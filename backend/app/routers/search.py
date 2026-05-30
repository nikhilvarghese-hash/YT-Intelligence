"""
Global search across all comments + keyword explorer.
Uses SQLite FTS5 for fast full-text search.
"""
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text, func

from ..database import get_db, engine
from ..models import Comment, Video, Creator, SavedSearch
from ..schemas import (
    SearchRequest, SearchResponse, SearchResult,
    KeywordStats, SavedSearchCreate, SavedSearchOut,
)

router = APIRouter()


def ensure_fts(db: Session):
    """Create FTS5 virtual table if not present."""
    try:
        db.execute(text("""
            CREATE VIRTUAL TABLE IF NOT EXISTS comments_fts
            USING fts5(
                comment_text,
                author_name,
                content='comments',
                content_rowid='id'
            )
        """))
        db.execute(text("""
            CREATE TRIGGER IF NOT EXISTS comments_ai AFTER INSERT ON comments BEGIN
                INSERT INTO comments_fts(rowid, comment_text, author_name)
                VALUES (new.id, new.comment_text, new.author_name);
            END
        """))
        db.execute(text("""
            CREATE TRIGGER IF NOT EXISTS comments_ad AFTER DELETE ON comments BEGIN
                INSERT INTO comments_fts(comments_fts, rowid, comment_text, author_name)
                VALUES('delete', old.id, old.comment_text, old.author_name);
            END
        """))
        db.commit()
    except Exception:
        db.rollback()


@router.get("/", response_model=SearchResponse)
def search_comments(
    q: str = Query(..., min_length=1, description="Search query"),
    creator_ids: Optional[str] = Query(None, description="Comma-separated creator IDs"),
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    min_likes: Optional[int] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    creator_id_list = [int(x) for x in creator_ids.split(",") if x.strip()] if creator_ids else None

    # Use LIKE search (FTS5 may not be built in all SQLite versions)
    base_query = (
        db.query(
            Comment,
            Video.title.label("video_title"),
            Creator.channel_name.label("creator_name"),
            Creator.id.label("creator_id"),
        )
        .join(Video, Comment.video_id == Video.id)
        .join(Creator, Video.creator_id == Creator.id)
        .filter(Comment.comment_text.ilike(f"%{q}%"))
    )

    if creator_id_list:
        base_query = base_query.filter(Creator.id.in_(creator_id_list))
    if date_from:
        base_query = base_query.filter(Comment.comment_date >= date_from)
    if date_to:
        base_query = base_query.filter(Comment.comment_date <= date_to)
    if min_likes is not None:
        base_query = base_query.filter(Comment.likes >= min_likes)

    total = base_query.count()
    offset = (page - 1) * page_size

    rows = base_query.order_by(Comment.likes.desc()).offset(offset).limit(page_size).all()

    results = [
        SearchResult(
            comment_id=row.Comment.id,
            comment_text=row.Comment.comment_text,
            author_name=row.Comment.author_name,
            likes=row.Comment.likes,
            reply_count=row.Comment.reply_count,
            comment_date=row.Comment.comment_date,
            video_id=row.Comment.video_id,
            video_title=row.video_title,
            creator_id=row.creator_id,
            creator_name=row.creator_name,
            relevance_score=1.0,
        )
        for row in rows
    ]

    return SearchResponse(results=results, total=total, page=page, page_size=page_size, query=q)


@router.get("/keyword/{keyword}", response_model=KeywordStats)
def keyword_explorer(
    keyword: str,
    creator_ids: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    creator_id_list = [int(x) for x in creator_ids.split(",") if x.strip()] if creator_ids else None

    base = (
        db.query(Comment, Video, Creator)
        .join(Video, Comment.video_id == Video.id)
        .join(Creator, Video.creator_id == Creator.id)
        .filter(Comment.comment_text.ilike(f"%{keyword}%"))
    )
    if creator_id_list:
        base = base.filter(Creator.id.in_(creator_id_list))

    all_rows = base.all()

    if not all_rows:
        return KeywordStats(
            keyword=keyword,
            total_mentions=0,
            unique_videos=0,
            unique_creators=0,
            avg_likes_on_mentions=0,
            top_creators=[],
            top_videos=[],
            most_liked_comments=[],
            most_replied_comments=[],
            mention_trend=[],
        )

    total_mentions = len(all_rows)
    unique_videos = len(set(r.Video.id for r in all_rows))
    unique_creators = len(set(r.Creator.id for r in all_rows))
    avg_likes = sum(r.Comment.likes for r in all_rows) / total_mentions if total_mentions else 0

    # Top creators by mention count
    creator_counts: dict = {}
    for r in all_rows:
        cid = r.Creator.id
        if cid not in creator_counts:
            creator_counts[cid] = {"id": cid, "name": r.Creator.channel_name, "count": 0}
        creator_counts[cid]["count"] += 1
    top_creators = sorted(creator_counts.values(), key=lambda x: x["count"], reverse=True)[:5]

    # Top videos by mention count
    video_counts: dict = {}
    for r in all_rows:
        vid = r.Video.id
        if vid not in video_counts:
            video_counts[vid] = {
                "id": vid,
                "title": r.Video.title,
                "url": r.Video.url,
                "creator": r.Creator.channel_name,
                "count": 0,
            }
        video_counts[vid]["count"] += 1
    top_videos = sorted(video_counts.values(), key=lambda x: x["count"], reverse=True)[:5]

    # Most liked comments
    sorted_by_likes = sorted(all_rows, key=lambda r: r.Comment.likes, reverse=True)[:5]
    most_liked = _format_comments_with_context(sorted_by_likes)

    # Most replied comments
    sorted_by_replies = sorted(all_rows, key=lambda r: r.Comment.reply_count, reverse=True)[:5]
    most_replied = _format_comments_with_context(sorted_by_replies)

    # Trend: group by month
    trend: dict = {}
    for r in all_rows:
        if r.Comment.comment_date:
            key = r.Comment.comment_date.strftime("%Y-%m")
            trend[key] = trend.get(key, 0) + 1
    mention_trend = [{"date": k, "count": v} for k, v in sorted(trend.items())]

    return KeywordStats(
        keyword=keyword,
        total_mentions=total_mentions,
        unique_videos=unique_videos,
        unique_creators=unique_creators,
        avg_likes_on_mentions=round(avg_likes, 2),
        top_creators=top_creators,
        top_videos=top_videos,
        most_liked_comments=most_liked,
        most_replied_comments=most_replied,
        mention_trend=mention_trend,
    )


def _format_comments_with_context(rows):
    return [
        {
            "id": r.Comment.id,
            "comment_id": r.Comment.comment_id,
            "author_name": r.Comment.author_name,
            "author_channel_id": r.Comment.author_channel_id,
            "comment_text": r.Comment.comment_text,
            "comment_date": r.Comment.comment_date,
            "likes": r.Comment.likes,
            "reply_count": r.Comment.reply_count,
            "video_id": r.Video.id,
            "video_title": r.Video.title,
            "creator_name": r.Creator.channel_name,
            "creator_id": r.Creator.id,
        }
        for r in rows
    ]


# ─── Saved Searches ───────────────────────────────────────────────────────────

@router.post("/saved", response_model=SavedSearchOut)
def create_saved_search(req: SavedSearchCreate, db: Session = Depends(get_db)):
    s = SavedSearch(name=req.name, query=req.query, filters=req.filters)
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@router.get("/saved", response_model=List[SavedSearchOut])
def list_saved_searches(db: Session = Depends(get_db)):
    return db.query(SavedSearch).order_by(SavedSearch.created_at.desc()).all()


@router.delete("/saved/{search_id}")
def delete_saved_search(search_id: int, db: Session = Depends(get_db)):
    s = db.query(SavedSearch).filter(SavedSearch.id == search_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(s)
    db.commit()
    return {"detail": "Deleted"}
