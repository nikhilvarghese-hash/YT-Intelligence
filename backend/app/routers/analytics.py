"""
Analytics: pain points, questions, purchase intent, content opportunities,
audience overlap, creator comparison, collections, watchlists.
"""
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, text

from ..database import get_db
from ..models import (
    Comment, Video, Creator, Reply,
    CommentCollection, CollectionItem, Watchlist,
)
from ..schemas import (
    CollectionCreate, CollectionOut, AddToCollectionRequest,
    WatchlistCreate, WatchlistOut,
)
from ..services.ai_insights import (
    detect_pain_points, extract_questions,
    detect_purchase_intent, discover_content_opportunities,
    ai_analyze_videos,
)
from ..models import AppSettings

router = APIRouter()


def _get_comments_for_creators(db: Session, creator_ids: Optional[List[int]] = None, limit: int = 5000):
    q = (
        db.query(Comment, Video.title.label("video_title"), Creator.channel_name.label("creator_name"), Creator.id.label("creator_id"))
        .join(Video, Comment.video_id == Video.id)
        .join(Creator, Video.creator_id == Creator.id)
    )
    if creator_ids:
        q = q.filter(Creator.id.in_(creator_ids))
    return q.order_by(Comment.likes.desc()).limit(limit).all()


# ─── Pain Points ─────────────────────────────────────────────────────────────

@router.get("/pain-points")
def get_pain_points(
    creator_ids: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    id_list = [int(x) for x in creator_ids.split(",") if x.strip()] if creator_ids else None
    rows = _get_comments_for_creators(db, id_list)
    texts = [r.Comment.comment_text for r in rows]
    return detect_pain_points(texts)


# ─── Question Mining ──────────────────────────────────────────────────────────

@router.get("/questions")
def get_questions(
    creator_ids: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    id_list = [int(x) for x in creator_ids.split(",") if x.strip()] if creator_ids else None
    rows = _get_comments_for_creators(db, id_list, limit=10000)

    # Also get creator names per question
    texts = [r.Comment.comment_text for r in rows]
    questions = extract_questions(texts)

    # Enrich with creator names
    for q in questions:
        matching_creators = set()
        for r in rows:
            if any(ex in r.Comment.comment_text for ex in q.get("example_comments", [])[:2]):
                matching_creators.add(r.creator_name)
        q["creator_names"] = list(matching_creators)

    return questions


# ─── Purchase Intent ─────────────────────────────────────────────────────────

@router.get("/purchase-intent")
def get_purchase_intent(
    creator_ids: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    id_list = [int(x) for x in creator_ids.split(",") if x.strip()] if creator_ids else None
    rows = _get_comments_for_creators(db, id_list, limit=5000)

    comments_data = [
        {
            "id": r.Comment.id,
            "comment_text": r.Comment.comment_text,
            "author_name": r.Comment.author_name,
            "likes": r.Comment.likes,
            "comment_date": r.Comment.comment_date.isoformat() if r.Comment.comment_date else None,
            "video_title": r.video_title,
            "creator_name": r.creator_name,
        }
        for r in rows
    ]
    return detect_purchase_intent(comments_data)


# ─── Content Opportunities ────────────────────────────────────────────────────

@router.get("/content-opportunities")
def get_content_opportunities(
    creator_ids: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    id_list = [int(x) for x in creator_ids.split(",") if x.strip()] if creator_ids else None
    rows = _get_comments_for_creators(db, id_list)

    texts = [r.Comment.comment_text for r in rows]
    opportunities = discover_content_opportunities(texts)

    # Enrich with creator names
    for opp in opportunities:
        creators_set = set()
        topic = opp["topic"].lower()
        for r in rows:
            if topic in r.Comment.comment_text.lower():
                creators_set.add(r.creator_name)
        opp["creators_mentioning"] = list(creators_set)

    return opportunities


# ─── Audience Overlap ────────────────────────────────────────────────────────

@router.get("/audience-overlap")
def get_audience_overlap(
    creator_ids: Optional[str] = Query(None),
    min_creators: int = Query(2, ge=2),
    db: Session = Depends(get_db),
):
    id_list = [int(x) for x in creator_ids.split(",") if x.strip()] if creator_ids else None

    query = (
        db.query(
            Comment.author_channel_id,
            Comment.author_name,
            func.count(func.distinct(Creator.id)).label("creator_count"),
            func.count(Comment.id).label("comment_count"),
        )
        .join(Video, Comment.video_id == Video.id)
        .join(Creator, Video.creator_id == Creator.id)
        .filter(Comment.author_channel_id.isnot(None))
        .group_by(Comment.author_channel_id, Comment.author_name)
        .having(func.count(func.distinct(Creator.id)) >= min_creators)
        .order_by(func.count(func.distinct(Creator.id)).desc())
    )

    if id_list:
        query = query.filter(Creator.id.in_(id_list))

    rows = query.limit(200).all()

    result = []
    for row in rows:
        # Get which creators they commented on
        creator_names = (
            db.query(func.distinct(Creator.channel_name))
            .join(Video, Creator.id == Video.creator_id)
            .join(Comment, Video.id == Comment.video_id)
            .filter(Comment.author_channel_id == row.author_channel_id)
            .all()
        )
        result.append({
            "author_name": row.author_name,
            "author_channel_id": row.author_channel_id,
            "creator_count": row.creator_count,
            "comment_count": row.comment_count,
            "creators": [c[0] for c in creator_names],
        })

    return result


# ─── Creator Comparison ───────────────────────────────────────────────────────

@router.get("/compare")
def compare_creators(
    creator_ids: str = Query(..., description="Comma-separated creator IDs"),
    db: Session = Depends(get_db),
):
    id_list = [int(x) for x in creator_ids.split(",") if x.strip()]
    result = []

    for cid in id_list:
        creator = db.query(Creator).filter(Creator.id == cid).first()
        if not creator:
            continue

        total_comments = (
            db.query(func.count(Comment.id))
            .join(Video, Comment.video_id == Video.id)
            .filter(Video.creator_id == cid)
            .scalar() or 0
        )
        avg_likes = (
            db.query(func.avg(Comment.likes))
            .join(Video, Comment.video_id == Video.id)
            .filter(Video.creator_id == cid)
            .scalar() or 0
        )
        avg_replies = (
            db.query(func.avg(Comment.reply_count))
            .join(Video, Comment.video_id == Video.id)
            .filter(Video.creator_id == cid)
            .scalar() or 0
        )
        total_videos = db.query(func.count(Video.id)).filter(Video.creator_id == cid).scalar() or 0
        total_views = db.query(func.sum(Video.views)).filter(Video.creator_id == cid).scalar() or 0

        engagement_rate = (total_comments / total_views * 100) if total_views > 0 else 0

        result.append({
            "creator_id": cid,
            "creator_name": creator.channel_name,
            "subscriber_count": creator.subscriber_count,
            "total_comments": total_comments,
            "avg_likes_per_comment": round(float(avg_likes), 2),
            "avg_replies_per_comment": round(float(avg_replies), 2),
            "engagement_rate": round(engagement_rate, 4),
            "total_videos": total_videos,
            "thumbnail_url": creator.thumbnail_url,
        })

    return result


# ─── Collections ─────────────────────────────────────────────────────────────

@router.get("/collections", response_model=List[CollectionOut])
def list_collections(db: Session = Depends(get_db)):
    cols = db.query(CommentCollection).order_by(CommentCollection.created_at.desc()).all()
    result = []
    for col in cols:
        count = db.query(func.count(CollectionItem.id)).filter(CollectionItem.collection_id == col.id).scalar()
        out = CollectionOut.model_validate(col)
        out.item_count = count
        result.append(out)
    return result


@router.post("/collections", response_model=CollectionOut)
def create_collection(req: CollectionCreate, db: Session = Depends(get_db)):
    col = CommentCollection(name=req.name, description=req.description, color=req.color)
    db.add(col)
    db.commit()
    db.refresh(col)
    out = CollectionOut.model_validate(col)
    out.item_count = 0
    return out


@router.delete("/collections/{collection_id}")
def delete_collection(collection_id: int, db: Session = Depends(get_db)):
    col = db.query(CommentCollection).filter(CommentCollection.id == collection_id).first()
    if not col:
        raise HTTPException(status_code=404)
    db.delete(col)
    db.commit()
    return {"detail": "Deleted"}


@router.post("/collections/{collection_id}/items")
def add_to_collection(
    collection_id: int,
    req: AddToCollectionRequest,
    db: Session = Depends(get_db),
):
    col = db.query(CommentCollection).filter(CommentCollection.id == collection_id).first()
    if not col:
        raise HTTPException(status_code=404, detail="Collection not found")

    added = 0
    for comment_id in req.comment_ids:
        existing = db.query(CollectionItem).filter(
            CollectionItem.collection_id == collection_id,
            CollectionItem.comment_id == comment_id,
        ).first()
        if not existing:
            item = CollectionItem(
                collection_id=collection_id,
                comment_id=comment_id,
                note=req.note,
            )
            db.add(item)
            added += 1

    db.commit()
    return {"added": added}


@router.get("/collections/{collection_id}/items")
def get_collection_items(
    collection_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    offset = (page - 1) * page_size
    total = db.query(func.count(CollectionItem.id)).filter(CollectionItem.collection_id == collection_id).scalar()

    items = (
        db.query(CollectionItem, Comment, Video.title.label("video_title"), Creator.channel_name.label("creator_name"))
        .join(Comment, CollectionItem.comment_id == Comment.id)
        .join(Video, Comment.video_id == Video.id)
        .join(Creator, Video.creator_id == Creator.id)
        .filter(CollectionItem.collection_id == collection_id)
        .offset(offset).limit(page_size).all()
    )

    return {
        "items": [
            {
                "item_id": item.CollectionItem.id,
                "comment_id": item.Comment.id,
                "comment_text": item.Comment.comment_text,
                "author_name": item.Comment.author_name,
                "likes": item.Comment.likes,
                "comment_date": item.Comment.comment_date,
                "video_title": item.video_title,
                "creator_name": item.creator_name,
                "note": item.CollectionItem.note,
                "added_at": item.CollectionItem.added_at,
            }
            for item in items
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size,
    }


@router.delete("/collections/{collection_id}/items/{item_id}")
def remove_from_collection(collection_id: int, item_id: int, db: Session = Depends(get_db)):
    item = db.query(CollectionItem).filter(
        CollectionItem.collection_id == collection_id,
        CollectionItem.id == item_id,
    ).first()
    if not item:
        raise HTTPException(status_code=404)
    db.delete(item)
    db.commit()
    return {"detail": "Removed"}


# ─── Watchlists ───────────────────────────────────────────────────────────────

@router.get("/watchlists", response_model=List[WatchlistOut])
def list_watchlists(db: Session = Depends(get_db)):
    return db.query(Watchlist).order_by(Watchlist.created_at.desc()).all()


@router.post("/watchlists", response_model=WatchlistOut)
def create_watchlist(req: WatchlistCreate, db: Session = Depends(get_db)):
    w = Watchlist(keyword=req.keyword, description=req.description, creator_ids=req.creator_ids)
    db.add(w)
    db.commit()
    db.refresh(w)
    return w


@router.delete("/watchlists/{watchlist_id}")
def delete_watchlist(watchlist_id: int, db: Session = Depends(get_db)):
    w = db.query(Watchlist).filter(Watchlist.id == watchlist_id).first()
    if not w:
        raise HTTPException(status_code=404)
    db.delete(w)
    db.commit()
    return {"detail": "Deleted"}


# ─── AI Content Strategy Insights ────────────────────────────────────────────

def _get_setting(db: Session, key: str) -> str | None:
    row = db.query(AppSettings).filter(AppSettings.key == key).first()
    return row.value if row else None

def _set_setting(db: Session, key: str, value: str):
    row = db.query(AppSettings).filter(AppSettings.key == key).first()
    if row:
        row.value = value
        row.updated_at = datetime.utcnow()
    else:
        row = AppSettings(key=key, value=value)
        db.add(row)
    db.commit()


@router.get("/competitor-insights/status")
def get_competitor_insights_status(
    creator_ids: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    id_list = [int(x) for x in creator_ids.split(",") if x.strip()] if creator_ids else None
    last_run_str = _get_setting(db, "competitor_insights_last_run")
    last_run_at = datetime.fromisoformat(last_run_str) if last_run_str else None

    base_q = (
        db.query(func.count(Comment.id))
        .join(Video, Comment.video_id == Video.id)
        .join(Creator, Video.creator_id == Creator.id)
    )
    if id_list:
        base_q = base_q.filter(Creator.id.in_(id_list))
    total_comments = base_q.scalar() or 0

    new_comments = 0
    if last_run_at:
        new_q = (
            db.query(func.count(Comment.id))
            .join(Video, Comment.video_id == Video.id)
            .join(Creator, Video.creator_id == Creator.id)
            .filter(Comment.imported_at > last_run_at)
        )
        if id_list:
            new_q = new_q.filter(Creator.id.in_(id_list))
        new_comments = new_q.scalar() or 0

    return {
        "last_run_at": last_run_at.isoformat() if last_run_at else None,
        "new_comments_since_last_run": new_comments if last_run_at else total_comments,
        "total_comments": total_comments,
        "is_first_run": last_run_at is None,
    }


@router.post("/competitor-insights")
async def run_competitor_insights(
    creator_ids: Optional[str] = Query(None),
    incremental: bool = Query(True),
    db: Session = Depends(get_db),
):
    from ..config import settings as app_settings
    id_list = [int(x) for x in creator_ids.split(",") if x.strip()] if creator_ids else None

    # Determine cutoff for incremental
    last_run_str = _get_setting(db, "competitor_insights_last_run")
    last_run_at = datetime.fromisoformat(last_run_str) if last_run_str else None
    cutoff = last_run_at if (incremental and last_run_at) else None

    # Query comments
    q = (
        db.query(Comment, Video.title.label("video_title"), Creator.channel_name.label("creator_name"))
        .join(Video, Comment.video_id == Video.id)
        .join(Creator, Video.creator_id == Creator.id)
    )
    if id_list:
        q = q.filter(Creator.id.in_(id_list))
    if cutoff:
        q = q.filter(Comment.imported_at > cutoff)

    rows = q.order_by(Comment.likes.desc()).limit(8000).all()
    comments_analyzed = len(rows)

    if comments_analyzed == 0:
        return {
            "insight": None,
            "model_used": None,
            "error": "No new comments to analyze since last run." if cutoff else "No comments found. Import creators first.",
            "comments_analyzed": 0,
            "incremental_since": cutoff.isoformat() if cutoff else None,
            "last_run_at": last_run_str,
        }

    texts = [r.Comment.comment_text for r in rows]
    questions = extract_questions(texts)
    pain_points = detect_pain_points(texts)
    opportunities = discover_content_opportunities(texts)

    # Build compact summary for AI
    def _fmt_list(items, key, freq_key="frequency", n=15):
        return "\n".join(
            f"  • {item[key]} ({item[freq_key]}× mentions)"
            for item in sorted(items, key=lambda x: x[freq_key], reverse=True)[:n]
        )

    summary_lines = [
        f"Comments analyzed: {comments_analyzed}",
        f"Period: {'since ' + cutoff.strftime('%Y-%m-%d') if cutoff else 'all time'}",
        "",
        "TOP QUESTIONS FROM AUDIENCE:",
        _fmt_list(questions, "question_text"),
        "",
        "PAIN POINTS:",
        _fmt_list(pain_points, "topic"),
        "",
        "CONTENT TOPICS MENTIONED:",
        _fmt_list(opportunities, "topic"),
    ]
    prompt_data = "\n".join(summary_lines)

    prompt = f"""You are a YouTube content strategist. Analyze this audience intelligence data and provide actionable content recommendations.

{prompt_data}

Provide a structured analysis with these exact sections:

## 🎯 TOP 5 PRIORITY TOPICS
For each topic: name, why it matters (mention count + gap assessment), and 2 specific video title ideas.

## 🔥 TRENDING NOW
3-5 topics showing the highest recent demand based on the data.

## 🚨 CONTENT GAPS
Topics with high audience demand but likely underserved — these are your biggest opportunities.

## ⚡ QUICK WIN VIDEO IDEAS
5 specific, ready-to-film video titles based on the most common questions. Include the question pattern that inspired each.

Keep it concise and actionable. Focus on what to create NEXT."""

    video_summaries = summary_lines
    insight, error = await ai_analyze_videos(video_summaries, "custom", prompt)

    # Update last run timestamp
    now_str = datetime.utcnow().isoformat()
    _set_setting(db, "competitor_insights_last_run", now_str)

    return {
        "insight": insight,
        "model_used": app_settings.AI_MODEL or app_settings.AI_PROVIDER,
        "error": error,
        "comments_analyzed": comments_analyzed,
        "incremental_since": cutoff.isoformat() if cutoff else None,
        "last_run_at": now_str,
        "topics_found": len(questions) + len(pain_points) + len(opportunities),
    }


@router.post("/watchlists/{watchlist_id}/check")
def check_watchlist(watchlist_id: int, db: Session = Depends(get_db)):
    """Update mention count for a watchlist keyword."""
    w = db.query(Watchlist).filter(Watchlist.id == watchlist_id).first()
    if not w:
        raise HTTPException(status_code=404)

    q = db.query(func.count(Comment.id)).filter(Comment.comment_text.ilike(f"%{w.keyword}%"))
    if w.creator_ids:
        q = q.join(Video, Comment.video_id == Video.id).filter(Video.creator_id.in_(w.creator_ids))

    count = q.scalar() or 0
    w.mention_count = count
    w.last_checked_at = datetime.utcnow()
    db.commit()
    return {"keyword": w.keyword, "mention_count": count}
