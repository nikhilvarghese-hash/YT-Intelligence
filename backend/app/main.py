from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from .config import settings
from .database import engine, Base
from .routers import creators, search, analytics, export, settings as settings_router
from .routers import competitors

# Create all tables
Base.metadata.create_all(bind=engine)

# Migrate: add is_competitor column if it doesn't exist (SQLite compatible)
from sqlalchemy import text
with engine.connect() as conn:
    try:
        conn.execute(text("ALTER TABLE creators ADD COLUMN is_competitor BOOLEAN DEFAULT 0"))
        conn.commit()
    except Exception:
        pass  # Column already exists

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="YouTube Audience Intelligence Platform API",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

# Middleware
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(creators.router, prefix="/api/creators", tags=["Creators"])
app.include_router(search.router, prefix="/api/search", tags=["Search"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["Analytics"])
app.include_router(export.router, prefix="/api/export", tags=["Export"])
app.include_router(settings_router.router, prefix="/api/settings", tags=["Settings"])
app.include_router(competitors.router, prefix="/api/competitors", tags=["Competitors"])


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": settings.APP_VERSION}


@app.get("/api/stats")
async def global_stats():
    from .database import SessionLocal
    from .models import Creator, Video, Comment, Reply
    from sqlalchemy import func

    db = SessionLocal()
    try:
        creators_count = db.query(func.count(Creator.id)).scalar()
        videos_count = db.query(func.count(Video.id)).scalar()
        comments_count = db.query(func.count(Comment.id)).scalar()
        replies_count = db.query(func.count(Reply.id)).scalar()
        return {
            "creators": creators_count,
            "videos": videos_count,
            "comments": comments_count,
            "replies": replies_count,
        }
    finally:
        db.close()
