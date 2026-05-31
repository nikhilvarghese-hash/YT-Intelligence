"""
Incremental RAG indexer.

Processes Comments, Replies, and Videos from the database.
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
    Comment, Reply, Video, Creator,
    RAGDocument, RAGChunk, RAGEmbedding,
)
from .embedder import embed_texts, EMBEDDING_MODEL

logger = logging.getLogger(__name__)

# Characters per chunk (≈500-800 tokens at 4 chars/token)
_CHUNK_CHARS = 2000
_CHUNK_OVERLAP = 200


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def _chunk_text(text: str) -> list[str]:
    """Split text into overlapping chunks."""
    if len(text) <= _CHUNK_CHARS:
        return [text]
    chunks = []
    start = 0
    while start < len(text):
        end = start + _CHUNK_CHARS
        chunks.append(text[start:end])
        start = end - _CHUNK_OVERLAP
    return chunks


def _build_comment_text(c: Comment) -> str:
    parts = [c.comment_text or ""]
    return " ".join(p for p in parts if p).strip()


def _build_video_text(v: Video) -> str:
    parts = [v.title or "", v.description or ""]
    return " ".join(p for p in parts if p).strip()


def _comment_metadata(c: Comment) -> dict[str, Any]:
    return {
        "source_type": "comment",
        "source_id": str(c.id),
        "creator_id": c.creator_id,
        "video_id": c.video_id,
        "intent": c.intent,
        "sentiment": c.sentiment,
        "topic": c.topic,
        "subtopic": c.subtopic,
        "engagement_score": (c.like_count or 0) * 3 + (c.reply_count or 0) * 2,
        "frequency_score": 1,
    }


def _video_metadata(v: Video) -> dict[str, Any]:
    return {
        "source_type": "video",
        "source_id": str(v.video_id),
        "creator_id": v.creator_id,
        "video_id": v.video_id,
        "intent": None,
        "sentiment": None,
        "topic": None,
        "engagement_score": (v.views or 0) // 1000 + (v.likes or 0) * 3,
        "frequency_score": 1,
    }


async def run_incremental_index(db: Session, creator_ids: list[int] | None = None) -> dict:
    """
    Main entry point. Process all unindexed or changed records.
    Returns a summary dict.
    """
    added = updated = skipped = 0
    texts_to_embed: list[str] = []
    chunk_ids_pending: list[int] = []

    def _upsert_document(source_type: str, source_id: str, content_hash: str, creator_id: int | None) -> tuple[RAGDocument, bool]:
        """Return (doc, is_new_or_changed)."""
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
            # Delete old chunks (cascades to embeddings)
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

    # ── Comments ──────────────────────────────────────────────────────────────
    q = db.query(Comment)
    if creator_ids:
        q = q.filter(Comment.creator_id.in_(creator_ids))
    for comment in q.all():
        text = _build_comment_text(comment)
        if not text:
            skipped += 1
            continue
        h = _sha256(text)
        doc, changed = _upsert_document("comment", str(comment.id), h, comment.creator_id)
        if not changed:
            skipped += 1
            continue
        meta = _comment_metadata(comment)
        chunks = _store_chunks(doc, text, meta)
        for ch in chunks:
            texts_to_embed.append(ch.chunk_text)
            chunk_ids_pending.append(ch.id)
        added += 1

    # ── Videos ───────────────────────────────────────────────────────────────
    q = db.query(Video)
    if creator_ids:
        q = q.filter(Video.creator_id.in_(creator_ids))
    for video in q.all():
        text = _build_video_text(video)
        if not text:
            skipped += 1
            continue
        h = _sha256(text)
        doc, changed = _upsert_document("video", str(video.video_id), h, video.creator_id)
        if not changed:
            skipped += 1
            continue
        meta = _video_metadata(video)
        chunks = _store_chunks(doc, text, meta)
        for ch in chunks:
            texts_to_embed.append(ch.chunk_text)
            chunk_ids_pending.append(ch.id)
        added += 1

    db.commit()

    # ── Embed new chunks ──────────────────────────────────────────────────────
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
                logger.info("Embedded %d chunks", len(vectors))
            else:
                logger.info("No embedding provider; keyword search only")
        except Exception as e:
            logger.warning("Embedding failed: %s", e)

    # Mark all processed documents as indexed
    db.query(RAGDocument).filter(RAGDocument.indexed_at.is_(None)).update(
        {"indexed_at": datetime.utcnow()}
    )
    db.commit()

    return {"indexed": added, "updated": updated, "skipped": skipped, "chunks_embedded": len(chunk_ids_pending)}
