"""
Ask Finniki router.
GET  /index        — trigger incremental background indexing
GET  /index/status — indexing stats
POST /ask          — streaming SSE response
GET  /analytics    — query log analytics
"""
from __future__ import annotations

import asyncio
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import RAGDocument, RAGChunk, RAGEmbedding, RAGQueryLog
from ..services.rag.indexer import run_incremental_index
from ..services.rag.finniki import ask

router = APIRouter()

_indexing = False


class AskRequest(BaseModel):
    query: str
    creator_ids: Optional[list[int]] = None


# ── Indexing ──────────────────────────────────────────────────────────────────

@router.post("/index")
async def trigger_index(background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Kick off incremental indexing in the background."""
    global _indexing
    if _indexing:
        return {"status": "already_running"}
    _indexing = True

    async def _run():
        global _indexing
        try:
            from ..database import SessionLocal
            bg_db = SessionLocal()
            try:
                await run_incremental_index(bg_db)
            finally:
                bg_db.close()
        finally:
            _indexing = False

    background_tasks.add_task(_run)
    return {"status": "started"}


@router.get("/index/status")
def index_status(db: Session = Depends(get_db)):
    total_docs   = db.query(func.count(RAGDocument.id)).scalar() or 0
    indexed_docs = db.query(func.count(RAGDocument.id)).filter(RAGDocument.indexed_at.isnot(None)).scalar() or 0
    total_chunks = db.query(func.count(RAGChunk.id)).scalar() or 0
    total_embs   = db.query(func.count(RAGEmbedding.id)).scalar() or 0
    return {
        "total_documents": total_docs,
        "indexed_documents": indexed_docs,
        "pending_documents": total_docs - indexed_docs,
        "total_chunks": total_chunks,
        "total_embeddings": total_embs,
        "is_indexing": _indexing,
    }


# ── Ask (streaming) ───────────────────────────────────────────────────────────

@router.post("/ask")
async def ask_finniki(body: AskRequest, db: Session = Depends(get_db)):
    """SSE stream of JSON lines. Each line: {"type": "chunk"|"meta"|"error"|"done", ...}"""

    async def event_stream():
        async for line in ask(body.query, db, creator_ids=body.creator_ids):
            yield f"data: {line}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ── Analytics ─────────────────────────────────────────────────────────────────

@router.get("/analytics")
def analytics(db: Session = Depends(get_db)):
    logs = db.query(RAGQueryLog).order_by(RAGQueryLog.created_at.desc()).limit(500).all()

    total_queries = len(logs)
    avg_confidence = (sum(l.confidence or 0 for l in logs) / total_queries) if total_queries else 0
    avg_retrieval  = (sum(l.execution_time_ms or 0 for l in logs) / total_queries) if total_queries else 0
    success_count  = sum(1 for l in logs if (l.confidence or 0) >= 0.3)

    # Most asked questions (last 100)
    recent = logs[:100]

    return {
        "total_queries": total_queries,
        "avg_confidence": round(avg_confidence, 2),
        "avg_execution_ms": round(avg_retrieval),
        "success_rate": round(success_count / total_queries, 2) if total_queries else 0,
        "recent_queries": [
            {
                "query": l.query,
                "confidence": l.confidence,
                "sources_used": l.sources_used,
                "execution_ms": l.execution_time_ms,
                "created_at": l.created_at.isoformat() if l.created_at else None,
            }
            for l in recent
        ],
    }
