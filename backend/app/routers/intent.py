"""
Intent layer router — accepts a natural language query and returns classified
intent + a preview of the relevant data from the appropriate service.
"""
from __future__ import annotations

from typing import Optional

import httpx
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..services.intent_classifier import classify, INTENTS

router = APIRouter()

BASE_URL = "http://localhost:8000/api"

# Page links shown to the frontend so the user can navigate to the full view
PAGE_LINKS: dict[str, str] = {
    "topic_themes":          "/topic-intelligence",
    "pain_points":           "/analytics/pain-points",
    "questions":             "/analytics/questions",
    "purchase_intent":       "/analytics/purchase-intent",
    "content_opportunities": "/analytics/content-opportunities",
    "content_strategy":      "/ai-content-strategy",
    "audience_overlap":      "/analytics/audience-overlap",
    "compare_creators":      "/analytics/compare",
    "competitor_insights":   "/competitor-analytics",
    "unknown":               "/",
}


class QueryRequest(BaseModel):
    query: str
    creator_ids: Optional[list[int]] = None


@router.post("/query")
async def query_intent(body: QueryRequest, db: Session = Depends(get_db)):
    classification = await classify(body.query)
    intent = classification["intent"]
    period = classification["period"]
    topic = classification["topic"]

    creator_param = (
        ",".join(str(i) for i in body.creator_ids) if body.creator_ids else ""
    )

    preview = await _fetch_preview(intent, creator_param, period, topic)

    return {
        "intent": intent,
        "intent_label": INTENTS.get(intent, intent),
        "summary": classification["summary"],
        "period": period,
        "topic": topic,
        "page_link": PAGE_LINKS.get(intent, "/"),
        "preview": preview,
    }


# ── Preview fetchers ──────────────────────────────────────────────────────────

async def _fetch_preview(
    intent: str, creator_param: str, period: int, topic: str | None
) -> dict:
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            if intent == "topic_themes":
                r = await client.get(
                    f"{BASE_URL}/topic-intelligence/themes",
                    params={"creator_ids": creator_param, "period": period},
                )
                themes = r.json().get("themes", [])[:5]
                return {
                    "type": "themes",
                    "items": [
                        {"label": t.get("label", ""), "size": t.get("size", 0)}
                        for t in themes
                    ],
                }

            if intent == "pain_points":
                r = await client.get(
                    f"{BASE_URL}/analytics/pain-points",
                    params={"creator_ids": creator_param, "period": period},
                )
                items = r.json()[:5] if isinstance(r.json(), list) else []
                return {"type": "pain_points", "items": items}

            if intent == "questions":
                r = await client.get(
                    f"{BASE_URL}/analytics/questions",
                    params={"creator_ids": creator_param, "period": period},
                )
                items = r.json()[:5] if isinstance(r.json(), list) else []
                return {"type": "questions", "items": items}

            if intent == "purchase_intent":
                r = await client.get(
                    f"{BASE_URL}/analytics/purchase-intent",
                    params={"creator_ids": creator_param},
                )
                items = r.json()[:5] if isinstance(r.json(), list) else []
                return {"type": "purchase_intent", "items": items}

            if intent == "content_opportunities":
                r = await client.get(
                    f"{BASE_URL}/analytics/content-opportunities",
                    params={"creator_ids": creator_param, "period": period},
                )
                items = r.json()[:5] if isinstance(r.json(), list) else []
                return {"type": "content_opportunities", "items": items}

            if intent == "content_strategy":
                r = await client.get(
                    f"{BASE_URL}/content-strategy/opportunities",
                    params={"creator_ids": creator_param, "period": period},
                )
                items = r.json()[:5] if isinstance(r.json(), list) else []
                return {"type": "content_strategy", "items": items}

            if intent == "audience_overlap":
                r = await client.get(
                    f"{BASE_URL}/analytics/audience-overlap",
                    params={"creator_ids": creator_param},
                )
                return {"type": "audience_overlap", "data": r.json()}

            if intent == "compare_creators":
                r = await client.get(
                    f"{BASE_URL}/analytics/compare",
                    params={"creator_ids": creator_param},
                )
                return {"type": "compare_creators", "data": r.json()}

            if intent == "competitor_insights":
                r = await client.get(
                    f"{BASE_URL}/competitors/top-videos",
                    params={"creator_ids": creator_param, "period": period},
                )
                items = r.json()[:5] if isinstance(r.json(), list) else []
                return {"type": "competitor_insights", "items": items}

    except Exception as exc:
        return {"type": "error", "detail": str(exc)}

    return {"type": "none"}
