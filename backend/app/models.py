from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Text, DateTime, Float, Boolean,
    ForeignKey, BigInteger, Index, JSON
)
from sqlalchemy.orm import relationship
from .database import Base


class Creator(Base):
    __tablename__ = "creators"

    id = Column(Integer, primary_key=True, index=True)
    channel_id = Column(String(64), unique=True, index=True, nullable=False)
    channel_name = Column(String(256), nullable=False)
    subscriber_count = Column(BigInteger, default=0)
    video_count = Column(Integer, default=0)
    channel_url = Column(String(512))
    thumbnail_url = Column(String(512))
    description = Column(Text)
    country = Column(String(8))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_synced_at = Column(DateTime)
    is_active = Column(Boolean, default=True)
    is_competitor = Column(Boolean, default=False)

    videos = relationship("Video", back_populates="creator", cascade="all, delete-orphan")


class Video(Base):
    __tablename__ = "videos"

    id = Column(Integer, primary_key=True, index=True)
    creator_id = Column(Integer, ForeignKey("creators.id", ondelete="CASCADE"), nullable=False)
    video_id = Column(String(32), unique=True, index=True, nullable=False)
    title = Column(String(512), nullable=False)
    url = Column(String(512))
    description = Column(Text)
    publish_date = Column(DateTime, index=True)
    views = Column(BigInteger, default=0)
    likes = Column(BigInteger, default=0)
    comment_count = Column(Integer, default=0)
    duration = Column(String(32))
    thumbnail_url = Column(String(512))
    imported_at = Column(DateTime, default=datetime.utcnow)
    comments_imported = Column(Boolean, default=False)
    comments_imported_at = Column(DateTime)

    creator = relationship("Creator", back_populates="videos")
    comments = relationship("Comment", back_populates="video", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_videos_creator_publish", "creator_id", "publish_date"),
    )


class Comment(Base):
    __tablename__ = "comments"

    id = Column(Integer, primary_key=True, index=True)
    video_id = Column(Integer, ForeignKey("videos.id", ondelete="CASCADE"), nullable=False)
    comment_id = Column(String(64), unique=True, index=True, nullable=False)
    author_name = Column(String(256), index=True)
    author_channel_id = Column(String(64), index=True)
    comment_text = Column(Text, nullable=False)
    comment_date = Column(DateTime, index=True)
    likes = Column(Integer, default=0)
    reply_count = Column(Integer, default=0)
    is_top_level = Column(Boolean, default=True)
    imported_at = Column(DateTime, default=datetime.utcnow)

    video = relationship("Video", back_populates="comments")
    replies = relationship("Reply", back_populates="comment", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_comments_video_likes", "video_id", "likes"),
        Index("ix_comments_author", "author_channel_id"),
    )


class Reply(Base):
    __tablename__ = "replies"

    id = Column(Integer, primary_key=True, index=True)
    comment_id = Column(Integer, ForeignKey("comments.id", ondelete="CASCADE"), nullable=False)
    reply_id = Column(String(64), unique=True, index=True, nullable=False)
    reply_author = Column(String(256))
    reply_author_channel_id = Column(String(64))
    reply_text = Column(Text, nullable=False)
    reply_date = Column(DateTime)
    likes = Column(Integer, default=0)
    imported_at = Column(DateTime, default=datetime.utcnow)

    comment = relationship("Comment", back_populates="replies")


class SavedSearch(Base):
    __tablename__ = "saved_searches"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(256), nullable=False)
    query = Column(String(512), nullable=False)
    filters = Column(JSON)  # creator_ids, date_range, etc.
    created_at = Column(DateTime, default=datetime.utcnow)
    last_run_at = Column(DateTime)
    result_count = Column(Integer)


class Watchlist(Base):
    __tablename__ = "watchlists"

    id = Column(Integer, primary_key=True, index=True)
    keyword = Column(String(256), nullable=False)
    description = Column(String(512))
    creator_ids = Column(JSON)  # list of creator ids to watch, empty = all
    created_at = Column(DateTime, default=datetime.utcnow)
    last_checked_at = Column(DateTime)
    mention_count = Column(Integer, default=0)


class CommentCollection(Base):
    __tablename__ = "comment_collections"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(256), nullable=False)
    description = Column(String(512))
    color = Column(String(16), default="#6366f1")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    items = relationship("CollectionItem", back_populates="collection", cascade="all, delete-orphan")


class CollectionItem(Base):
    __tablename__ = "collection_items"

    id = Column(Integer, primary_key=True, index=True)
    collection_id = Column(Integer, ForeignKey("comment_collections.id", ondelete="CASCADE"), nullable=False)
    comment_id = Column(Integer, ForeignKey("comments.id", ondelete="CASCADE"), nullable=False)
    note = Column(Text)
    added_at = Column(DateTime, default=datetime.utcnow)

    collection = relationship("CommentCollection", back_populates="items")
    comment = relationship("Comment")


class AppSettings(Base):
    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(128), unique=True, nullable=False)
    value = Column(Text)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ContentRecommendation(Base):
    __tablename__ = "content_recommendations"

    id = Column(Integer, primary_key=True, index=True)

    # Source
    topic = Column(String(512), nullable=False)
    original_topic = Column(String(512))
    category = Column(String(128))
    classification = Column(String(32))          # finniki | adjacent
    creator_ids_filter = Column(JSON)            # which creators were in scope

    # Scores (0-100 integers)
    demand_score = Column(Integer, default=0)
    engagement_score = Column(Integer, default=0)
    trend_score = Column(Integer, default=0)
    relevance_score = Column(Integer, default=0)
    priority_score = Column(Integer, default=0)
    confidence_score = Column(Float, default=0)  # 0.0-1.0

    # Raw metrics (for later re-scoring)
    frequency = Column(Integer, default=0)
    unique_users = Column(Integer, default=0)
    avg_likes = Column(Float, default=0)
    growth_rate = Column(Float, default=0)
    trend = Column(String(16))

    # Generated content (AI-produced)
    suggested_title = Column(Text)
    suggested_hook = Column(Text)
    format = Column(String(32))                  # long | short | series
    target_audience = Column(String(256))
    talking_points = Column(JSON)                # list[str]
    faqs = Column(JSON)                          # list[{q, a}]
    misconceptions = Column(JSON)                # list[str]
    explanation = Column(Text)                   # why this scored high

    # Workflow
    status = Column(String(32), default='draft') # draft | reviewed | approved | published
    notes = Column(Text)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ContentBrief(Base):
    __tablename__ = "content_briefs"

    id = Column(Integer, primary_key=True, index=True)

    # Source linkage (nullable — briefs can be created standalone)
    recommendation_id = Column(Integer, ForeignKey("content_recommendations.id", ondelete="SET NULL"), nullable=True, index=True)
    topic = Column(String(512), nullable=False)
    title = Column(String(512))
    category = Column(String(128))
    classification = Column(String(32))   # finniki | adjacent

    # AI-generated components
    brief_summary = Column(Text)
    target_audience = Column(String(256))
    hook = Column(Text)
    video_outline = Column(JSON)          # [{section, duration_min, points:[]}]
    thumbnail_ideas = Column(JSON)        # [{concept, description, style}]
    seo_primary_keyword = Column(String(256))
    seo_secondary_keywords = Column(JSON) # [str]
    seo_tags = Column(JSON)               # [str]
    estimated_duration = Column(Integer)  # minutes
    content_format = Column(String(32))   # long | short | series

    # Workflow
    status = Column(String(32), default='draft')  # draft | ready | scheduled | published
    scheduled_date = Column(DateTime, nullable=True)
    notes = Column(Text)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ── Ask Finniki RAG tables ────────────────────────────────────────────────────

class RAGDocument(Base):
    """One-to-one with a source record; tracks whether it's been indexed."""
    __tablename__ = "rag_documents"

    id = Column(Integer, primary_key=True, index=True)
    source_type = Column(String(64), nullable=False, index=True)  # comment | video | reply
    source_id = Column(String(128), nullable=False, index=True)
    content_hash = Column(String(64), nullable=False, index=True)
    creator_id = Column(Integer, ForeignKey("creators.id", ondelete="CASCADE"), nullable=True, index=True)
    indexed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    chunks = relationship("RAGChunk", back_populates="document", cascade="all, delete-orphan")


class RAGChunk(Base):
    """A text chunk derived from a RAGDocument."""
    __tablename__ = "rag_chunks"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("rag_documents.id", ondelete="CASCADE"), nullable=False, index=True)
    chunk_index = Column(Integer, nullable=False, default=0)
    chunk_hash = Column(String(64), nullable=False)
    chunk_text = Column(Text, nullable=False)
    metadata_json = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    document = relationship("RAGDocument", back_populates="chunks")
    embedding = relationship("RAGEmbedding", back_populates="chunk", uselist=False, cascade="all, delete-orphan")


class RAGEmbedding(Base):
    """Embedding vector stored as JSON float array (SQLite-compatible)."""
    __tablename__ = "rag_embeddings"

    id = Column(Integer, primary_key=True, index=True)
    chunk_id = Column(Integer, ForeignKey("rag_chunks.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    embedding = Column(Text, nullable=False)
    embedding_model = Column(String(128), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    chunk = relationship("RAGChunk", back_populates="embedding")


class RAGQueryLog(Base):
    """Audit log of all Ask Finniki queries."""
    __tablename__ = "rag_query_logs"

    id = Column(Integer, primary_key=True, index=True)
    query = Column(Text, nullable=False)
    response = Column(Text)
    confidence = Column(Float)
    sources_used = Column(Integer, default=0)
    retrieved_chunks = Column(Integer, default=0)
    execution_time_ms = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)
