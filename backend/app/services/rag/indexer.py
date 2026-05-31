"""
Incremental RAG indexer.

Processes Comments and Videos from the database.
Uses SHA-256 content hashing — only re-indexes changed records.
Runs in the background; never called during search.
"""
from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ...models import (
    Comment, Video,
    RAGDocument, RAGChunk, RAGEmbedding,
)
from .embedder import embed_texts, EMBEDDING_MODEL

logger = logging.getLogger(__name__)

_CHUNK_CHARS = 2000
_CHUNK_OVERLAP = 200


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def _chunk_text(text: str) -> list[str]:
    if len(text) <= _CHUNK_CHARS:
        return [text]
    chunks = []
    start = 0
    while start < len(text):
        end = start + _CHUNK_CHARS
        chunks.append(text[start:end])
        start = end - _CHUNK_OVERLAP
    return chunks


async def run_incremental_index(db: Session, creator_ids: list[int] | None = None) -> dict:
    added = skipped = 0
    texts_to_embed: list[str] = []
    chunk_ids_pending: list[int] = []

    def _upsert_document(source_type: str, source_id: str, content_hash: str, creator_id: int | None) -> tuple[RAGDocument, bool]:
        doc = db.query(RAGDocument).filter_by(source_type=source_type, source_id=source_id).first()
        if doc is None:
            doc = RAGDocument(
                source_type=source_type,
                source_id=source_id,
                content_hash=content_hash,
                creator_id=creator_id,
            )
            db.add(doc)
            db.flush()
            return doc, True
        if doc.content_hash != content_hash:
            doc.content_hash = content_hash
            doc.creator_id = creator_id
            doc.updated_at = datetime.utcnow()
            for chunk in list(doc.chunks):
                db.delete(chunk)
            db.flush()
            return doc, True
        return doc, False

    def _store_chunks(doc: RAGDocument, text: str, meta: dict) -> list[RAGChunk]:
        parts = _chunk_text(text)
        chunks = []
        for i, part in enumerate(parts):
            ch = RAGChunk(
                document_id=doc.id,
                chunk_index=i,
                chunk_hash=_sha256(part),
                chunk_text=part,
                metadata_json=meta,
            )
            db.add(ch)
            chunks.append(ch)
        db.flush()
        return chunks

    # ── Videos ───────────────────────────────────────────────────────────────
    vq = db.query(Video)
    if creator_ids:
        vq = vq.filter(Video.creator_id.in_(creator_ids))

    for video in vq.all():
        parts = [p for p in [video.title, video.description] if p]
        text = " | ".join(parts).strip()
        if not text:
            skipped += 1
            continue
        h = _sha256(text)
        doc, changed = _upsert_document("video", str(video.video_id), h, video.creator_id)
        if not changed:
            skipped += 1
            continue
        meta = {
            "source_type": "video",
            "source_id": str(video.video_id),
            "creator_id": video.creator_id,
            "video_id": str(video.video_id),
            "intent": None,
            "sentiment": None,
            "topic": None,
            "engagement_score": int((video.views or 0) // 1000 + (video.likes or 0) * 3),
            "frequency_score": 1,
        }
        for ch in _store_chunks(doc, text, meta):
            texts_to_embed.append(ch.chunk_text)
            chunk_ids_pending.append(ch.id)
        added += 1

    # ── Comments (join to video for creator_id) ───────────────────────────────
    cq = db.query(Comment, Video.creator_id, Video.video_id.label("yt_video_id")).join(
        Video, Comment.video_id == Video.id
    )
    if creator_ids:
        cq = cq.filter(Video.creator_id.in_(creator_ids))

    for comment, creator_id, yt_video_id in cq.all():
        text = (comment.comment_text or "").strip()
        if not text:
            skipped += 1
            continue
        h = _sha256(text)
        doc, changed = _upsert_document("comment", str(comment.id), h, creator_id)
        if not changed:
            skipped += 1
            continue
        meta = {
            "source_type": "comment",
            "source_id": str(comment.id),
            "creator_id": creator_id,
            "video_id": str(yt_video_id),
            "intent": None,
            "sentiment": None,
            "topic": None,
            "engagement_score": int((comment.likes or 0) * 3 + (comment.reply_count or 0) * 2),
            "frequency_score": 1,
        }
        for ch in _store_chunks(doc, text, meta):
            texts_to_embed.append(ch.chunk_text)
            chunk_ids_pending.append(ch.id)
        added += 1

        # Commit in batches to avoid huge transactions
        if added % 500 == 0:
            db.commit()
            logger.info("Indexed %d records so far…", added)

    db.commit()

    # ── Embed new chunks ──────────────────────────────────────────────────────
    embedded = 0
    if texts_to_embed:
        try:
            vectors = await embed_texts(texts_to_embed)
            if vectors:
                for chunk_id, vector in zip(chunk_ids_pending, vectors):
                    emb = RAGEmbedding(
                        chunk_id=chunk_id,
                        embedding=json.dumps(vector),
                        embedding_model=EMBEDDING_MODEL,
                    )
                    db.add(emb)
                db.commit()
                embedded = len(vectors)
                logger.info("Embedded %d chunks", embedded)
            else:
                logger.info("No embedding provider configured — keyword search only")
        except Exception as e:
            logger.warning("Embedding failed: %s", e)

    db.query(RAGDocument).filter(RAGDocument.indexed_at.is_(None)).update(
        {"indexed_at": datetime.utcnow()}
    )
    db.commit()

    # ── Embed any previously unembedded chunks (e.g. provider added later) ───
    unembedded_extra = 0
    if embedded == 0:  # only run this pass if we didn't just embed new chunks
        from sqlalchemy import text as sa_text
        unembedded = (
            db.query(RAGChunk)
            .outerjoin(RAGEmbedding, RAGChunk.id == RAGEmbedding.chunk_id)
            .filter(RAGEmbedding.id.is_(None))
            .limit(50000)
            .all()
        )
        if unembedded:
            logger.info("Found %d unembedded chunks — embedding now…", len(unembedded))
            try:
                batch_texts = [c.chunk_text for c in unembedded]
                vectors = await embed_texts(batch_texts)
                if vectors:
                    for chunk, vector in zip(unembedded, vectors):
                        emb = RAGEmbedding(
                            chunk_id=chunk.id,
                            embedding=json.dumps(vector),
                            embedding_model=EMBEDDING_MODEL,
                        )
                        db.add(emb)
                    db.commit()
                    unembedded_extra = len(vectors)
                    logger.info("Embedded %d previously unembedded chunks", unembedded_extra)
            except Exception as e:
                logger.warning("Backfill embedding failed: %s", e)

    return {"indexed": added, "skipped": skipped, "chunks_embedded": embedded + unembedded_extra}
