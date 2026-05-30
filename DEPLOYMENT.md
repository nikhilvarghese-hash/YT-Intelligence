# YouTube Intelligence — Deployment Guide

## Local Development (Quickstart)

### Prerequisites
- Python 3.11+
- Node.js 20+
- YouTube Data API v3 key

### 1. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Create .env
cp .env.example .env
# Edit .env → add YOUTUBE_API_KEY

uvicorn app.main:app --reload --port 8000
```

API docs: http://localhost:8000/api/docs

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

App: http://localhost:3000

---

## Environment Variables

### Backend `.env`

```env
YOUTUBE_API_KEY=AIzaXXX...
AI_PROVIDER=none           # none | openai | anthropic | gemini | ollama
AI_MODEL=                  # optional, defaults set per provider
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
OLLAMA_BASE_URL=http://localhost:11434
DATABASE_URL=sqlite:///./youtube_intelligence.db
CORS_ORIGINS=["http://localhost:3000"]
```

### Frontend `.env.local`

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## Production Deployment

### Railway

1. Push repo to GitHub
2. New project → Deploy from GitHub
3. Add two services: `backend` and `frontend`
4. Set environment variables in Railway dashboard
5. Backend: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
6. Frontend: set `NEXT_PUBLIC_API_URL` to your backend Railway URL

**Cost:** ~$5–8/month on hobby plan

### Render

1. New Web Service → Connect GitHub
2. Backend:
   - Build: `pip install -r requirements.txt`
   - Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - Add persistent disk at `/app/data` for SQLite
3. Frontend:
   - Build: `npm install && npm run build`
   - Start: `npm start`
4. Add env vars in Render dashboard

**Cost:** ~$7/month (free tier spins down after inactivity)

### Fly.io

```bash
# Backend
cd backend
fly launch --name yt-intel-api
fly secrets set YOUTUBE_API_KEY=AIzaXXX
fly volumes create data --size 1
fly deploy

# Frontend
cd frontend
fly launch --name yt-intel-app
fly secrets set NEXT_PUBLIC_API_URL=https://yt-intel-api.fly.dev
fly deploy
```

**Cost:** ~$3–5/month on shared-cpu-1x

### VPS (e.g. DigitalOcean $6/month droplet)

```bash
# Install deps
apt update && apt install python3-pip nodejs npm nginx -y

# Clone repo
git clone <your-repo>
cd youtube-intelligence

# Backend (systemd service)
cd backend
pip install -r requirements.txt
# Create /etc/systemd/system/yt-intel-backend.service

# Frontend
cd frontend
npm install && npm run build

# Nginx reverse proxy
# /etc/nginx/sites-available/yt-intel
server {
  listen 80;
  location /api/ { proxy_pass http://localhost:8000; }
  location / { proxy_pass http://localhost:3000; }
}
```

---

## Docker Compose (All-in-one)

```bash
cp .env.example .env
# Edit .env
docker compose up -d
```

App runs at http://localhost:3000

---

## Getting a YouTube API Key

1. Go to https://console.cloud.google.com
2. Create a new project
3. APIs & Services → Enable APIs → Search "YouTube Data API v3"
4. Credentials → Create API Key
5. (Optional) Restrict to YouTube Data API v3

**Daily quota:** 10,000 units
- Channel lookup: 1 unit
- Video list: 1 unit/page
- Comment fetch: 1 unit/page (up to 100 comments)
- Search: 100 units

Importing 25 videos × ~5 pages comments = ~125 units per creator

---

## Database

SQLite database is stored at `youtube_intelligence.db`.

For production on Railway/Render: mount a persistent disk and set:
```
DATABASE_URL=sqlite:///./data/youtube_intelligence.db
```

**Performance at scale:**
- 1M comments: ~200MB SQLite file, ~50ms queries with indexes
- For 10M+ comments: migrate to PostgreSQL (swap SQLAlchemy URL)

---

## Architecture Diagram

```
Browser (Next.js)
     │
     ▼
FastAPI (Python)
     │
     ├── YouTube Data API v3
     ├── SQLite (persistent)
     └── AI Provider (optional)
         ├── OpenAI
         ├── Anthropic
         ├── Gemini
         └── Ollama
```
