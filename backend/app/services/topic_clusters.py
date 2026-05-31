"""
Topic Intelligence Engine
Pure-numpy TF-IDF + cosine k-means — no sklearn, no torch required.

Pipeline:
  comments → questions/topics → tfidf vectors → k-means clusters
           → metadata (growth, unique users, related videos)
           → AI theme names + summaries (optional, async)
           → JSON cache in AppSettings
"""
from __future__ import annotations

import hashlib
import json
import math
import re
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from typing import TYPE_CHECKING

import numpy as np

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

# ── Text helpers ──────────────────────────────────────────────────────────────

STOPWORDS = {
    "the","a","an","is","it","in","on","at","to","for","of","and","or","but",
    "i","my","me","we","our","you","your","he","she","they","their","that",
    "this","are","was","were","be","been","being","have","has","had","do",
    "does","did","will","would","can","could","should","may","might","shall",
    "from","with","by","as","if","so","no","not","any","all","also","than",
    "then","when","where","which","who","how","what","why","up","out","one",
    "there","here","about","just","more","like","get","got","its","what",
    "into","very","some","can't","don't","won't","isn't","aren't","didn't",
}


def _tokenize(text: str) -> list[str]:
    return [w for w in re.findall(r"\b[a-z]{2,}\b", text.lower()) if w not in STOPWORDS]


# ── TF-IDF ────────────────────────────────────────────────────────────────────

def _build_tfidf(texts: list[str]) -> tuple[np.ndarray, list[str]]:
    """Return L2-normalised TF-IDF matrix (n_docs × n_terms) and vocab."""
    tokenized = [_tokenize(t) for t in texts]
    word_df: Counter[str] = Counter()
    for doc in tokenized:
        word_df.update(set(doc))
    # Keep words that appear in at least 2 docs but fewer than 80 %
    n = len(texts)
    vocab = [w for w, df in word_df.items() if 2 <= df <= max(2, int(n * 0.8))]
    if not vocab:
        vocab = list({w for doc in tokenized for w in doc})[:500]
    vid = {w: i for i, w in enumerate(vocab)}

    tf = np.zeros((n, len(vocab)), dtype=np.float32)
    for i, doc in enumerate(tokenized):
        for w in doc:
            if w in vid:
                tf[i, vid[w]] += 1
        total = max(len(doc), 1)
        tf[i] /= total

    df_vec = (tf > 0).sum(axis=0).astype(np.float32) + 1
    idf = np.log((n + 1) / df_vec).astype(np.float32)
    mat = tf * idf

    norms = np.linalg.norm(mat, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return mat / norms, vocab


# ── K-means ───────────────────────────────────────────────────────────────────

def _kmeans(X: np.ndarray, k: int, max_iter: int = 60, seed: int = 42) -> np.ndarray:
    """Spherical k-means (cosine) on L2-normalised rows."""
    rng = np.random.default_rng(seed)
    n = X.shape[0]
    k = min(k, n)
    if k <= 1:
        return np.zeros(n, dtype=int)

    # k-means++ init
    first = int(rng.integers(n))
    centers = [X[first]]
    for _ in range(k - 1):
        sims = X @ np.array(centers).T          # (n, len(centers))
        best_sim = sims.max(axis=1)             # closest center similarity
        dists = (1 - best_sim).clip(0)          # convert to distance
        total = dists.sum()
        if total == 0:
            break
        probs = dists / total
        centers.append(X[int(rng.choice(n, p=probs))])

    C = np.array(centers, dtype=np.float32)
    labels = np.zeros(n, dtype=int)

    for _ in range(max_iter):
        sims = X @ C.T                          # (n, k)
        new_labels = sims.argmax(axis=1)
        if np.array_equal(new_labels, labels):
            break
        labels = new_labels
        for j in range(k):
            mask = labels == j
            if mask.sum() == 0:
                C[j] = X[int(rng.integers(n))]
            else:
                c = X[mask].mean(axis=0)
                norm = np.linalg.norm(c)
                C[j] = c / norm if norm > 0 else c

    return labels


# ── Deduplication ─────────────────────────────────────────────────────────────

def _deduplicate(items: list[str], threshold: float = 0.82) -> list[str]:
    """Remove near-duplicate strings using cosine similarity."""
    if len(items) <= 1:
        return items
    mat, _ = _build_tfidf(items)
    sims = mat @ mat.T
    kept: list[int] = []
    dropped: set[int] = set()
    for i in range(len(items)):
        if i in dropped:
            continue
        kept.append(i)
        for j in range(i + 1, len(items)):
            if j not in dropped and sims[i, j] >= threshold:
                dropped.add(j)
    return [items[i] for i in kept]


# ── Finniki classification ────────────────────────────────────────────────────

FINNIKI_TERMS: set[str] = {
    "nre","nro","tax","mutual fund","sip","elss","ltcg","stcg","itr","insurance",
    "retirement","wealth","portfolio","demat","investment","income tax","capital gain",
    "fema","ppf","epf","nps","oci","rnor","repatriation","gift city","stock","equity",
    "bond","fixed deposit","pension","financial plan","real estate","property","gold",
    "cryptocurrency","dtaa","will","estate","aadhaar","pan card","visa","passport",
    "remittance","nri","home loan","credit","cibil","budget","inflation","interest rate",
    "rbi","sebi","finance","money","dividend","ipo","indexation","fund","invest","return",
    "tax planning","savings","asset","liability","net worth","compound","bank","account",
}


def _finniki_score(topic_text: str, questions: list[str]) -> tuple[bool, float]:
    """Return (is_finniki, confidence 0-1)."""
    all_text = (topic_text + " " + " ".join(questions)).lower()
    hits = sum(1 for kw in FINNIKI_TERMS if kw in all_text)
    # Normalise: 3+ hits → high confidence
    confidence = min(1.0, hits / 3)
    return confidence >= 0.34, round(confidence, 2)


# ── Main builder ──────────────────────────────────────────────────────────────

def _top_keywords(texts: list[str], n: int = 6) -> list[str]:
    counter: Counter[str] = Counter()
    for t in texts:
        counter.update(_tokenize(t))
    return [w for w, _ in counter.most_common(n)]


def _theme_name_from_keywords(keywords: list[str]) -> str:
    """Capitalise and join top 2-3 keywords as a fallback theme name."""
    return " ".join(w.capitalize() for w in keywords[:3]) if keywords else "General"


def build_clusters(
    questions: list[str],
    comments_meta: list[dict],   # [{text, author, date, likes, video_title, video_id}]
    *,
    k_override: int | None = None,
) -> list[dict]:
    """
    Cluster questions into themes and compute metadata.
    Returns list of theme dicts ready to serialize.
    """
    if not questions:
        return []

    # Deduplicate questions
    unique_qs = _deduplicate(questions)

    # Number of clusters: sqrt heuristic, bounded [5, 20]
    k = k_override or max(5, min(20, round(math.sqrt(len(unique_qs) * 1.5))))

    mat, vocab = _build_tfidf(unique_qs)
    labels = _kmeans(mat, k)

    # Build reverse map: comment text → author/date
    text_to_meta: dict[str, list[dict]] = defaultdict(list)
    for m in comments_meta:
        text_to_meta[m["text"].lower()[:60]].append(m)

    # Determine period halves for growth calculation
    now = datetime.utcnow()
    midpoint = now - timedelta(days=45)  # fixed 90-day period midpoint

    clusters: list[dict] = []
    for cluster_id in range(k):
        idxs = [i for i, l in enumerate(labels) if l == cluster_id]
        if not idxs:
            continue

        cluster_qs = [unique_qs[i] for i in idxs]

        # Match original comments against cluster questions
        matching_metas: list[dict] = []
        for q in cluster_qs:
            prefix = q.lower()[:40]
            for m in comments_meta:
                if prefix[:25] in m["text"].lower():
                    matching_metas.append(m)

        # Unique users
        unique_users = len({m["author"] for m in matching_metas if m.get("author")})

        # Growth rate: compare recent 45 days vs earlier 45 days
        recent_count = sum(
            1 for m in matching_metas
            if m.get("date") and m["date"] >= midpoint
        )
        older_count = sum(
            1 for m in matching_metas
            if m.get("date") and m["date"] < midpoint
        )
        if older_count == 0:
            growth_rate = 1.0 if recent_count > 0 else 0.0
        else:
            growth_rate = round((recent_count - older_count) / older_count, 2)

        if growth_rate > 0.25:
            trend = "growing"
        elif growth_rate < -0.25:
            trend = "declining"
        else:
            trend = "stable"

        # Related videos (top 5 by match count)
        video_counter: Counter[str] = Counter()
        for m in matching_metas:
            if m.get("video_title"):
                video_counter[m["video_title"]] += 1
        related_videos = [
            {"title": t, "count": c}
            for t, c in video_counter.most_common(5)
        ]

        keywords = _top_keywords(cluster_qs)
        is_finniki, confidence = _finniki_score(" ".join(cluster_qs), cluster_qs)

        cluster_id_str = hashlib.md5("|".join(sorted(cluster_qs)).encode()).hexdigest()[:10]

        clusters.append({
            "id": cluster_id_str,
            "name": _theme_name_from_keywords(keywords),  # overwritten by AI if available
            "total_mentions": len(matching_metas),
            "unique_users": unique_users,
            "growth_rate": growth_rate,
            "trend": trend,
            "finniki": is_finniki,
            "finniki_confidence": confidence,
            "top_keywords": keywords,
            "representative_questions": _deduplicate(cluster_qs)[:8],
            "all_questions": cluster_qs,
            "related_videos": related_videos,
            "summary": "",       # filled in by AI enrichment
        })

    clusters.sort(key=lambda c: c["total_mentions"], reverse=True)
    return clusters


# ── AI enrichment ─────────────────────────────────────────────────────────────

async def enrich_with_ai(clusters: list[dict]) -> list[dict]:
    """
    Call configured AI provider to generate theme names and summaries.
    Returns enriched clusters; falls back gracefully if AI is unavailable.
    """
    from ..services.ai_insights import ai_analyze_videos

    batch = []
    for c in clusters:
        batch.append(
            f"Theme keywords: {', '.join(c['top_keywords'])}\n"
            f"Sample questions: {'; '.join(c['representative_questions'][:4])}\n"
            f"Finniki: {c['finniki']}"
        )

    prompt = (
        "You are an expert content strategist for a YouTube channel focused on NRI personal finance.\n\n"
        "For each of the following topic clusters, provide:\n"
        "1. A concise, specific theme name (3-5 words)\n"
        "2. A one-sentence summary of what the audience wants to know\n\n"
        "Respond with ONLY a JSON array, one object per cluster, in input order:\n"
        '[{"name": "...", "summary": "..."}, ...]\n\n'
        "Clusters:\n" + "\n\n".join(f"Cluster {i+1}:\n{b}" for i, b in enumerate(batch))
    )

    result, error = await ai_analyze_videos([], "custom", prompt)
    if not result:
        return clusters

    # Extract JSON from response
    try:
        # Strip markdown fences
        cleaned = re.sub(r"```json|```", "", result).strip()
        start = cleaned.find("[")
        end = cleaned.rfind("]") + 1
        parsed: list[dict] = json.loads(cleaned[start:end])
        for i, item in enumerate(parsed):
            if i < len(clusters):
                clusters[i]["name"] = item.get("name", clusters[i]["name"])
                clusters[i]["summary"] = item.get("summary", "")
    except Exception:
        pass  # Keep keyword-based names on parse failure

    return clusters


# ── Cache helpers ─────────────────────────────────────────────────────────────

CACHE_KEY = "topic_intelligence_cache"
CACHE_TTL_HOURS = 6


def _fingerprint(creator_ids: list[int], period: int, comment_count: int) -> str:
    key = f"{sorted(creator_ids)}|{period}|{comment_count}"
    return hashlib.md5(key.encode()).hexdigest()


def load_cache(db: "Session", creator_ids: list[int], period: int, comment_count: int) -> list[dict] | None:
    from ..models import AppSettings
    row = db.query(AppSettings).filter(AppSettings.key == CACHE_KEY).first()
    if not row or not row.value:
        return None
    try:
        cached = json.loads(row.value)
    except Exception:
        return None

    if cached.get("fingerprint") != _fingerprint(creator_ids, period, comment_count):
        return None
    built_at = datetime.fromisoformat(cached["built_at"])
    if (datetime.utcnow() - built_at).total_seconds() > CACHE_TTL_HOURS * 3600:
        return None
    return cached["themes"]


def save_cache(db: "Session", themes: list[dict], creator_ids: list[int], period: int, comment_count: int):
    from ..models import AppSettings
    payload = json.dumps({
        "fingerprint": _fingerprint(creator_ids, period, comment_count),
        "built_at": datetime.utcnow().isoformat(),
        "themes": themes,
    })
    row = db.query(AppSettings).filter(AppSettings.key == CACHE_KEY).first()
    if row:
        row.value = payload
        row.updated_at = datetime.utcnow()
    else:
        db.add(AppSettings(key=CACHE_KEY, value=payload))
    db.commit()
