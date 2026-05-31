"""
Embedding provider abstraction.
Primary: OpenAI text-embedding-3-small
Fallback: TF-IDF cosine similarity (no external API required)
"""
from __future__ import annotations

import json
import math
import re
from collections import Counter
from typing import Optional

from ...config import settings


EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIM = 1536


async def embed_texts(texts: list[str]) -> list[list[float]] | None:
    """Embed a batch of texts. Returns None if no provider is available."""
    key = settings.OPENAI_API_KEY
    if key:
        return await _openai_embed(texts, key)
    # No provider — caller falls back to keyword search only
    return None


async def embed_query(text: str) -> list[float] | None:
    result = await embed_texts([text])
    return result[0] if result else None


async def _openai_embed(texts: list[str], api_key: str) -> list[list[float]]:
    import httpx
    # OpenAI allows up to 2048 texts per request; chunk conservatively
    all_embeddings: list[list[float]] = []
    batch_size = 100
    async with httpx.AsyncClient(timeout=60) as client:
        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            resp = await client.post(
                "https://api.openai.com/v1/embeddings",
                headers={"Authorization": f"Bearer {api_key}"},
                json={"model": EMBEDDING_MODEL, "input": batch},
            )
            resp.raise_for_status()
            data = resp.json()["data"]
            data.sort(key=lambda x: x["index"])
            all_embeddings.extend(item["embedding"] for item in data)
    return all_embeddings


def cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


# ── TF-IDF fallback ───────────────────────────────────────────────────────────

_STOP = {
    "a","an","the","and","or","but","in","on","at","to","for","of","with","is",
    "are","was","were","be","been","it","this","that","i","you","we","they",
    "have","has","had","do","does","did","not","no","so","if","from","by","as",
}

def tfidf_vector(text: str, vocab: dict[str, int], idf: dict[str, float]) -> list[float]:
    words = re.findall(r"[a-z]{2,}", text.lower())
    words = [w for w in words if w not in _STOP]
    tf = Counter(words)
    total = max(sum(tf.values()), 1)
    vec = [0.0] * len(vocab)
    for word, count in tf.items():
        if word in vocab:
            vec[vocab[word]] = (count / total) * idf.get(word, 1.0)
    return vec


def build_tfidf_index(corpus: list[str]) -> tuple[dict[str, int], dict[str, float]]:
    """Build vocab and IDF from a list of texts."""
    N = len(corpus)
    df: Counter[str] = Counter()
    for text in corpus:
        words = set(re.findall(r"[a-z]{2,}", text.lower())) - _STOP
        df.update(words)
    vocab = {word: i for i, word in enumerate(sorted(df.keys()))}
    idf = {word: math.log((N + 1) / (count + 1)) + 1 for word, count in df.items()}
    return vocab, idf
