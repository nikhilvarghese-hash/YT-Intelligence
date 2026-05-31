"""
Content Recommendation Engine
Generates and persists structured content recommendations from opportunity cards.
Scores: Demand · Engagement · Trend · Relevance → Priority + Confidence.
"""
from __future__ import annotations

import json
import math
import re
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import ContentRecommendation
from ..services.ai_insights import ai_analyze_videos

router = APIRouter()

# ── Scoring helpers ───────────────────────────────────────────────────────────

def _log_score(value: float, saturation: float) -> int:
    """Map a raw count to 0-100 using log scale. saturation = value that gives ~95."""
    if value <= 0:
        return 0
    return min(100, round(math.log(value + 1) / math.log(saturation + 1) * 100))


def compute_scores(
    frequency: int,
    unique_users: int,
    avg_likes: float,
    growth_rate: float,
    finniki: bool,
    finniki_confidence: float,
) -> dict:
    """
    Returns all component scores and derived priority/confidence.

    Demand  (0-100): log-scaled mentions (sat=60) × 0.6 + unique_users (sat=30) × 0.4
    Engage  (0-100): log-scaled avg_likes (sat=50)
    Trend   (0-100): (growth_rate + 1) × 50, clamped; growing >50, declining <50
    Relev   (0-100): finniki → confidence×100 (floor 40); adjacent → (1-confidence)×30
    Priority: demand×0.35 + engage×0.25 + trend×0.20 + relev×0.20
    Confidence: blended data-quality signal
    """
    demand = round(
        _log_score(frequency, 60) * 0.6 + _log_score(unique_users, 30) * 0.4
    )
    engagement = _log_score(avg_likes, 50)
    trend = max(0, min(100, round((growth_rate + 1) * 50)))
    if finniki:
        relevance = max(40, round(finniki_confidence * 100))
    else:
        relevance = round((1 - finniki_confidence) * 30)

    priority = round(
        demand * 0.35 + engagement * 0.25 + trend * 0.20 + relevance * 0.20
    )
    confidence = round(
        min(1.0, (
            min(1.0, unique_users / 20) * 0.45 +
            min(1.0, frequency / 30) * 0.35 +
            (1 if finniki_confidence > 0.5 else finniki_confidence) * 0.20
        )), 2,
    )
    return {
        "demand_score": demand,
        "engagement_score": engagement,
        "trend_score": trend,
        "relevance_score": relevance,
        "priority_score": priority,
        "confidence_score": confidence,
    }


# ── AI generation ─────────────────────────────────────────────────────────────

async def _generate_content(
    topic: str,
    category: str,
    classification: str,
    frequency: int,
    unique_users: int,
    growth_rate: float,
    example_comments: list[str],
    scores: dict,
) -> dict:
    """Call AI provider to produce the full recommendation content."""

    trend_label = (
        "growing rapidly" if growth_rate > 0.5 else
        "growing" if growth_rate > 0.1 else
        "declining" if growth_rate < -0.1 else "stable"
    )

    prompt = f"""You are an expert YouTube content strategist for a channel focused on NRI personal finance and wealth management.

Generate a complete content recommendation for this topic:

Topic: {topic}
Category: {category}
Type: {"Finniki (core NRI finance topic)" if classification == "finniki" else "Adjacent topic"}
Demand: {frequency} mentions from {unique_users} unique viewers
Trend: {trend_label}
Priority Score: {scores["priority_score"]}/100
Sample audience comments:
{chr(10).join(f'- "{c}"' for c in example_comments[:4])}

Respond with ONLY a valid JSON object (no markdown fences):
{{
  "suggested_title": "Single compelling YouTube title (60-70 chars, SEO-optimised)",
  "suggested_hook": "Opening 20-30 seconds of the video script — must hook immediately",
  "format": "long" | "short" | "series",
  "target_audience": "Specific viewer segment (e.g. NRI salaried professionals in the US)",
  "talking_points": ["Point 1", "Point 2", "Point 3", "Point 4", "Point 5"],
  "faqs": [
    {{"q": "Frequently asked question?", "a": "Concise answer"}},
    {{"q": "...", "a": "..."}},
    {{"q": "...", "a": "..."}}
  ],
  "misconceptions": ["Common misconception 1", "Common misconception 2", "Common misconception 3"],
  "explanation": "1-2 sentence explanation of why this content ranks high priority right now"
}}"""

    result, error = await ai_analyze_videos([], "custom", prompt)
    if not result:
        return {}

    # Parse JSON — strip any accidental fences
    cleaned = re.sub(r"```json|```", "", result).strip()
    start = cleaned.find("{")
    end = cleaned.rfind("}") + 1
    if start == -1 or end == 0:
        return {}
    try:
        return json.loads(cleaned[start:end])
    except Exception:
        return {}


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/")
def list_recommendations(
    status: Optional[str] = Query(None),
    classification: Optional[str] = Query(None),
    min_priority: int = Query(0),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    q = db.query(ContentRecommendation)
    if status:
        q = q.filter(ContentRecommendation.status == status)
    if classification:
        q = q.filter(ContentRecommendation.classification == classification)
    if min_priority:
        q = q.filter(ContentRecommendation.priority_score >= min_priority)
    total = q.count()
    items = (
        q.order_by(ContentRecommendation.priority_score.desc())
         .offset((page - 1) * page_size)
         .limit(page_size)
         .all()
    )
    return {
        "items": [_serialize(r) for r in items],
        "total": total,
        "page": page,
        "has_more": page * page_size < total,
    }


@router.post("/generate")
async def generate_recommendation(body: dict, db: Session = Depends(get_db)):
    """
    Generate and persist a recommendation from an opportunity card dict.
    Idempotent: if a recommendation for this topic already exists, returns it.
    """
    topic = body.get("topic", "").strip()
    if not topic:
        raise HTTPException(status_code=422, detail="topic is required")

    # Idempotency: return existing if already generated
    existing = db.query(ContentRecommendation).filter(
        ContentRecommendation.topic == topic
    ).first()
    if existing and existing.suggested_title:
        return _serialize(existing)

    # Extract inputs
    frequency = int(body.get("frequency", 0))
    unique_users = int(body.get("unique_users", 0))
    avg_likes = float(body.get("avg_likes", 0))
    growth_rate = float(body.get("growth_rate", 0))
    classification = body.get("classification", "adjacent")
    finniki_confidence = float(body.get("finniki_confidence", 0.5 if classification == "finniki" else 0.1))
    category = body.get("category", "General")
    trend = body.get("trend", "stable")
    example_comments = body.get("example_comments", [])
    creator_ids = body.get("creator_ids", [])
    original_topic = body.get("original_topic", topic)

    scores = compute_scores(
        frequency=frequency,
        unique_users=unique_users,
        avg_likes=avg_likes,
        growth_rate=growth_rate,
        finniki=classification == "finniki",
        finniki_confidence=finniki_confidence,
    )

    # Generate AI content
    generated = await _generate_content(
        topic=topic,
        category=category,
        classification=classification,
        frequency=frequency,
        unique_users=unique_users,
        growth_rate=growth_rate,
        example_comments=example_comments,
        scores=scores,
    )

    rec = existing or ContentRecommendation()
    rec.topic = topic
    rec.original_topic = original_topic
    rec.category = category
    rec.classification = classification
    rec.creator_ids_filter = creator_ids
    rec.frequency = frequency
    rec.unique_users = unique_users
    rec.avg_likes = avg_likes
    rec.growth_rate = growth_rate
    rec.trend = trend

    for k, v in scores.items():
        setattr(rec, k, v)

    rec.suggested_title = generated.get("suggested_title", "")
    rec.suggested_hook = generated.get("suggested_hook", "")
    rec.format = generated.get("format", "long")
    rec.target_audience = generated.get("target_audience", "")
    rec.talking_points = generated.get("talking_points", [])
    rec.faqs = generated.get("faqs", [])
    rec.misconceptions = generated.get("misconceptions", [])
    rec.explanation = generated.get("explanation", "")

    if not existing:
        db.add(rec)
    db.commit()
    db.refresh(rec)
    return _serialize(rec)


@router.get("/{rec_id}")
def get_recommendation(rec_id: int, db: Session = Depends(get_db)):
    rec = db.query(ContentRecommendation).filter(ContentRecommendation.id == rec_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Not found")
    return _serialize(rec)


@router.patch("/{rec_id}")
def update_recommendation(rec_id: int, body: dict, db: Session = Depends(get_db)):
    rec = db.query(ContentRecommendation).filter(ContentRecommendation.id == rec_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Not found")
    for field in ("status", "notes", "suggested_title", "talking_points", "faqs", "misconceptions"):
        if field in body:
            setattr(rec, field, body[field])
    db.commit()
    return {"detail": "ok"}


@router.delete("/{rec_id}")
def delete_recommendation(rec_id: int, db: Session = Depends(get_db)):
    rec = db.query(ContentRecommendation).filter(ContentRecommendation.id == rec_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(rec)
    db.commit()
    return {"detail": "ok"}


@router.get("/{rec_id}/rescore")
def rescore_recommendation(rec_id: int, db: Session = Depends(get_db)):
    """Recompute scores from raw metrics — useful after algorithm changes."""
    rec = db.query(ContentRecommendation).filter(ContentRecommendation.id == rec_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Not found")
    scores = compute_scores(
        frequency=rec.frequency or 0,
        unique_users=rec.unique_users or 0,
        avg_likes=rec.avg_likes or 0,
        growth_rate=rec.growth_rate or 0,
        finniki=rec.classification == "finniki",
        finniki_confidence=0.8 if rec.classification == "finniki" else 0.1,
    )
    for k, v in scores.items():
        setattr(rec, k, v)
    db.commit()
    return _serialize(rec)


# ── Serialiser ────────────────────────────────────────────────────────────────

def _serialize(rec: ContentRecommendation) -> dict:
    return {
        "id": rec.id,
        "topic": rec.topic,
        "original_topic": rec.original_topic,
        "category": rec.category,
        "classification": rec.classification,
        "scores": {
            "demand":     rec.demand_score,
            "engagement": rec.engagement_score,
            "trend":      rec.trend_score,
            "relevance":  rec.relevance_score,
            "priority":   rec.priority_score,
            "confidence": rec.confidence_score,
        },
        "frequency":    rec.frequency,
        "unique_users": rec.unique_users,
        "avg_likes":    rec.avg_likes,
        "growth_rate":  rec.growth_rate,
        "trend":        rec.trend,
        "suggested_title":  rec.suggested_title,
        "suggested_hook":   rec.suggested_hook,
        "format":           rec.format,
        "target_audience":  rec.target_audience,
        "talking_points":   rec.talking_points or [],
        "faqs":             rec.faqs or [],
        "misconceptions":   rec.misconceptions or [],
        "explanation":      rec.explanation,
        "status":           rec.status,
        "notes":            rec.notes,
        "creator_ids_filter": rec.creator_ids_filter or [],
        "created_at": rec.created_at.isoformat() if rec.created_at else None,
        "updated_at": rec.updated_at.isoformat() if rec.updated_at else None,
    }
