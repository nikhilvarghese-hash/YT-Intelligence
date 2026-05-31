"""
AI Content Strategy router — enriched content opportunity cards with Kanban state.
"""
import hashlib
import json
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..database import get_db
from ..models import Comment, Video, Creator, AppSettings
from ..services.ai_insights import (
    extract_questions, detect_pain_points,
    discover_content_opportunities, ai_analyze_videos,
)

router = APIRouter()

# ── Classification & scoring helpers ─────────────────────────────────────────

FINNIKI_KEYWORDS = {
    "nre", "nro", "tax", "mutual fund", "sip", "elss", "ltcg", "stcg",
    "itr", "insurance", "retirement", "wealth", "portfolio", "demat",
    "investment", "income tax", "capital gain", "fema", "ppf", "epf",
    "nps", "oci", "rnor", "repatriation", "gift city", "stock", "equity",
    "bond", "fixed deposit", "pension", "financial plan", "real estate",
    "property", "gold", "cryptocurrency", "dtaa", "will", "estate",
    "aadhaar", "pan card", "visa", "passport", "remittance", "nri",
    "home loan", "credit", "cibil", "budget", "inflation", "interest rate",
    "rbi", "sebi", "finance", "money", "dividend", "ipo", "indexation",
}

THEME_CATEGORIES = {
    "Tax Planning": ["tax", "itr", "ltcg", "stcg", "dtaa", "capital gain", "income tax", "indexation"],
    "Banking & Accounts": ["nre", "nro", "bank", "account", "repatri", "remittanc", "fcnr"],
    "Mutual Funds": ["mutual fund", "sip", "elss", "mf", "nav", "amc", "flexi", "largecap"],
    "Stock Market": ["stock", "equity", "demat", "share", "ipo", "sebi", "nifty", "sensex", "pis"],
    "Retirement": ["retirement", "pension", "nps", "ppf", "epf", "401k", "corpus", "withdraw"],
    "Real Estate": ["real estate", "property", "home loan", "flat", "house", "land", "builder"],
    "Insurance": ["insurance", "life insurance", "health insurance", "term", "lic", "claim"],
    "NRI Finance": ["nri", "oci", "rnor", "repatri", "foreign", "abroad", "overseas", "visa", "passport"],
    "Personal Finance": ["budget", "saving", "expense", "wealth", "financial plan", "money", "salary"],
    "Alternative Investments": ["gold", "crypto", "bitcoin", "reit", "sgb", "bond", "fd", "fixed deposit"],
    "Compliance": ["fema", "rbi", "compliance", "penalty", "aadhaar", "pan", "kyc", "fbar"],
}


def _card_id(topic: str) -> str:
    return hashlib.md5(topic.lower().encode()).hexdigest()[:10]


def _classify(topic: str) -> str:
    t = topic.lower()
    return "finniki" if any(kw in t for kw in FINNIKI_KEYWORDS) else "adjacent"


def _category(topic: str) -> str:
    t = topic.lower()
    for cat, keywords in THEME_CATEGORIES.items():
        if any(kw in t for kw in keywords):
            return cat
    return "General"


def _format_rec(freq: int, topic: str) -> tuple[str, float]:
    t = topic.lower()
    short_signals = ["what is", "quick", "tip", "hack", "mistake", " vs ", "or not", "should i"]
    long_signals = ["guide", "explain", "complete", "how to", "everything", "step by step", "deep dive"]
    if any(s in t for s in short_signals) or freq < 8:
        return "short", 0.78
    if freq >= 25 or any(s in t for s in long_signals):
        return "both", 0.83
    return "long", 0.72


def _trend(recent: int, older: int) -> str:
    if older == 0:
        return "growing" if recent > 0 else "stable"
    r = recent / max(older, 1)
    return "growing" if r > 1.25 else ("declining" if r < 0.75 else "stable")


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


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/videos")
def list_strategy_videos(
    creator_ids: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Compact video list for use in the video filter dropdown."""
    id_list = [int(x) for x in creator_ids.split(",") if x.strip()] if creator_ids else None
    q = db.query(Video.id, Video.video_id, Video.title, Video.publish_date)
    if id_list:
        q = q.filter(Video.creator_id.in_(id_list))
    rows = q.order_by(Video.publish_date.desc()).limit(300).all()
    return [{"id": r.id, "video_id": r.video_id, "title": r.title} for r in rows]


@router.get("/opportunities")
def get_opportunities(
    creator_ids: Optional[str] = Query(None),
    period: int = Query(90, description="Days to look back"),
    video_id: Optional[int] = Query(None, description="Filter by specific video DB id"),
    min_score: int = Query(0, description="Minimum opportunity score"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    id_list = [int(x) for x in creator_ids.split(",") if x.strip()] if creator_ids else None
    cutoff = datetime.utcnow() - timedelta(days=period)
    older_cutoff = datetime.utcnow() - timedelta(days=period * 2)

    base_q = (
        db.query(Comment, Video.title.label("video_title"), Creator.channel_name.label("creator_name"))
        .join(Video, Comment.video_id == Video.id)
        .join(Creator, Video.creator_id == Creator.id)
    )
    if id_list:
        base_q = base_q.filter(Creator.id.in_(id_list))
    if video_id:
        base_q = base_q.filter(Video.id == video_id)

    all_rows = base_q.limit(12000).all()
    recent_rows = [r for r in all_rows if r.Comment.comment_date and r.Comment.comment_date >= cutoff]
    older_rows = [r for r in all_rows if r.Comment.comment_date and older_cutoff <= r.Comment.comment_date < cutoff]

    texts_all = [r.Comment.comment_text for r in all_rows]
    texts_recent = [r.Comment.comment_text for r in recent_rows]
    texts_older = [r.Comment.comment_text for r in older_rows]

    questions = extract_questions(texts_all)[:40]
    opportunities = discover_content_opportunities(texts_all)[:30]
    pain_points = detect_pain_points(texts_all)[:20]

    def _recent_freq(items, topic, key):
        q_items_r = extract_questions(texts_recent) if key == "question_text" else discover_content_opportunities(texts_recent)
        for item in q_items_r:
            if item.get(key, "").lower()[:30] == topic.lower()[:30]:
                return item.get("frequency", 0)
        return 0

    def _older_freq(items, topic, key):
        q_items_o = extract_questions(texts_older) if key == "question_text" else discover_content_opportunities(texts_older)
        for item in q_items_o:
            if item.get(key, "").lower()[:30] == topic.lower()[:30]:
                return item.get("frequency", 0)
        return 0

    seen: set[str] = set()
    all_topics: list[dict] = []

    for item in questions:
        t = item["question_text"]
        if t in seen:
            continue
        seen.add(t)
        freq = item["frequency"]
        avg_likes = (
            sum(r.Comment.likes for r in all_rows if t.lower()[:20] in r.Comment.comment_text.lower())
            / max(freq, 1)
        )
        all_topics.append({
            "topic": t, "type": "question", "frequency": freq,
            "recent": _recent_freq(questions, t, "question_text"),
            "older": _older_freq(questions, t, "question_text"),
            "avg_likes": round(avg_likes, 1),
            "example_comments": item.get("example_comments", []),
            "creator_names": item.get("creator_names", []),
        })

    for item in opportunities:
        t = item["topic"]
        if t in seen:
            continue
        seen.add(t)
        freq = item["frequency"]
        avg_likes = (
            sum(r.Comment.likes for r in all_rows if t.lower() in r.Comment.comment_text.lower())
            / max(freq, 1)
        )
        all_topics.append({
            "topic": t, "type": "opportunity", "frequency": freq,
            "recent": _recent_freq(opportunities, t, "topic"),
            "older": _older_freq(opportunities, t, "topic"),
            "avg_likes": round(avg_likes, 1),
            "example_comments": item.get("example_comments", []),
            "creator_names": item.get("creators_mentioning", []),
        })

    for item in pain_points:
        t = item["topic"]
        if t in seen:
            continue
        seen.add(t)
        freq = item["frequency"]
        all_topics.append({
            "topic": t, "type": "pain_point", "frequency": freq,
            "recent": 0, "older": 0,
            "avg_likes": 0,
            "example_comments": item.get("example_comments", []),
            "creator_names": [],
        })

    if not all_topics:
        return {"items": [], "total": 0, "page": page, "has_more": False}

    max_freq = max(t["frequency"] for t in all_topics)
    max_likes = max(t["avg_likes"] for t in all_topics) or 1

    # Build unique-users lookup once across all topics
    topic_keywords = {t["topic"]: t["topic"].lower()[:25] for t in all_topics}
    unique_user_map: dict[str, set[str]] = {t["topic"]: set() for t in all_topics}
    for row in all_rows:
        text = row.Comment.comment_text.lower()
        uid = row.Comment.author_channel_id or row.Comment.author_name or ""
        if not uid:
            continue
        for topic, kw in topic_keywords.items():
            if kw in text:
                unique_user_map[topic].add(uid)

    states_raw = _get_setting(db, "cs_kanban_states")
    states = json.loads(states_raw) if states_raw else {}

    meta_raw = _get_setting(db, "cs_card_meta")
    meta = json.loads(meta_raw) if meta_raw else {}

    result = []
    for t in all_topics:
        cid = _card_id(t["topic"])
        freq = t["frequency"]
        al = t["avg_likes"]
        card_meta = meta.get(cid, {})

        if card_meta.get("archived"):
            status = "archived"
        elif cid in states:
            status = states[cid]
        elif any(kw in t["topic"].lower() for kw in ["best", "top", "must", "essential"]) and freq >= 20:
            status = "high_engagement"
        elif _trend(t["recent"], t["older"]) == "growing":
            status = "trending"
        else:
            status = "new"

        demand = round(min(100, (freq / max_freq) * 100))
        engagement = round(min(100, (al / max_likes) * 100))
        relevance = round(min(100, len(set(t["creator_names"])) * 20))
        opp_score = round(demand * 0.45 + engagement * 0.35 + relevance * 0.20)

        if opp_score < min_score:
            continue

        trend = _trend(t["recent"], t["older"])
        fmt, fmt_conf = _format_rec(freq, t["topic"])
        classification = _classify(t["topic"])
        category = _category(t["topic"])

        result.append({
            "id": cid,
            "topic": card_meta.get("custom_title") or t["topic"],
            "original_topic": t["topic"],
            "type": t["type"],
            "category": category,
            "classification": classification,
            "frequency": freq,
            "unique_users": len(unique_user_map[t["topic"]]),
            "avg_likes": al,
            "scores": {
                "demand": demand,
                "engagement": engagement,
                "relevance": relevance,
                "opportunity": opp_score,
            },
            "format": fmt,
            "format_confidence": fmt_conf,
            "trend": trend,
            "status": status,
            "example_comments": t["example_comments"][:5],
            "creator_names": list(set(t["creator_names"]))[:5],
            "notes": card_meta.get("notes", ""),
            "custom_title": card_meta.get("custom_title", ""),
        })

    result.sort(key=lambda x: x["scores"]["opportunity"], reverse=True)

    total = len(result)
    start = (page - 1) * page_size
    end = start + page_size
    page_items = result[start:end]

    return {
        "items": page_items,
        "total": total,
        "page": page,
        "has_more": end < total,
    }


@router.get("/cards/status")
def get_card_statuses(db: Session = Depends(get_db)):
    raw = _get_setting(db, "cs_kanban_states")
    return json.loads(raw) if raw else {}


@router.post("/cards/status")
def update_card_statuses(updates: dict, db: Session = Depends(get_db)):
    raw = _get_setting(db, "cs_kanban_states")
    states = json.loads(raw) if raw else {}
    states.update(updates)
    _set_setting(db, "cs_kanban_states", json.dumps(states))
    return {"detail": "ok"}


@router.get("/cards/meta")
def get_card_meta(db: Session = Depends(get_db)):
    raw = _get_setting(db, "cs_card_meta")
    return json.loads(raw) if raw else {}


@router.patch("/cards/{card_id}/meta")
def update_card_meta(card_id: str, body: dict, db: Session = Depends(get_db)):
    raw = _get_setting(db, "cs_card_meta")
    meta = json.loads(raw) if raw else {}
    existing = meta.get(card_id, {})
    # Only update provided fields
    for key in ("notes", "custom_title", "archived"):
        if key in body:
            existing[key] = body[key]
    meta[card_id] = existing
    _set_setting(db, "cs_card_meta", json.dumps(meta))
    return {"detail": "ok"}


@router.post("/cards/brief")
async def generate_card_brief(body: dict, db: Session = Depends(get_db)):
    topic = body.get("topic", "")
    frequency = body.get("frequency", 0)
    example_comments = body.get("example_comments", [])
    classification = body.get("classification", "adjacent")
    category = body.get("category", "General")

    prompt = f"""Generate a YouTube content brief for this topic.

Topic: {topic}
Category: {category}
Audience demand: {frequency} mentions
Type: {"Personal Finance / NRI Finance (core topic)" if classification == "finniki" else "Adjacent / Broader interest topic"}
Representative audience questions/comments:
{chr(10).join(f'- "{c}"' for c in example_comments[:4])}

Respond using EXACTLY these section markers:

===TITLES===
1. [title 1 — punchy, SEO-friendly]
2. [title 2]
3. [title 3]

===HOOK===
[30-second opening hook script for the video. Make it grab attention immediately.]

===TALKING_POINTS===
1. [key point 1]
2. [key point 2]
3. [key point 3]
4. [key point 4]
5. [key point 5]

===TARGET_AUDIENCE===
[Specific audience segment — e.g. NRI salaried professionals, first-time investors, HNIs returning to India]

===QUESTIONS_TO_ANSWER===
1. [specific question from the audience]
2. [specific question]
3. [specific question]

Keep each section tight and actionable."""

    brief, error = await ai_analyze_videos([], "custom", prompt)
    return {"brief": brief, "error": error}


@router.get("/trends")
def get_trends(
    creator_ids: Optional[str] = Query(None),
    topics: Optional[str] = Query(None),
    weeks: int = Query(12),
    db: Session = Depends(get_db),
):
    id_list = [int(x) for x in creator_ids.split(",") if x.strip()] if creator_ids else None
    topic_list = [t.strip() for t in topics.split(",") if t.strip()][:8] if topics else []
    if not topic_list:
        return {}

    now = datetime.utcnow()
    result: dict = {}

    for topic in topic_list:
        result[topic] = []
        for w in range(weeks, 0, -1):
            week_start = now - timedelta(weeks=w)
            week_end = now - timedelta(weeks=w - 1)
            q = (
                db.query(func.count(Comment.id))
                .join(Video, Comment.video_id == Video.id)
                .join(Creator, Video.creator_id == Creator.id)
                .filter(Comment.comment_text.ilike(f"%{topic[:25]}%"))
                .filter(Comment.comment_date >= week_start)
                .filter(Comment.comment_date < week_end)
            )
            if id_list:
                q = q.filter(Creator.id.in_(id_list))
            result[topic].append({"week": week_start.strftime("%Y-%m-%d"), "count": q.scalar() or 0})

    return result
