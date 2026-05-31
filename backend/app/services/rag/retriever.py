"""
Hybrid retrieval: semantic (vector) + keyword matching.
Ranking: semantic_score * 0.6 + keyword_score * 0.3 + engagement * 0.1
"""
from __future__ import annotations

import json
import re
from typing import Any, Optional

from sqlalchemy.orm import Session

from ...models import RAGChunk, RAGEmbedding
from .embedder import cosine_similarity, embed_query, build_tfidf_index, tfidf_vector, _STOP

_TOP_K = 40  # chunks to retrieve before reranking


async def retrieve(
    query: str,
    db: Session,
    creator_ids: Optional[list[int]] = None,
    source_types: Optional[list[str]] = None,
    top_k: int = _TOP_K,
) -> list[dict[str, Any]]:
    """
    Return ranked list of chunk dicts with scores and metadata.
    """
    # Load candidate chunks from DB (filter by creator/type before loading)
    q = db.query(RAGChunk)
    if creator_ids:
        q = q.join(RAGChunk.document).filter_by  # join via document
        from ...models import RAGDocument
        q = db.query(RAGChunk).join(RAGDocument, RAGChunk.document_id == RAGDocument.id)
        if creator_ids:
            q = q.filter(RAGDocument.creator_id.in_(creator_ids))
        if source_types:
            q = q.filter(RAGDocument.source_type.in_(source_types))
    elif source_types:
        from ...models import RAGDocument
        q = db.query(RAGChunk).join(RAGDocument, RAGChunk.document_id == RAGDocument.id)
        q = q.filter(RAGDocument.source_type.in_(source_types))

    chunks = q.all()
    if not chunks:
        return []

    chunk_texts = [c.chunk_text for c in chunks]
    chunk_metas = [c.metadata_json or {} for c in chunks]

    # ── Keyword scores ────────────────────────────────────────────────────────
    query_words = set(re.findall(r"[a-z]{2,}", query.lower())) - _STOP
    keyword_scores = []
    for text in chunk_texts:
        text_words = set(re.findall(r"[a-z]{2,}", text.lower()))
        if not text_words:
            keyword_scores.append(0.0)
            continue
        overlap = len(query_words & text_words) / max(len(query_words), 1)
        keyword_scores.append(overlap)

    # ── Semantic scores ───────────────────────────────────────────────────────
    semantic_scores = [0.0] * len(chunks)
    query_vec = await embed_query(query)
    if query_vec:
        # Load embeddings for these chunk IDs
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
        # Fallback: TF-IDF similarity
        vocab, idf = build_tfidf_index(chunk_texts)
        q_vec = tfidf_vector(query, vocab, idf)
        for i, text in enumerate(chunk_texts):
            c_vec = tfidf_vector(text, vocab, idf)
            semantic_scores[i] = cosine_similarity(q_vec, c_vec)

    # ── Engagement normalisation ──────────────────────────────────────────────
    engagement_scores = []
    max_eng = 1
    for meta in chunk_metas:
        e = meta.get("engagement_score", 0) or 0
        engagement_scores.append(e)
        if e > max_eng:
            max_eng = e
    engagement_scores = [e / max_eng for e in engagement_scores]

    # ── Combined rank ─────────────────────────────────────────────────────────
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
