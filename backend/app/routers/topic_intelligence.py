"""
Topic Intelligence router — theme clustering over audience comments.
"""
import asyncio
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Comment, Video, Creator, AppSettings
from ..services.topic_clusters import (
    build_clusters, enrich_with_ai, load_cache, save_cache,
)
from ..services.ai_insights import extract_questions, discover_content_opportunities

router = APIRouter()

# Global flag so only one rebuild runs at a time
_building: bool = False
_build_error: str = ""
_build_started: Optional[datetime] = None


def _get_setting(db: Session, key: str) -> str | None:
    row = db.query(AppSettings).filter(AppSettings.key == key).first()
    return row.value if row else None


# ── Data loader ───────────────────────────────────────────────────────────────

def _load_comment_data(db: Session, id_list: list[int] | None, period: int) -> tuple[list[str], list[dict], int]:
    """
    Returns (questions, comments_meta, total_count).
    comments_meta contains raw comment dicts for cluster metadata computation.
    """
    cutoff = datetime.utcnow() - timedelta(days=period)

    q = (
        db.query(Comment, Video.title.label("video_title"), Creator.channel_name.label("creator_name"))
        .join(Video, Comment.video_id == Video.id)
        .join(Creator, Video.creator_id == Creator.id)
    )
    if id_list:
        q = q.filter(Creator.id.in_(id_list))

    rows = q.limit(15000).all()
    total_count = len(rows)

    texts = [r.Comment.comment_text for r in rows]
    raw_questions = extract_questions(texts)
    raw_opportunities = discover_content_opportunities(texts)

    # Build flat question list
    all_questions: list[str] = []
    seen: set[str] = set()
    for item in raw_questions:
        q_text = item.get("question_text", "")
        if q_text and q_text not in seen:
            seen.add(q_text)
            # Repeat by frequency so clusters reflect demand
            freq = min(item.get("frequency", 1), 5)
            all_questions.extend([q_text] * freq)
    for item in raw_opportunities:
        q_text = item.get("topic", "")
        if q_text and q_text not in seen:
            seen.add(q_text)
            freq = min(item.get("frequency", 1), 3)
            all_questions.extend([q_text] * freq)

    # Build comments_meta for growth/users/video metadata
    comments_meta: list[dict] = []
    for r in rows:
        comments_meta.append({
            "text":        r.Comment.comment_text,
            "author":      r.Comment.author_channel_id or r.Comment.author_name or "",
            "date":        r.Comment.comment_date,
            "likes":       r.Comment.likes or 0,
            "video_title": r.video_title,
        })

    return all_questions, comments_meta, total_count


# ── Background rebuild ────────────────────────────────────────────────────────

async def _rebuild_task(id_list: list[int], period: int):
    global _building, _build_error, _build_started
    _building = True
    _build_error = ""
    _build_started = datetime.utcnow()

    from ..database import SessionLocal
    db = SessionLocal()
    try:
        questions, meta, total = _load_comment_data(db, id_list or None, period)
        if not questions:
            _build_error = "No questions found in comments."
            return

        clusters = build_clusters(questions, meta)
        clusters = await enrich_with_ai(clusters)
        save_cache(db, clusters, id_list, period, total)
    except Exception as e:
        _build_error = str(e)
    finally:
        _building = False
        db.close()


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/themes")
async def get_themes(
    creator_ids: Optional[str] = Query(None),
    period: int = Query(90),
    force_rebuild: bool = Query(False),
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db),
):
    global _building

    id_list = [int(x) for x in creator_ids.split(",") if x.strip()] if creator_ids else []

    # Fast path: return cache if available and not forced
    if not force_rebuild:
        # Count comments to check fingerprint without loading all data
        count_q = db.query(Comment)
        if id_list:
            count_q = (
                count_q.join(Video, Comment.video_id == Video.id)
                       .join(Creator, Video.creator_id == Creator.id)
                       .filter(Creator.id.in_(id_list))
            )
        total_count = count_q.count()
        cached = load_cache(db, id_list, period, total_count)
        if cached:
            return {
                "themes": cached,
                "status": "cached",
                "building": _building,
                "error": _build_error,
            }

    # If already building, report status
    if _building:
        return {"themes": [], "status": "building", "building": True, "error": ""}

    # Trigger background rebuild
    if background_tasks is not None:
        background_tasks.add_task(_rebuild_task, id_list, period)
        return {"themes": [], "status": "building", "building": True, "error": ""}

    # Fallback: run inline (for force_rebuild=True without BackgroundTasks injection)
    await _rebuild_task(id_list, period)
    total_count = db.query(Comment).count()
    cached = load_cache(db, id_list, period, total_count)
    return {
        "themes": cached or [],
        "status": "ready",
        "building": False,
        "error": _build_error,
    }


@router.post("/rebuild")
async def rebuild_themes(
    creator_ids: Optional[str] = Query(None),
    period: int = Query(90),
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db),
):
    global _building
    id_list = [int(x) for x in creator_ids.split(",") if x.strip()] if creator_ids else []
    if _building:
        return {"detail": "Already building", "building": True}
    if background_tasks is not None:
        background_tasks.add_task(_rebuild_task, id_list, period)
    return {"detail": "Rebuild started", "building": True}


@router.get("/status")
def build_status():
    return {
        "building": _building,
        "error": _build_error,
        "started_at": _build_started.isoformat() if _build_started else None,
    }


@router.get("/themes/{theme_id}")
async def get_theme_detail(
    theme_id: str,
    creator_ids: Optional[str] = Query(None),
    period: int = Query(90),
    db: Session = Depends(get_db),
):
    """Return a single theme with full question list."""
    id_list = [int(x) for x in creator_ids.split(",") if x.strip()] if creator_ids else []

    count_q = db.query(Comment)
    if id_list:
        count_q = (
            count_q.join(Video, Comment.video_id == Video.id)
                   .join(Creator, Video.creator_id == Creator.id)
                   .filter(Creator.id.in_(id_list))
        )
    total_count = count_q.count()
    cached = load_cache(db, id_list, period, total_count)
    if not cached:
        return {"error": "No cache available. Trigger a rebuild first."}

    theme = next((t for t in cached if t["id"] == theme_id), None)
    if not theme:
        return {"error": "Theme not found"}
    return theme
