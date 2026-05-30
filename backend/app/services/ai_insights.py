"""
AI Insights service.
Supports: OpenAI, Anthropic, Gemini, Ollama, or rule-based fallback.
"""
import re
from typing import List, Optional
from ..config import settings


# ─── Rule-based patterns ─────────────────────────────────────────────────────

QUESTION_PATTERNS = [
    r'\b(how|what|why|when|where|who|which|can|could|would|should|is|are|do|does|did)\b.{5,}[?]',
    r'[A-Z][^.!?]*\?',
]

PAIN_POINT_CATEGORIES = {
    "Customer Acquisition": [
        "get customers", "find clients", "generate leads", "marketing",
        "how to grow", "no customers", "struggling to sell", "acquisition cost",
        "where to find", "get traffic", "get users",
    ],
    "Fundraising": [
        "raise money", "find investors", "get funded", "vc", "venture capital",
        "angel investor", "seed round", "series a", "pitch deck", "fundraising",
        "investment", "raise capital",
    ],
    "Pricing": [
        "how much to charge", "pricing strategy", "price point", "too expensive",
        "pricing confusion", "what to charge", "pricing model", "subscription price",
        "undercharging", "value pricing",
    ],
    "Hiring": [
        "hire", "find employees", "talent", "recruitment", "team building",
        "bad hire", "first hire", "remote team", "contractor",
    ],
    "Product-Market Fit": [
        "product market fit", "pmf", "no demand", "no one buying",
        "pivot", "finding the right market", "validate idea",
    ],
    "Scaling": [
        "scale", "scaling", "growing too fast", "can't keep up",
        "overwhelmed", "systems", "processes", "delegation",
    ],
    "Competition": [
        "competitors", "competition", "differentiate", "stand out",
        "copycats", "market share", "competitive advantage",
    ],
    "Cash Flow": [
        "cash flow", "runway", "burn rate", "running out of money",
        "profitable", "break even", "revenue", "churn",
    ],
}

PURCHASE_INTENT_SIGNALS = {
    "direct_purchase": [
        "where can i buy", "how do i get", "where to purchase",
        "take my money", "shut up and take", "want to buy",
        "how to order", "link to buy",
    ],
    "pricing_inquiry": [
        "how much does it cost", "what's the price", "pricing?",
        "how much is", "what does it cost", "price?", "cost?",
        "is it expensive", "affordable",
    ],
    "access_request": [
        "can i get access", "sign me up", "i want in",
        "where do i sign up", "how to join", "waiting list",
        "waitlist", "early access", "beta access",
    ],
    "recommendation_seeking": [
        "recommend", "is it worth it", "should i buy",
        "is it good", "worth the money", "better than",
    ],
}

CONTENT_TOPICS = [
    "AI automation", "machine learning", "artificial intelligence",
    "fundraising", "venture capital", "startup funding",
    "SaaS", "subscription business", "recurring revenue",
    "cold email", "outbound sales", "lead generation",
    "content marketing", "SEO", "organic growth",
    "hiring", "team building", "delegation",
    "pricing", "monetization", "revenue model",
    "product launch", "go to market", "GTM",
    "customer success", "churn", "retention",
    "productivity", "time management", "systems",
    "personal finance", "investing", "passive income",
    "real estate", "stocks", "crypto",
    "social media", "LinkedIn", "Twitter", "Instagram",
    "e-commerce", "dropshipping", "Amazon FBA",
    "consulting", "agency", "freelancing",
    "mindset", "motivation", "discipline",
]


def is_question(text: str) -> bool:
    """Detect if a comment is a question."""
    if "?" in text:
        for pattern in QUESTION_PATTERNS:
            if re.search(pattern, text, re.IGNORECASE):
                return True
        if text.count("?") >= 1 and len(text) > 10:
            return True
    return False


def detect_pain_points(comments: List[str]) -> List[dict]:
    """Rule-based pain point detection."""
    category_counts = {cat: {"count": 0, "examples": []} for cat in PAIN_POINT_CATEGORIES}

    for text in comments:
        text_lower = text.lower()
        for category, keywords in PAIN_POINT_CATEGORIES.items():
            if any(kw in text_lower for kw in keywords):
                category_counts[category]["count"] += 1
                if len(category_counts[category]["examples"]) < 5:
                    category_counts[category]["examples"].append(text[:200])

    result = [
        {
            "topic": cat,
            "frequency": data["count"],
            "example_comments": data["examples"],
            "category": cat,
        }
        for cat, data in category_counts.items()
        if data["count"] > 0
    ]
    result.sort(key=lambda x: x["frequency"], reverse=True)
    return result


def extract_questions(comments: List[str]) -> List[dict]:
    """Extract and deduplicate questions from comments."""
    questions = []
    seen = set()

    for text in comments:
        if is_question(text):
            # Normalize
            normalized = re.sub(r'\s+', ' ', text.strip().lower())[:100]
            if normalized not in seen:
                seen.add(normalized)
                questions.append(text)

    # Group similar questions (simple keyword overlap)
    grouped = {}
    for q in questions:
        key_words = frozenset(
            w for w in re.findall(r'\b[a-z]{4,}\b', q.lower())
            if w not in {"this", "that", "with", "from", "they", "have", "what", "when", "where", "which"}
        )
        # Find best matching group
        best_group = None
        best_overlap = 0
        for existing_key in grouped:
            overlap = len(key_words & existing_key)
            if overlap >= 2 and overlap > best_overlap:
                best_overlap = overlap
                best_group = existing_key

        if best_group:
            grouped[best_group]["count"] += 1
            if len(grouped[best_group]["examples"]) < 5:
                grouped[best_group]["examples"].append(q[:200])
        else:
            grouped[key_words] = {"question": q[:200], "count": 1, "examples": [q[:200]]}

    result = [
        {
            "question_text": data["question"],
            "frequency": data["count"],
            "example_comments": data["examples"],
        }
        for data in grouped.values()
        if data["count"] >= 1
    ]
    result.sort(key=lambda x: x["frequency"], reverse=True)
    return result[:100]


def detect_purchase_intent(comments: List[dict]) -> List[dict]:
    """Detect purchase intent signals in comments."""
    results = []
    for comment in comments:
        text = comment.get("comment_text", "")
        text_lower = text.lower()
        signals = []
        score = 0.0

        for signal_type, keywords in PURCHASE_INTENT_SIGNALS.items():
            for kw in keywords:
                if kw in text_lower:
                    signals.append(signal_type.replace("_", " ").title())
                    score += 0.3
                    break

        if score > 0:
            results.append({
                **comment,
                "intent_score": min(1.0, score),
                "signals": list(set(signals)),
            })

    results.sort(key=lambda x: x["intent_score"], reverse=True)
    return results


def discover_content_opportunities(comments: List[str]) -> List[dict]:
    """Find frequently requested content topics."""
    topic_counts = {}

    for text in comments:
        text_lower = text.lower()
        for topic in CONTENT_TOPICS:
            topic_lower = topic.lower()
            if topic_lower in text_lower:
                if topic not in topic_counts:
                    topic_counts[topic] = {"count": 0, "examples": []}
                topic_counts[topic]["count"] += 1
                if len(topic_counts[topic]["examples"]) < 5:
                    topic_counts[topic]["examples"].append(text[:200])

    result = [
        {
            "topic": topic,
            "frequency": data["count"],
            "example_comments": data["examples"],
        }
        for topic, data in topic_counts.items()
        if data["count"] > 0
    ]
    result.sort(key=lambda x: x["frequency"], reverse=True)
    return result[:30]


# ─── AI-powered analysis (when provider is configured) ───────────────────────

async def ai_analyze_comments(comments: List[str], task: str) -> Optional[str]:
    """
    Use configured AI provider to analyze comments.
    Returns raw text analysis or None if no provider.
    """
    if not comments:
        return None

    provider = settings.AI_PROVIDER.lower()
    sample = comments[:50]  # Cost control
    prompt = _build_analysis_prompt(sample, task)

    try:
        if provider == "openai":
            return await _openai_analyze(prompt)
        elif provider == "anthropic":
            return await _anthropic_analyze(prompt)
        elif provider == "gemini":
            return await _gemini_analyze(prompt)
        elif provider == "ollama":
            return await _ollama_analyze(prompt)
        elif provider == "openrouter":
            return await _openrouter_analyze(prompt)
    except Exception as e:
        print(f"AI analysis failed: {e}")
    return None


def _build_analysis_prompt(comments: List[str], task: str) -> str:
    joined = "\n---\n".join(comments)
    return f"""You are an expert at analyzing YouTube comments for business intelligence.

Task: {task}

Comments:
{joined}

Provide a structured JSON response."""


async def _openai_analyze(prompt: str) -> str:
    import httpx
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {settings.OPENAI_API_KEY}"},
            json={
                "model": settings.AI_MODEL or "gpt-4o-mini",
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 2000,
            },
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]


async def _anthropic_analyze(prompt: str) -> str:
    import httpx
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": settings.ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
            },
            json={
                "model": settings.AI_MODEL or "claude-haiku-4-5-20251001",
                "max_tokens": 2000,
                "messages": [{"role": "user", "content": prompt}],
            },
        )
        resp.raise_for_status()
        return resp.json()["content"][0]["text"]


async def _gemini_analyze(prompt: str) -> str:
    import httpx
    model = settings.AI_MODEL or "gemini-1.5-flash"
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
            params={"key": settings.GEMINI_API_KEY},
            json={"contents": [{"parts": [{"text": prompt}]}]},
        )
        resp.raise_for_status()
        return resp.json()["candidates"][0]["content"]["parts"][0]["text"]


async def _ollama_analyze(prompt: str) -> str:
    import httpx
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{settings.OLLAMA_BASE_URL}/api/generate",
            json={
                "model": settings.AI_MODEL or "llama3",
                "prompt": prompt,
                "stream": False,
            },
        )
        resp.raise_for_status()
        return resp.json()["response"]


async def _openrouter_analyze(prompt: str) -> str:
    import httpx
    import asyncio
    model = settings.AI_MODEL or "google/gemini-flash-1.5"
    max_retries = 4
    base_delay = 5.0

    async with httpx.AsyncClient(timeout=90) as client:
        for attempt in range(max_retries):
            resp = await client.post(
                f"{settings.OPENROUTER_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
                    "HTTP-Referer": "http://localhost:3000",
                    "X-Title": "YouTube Intelligence",
                },
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 2000,
                },
            )

            if resp.status_code == 429:
                if attempt == max_retries - 1:
                    raise Exception(
                        f"OpenRouter rate limit hit after {max_retries} attempts. "
                        "Try again in a minute, or switch to a model with higher rate limits (e.g. a free tier model)."
                    )
                retry_after = float(resp.headers.get("Retry-After", base_delay * (2 ** attempt)))
                await asyncio.sleep(min(retry_after, 60))
                continue

            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]

    raise Exception("OpenRouter request failed after all retries")


async def ai_analyze_videos(video_summaries: list[str], prompt_type: str, custom_prompt: str = "") -> tuple[str | None, str | None]:
    """Analyze competitor videos using configured AI provider. Returns (insight, error)."""
    provider = settings.AI_PROVIDER.lower()
    if provider == "none" or not provider:
        return None, "No AI provider configured. Add an OpenRouter key in Settings."

    video_list = "\n".join(video_summaries[:30])

    PROMPTS = {
        "summary": f"Analyse these top-performing competitor YouTube videos. What content themes, title patterns, and topics are driving the most views? Give a concise strategic summary.\n\nVideos:\n{video_list}",
        "titles": f"Look at these YouTube video titles from competitors. What title formulas, hooks, and patterns appear in the top performers? List the top 5 patterns with examples.\n\nVideos:\n{video_list}",
        "topics": f"Based on these competitor videos, what topics and content categories are resonating most with audiences right now? Rank by apparent demand.\n\nVideos:\n{video_list}",
        "custom": f"{custom_prompt}\n\nVideos:\n{video_list}",
    }

    prompt = PROMPTS.get(prompt_type, PROMPTS["summary"])
    model_used = settings.AI_MODEL or "default"

    try:
        if provider == "openai":
            result = await _openai_analyze(prompt)
        elif provider == "anthropic":
            result = await _anthropic_analyze(prompt)
        elif provider == "gemini":
            result = await _gemini_analyze(prompt)
        elif provider == "ollama":
            result = await _ollama_analyze(prompt)
        elif provider == "openrouter":
            result = await _openrouter_analyze(prompt)
        else:
            return None, f"Unknown provider: {provider}"
        return result, None
    except Exception as e:
        return None, str(e)
