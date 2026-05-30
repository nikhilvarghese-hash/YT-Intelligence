"""
Creator management: discovery, import, listing, deletion.
Import runs as a background task with SSE progress updates.
"""
import asyncio
import json
import uuid
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..database import get_db
from ..models import Creator, Video, Comment, Reply
from ..schemas import (
    CreatorDiscoveryRequest, CreatorDiscoveryResult,
    ImportRequest, CreatorOut, VideoOut, ImportStatus,
)
from ..services import youtube as yt_service

router = APIRouter()

# In-memory job store (use Redis in production)
_import_jobs: dict[str, dict] = {}


# ─── Discovery ────────────────────────────────────────────────────────────────

@router.post("/discover", response_model=CreatorDiscoveryResult)
async def discover_creator(req: CreatorDiscoveryRequest, db: Session = Depends(get_db)):
    """Search for a YouTube channel by name, URL, or channel ID."""
    try:
        channel = await yt_service.discover_channel(req.query)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"YouTube API error: {str(e)}")

    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")

    existing = db.query(Creator).filter(Creator.channel_id == channel["channel_id"]).first()
    channel["already_imported"] = existing is not None
    return CreatorDiscoveryResult(**channel)


# ─── Import ───────────────────────────────────────────────────────────────────

@router.post("/import")
async def start_import(req: ImportRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Start a background import job for a channel."""
    job_id = str(uuid.uuid4())
    _import_jobs[job_id] = {
        "job_id": job_id,
        "status": "pending",
        "channel_id": req.channel_id,
        "channel_name": None,
        "videos_total": 0,
        "videos_imported": 0,
        "comments_total": 0,
        "comments_imported": 0,
        "progress_pct": 0.0,
        "message": "Initializing...",
        "started_at": datetime.utcnow().isoformat(),
        "completed_at": None,
        "error": None,
    }
    background_tasks.add_task(_run_import, job_id, req.channel_id, req.video_count)
    return {"job_id": job_id}


@router.get("/import/{job_id}/status")
async def get_import_status(job_id: str):
    """Poll import job status."""
    job = _import_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.get("/import/{job_id}/stream")
async def stream_import_status(job_id: str):
    """SSE stream for real-time import progress."""
    async def event_stream():
        while True:
            job = _import_jobs.get(job_id)
            if not job:
                yield f"data: {json.dumps({'error': 'Job not found'})}\n\n"
                break
            yield f"data: {json.dumps(job)}\n\n"
            if job["status"] in ("completed", "failed"):
                break
            await asyncio.sleep(1)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


async def _run_import(job_id: str, channel_id: str, video_count: int):
    """Background import task."""
    from ..database import SessionLocal
    db = SessionLocal()
    job = _import_jobs[job_id]

    try:
        job["status"] = "running"
        job["message"] = "Fetching channel info..."

        # Get or create creator
        channel_info = await yt_service.discover_channel(channel_id)
        if not channel_info:
            raise ValueError("Channel not found")

        job["channel_name"] = channel_info["channel_name"]

        creator = db.query(Creator).filter(Creator.channel_id == channel_id).first()
        if not creator:
            creator = Creator(
                channel_id=channel_info["channel_id"],
                channel_name=channel_info["channel_name"],
                subscriber_count=channel_info.get("subscriber_count", 0),
                video_count=channel_info.get("video_count", 0),
                channel_url=channel_info.get("channel_url"),
                thumbnail_url=channel_info.get("thumbnail_url"),
                description=channel_info.get("description"),
                country=channel_info.get("country"),
            )
            db.add(creator)
        else:
            creator.subscriber_count = channel_info.get("subscriber_count", 0)
            creator.channel_name = channel_info["channel_name"]
        db.commit()
        db.refresh(creator)

        # Fetch videos
        job["message"] = f"Fetching last {video_count} videos..."
        videos = await yt_service.get_channel_videos(channel_id, video_count)
        job["videos_total"] = len(videos)

        for i, v in enumerate(videos):
            # Skip existing
            existing_video = db.query(Video).filter(Video.video_id == v["video_id"]).first()
            if not existing_video:
                video_obj = Video(
                    creator_id=creator.id,
                    video_id=v["video_id"],
                    title=v["title"],
                    url=v["url"],
                    description=v.get("description"),
                    publish_date=v.get("publish_date"),
                    views=v.get("views", 0),
                    likes=v.get("likes", 0),
                    comment_count=v.get("comment_count", 0),
                    duration=v.get("duration"),
                    thumbnail_url=v.get("thumbnail_url"),
                )
                db.add(video_obj)
                db.commit()
                db.refresh(video_obj)
            else:
                video_obj = existing_video
                # Update stats
                video_obj.views = v.get("views", 0)
                video_obj.likes = v.get("likes", 0)
                video_obj.comment_count = v.get("comment_count", 0)
                db.commit()

            job["videos_imported"] = i + 1
            job["progress_pct"] = round((i + 1) / len(videos) * 50, 1)

            # Fetch comments
            if not existing_video or not existing_video.comments_imported:
                job["message"] = f"Importing comments for: {v['title'][:50]}..."
                comments = await yt_service.get_video_comments(v["video_id"])
                job["comments_total"] += len(comments)

                for c in comments:
                    existing_comment = db.query(Comment).filter(Comment.comment_id == c["comment_id"]).first()
                    if not existing_comment:
                        comment_obj = Comment(
                            video_id=video_obj.id,
                            comment_id=c["comment_id"],
                            author_name=c.get("author_name"),
                            author_channel_id=c.get("author_channel_id"),
                            comment_text=c["comment_text"],
                            comment_date=c.get("comment_date"),
                            likes=c.get("likes", 0),
                            reply_count=c.get("reply_count", 0),
                        )
                        db.add(comment_obj)
                        db.flush()

                        # Replies
                        for r in c.get("replies", []):
                            reply_obj = Reply(
                                comment_id=comment_obj.id,
                                reply_id=r["reply_id"],
                                reply_author=r.get("reply_author"),
                                reply_author_channel_id=r.get("reply_author_channel_id"),
                                reply_text=r["reply_text"],
                                reply_date=r.get("reply_date"),
                                likes=r.get("likes", 0),
                            )
                            db.add(reply_obj)

                        job["comments_imported"] += 1

                db.commit()
                video_obj.comments_imported = True
                video_obj.comments_imported_at = datetime.utcnow()
                db.commit()

            job["progress_pct"] = round(50 + (i + 1) / len(videos) * 50, 1)

        creator.last_synced_at = datetime.utcnow()
        db.commit()

        job["status"] = "completed"
        job["progress_pct"] = 100.0
        job["completed_at"] = datetime.utcnow().isoformat()
        job["message"] = f"Import complete. {job['videos_imported']} videos, {job['comments_imported']} comments."

    except Exception as e:
        job["status"] = "failed"
        job["error"] = str(e)
        job["message"] = f"Import failed: {str(e)}"
    finally:
        db.close()


# ─── Listing & Management ────────────────────────────────────────────────────

@router.get("", response_model=List[CreatorOut])
def list_creators(db: Session = Depends(get_db)):
    creators = db.query(Creator).filter(Creator.is_active == True).order_by(Creator.channel_name).all()
    result = []
    for c in creators:
        total_videos = db.query(func.count(Video.id)).filter(Video.creator_id == c.id).scalar()
        total_comments = (
            db.query(func.count(Comment.id))
            .join(Video, Comment.video_id == Video.id)
            .filter(Video.creator_id == c.id)
            .scalar()
        )
        out = CreatorOut.model_validate(c)
        out.total_videos_imported = total_videos
        out.total_comments = total_comments
        result.append(out)
    return result


@router.get("/{creator_id}", response_model=CreatorOut)
def get_creator(creator_id: int, db: Session = Depends(get_db)):
    creator = db.query(Creator).filter(Creator.id == creator_id).first()
    if not creator:
        raise HTTPException(status_code=404, detail="Creator not found")
    return creator


@router.delete("/{creator_id}")
def delete_creator(creator_id: int, db: Session = Depends(get_db)):
    creator = db.query(Creator).filter(Creator.id == creator_id).first()
    if not creator:
        raise HTTPException(status_code=404, detail="Creator not found")
    db.delete(creator)
    db.commit()
    return {"detail": "Creator deleted"}


@router.get("/{creator_id}/videos", response_model=List[VideoOut])
def list_creator_videos(
    creator_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
):
    offset = (page - 1) * page_size
    videos = (
        db.query(Video)
        .filter(Video.creator_id == creator_id)
        .order_by(Video.publish_date.desc())
        .offset(offset)
        .limit(page_size)
        .all()
    )
    return videos


@router.get("/{creator_id}/comments")
def list_creator_comments(
    creator_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    sort_by: str = Query("likes", regex="^(likes|date|replies)$"),
    db: Session = Depends(get_db),
):
    offset = (page - 1) * page_size
    order = Comment.likes.desc() if sort_by == "likes" else (
        Comment.comment_date.desc() if sort_by == "date" else Comment.reply_count.desc()
    )
    comments = (
        db.query(Comment, Video.title.label("video_title"))
        .join(Video, Comment.video_id == Video.id)
        .filter(Video.creator_id == creator_id)
        .order_by(order)
        .offset(offset)
        .limit(page_size)
        .all()
    )
    total = (
        db.query(func.count(Comment.id))
        .join(Video, Comment.video_id == Video.id)
        .filter(Video.creator_id == creator_id)
        .scalar()
    )
    return {
        "items": [
            {
                "id": c.Comment.id,
                "comment_id": c.Comment.comment_id,
                "author_name": c.Comment.author_name,
                "comment_text": c.Comment.comment_text,
                "comment_date": c.Comment.comment_date,
                "likes": c.Comment.likes,
                "reply_count": c.Comment.reply_count,
                "video_title": c.video_title,
            }
            for c in comments
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size,
    }
