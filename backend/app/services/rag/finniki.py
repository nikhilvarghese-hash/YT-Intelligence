"""
Ask Finniki — grounded audience intelligence engine.
Streams a structured response using retrieved evidence only.
"""
from __future__ import annotations

import json
import time
from typing import Any, AsyncIterator, Optional

from sqlalchemy.orm import Session

from ...config import settings
from ...models import RAGQueryLog
from .retriever import retrieve
from .context_builder import build_context

_SYSTEM_PROMPT = """\
You are Ask Finniki, an Audience Intelligence Analyst.

You answer ONLY using the audience evidence supplied below.
Never speculate. Never invent facts, statistics, trends, or recommendations.
If the evidence is insufficient, say exactly:
"I could not find enough supporting audience evidence to answer that reliably."

Structure your response with these sections (use markdown headers):
## Executive Summary
## Key Findings
## Audience Signals
## Representative Quotes
## Content Opportunities
## Follow-Up Questions

In Key Findings, cite numbers where available (e.g. "42 comments discussed X").
In Representative Quotes, pick 3-5 verbatim audience comments.
In Content Opportunities, suggest Long Form and Shorts ideas grounded in the evidence.
In Follow-Up Questions, suggest 3 evidence-based follow-up questions.
"""


async def ask(
    query: str,
    db: Session,
    creator_ids: Optional[list[int]] = None,
    top_k: int = 40,
) -> AsyncIterator[str]:
    """
    Async generator that yields SSE data chunks.
    Yields JSON lines: {"type": "chunk"|"meta"|"error", ...}
    """
    start = time.time()

    # ── Retrieve ──────────────────────────────────────────────────────────────
    chunks = await retrieve(query, db, creator_ids=creator_ids, top_k=top_k)
    ctx = build_context(chunks, query)

    stats = ctx["stats"]
    total_chunks = stats["total_chunks"]

    if total_chunks == 0:
        yield _event("error", {"message": "No audience data found. Sync some creators first to build the knowledge base."})
        return

    # Confidence: based on chunk count and score spread
    if chunks:
        avg_score = sum(c["final_score"] for c in chunks) / len(chunks)
        confidence = min(0.99, avg_score * 1.5 + (min(total_chunks, 50) / 50) * 0.3)
    else:
        confidence = 0.0

    if confidence < 0.15 or total_chunks < 3:
        yield _event("error", {"message": "I could not find enough supporting audience evidence to answer that reliably."})
        return

    # ── Stream LLM response ───────────────────────────────────────────────────
    prompt = f"{_SYSTEM_PROMPT}\n\n--- AUDIENCE EVIDENCE ---\n{ctx['context_text']}\n\n--- USER QUESTION ---\n{query}"

    elapsed_ms = int((time.time() - start) * 1000)

    # Yield meta first so UI can show stats while text streams
    yield _event("meta", {
        "confidence": round(confidence, 2),
        "sources_used": stats["comments_analysed"] + stats["videos_referenced"],
        "retrieved_chunks": total_chunks,
        "retrieval_ms": elapsed_ms,
        "stats": stats,
    })

    response_text = ""
    provider = (settings.AI_PROVIDER or "none").lower()

    try:
        if provider == "openai":
            async for token in _stream_openai(prompt):
                response_text += token
                yield _event("chunk", {"text": token})
        elif provider == "anthropic":
            async for token in _stream_anthropic(prompt):
                response_text += token
                yield _event("chunk", {"text": token})
        elif provider == "openrouter":
            async for token in _stream_openrouter(prompt):
                response_text += token
                yield _event("chunk", {"text": token})
        elif provider == "ollama":
            async for token in _stream_ollama(prompt):
                response_text += token
                yield _event("chunk", {"text": token})
        elif provider == "gemini":
            async for token in _stream_gemini(prompt):
                response_text += token
                yield _event("chunk", {"text": token})
        else:
            yield _event("error", {"message": "No AI provider configured. Go to Settings and set up an AI provider."})
            return
    except Exception as e:
        yield _event("error", {"message": f"AI provider error: {str(e)}"})
        return

    total_ms = int((time.time() - start) * 1000)

    # ── Persist query log ─────────────────────────────────────────────────────
    try:
        log = RAGQueryLog(
            query=query,
            response=response_text[:4000],
            confidence=confidence,
            sources_used=stats["comments_analysed"] + stats["videos_referenced"],
            retrieved_chunks=total_chunks,
            execution_time_ms=total_ms,
        )
        db.add(log)
        db.commit()
    except Exception:
        pass

    yield _event("done", {"total_ms": total_ms})


def _event(event_type: str, data: dict) -> str:
    return json.dumps({"type": event_type, **data})


# ── Streaming LLM helpers ─────────────────────────────────────────────────────

async def _stream_openai(prompt: str) -> AsyncIterator[str]:
    import httpx
    async with httpx.AsyncClient(timeout=120) as client:
        async with client.stream(
            "POST",
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {settings.OPENAI_API_KEY}"},
            json={
                "model": settings.AI_MODEL or "gpt-4o-mini",
                "messages": [{"role": "user", "content": prompt}],
                "stream": True,
                "max_tokens": 2000,
            },
        ) as resp:
            async for line in resp.aiter_lines():
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                try:
                    obj = json.loads(data)
                    token = obj["choices"][0]["delta"].get("content", "")
                    if token:
                        yield token
                except Exception:
                    pass


async def _stream_anthropic(prompt: str) -> AsyncIterator[str]:
    import httpx
    async with httpx.AsyncClient(timeout=120) as client:
        async with client.stream(
            "POST",
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": settings.ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": settings.AI_MODEL or "claude-haiku-4-5-20251001",
                "max_tokens": 2000,
                "stream": True,
                "messages": [{"role": "user", "content": prompt}],
            },
        ) as resp:
            async for line in resp.aiter_lines():
                if not line.startswith("data:"):
                    continue
                try:
                    obj = json.loads(line[5:])
                    if obj.get("type") == "content_block_delta":
                        yield obj["delta"].get("text", "")
                except Exception:
                    pass


async def _stream_openrouter(prompt: str) -> AsyncIterator[str]:
    import httpx
    async with httpx.AsyncClient(timeout=120) as client:
        async with client.stream(
            "POST",
            f"{settings.OPENROUTER_BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
                "HTTP-Referer": "http://localhost:3000",
            },
            json={
                "model": settings.AI_MODEL or "openai/gpt-4o-mini",
                "messages": [{"role": "user", "content": prompt}],
                "stream": True,
                "max_tokens": 2000,
            },
        ) as resp:
            async for line in resp.aiter_lines():
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                try:
                    obj = json.loads(data)
                    token = obj["choices"][0]["delta"].get("content", "")
                    if token:
                        yield token
                except Exception:
                    pass


async def _stream_ollama(prompt: str) -> AsyncIterator[str]:
    import httpx
    base = settings.OLLAMA_BASE_URL.rstrip("/")
    async with httpx.AsyncClient(timeout=120) as client:
        async with client.stream(
            "POST",
            f"{base}/api/generate",
            json={
                "model": settings.AI_MODEL or "llama3",
                "prompt": prompt,
                "stream": True,
            },
        ) as resp:
            async for line in resp.aiter_lines():
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                    yield obj.get("response", "")
                    if obj.get("done"):
                        break
                except Exception:
                    pass


async def _stream_gemini(prompt: str) -> AsyncIterator[str]:
    import httpx
    model = settings.AI_MODEL or "gemini-1.5-flash"
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?key={settings.GEMINI_API_KEY}&alt=sse"
    async with httpx.AsyncClient(timeout=120) as client:
        async with client.stream(
            "POST",
            url,
            json={"contents": [{"parts": [{"text": prompt}]}]},
        ) as resp:
            async for line in resp.aiter_lines():
                if not line.startswith("data:"):
                    continue
                try:
                    obj = json.loads(line[5:])
                    text = obj["candidates"][0]["content"]["parts"][0]["text"]
                    yield text
                except Exception:
                    pass
