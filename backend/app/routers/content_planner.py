"""
Content Planner — Phase 2
Converts approved recommendations into full content packages:
Brief · Video Outline · Thumbnail Ideas · Hooks · SEO Keywords · Calendar.
"""
from __future__ import annotations

import json
import re
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import ContentBrief, ContentRecommendation
from ..services.ai_insights import ai_analyze_videos

router = APIRouter()


# ── AI generation ─────────────────────────────────────────────────────────────

async def _generate_brief(
    topic: str,
    title: str,
    category: str,
    classification: str,
    target_audience: str,
    talking_points: list[str],
    hook: str,
    format_: str,
    priority_score: int,
) -> dict:
    prompt = f"""You are an expert YouTube content strategist for a channel focused on NRI personal finance.

Create a complete content production brief for this approved video:

Topic: {topic}
Title: {title}
Category: {category}
Type: {"Core Finniki NRI finance" if classification == "finniki" else "Adjacent topic"}
Format: {format_}
Target Audience: {target_audience}
Priority Score: {priority_score}/100
Existing Talking Points: {json.dumps(talking_points)}
Draft Hook: {hook}

Respond with ONLY a valid JSON object (no markdown fences):
{{
  "brief_summary": "2-3 sentence production brief — the essential angle and why now",
  "hook": "Refined 20-30 second opening script — must hook within 5 words",
  "video_outline": [
    {{"section": "Intro", "duration_min": 1, "points": ["point 1", "point 2"]}},
    {{"section": "Section title", "duration_min": 3, "points": ["point 1", "point 2", "point 3"]}},
    {{"section": "CTA / Outro", "duration_min": 1, "points": ["Subscribe prompt", "Next video tease"]}}
  ],
  "thumbnail_ideas": [
    {{"concept": "Short concept label", "description": "Visual description of thumbnail layout and text overlay", "style": "fear" | "curiosity" | "value" | "authority"}},
    {{"concept": "...", "description": "...", "style": "..."}},
    {{"concept": "...", "description": "...", "style": "..."}}
  ],
  "seo_primary_keyword": "main search keyword phrase",
  "seo_secondary_keywords": ["keyword 2", "keyword 3", "keyword 4", "keyword 5"],
  "seo_tags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8"],
  "estimated_duration": 12
}}

Rules:
- video_outline must have 4-7 sections
- thumbnail_ideas must have exactly 3 options
- estimated_duration is the video length in minutes (integer)
- seo_primary_keyword should match how NRIs actually search"""

    result, error = await ai_analyze_videos([], "custom", prompt)
    if not result:
        return {}

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

@router.post("/briefs/generate")
async def generate_brief(body: dict, db: Session = Depends(get_db)):
    """
    Generate a full content brief from a recommendation_id or raw fields.
    Idempotent per recommendation_id — returns existing if already generated.
    """
    rec_id: Optional[int] = body.get("recommendation_id")
    rec: Optional[ContentRecommendation] = None

    if rec_id:
        rec = db.query(ContentRecommendation).filter(ContentRecommendation.id == rec_id).first()
        if not rec:
            raise HTTPException(status_code=404, detail="Recommendation not found")

        # Idempotency
        existing = db.query(ContentBrief).filter(ContentBrief.recommendation_id == rec_id).first()
        if existing and existing.brief_summary:
            return _serialize(existing)

    topic = (rec.topic if rec else body.get("topic", "")).strip()
    if not topic:
        raise HTTPException(status_code=422, detail="topic or recommendation_id required")

    title = rec.suggested_title if rec else body.get("title", topic)
    category = rec.category if rec else body.get("category", "General")
    classification = rec.classification if rec else body.get("classification", "adjacent")
    target_audience = rec.target_audience if rec else body.get("target_audience", "NRI investors")
    talking_points = (rec.talking_points or []) if rec else body.get("talking_points", [])
    hook = rec.suggested_hook if rec else body.get("hook", "")
    format_ = rec.format if rec else body.get("format", "long")
    priority_score = rec.priority_score if rec else body.get("priority_score", 50)

    generated = await _generate_brief(
        topic=topic,
        title=title,
        category=category,
        classification=classification,
        target_audience=target_audience,
        talking_points=talking_points,
        hook=hook,
        format_=format_,
        priority_score=priority_score,
    )

    brief = ContentBrief()
    brief.recommendation_id = rec_id
    brief.topic = topic
    brief.title = title
    brief.category = category
    brief.classification = classification
    brief.brief_summary = generated.get("brief_summary", "")
    brief.target_audience = target_audience
    brief.hook = generated.get("hook", hook)
    brief.video_outline = generated.get("video_outline", [])
    brief.thumbnail_ideas = generated.get("thumbnail_ideas", [])
    brief.seo_primary_keyword = generated.get("seo_primary_keyword", "")
    brief.seo_secondary_keywords = generated.get("seo_secondary_keywords", [])
    brief.seo_tags = generated.get("seo_tags", [])
    brief.estimated_duration = generated.get("estimated_duration", 10)
    brief.content_format = format_

    db.add(brief)
    db.commit()
    db.refresh(brief)
    return _serialize(brief)


@router.get("/briefs")
def list_briefs(
    status: Optional[str] = Query(None),
    classification: Optional[str] = Query(None),
    format: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    q = db.query(ContentBrief)
    if status:
        q = q.filter(ContentBrief.status == status)
    if classification:
        q = q.filter(ContentBrief.classification == classification)
    if format:
        q = q.filter(ContentBrief.content_format == format)
    total = q.count()
    items = (
        q.order_by(ContentBrief.created_at.desc())
         .offset((page - 1) * page_size)
         .limit(page_size)
         .all()
    )
    return {
        "items": [_serialize(b) for b in items],
        "total": total,
        "page": page,
        "has_more": page * page_size < total,
    }


@router.get("/calendar")
def get_calendar(
    year: int = Query(...),
    month: int = Query(...),
    db: Session = Depends(get_db),
):
    """Return all briefs scheduled in the given month."""
    from calendar import monthrange
    from datetime import date

    first = datetime(year, month, 1)
    last_day = monthrange(year, month)[1]
    last = datetime(year, month, last_day, 23, 59, 59)

    items = (
        db.query(ContentBrief)
          .filter(ContentBrief.scheduled_date >= first)
          .filter(ContentBrief.scheduled_date <= last)
          .order_by(ContentBrief.scheduled_date)
          .all()
    )
    return {"items": [_serialize(b) for b in items]}


@router.get("/briefs/{brief_id}")
def get_brief(brief_id: int, db: Session = Depends(get_db)):
    brief = db.query(ContentBrief).filter(ContentBrief.id == brief_id).first()
    if not brief:
        raise HTTPException(status_code=404, detail="Not found")
    return _serialize(brief)


@router.patch("/briefs/{brief_id}")
def update_brief(brief_id: int, body: dict, db: Session = Depends(get_db)):
    brief = db.query(ContentBrief).filter(ContentBrief.id == brief_id).first()
    if not brief:
        raise HTTPException(status_code=404, detail="Not found")
    patchable = (
        "status", "notes", "title", "hook", "brief_summary",
        "video_outline", "thumbnail_ideas", "seo_primary_keyword",
        "seo_secondary_keywords", "seo_tags", "estimated_duration",
        "content_format", "target_audience",
    )
    for field in patchable:
        if field in body:
            setattr(brief, field, body[field])
    if "scheduled_date" in body:
        val = body["scheduled_date"]
        brief.scheduled_date = datetime.fromisoformat(val) if val else None
    db.commit()
    return {"detail": "ok"}


@router.delete("/briefs/{brief_id}")
def delete_brief(brief_id: int, db: Session = Depends(get_db)):
    brief = db.query(ContentBrief).filter(ContentBrief.id == brief_id).first()
    if not brief:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(brief)
    db.commit()
    return {"detail": "ok"}


# ── Serialiser ────────────────────────────────────────────────────────────────

def _serialize(b: ContentBrief) -> dict:
    return {
        "id": b.id,
        "recommendation_id": b.recommendation_id,
        "topic": b.topic,
        "title": b.title,
        "category": b.category,
        "classification": b.classification,
        "brief_summary": b.brief_summary,
        "target_audience": b.target_audience,
        "hook": b.hook,
        "video_outline": b.video_outline or [],
        "thumbnail_ideas": b.thumbnail_ideas or [],
        "seo_primary_keyword": b.seo_primary_keyword,
        "seo_secondary_keywords": b.seo_secondary_keywords or [],
        "seo_tags": b.seo_tags or [],
        "estimated_duration": b.estimated_duration,
        "content_format": b.content_format,
        "status": b.status,
        "scheduled_date": b.scheduled_date.isoformat() if b.scheduled_date else None,
        "notes": b.notes,
        "created_at": b.created_at.isoformat() if b.created_at else None,
        "updated_at": b.updated_at.isoformat() if b.updated_at else None,
    }
