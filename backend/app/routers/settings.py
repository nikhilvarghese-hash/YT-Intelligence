"""
App settings: API keys, AI provider config, quota tracking.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime

from ..database import get_db
from ..models import AppSettings
from ..schemas import SettingsUpdate, SettingsOut
from ..config import settings as app_settings
from ..services.youtube import get_quota_info

router = APIRouter()


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


@router.get("", response_model=SettingsOut)
def get_settings(db: Session = Depends(get_db)):
    quota = get_quota_info()
    return SettingsOut(
        youtube_api_key_set=bool(_get_setting(db, "youtube_api_key") or app_settings.YOUTUBE_API_KEY),
        ai_provider=_get_setting(db, "ai_provider") or app_settings.AI_PROVIDER,
        ai_model=_get_setting(db, "ai_model") or app_settings.AI_MODEL,
        openrouter_key_set=bool(_get_setting(db, "openrouter_api_key") or app_settings.OPENROUTER_API_KEY),
        quota_used=quota["used"],
        quota_remaining=quota["remaining"],
        last_api_call=quota["last_call"],
    )


@router.post("")
def update_settings(req: SettingsUpdate, db: Session = Depends(get_db)):
    if req.youtube_api_key is not None:
        _set_setting(db, "youtube_api_key", req.youtube_api_key)
        app_settings.YOUTUBE_API_KEY = req.youtube_api_key

    if req.ai_provider is not None:
        if req.ai_provider not in ("openai", "anthropic", "gemini", "ollama", "openrouter", "none"):
            raise HTTPException(status_code=400, detail="Invalid AI provider")
        _set_setting(db, "ai_provider", req.ai_provider)
        app_settings.AI_PROVIDER = req.ai_provider

    if req.ai_model is not None:
        _set_setting(db, "ai_model", req.ai_model)
        app_settings.AI_MODEL = req.ai_model

    if req.openai_api_key is not None:
        _set_setting(db, "openai_api_key", req.openai_api_key)
        app_settings.OPENAI_API_KEY = req.openai_api_key

    if req.anthropic_api_key is not None:
        _set_setting(db, "anthropic_api_key", req.anthropic_api_key)
        app_settings.ANTHROPIC_API_KEY = req.anthropic_api_key

    if req.gemini_api_key is not None:
        _set_setting(db, "gemini_api_key", req.gemini_api_key)
        app_settings.GEMINI_API_KEY = req.gemini_api_key

    if req.ollama_base_url is not None:
        _set_setting(db, "ollama_base_url", req.ollama_base_url)
        app_settings.OLLAMA_BASE_URL = req.ollama_base_url

    if req.openrouter_api_key is not None:
        _set_setting(db, "openrouter_api_key", req.openrouter_api_key)
        app_settings.OPENROUTER_API_KEY = req.openrouter_api_key

    return {"detail": "Settings updated"}


@router.get("/load-from-db")
def load_settings_from_db(db: Session = Depends(get_db)):
    """Load persisted settings into runtime config on startup."""
    keys_to_load = [
        "youtube_api_key", "ai_provider", "ai_model",
        "openai_api_key", "anthropic_api_key", "gemini_api_key", "ollama_base_url",
        "openrouter_api_key",
    ]
    for key in keys_to_load:
        val = _get_setting(db, key)
        if val:
            setattr(app_settings, key.upper(), val)
    return {"detail": "Loaded"}


@router.get("/openrouter/models")
async def get_openrouter_models(key: str | None = None, db: Session = Depends(get_db)):
    import httpx
    key = key or _get_setting(db, "openrouter_api_key") or app_settings.OPENROUTER_API_KEY
    if not key:
        raise HTTPException(status_code=400, detail="OpenRouter API key not set")
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            "https://openrouter.ai/api/v1/models",
            headers={"Authorization": f"Bearer {key}"},
        )
        resp.raise_for_status()
    raw = resp.json().get("data", [])
    models = sorted(
        [{"id": m["id"], "name": m.get("name", m["id"]), "context_length": m.get("context_length", 0)}
         for m in raw],
        key=lambda x: x["name"],
    )
    return {"models": models}
