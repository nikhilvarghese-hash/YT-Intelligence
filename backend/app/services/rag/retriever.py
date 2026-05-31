"""
Hybrid retrieval: semantic (vector) + keyword pre-filter.
Pre-filters candidates with SQL LIKE to avoid loading all 45k chunks into memory.
Ranking: semantic_score * 0.6 + keyword_score * 0.3 + engagement * 0.1
"""
from __future__ import annotations

import json
import re
from typing import Any, Optional

from sqlalchemy import or_, text
from sqlalchemy.orm import Session

from ...models import RAGChunk, RAGDocument, RAGEmbedding
from .embedder import cosine_similarity, embed_query, build_tfidf_index, tfidf_vector, _STOP

_TOP_K = 40
_PRE_FILTER_LIMIT = 500  # max candidates from SQL before ranking


def _query_keywords(query: str) -> list[str]:
    """Extract meaningful words from query for SQL pre-filtering."""
    words = re.findall(r"[a-z]{3,}", query.lower())
    return [w for w in words if w not in _STOP]


async def retrieve(
    query: str,
    db: Session,
    creator_ids: Optional[list[int]] = None,
    source_types: Optional[list[str]] = None,
    top_k: int = _TOP_K,
) -> list[dict[str, Any]]:
    """Return ranked chunk dicts."""

    keywords = _query_keywords(query)

    # ── SQL pre-filter: get candidates matching any keyword ───────────────────
    q = db.query(RAGChunk).join(RAGDocument, RAGChunk.document_id == RAGDocument.id)

    if creator_ids:
        q = q.filter(RAGDocument.creator_id.in_(creator_ids))
    if source_types:
        q = q.filter(RAGDocument.source_type.in_(source_types))

    if keywords:
        like_filters = [RAGChunk.chunk_text.ilike(f"%{kw}%") for kw in keywords[:6]]
        q = q.filter(or_(*like_filters))

    chunks = q.limit(_PRE_FILTER_LIMIT).all()

    if not chunks:
        # Fallback: no keyword match — grab a general sample
        q2 = db.query(RAGChunk).join(RAGDocument, RAGChunk.document_id == RAGDocument.id)
        if creator_ids:
            q2 = q2.filter(RAGDocument.creator_id.in_(creator_ids))
        if source_types:
            q2 = q2.filter(RAGDocument.source_type.in_(source_types))
        chunks = q2.limit(200).all()

    if not chunks:
        return []

    chunk_texts = [c.chunk_text for c in chunks]
    chunk_metas = [c.metadata_json or {} for c in chunks]

    # ── Keyword scores ────────────────────────────────────────────────────────
    query_words = set(keywords)
    keyword_scores = []
    for text_content in chunk_texts:
        text_words = set(re.findall(r"[a-z]{3,}", text_content.lower())) - _STOP
        if not text_words:
            keyword_scores.append(0.0)
            continue
        overlap = len(query_words & text_words) / max(len(query_words), 1)
        keyword_scores.append(overlap)

    # ── Semantic scores ───────────────────────────────────────────────────────
    semantic_scores = [0.0] * len(chunks)
    query_vec = await embed_query(query)

    if query_vec:
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
        # TF-IDF only on the pre-filtered subset (fast)
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
