from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel, HttpUrl


# ─── Creator ────────────────────────────────────────────────────────────────

class CreatorBase(BaseModel):
    channel_id: str
    channel_name: str
    subscriber_count: Optional[int] = 0
    video_count: Optional[int] = 0
    channel_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    description: Optional[str] = None
    country: Optional[str] = None


class CreatorCreate(CreatorBase):
    pass


class CreatorOut(CreatorBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime]
    last_synced_at: Optional[datetime]
    is_active: bool
    total_comments: Optional[int] = 0
    total_videos_imported: Optional[int] = 0

    class Config:
        from_attributes = True


class CreatorDiscoveryRequest(BaseModel):
    query: str  # name, URL, or channel ID


class CreatorDiscoveryResult(BaseModel):
    channel_id: str
    channel_name: str
    subscriber_count: int
    video_count: int
    channel_url: str
    thumbnail_url: Optional[str] = None
    description: Optional[str] = None
    already_imported: bool = False


class ImportRequest(BaseModel):
    channel_id: str
    video_count: int = 25  # 10, 25, 50, 100, or custom


# ─── Video ───────────────────────────────────────────────────────────────────

class VideoOut(BaseModel):
    id: int
    creator_id: int
    video_id: str
    title: str
    url: Optional[str]
    publish_date: Optional[datetime]
    views: int
    likes: int
    comment_count: int
    duration: Optional[str]
    thumbnail_url: Optional[str]
    comments_imported: bool

    class Config:
        from_attributes = True


# ─── Comment ─────────────────────────────────────────────────────────────────

class CommentOut(BaseModel):
    id: int
    video_id: int
    comment_id: str
    author_name: Optional[str]
    author_channel_id: Optional[str]
    comment_text: str
    comment_date: Optional[datetime]
    likes: int
    reply_count: int
    # Joined fields
    video_title: Optional[str] = None
    creator_name: Optional[str] = None
    creator_id: Optional[int] = None

    class Config:
        from_attributes = True


class ReplyOut(BaseModel):
    id: int
    comment_id: int
    reply_id: str
    reply_author: Optional[str]
    reply_text: str
    reply_date: Optional[datetime]
    likes: int

    class Config:
        from_attributes = True


# ─── Search ──────────────────────────────────────────────────────────────────

class SearchRequest(BaseModel):
    query: str
    creator_ids: Optional[List[int]] = None
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    min_likes: Optional[int] = None
    page: int = 1
    page_size: int = 50


class SearchResult(BaseModel):
    comment_id: int
    comment_text: str
    author_name: Optional[str]
    likes: int
    reply_count: int
    comment_date: Optional[datetime]
    video_id: int
    video_title: str
    creator_id: int
    creator_name: str
    relevance_score: float = 1.0


class SearchResponse(BaseModel):
    results: List[SearchResult]
    total: int
    page: int
    page_size: int
    query: str


# ─── Keyword Explorer ────────────────────────────────────────────────────────

class KeywordStats(BaseModel):
    keyword: str
    total_mentions: int
    unique_videos: int
    unique_creators: int
    avg_likes_on_mentions: float
    top_creators: List[dict]
    top_videos: List[dict]
    most_liked_comments: List[CommentOut]
    most_replied_comments: List[CommentOut]
    mention_trend: List[dict]  # [{date, count}]


# ─── Analytics ───────────────────────────────────────────────────────────────

class PainPoint(BaseModel):
    topic: str
    frequency: int
    example_comments: List[str]
    category: str


class Question(BaseModel):
    question_text: str
    frequency: int
    example_comments: List[str]
    creator_names: List[str]


class PurchaseIntent(BaseModel):
    comment_text: str
    author_name: Optional[str]
    video_title: str
    creator_name: str
    likes: int
    comment_date: Optional[datetime]
    intent_score: float
    signals: List[str]


class ContentOpportunity(BaseModel):
    topic: str
    frequency: int
    example_comments: List[str]
    creators_mentioning: List[str]


class AudienceOverlapUser(BaseModel):
    author_name: str
    author_channel_id: Optional[str]
    creator_count: int
    comment_count: int
    creators: List[str]


class CreatorComparison(BaseModel):
    creator_id: int
    creator_name: str
    total_comments: int
    avg_likes_per_comment: float
    avg_replies_per_comment: float
    engagement_rate: float
    total_videos: int
    questions_count: int
    pain_points_count: int


# ─── Collections ─────────────────────────────────────────────────────────────

class CollectionCreate(BaseModel):
    name: str
    description: Optional[str] = None
    color: Optional[str] = "#6366f1"


class CollectionOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    color: str
    created_at: datetime
    item_count: Optional[int] = 0

    class Config:
        from_attributes = True


class AddToCollectionRequest(BaseModel):
    comment_ids: List[int]
    note: Optional[str] = None


# ─── Saved Search ────────────────────────────────────────────────────────────

class SavedSearchCreate(BaseModel):
    name: str
    query: str
    filters: Optional[dict] = None


class SavedSearchOut(BaseModel):
    id: int
    name: str
    query: str
    filters: Optional[dict]
    created_at: datetime
    last_run_at: Optional[datetime]
    result_count: Optional[int]

    class Config:
        from_attributes = True


# ─── Watchlist ───────────────────────────────────────────────────────────────

class WatchlistCreate(BaseModel):
    keyword: str
    description: Optional[str] = None
    creator_ids: Optional[List[int]] = None


class WatchlistOut(BaseModel):
    id: int
    keyword: str
    description: Optional[str]
    creator_ids: Optional[list]
    created_at: datetime
    last_checked_at: Optional[datetime]
    mention_count: int

    class Config:
        from_attributes = True


# ─── Settings ────────────────────────────────────────────────────────────────

class SettingsUpdate(BaseModel):
    youtube_api_key: Optional[str] = None
    ai_provider: Optional[str] = None
    ai_model: Optional[str] = None
    openai_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    gemini_api_key: Optional[str] = None
    ollama_base_url: Optional[str] = None
    openrouter_api_key: Optional[str] = None


class SettingsOut(BaseModel):
    youtube_api_key_set: bool
    ai_provider: str
    ai_model: str
    openrouter_key_set: bool = False
    quota_used: int
    quota_remaining: int
    last_api_call: Optional[datetime]


# ─── Reports ─────────────────────────────────────────────────────────────────

class ReportRequest(BaseModel):
    report_type: str  # audience | creator | market
    creator_ids: Optional[List[int]] = None
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None


# ─── Export ──────────────────────────────────────────────────────────────────

class ExportRequest(BaseModel):
    format: str  # csv | excel | json | markdown
    data_type: str  # comments | videos | creators | search_results | collection
    creator_ids: Optional[List[int]] = None
    collection_id: Optional[int] = None
    query: Optional[str] = None
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    min_likes: Optional[int] = None


# ─── Pagination ──────────────────────────────────────────────────────────────

class PaginatedResponse(BaseModel):
    items: List[Any]
    total: int
    page: int
    page_size: int
    pages: int


# ─── Import Status ───────────────────────────────────────────────────────────

class ImportStatus(BaseModel):
    job_id: str
    status: str  # pending | running | completed | failed
    channel_id: str
    channel_name: Optional[str]
    videos_total: int
    videos_imported: int
    comments_total: int
    comments_imported: int
    progress_pct: float
    message: Optional[str]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    error: Optional[str]


# ─── Competitors ─────────────────────────────────────────────────────────────

class CompetitorVideoOut(BaseModel):
    id: int
    video_id: str
    title: str
    url: Optional[str]
    thumbnail_url: Optional[str]
    publish_date: Optional[datetime]
    views: int
    likes: int
    comment_count: int
    creator_id: int
    creator_name: str
    subscriber_count: int
    outlier_score: Optional[float]
    views_per_hour: float
    hours_since_published: float

    class Config:
        from_attributes = True


class CompetitorInsightRequest(BaseModel):
    video_ids: List[int]
    prompt_type: str = "summary"  # summary | titles | topics | custom
    custom_prompt: Optional[str] = None


class CompetitorInsightResponse(BaseModel):
    insight: Optional[str]
    model_used: Optional[str]
    error: Optional[str] = None
