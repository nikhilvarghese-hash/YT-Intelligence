"""
Intent classifier — maps a natural language query to a structured routing decision.
Uses the same AI provider infrastructure as ai_insights.py.
"""
from __future__ import annotations

import json
import re
from typing import Any

from ..config import settings

INTENTS = {
    "topic_themes":          "Audience topic clusters and content themes",
    "pain_points":           "Audience pain points and struggles",
    "questions":             "Questions the audience is asking",
    "purchase_intent":       "Purchase intent signals in comments",
    "content_opportunities": "Content gap and opportunity ideas",
    "content_strategy":      "AI content strategy cards and Kanban board",
    "audience_overlap":      "Audience overlap between creators",
    "compare_creators":      "Side-by-side creator comparison",
    "competitor_insights":   "Competitor top videos and AI insights",
    "unknown":               "Query does not match any available feature",
}

_SYSTEM = """\
You are a routing assistant for a YouTube intelligence platform.
Given a user query, return a JSON object with these fields:
  intent    – one of: topic_themes | pain_points | questions | purchase_intent |
              content_opportunities | content_strategy | audience_overlap |
              compare_creators | competitor_insights | unknown
  period    – integer days to look back (default 90, range 7–365)
  topic     – specific topic keyword if mentioned, else null
  summary   – one sentence describing what the user wants

Return ONLY valid JSON, no markdown fences."""


async def classify(query: str) -> dict[str, Any]:
    prompt = f"{_SYSTEM}\n\nUser query: {query}"
    raw = await _call_ai(prompt)
    return _parse(raw, query)


# ── AI dispatch (mirrors ai_insights.py pattern) ─────────────────────────────

async def _call_ai(prompt: str) -> str | None:
    provider = (settings.AI_PROVIDER or "none").lower()
    try:
        if provider == "openai":
            return await _openai(prompt)
        if provider == "anthropic":
            return await _anthropic(prompt)
        if provider == "gemini":
            return await _gemini(prompt)
        if provider == "ollama":
            return await _ollama(prompt)
        if provider == "openrouter":
            return await _openrouter(prompt)
    except Exception:
        pass
    return None


async def _openai(prompt: str) -> str:
    import httpx
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {settings.OPENAI_API_KEY}"},
            json={
                "model": settings.AI_MODEL or "gpt-4o-mini",
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 200,
                "response_format": {"type": "json_object"},
            },
        )
        return resp.json()["choices"][0]["message"]["content"]


async def _anthropic(prompt: str) -> str:
    import httpx
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": settings.ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
            },
            json={
                "model": settings.AI_MODEL or "claude-haiku-4-5-20251001",
                "max_tokens": 200,
                "messages": [{"role": "user", "content": prompt}],
            },
        )
        return resp.json()["content"][0]["text"]


async def _gemini(prompt: str) -> str:
    import httpx
    model = settings.AI_MODEL or "gemini-1.5-flash"
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
            params={"key": settings.GEMINI_API_KEY},
            json={"contents": [{"parts": [{"text": prompt}]}]},
        )
        return resp.json()["candidates"][0]["content"]["parts"][0]["text"]


async def _ollama(prompt: str) -> str:
    import httpx
    base = settings.OLLAMA_BASE_URL or "http://localhost:11434"
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{base}/api/generate",
            json={"model": settings.AI_MODEL or "llama3", "prompt": prompt, "stream": False},
        )
        return resp.json().get("response", "")


async def _openrouter(prompt: str) -> str:
    import asyncio
    import httpx
    model = settings.AI_MODEL or "google/gemini-flash-1.5"
    max_retries = 3
    base_delay = 5.0
    async with httpx.AsyncClient(timeout=30) as client:
        for attempt in range(max_retries):
            resp = await client.post(
                f"{settings.OPENROUTER_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
                    "HTTP-Referer": "http://localhost:3000",
                    "X-Title": "YouTube Intelligence",
                },
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 200,
                },
            )
            if resp.status_code == 429 and attempt < max_retries - 1:
                await asyncio.sleep(base_delay * (2 ** attempt))
                continue
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]
    return ""


# ── Response parser ───────────────────────────────────────────────────────────

def _parse(raw: str | None, query: str) -> dict[str, Any]:
    if raw:
        # Strip markdown fences if the model added them despite instructions
        raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip())
        try:
            data = json.loads(raw)
            intent = data.get("intent", "unknown")
            if intent not in INTENTS:
                intent = "unknown"
            return {
                "intent": intent,
                "period": int(data.get("period", 90)),
                "topic": data.get("topic") or None,
                "summary": data.get("summary", query),
            }
        except (json.JSONDecodeError, ValueError):
            pass

    # Rule-based fallback when AI is unavailable
    q = query.lower()
    intent = "unknown"
    if any(w in q for w in ["theme", "topic", "cluster", "trend"]):
        intent = "topic_themes"
    elif any(w in q for w in ["pain", "struggle", "problem", "complaint"]):
        intent = "pain_points"
    elif any(w in q for w in ["question", "ask", "faq", "wonder"]):
        intent = "questions"
    elif any(w in q for w in ["buy", "purchase", "want to get", "take my money"]):
        intent = "purchase_intent"
    elif any(w in q for w in ["gap", "opportunit", "idea", "content"]):
        intent = "content_opportunities"
    elif any(w in q for w in ["strategy", "card", "kanban", "plan"]):
        intent = "content_strategy"
    elif any(w in q for w in ["overlap", "shared audience"]):
        intent = "audience_overlap"
    elif any(w in q for w in ["compare", "vs", "versus"]):
        intent = "compare_creators"
    elif any(w in q for w in ["competitor", "rival", "channel"]):
        intent = "competitor_insights"

    return {
        "intent": intent,
        "period": 90,
        "topic": None,
        "summary": query,
    }
