"""
Context builder — assembles retrieved chunks into a structured LLM context string.
Deduplicates, cleans noise, and formats evidence for the grounded response.
"""
from __future__ import annotations

import re
from collections import Counter, defaultdict
from typing import Any


def build_context(chunks: list[dict[str, Any]], query: str) -> dict[str, Any]:
    """
    Returns:
      - context_text: str  (what gets passed to the LLM)
      - stats: dict        (for confidence / sources card in UI)
    """
    if not chunks:
        return {"context_text": "", "stats": _empty_stats()}

    # Deduplicate by normalised text
    seen: set[str] = set()
    unique_chunks: list[dict] = []
    for chunk in chunks:
        key = _normalise(chunk["chunk_text"])[:200]
        if key not in seen:
            seen.add(key)
            unique_chunks.append(chunk)

    # Separate by source type
    comments = [c for c in unique_chunks if c["metadata"].get("source_type") == "comment"]
    videos   = [c for c in unique_chunks if c["metadata"].get("source_type") == "video"]

    # Intent and sentiment distributions from comment metadata
    intents: Counter = Counter()
    sentiments: Counter = Counter()
    topics: Counter = Counter()
    creator_ids: set = set()
    video_ids: set = set()

    for c in comments:
        m = c["metadata"]
        if m.get("intent"):
            intents[m["intent"]] += 1
        if m.get("sentiment"):
            sentiments[m["sentiment"]] += 1
        if m.get("topic"):
            topics[m["topic"]] += 1
        if m.get("creator_id"):
            creator_ids.add(m["creator_id"])
        if m.get("video_id"):
            video_ids.add(m["video_id"])

    for v in videos:
        m = v["metadata"]
        if m.get("creator_id"):
            creator_ids.add(m["creator_id"])
        if m.get("video_id"):
            video_ids.add(m["video_id"])

    # Build context text
    sections: list[str] = []

    if comments:
        sections.append(f"=== AUDIENCE COMMENTS ({len(comments)} records) ===")
        for i, c in enumerate(comments[:30], 1):
            m = c["metadata"]
            tags = []
            if m.get("intent"):
                tags.append(f"intent:{m['intent']}")
            if m.get("sentiment"):
                tags.append(f"sentiment:{m['sentiment']}")
            if m.get("topic"):
                tags.append(f"topic:{m['topic']}")
            tag_str = f" [{', '.join(tags)}]" if tags else ""
            sections.append(f"[{i}]{tag_str} {c['chunk_text'][:400]}")

    if videos:
        sections.append(f"\n=== VIDEO METADATA ({len(videos)} records) ===")
        for i, v in enumerate(videos[:10], 1):
            sections.append(f"[V{i}] {v['chunk_text'][:300]}")

    if intents:
        top_intents = intents.most_common(5)
        sections.append(f"\n=== INTENT DISTRIBUTION ===")
        for intent, count in top_intents:
            sections.append(f"  {intent}: {count} signals")

    if sentiments:
        sections.append(f"\n=== SENTIMENT DISTRIBUTION ===")
        for sentiment, count in sentiments.most_common():
            sections.append(f"  {sentiment}: {count} signals")

    if topics:
        sections.append(f"\n=== TOP TOPICS ===")
        for topic, count in topics.most_common(10):
            sections.append(f"  {topic}: {count} mentions")

    context_text = "\n".join(sections)

    stats = {
        "comments_analysed": len(comments),
        "videos_referenced": len(video_ids),
        "creators_referenced": len(creator_ids),
        "total_chunks": len(unique_chunks),
        "top_intents": dict(intents.most_common(5)),
        "top_sentiments": dict(sentiments.most_common()),
        "top_topics": dict(topics.most_common(10)),
    }

    return {"context_text": context_text, "stats": stats}


def _normalise(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower().strip())


def _empty_stats() -> dict:
    return {
        "comments_analysed": 0,
        "videos_referenced": 0,
        "creators_referenced": 0,
        "total_chunks": 0,
        "top_intents": {},
        "top_sentiments": {},
        "top_topics": {},
    }
