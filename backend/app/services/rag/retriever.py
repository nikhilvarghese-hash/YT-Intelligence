"""
Hybrid retrieval: semantic (vector) + keyword.

When embeddings exist, uses two-phase approach:
  1. Pull keyword-matched candidates (up to 300)
  2. Pull a broad sample of comment chunks (up to 200) for semantic ranking
  3. Rank everything together by combined score

When no embeddings: keyword pre-filter + TF-IDF similarity.
"""
from __future__ import annotations

import json
import re
from typing import Any, Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from ...models import RAGChunk, RAGDocument, RAGEmbedding
from .embedder import cosine_similarity, embed_query, build_tfidf_index, tfidf_vector, _STOP

_TOP_K = 40
_KEYWORD_LIMIT = 300
_COMMENT_SAMPLE = 200


def _keywords(query: str) -> list[str]:
    words = re.findall(r"[a-z]{3,}", query.lower())
    return [w for w in words if w not in _STOP]


def _has_embeddings(db: Session) -> bool:
    return db.query(RAGEmbedding.id).limit(1).scalar() is not None


async def retrieve(
    query: str,
    db: Session,
    creator_ids: Optional[list[int]] = None,
    source_types: Optional[list[str]] = None,
    top_k: int = _TOP_K,
) -> list[dict[str, Any]]:

    use_vectors = _has_embeddings(db)

    def _base_q():
        q = db.query(RAGChunk).join(RAGDocument, RAGChunk.document_id == RAGDocument.id)
        if creator_ids:
            q = q.filter(RAGDocument.creator_id.in_(creator_ids))
        if source_types:
            q = q.filter(RAGDocument.source_type.in_(source_types))
        return q

    kws = _keywords(query)

    if use_vectors:
        # Phase 1: keyword-matched candidates
        kw_chunks: list[RAGChunk] = []
        if kws:
            like_filters = [RAGChunk.chunk_text.ilike(f"%{kw}%") for kw in kws[:6]]
            kw_chunks = _base_q().filter(or_(*like_filters)).limit(_KEYWORD_LIMIT).all()

        # Phase 2: broad comment sample (semantic search finds relevant ones without keywords)
        comment_q = _base_q().filter(RAGDocument.source_type == "comment")
        comment_sample = comment_q.limit(_COMMENT_SAMPLE).all()

        # Merge, deduplicate by id
        seen: set[int] = set()
        chunks: list[RAGChunk] = []
        for c in kw_chunks + comment_sample:
            if c.id not in seen:
                seen.add(c.id)
                chunks.append(c)

        if not chunks:
            chunks = _base_q().limit(300).all()
    else:
        # No embeddings: keyword pre-filter only
        if kws:
            like_filters = [RAGChunk.chunk_text.ilike(f"%{kw}%") for kw in kws[:6]]
            chunks = _base_q().filter(or_(*like_filters)).limit(400).all()
        else:
            chunks = _base_q().limit(300).all()

        if not chunks:
            chunks = _base_q().limit(200).all()

    if not chunks:
        return []

    chunk_texts = [c.chunk_text for c in chunks]
    chunk_metas = [c.metadata_json or {} for c in chunks]

    # ── Keyword scores ────────────────────────────────────────────────────────
    query_words = set(kws)
    keyword_scores = []
    for text_content in chunk_texts:
        text_words = set(re.findall(r"[a-z]{3,}", text_content.lower())) - _STOP
        overlap = len(query_words & text_words) / max(len(query_words), 1) if query_words else 0.0
        keyword_scores.append(overlap)

    # ── Semantic scores ───────────────────────────────────────────────────────
    semantic_scores = [0.0] * len(chunks)
    query_vec = await embed_query(query)

    if query_vec and use_vectors:
        chunk_id_to_idx = {c.id: i for i, c in enumerate(chunks)}
        emb_rows = db.query(RAGEmbedding).filter(
            RAGEmbedding.chunk_id.in_(list(chunk_id_to_idx.keys()))
        ).all()
        for emb_row in emb_rows:
            idx = chunk_id_to_idx[emb_row.chunk_id]
            try:
                vec = json.loads(emb_row.embedding)
                semantic_scores[idx] = cosine_similarity(query_vec, vec)
            except Exception:
                pass
    else:
        vocab, idf = build_tfidf_index(chunk_texts)
        q_vec = tfidf_vector(query, vocab, idf)
        for i, text_content in enumerate(chunk_texts):
            c_vec = tfidf_vector(text_content, vocab, idf)
            semantic_scores[i] = cosine_similarity(q_vec, c_vec)

    # ── Engagement normalisation ──────────────────────────────────────────────
    eng_raw = [float(m.get("engagement_score", 0) or 0) for m in chunk_metas]
    max_eng = max(eng_raw) or 1.0
    engagement_scores = [e / max_eng for e in eng_raw]

    # ── Combined ranking ──────────────────────────────────────────────────────
    scored = []
    for i, chunk in enumerate(chunks):
        score = (
            semantic_scores[i] * 0.6
            + keyword_scores[i] * 0.3
            + engagement_scores[i] * 0.1
        )
        scored.append({
            "chunk_id": chunk.id,
            "chunk_text": chunk.chunk_text,
            "metadata": chunk_metas[i],
            "semantic_score": round(semantic_scores[i], 4),
            "keyword_score": round(keyword_scores[i], 4),
            "final_score": round(score, 4),
        })

    scored.sort(key=lambda x: x["final_score"], reverse=True)
    return scored[:top_k]
