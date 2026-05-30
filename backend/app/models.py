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
