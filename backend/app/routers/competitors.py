"""
Competitors router — top-performing competitor videos + AI insights.
"""
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from ..database import get_db
from ..models import Creator, Video
from ..schemas import CreatorOut, CompetitorVideoOut, CompetitorInsightRequest, CompetitorInsightResponse
from ..services.ai_insights import ai_analyze_videos

router = APIRouter()


@router.get("", response_model=list[CreatorOut])
def list_competitors(db: Session = Depends(get_db)):
    creators = db.query(Creator).filter(Creator.is_competitor == True, Creator.is_active == True).all()
    result = []
    for c in creators:
        total_comments = sum(v.comment_count for v in c.videos)
        total_videos = len(c.videos)
        obj = CreatorOut.model_validate(c)
        obj.total_comments = total_comments
        obj.total_videos_imported = total_videos
        result.append(obj)
    return result


@router.post("/{creator_id}")
def add_competitor(creator_id: int, db: Session = Depends(get_db)):
    creator = db.query(Creator).filter(Creator.id == creator_id).first()
    if not creator:
        raise HTTPException(status_code=404, detail="Creator not found")
    creator.is_competitor = True
    db.commit()
    return {"detail": "ok"}


@router.delete("/{creator_id}")
def remove_competitor(creator_id: int, db: Session = Depends(get_db)):
    creator = db.query(Creator).filter(Creator.id == creator_id).first()
    if not creator:
        raise HTTPException(status_code=404, detail="Creator not found")
    creator.is_competitor = False
    db.commit()
    return {"detail": "ok"}


@router.get("/top-videos")
def get_top_videos(
    metric: str = Query("views", pattern="^(views|outlier_score|views_per_hour)$"),
    period: str = Query("week", pattern="^(week|month|all)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    now = datetime.utcnow()

    # Get competitor creator IDs
    competitor_ids = [
        row.id for row in
        db.query(Creator.id).filter(Creator.is_competitor == True, Creator.is_active == True).all()
    ]
    if not competitor_ids:
        return {"items": [], "total": 0, "page": page, "pages": 0}

    # Per-creator avg views of last 10 videos (for outlier score)
    creator_avg: dict[int, float | None] = {}
    creator_video_count: dict[int, int] = {}
    for cid in competitor_ids:
        last10 = (
            db.query(Video.views)
            .filter(Video.creator_id == cid)
            .order_by(desc(Video.publish_date))
            .limit(10)
            .all()
        )
        count = len(last10)
        creator_video_count[cid] = count
        if count >= 3:
            creator_avg[cid] = sum(r.views for r in last10) / count
        else:
            creator_avg[cid] = None

    # Creator lookup
    creator_map = {
        c.id: c for c in
        db.query(Creator).filter(Creator.id.in_(competitor_ids)).all()
    }

    # Base video query with period filter
    q = db.query(Video).filter(Video.creator_id.in_(competitor_ids))
    if period == "week":
        q = q.filter(Video.publish_date >= now - timedelta(days=7))
    elif period == "month":
        q = q.filter(Video.publish_date >= now - timedelta(days=30))

    total = q.count()
    videos = q.order_by(desc(Video.publish_date)).offset((page - 1) * page_size * 3).limit(page_size * 3).all()

    # Compute derived metrics in Python
    rows = []
    for v in videos:
        if v.publish_date:
            hours = max((now - v.publish_date).total_seconds() / 3600, 1)
        else:
            hours = 1
        vph = round(v.views / hours, 1)

        avg = creator_avg.get(v.creator_id)
        outlier = round(v.views / avg, 2) if avg and avg > 0 else None

        creator = creator_map.get(v.creator_id)
        rows.append({
            "id": v.id,
            "video_id": v.video_id,
            "title": v.title,
            "url": v.url,
            "thumbnail_url": v.thumbnail_url,
            "publish_date": v.publish_date,
            "views": v.views,
            "likes": v.likes,
            "comment_count": v.comment_count,
            "creator_id": v.creator_id,
            "creator_name": creator.channel_name if creator else "",
            "subscriber_count": creator.subscriber_count if creator else 0,
            "outlier_score": outlier,
            "views_per_hour": vph,
            "hours_since_published": round(hours, 1),
        })

    # Sort by chosen metric
    if metric == "outlier_score":
        rows.sort(key=lambda x: x["outlier_score"] or 0, reverse=True)
    elif metric == "views_per_hour":
        rows.sort(key=lambda x: x["views_per_hour"], reverse=True)
    else:
        rows.sort(key=lambda x: x["views"], reverse=True)

    # Paginate after sort
    paginated = rows[:page_size]
    pages = max(1, (len(rows) + page_size - 1) // page_size)

    return {
        "items": paginated,
        "total": total,
        "page": page,
        "pages": pages,
    }


@router.post("/ai-insights", response_model=CompetitorInsightResponse)
async def get_ai_insights(req: CompetitorInsightRequest, db: Session = Depends(get_db)):
    # Fetch videos by ID
    videos = db.query(Video).filter(Video.id.in_(req.video_ids[:30])).all()
    creator_ids = list({v.creator_id for v in videos})
    creator_map = {c.id: c.channel_name for c in db.query(Creator).filter(Creator.id.in_(creator_ids)).all()}

    from ..models import Creator as CreatorModel
    video_summaries = [
        f"Title: {v.title} | Views: {v.views:,} | Creator: {creator_map.get(v.creator_id, 'Unknown')}"
        for v in videos
    ]

    insight, error = await ai_analyze_videos(
        video_summaries,
        req.prompt_type,
        req.custom_prompt or "",
    )

    from ..config import settings
    return CompetitorInsightResponse(
        insight=insight,
        model_used=settings.AI_MODEL or settings.AI_PROVIDER,
        error=error,
    )
