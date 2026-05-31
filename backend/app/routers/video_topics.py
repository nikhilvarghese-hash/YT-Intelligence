"""
Video-based topic ranking.
Groups videos by keyword clusters extracted from titles,
ranked purely by views / likes / engagement — no comment analysis.
"""
import re
from collections import defaultdict
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Creator, Video

router = APIRouter()

# Common stop words to skip when extracting topic keywords
_STOP = {
    "a","an","the","and","or","but","in","on","at","to","for","of","with",
    "is","are","was","were","be","been","being","have","has","had","do","does",
    "did","will","would","could","should","may","might","shall","can","need",
    "this","that","these","those","it","its","i","my","we","our","you","your",
    "he","she","they","his","her","their","what","which","who","how","when",
    "where","why","not","no","so","if","then","than","from","by","about","up",
    "out","into","over","after","before","between","through","during","all",
    "just","also","more","most","some","any","one","two","three","new","us",
    "video","watch","now","get","make","made","full","best","top","vs","vs.",
    "part","ep","episode","ft","feat","official","day","year","time","way",
    "amp","like","know","go","see","use","here","there","first","last","got",
    "#shorts","shorts","short","#short",
}

_ISO_RE = re.compile(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?")


def _duration_seconds(iso: Optional[str]) -> int:
    if not iso:
        return 0
    m = _ISO_RE.match(iso)
    if not m:
        return 0
    h, mn, s = (int(x) if x else 0 for x in m.groups())
    return h * 3600 + mn * 60 + s


def _is_short(iso: Optional[str]) -> bool:
    secs = _duration_seconds(iso)
    return 0 < secs <= 60


def _extract_keywords(title: str) -> list[str]:
    """Return meaningful words from a video title."""
    words = re.findall(r"[a-zA-Z]{3,}", title.lower())
    return [w for w in words if w not in _STOP]


def _engagement_score(views: int, likes: int, comments: int) -> float:
    """Composite score: log-weighted views + boosted likes + comments."""
    import math
    v = math.log1p(views) * 1.0
    l = math.log1p(likes) * 3.0
    c = math.log1p(comments) * 2.0
    return v + l + c


@router.get("/topics")
def get_video_topics(
    creator_ids: Optional[str] = Query(None),
    format: Optional[str] = Query(None),  # "shorts" | "long" | None
    limit: int = Query(50),
    db: Session = Depends(get_db),
):
    """
    Return topics derived from video titles, ranked by engagement.
    Each topic = a keyword cluster with aggregated metrics.
    """
    q = db.query(Video).join(Creator, Video.creator_id == Creator.id)
    if creator_ids:
        ids = [int(x) for x in creator_ids.split(",") if x.strip()]
        if ids:
            q = q.filter(Creator.id.in_(ids))

    videos = q.all()

    # Filter by format
    if format == "shorts":
        videos = [v for v in videos if _is_short(v.duration)]
    elif format == "long":
        videos = [v for v in videos if not _is_short(v.duration)]

    if not videos:
        return {"topics": [], "total_videos": 0}

    # Build keyword → video index
    kw_to_videos: dict[str, list[Video]] = defaultdict(list)
    for vid in videos:
        for kw in set(_extract_keywords(vid.title)):
            kw_to_videos[kw].append(vid)

    # Aggregate per keyword
    results = []
    for kw, vids in kw_to_videos.items():
        if len(vids) < 2:  # skip one-off keywords
            continue

        total_views  = sum(v.views or 0 for v in vids)
        total_likes  = sum(v.likes or 0 for v in vids)
        total_comments = sum(v.comment_count or 0 for v in vids)
        score = _engagement_score(total_views, total_likes, total_comments)

        # Top 5 videos by views for this keyword
        top_vids = sorted(vids, key=lambda v: v.views or 0, reverse=True)[:20]

        results.append({
            "keyword": kw,
            "video_count": len(vids),
            "total_views": total_views,
            "total_likes": total_likes,
            "total_comments": total_comments,
            "engagement_score": round(score, 2),
            "avg_views": round(total_views / len(vids)),
            "avg_likes": round(total_likes / len(vids)),
            "top_videos": [
                {
                    "id": v.video_id,
                    "title": v.title,
                    "views": v.views or 0,
                    "likes": v.likes or 0,
                    "comments": v.comment_count or 0,
                    "duration": v.duration,
                    "thumbnail_url": v.thumbnail_url,
                    "url": v.url,
                    "publish_date": v.publish_date.isoformat() if v.publish_date else None,
                    "is_short": _is_short(v.duration),
                }
                for v in top_vids
            ],
        })

    results.sort(key=lambda x: x["engagement_score"], reverse=True)
    return {"topics": results[:limit], "total_videos": len(videos)}
