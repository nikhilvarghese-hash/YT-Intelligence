# YouTube Intelligence Platform

> Mine comments, surface content opportunities, and turn viewer demand into AI-generated production briefs.

A full-stack audience research tool for YouTube creators. It ingests comments and replies at scale, then runs multi-layer analysis to answer one question: *what should I make next, and why will it perform?*

---

## What it does

**Audience Intelligence**
Index all comments across multiple channels. Surface pain points, questions, purchase intent signals, and content ideas — ranked by mention frequency and engagement.

**Competitor Analytics**
Side-by-side channel comparison with AI-generated insights on content gaps, audience sentiment, and growth patterns.

**Topic Intelligence Engine**
Clusters comments into semantic themes using TF-IDF + k-means (pure numpy, no ML deps). Tracks growth rate per theme, classifies topics as core vs adjacent, and caches results with fingerprint-based invalidation.

**AI Content Strategy**
Kanban-style opportunity board with server-side pagination, per-card AI briefs, inline editing, notes, and archiving. Scores every opportunity across Demand, Engagement, Trend, and Relevance axes.

**AI Content Recommendation Engine**
Generates and persists structured recommendations — title, hook, talking points, FAQs, misconceptions, and a priority score (0–100). Full workflow from draft → reviewed → approved → published.

**Content Planner**
Converts approved recommendations into production-ready packages: video outline with timed sections, three thumbnail concepts with persuasion style, SEO keyword strategy, and a monthly content calendar.

---

## Stack

| Layer | Tech |
|---|---|
| Backend | FastAPI · SQLAlchemy · SQLite · async background tasks |
| Frontend | Next.js 14 App Router · TypeScript · Tailwind CSS |
| AI | Provider-agnostic — OpenAI / Anthropic / Gemini / OpenRouter / Ollama |
| Clustering | Pure numpy (TF-IDF + k-means) — no sklearn / torch |

AI provider and model are swappable via the settings UI — no redeploy needed.

---

## Quickstart

**Prerequisites:** Python 3.11+, Node.js 20+, a YouTube Data API v3 key.

```bash
git clone <your-repo>
cd youtube-intelligence
./start.sh
```

That's it. The script installs all dependencies, creates `.env` files, and starts both services.

| | URL |
|---|---|
| App | http://localhost:3000 |
| API docs | http://localhost:8000/api/docs |

### Manual setup

**Backend**
```bash
cd backend
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env            # then add your YOUTUBE_API_KEY
uvicorn app.main:app --reload --port 8000
```

**Frontend**
```bash
cd frontend
npm install
npm run dev
```

---

## start.sh commands

```bash
./start.sh            # install deps + start everything (default)
./start.sh start      # start without reinstalling
./start.sh stop       # stop both services
./start.sh logs       # tail live logs
./start.sh reset      # wipe DB and start fresh
./start.sh setup      # install deps only, don't start
```

---

## Environment variables

**`backend/.env`**
```env
YOUTUBE_API_KEY=AIzaXXX...

# AI provider — set one, leave others blank
AI_PROVIDER=none          # none | openai | anthropic | gemini | ollama | openrouter
AI_MODEL=                 # optional — defaults are set per provider
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
OPENROUTER_API_KEY=
OLLAMA_BASE_URL=http://localhost:11434

DATABASE_URL=sqlite:///./youtube_intelligence.db
CORS_ORIGINS=["http://localhost:3000"]
```

**`frontend/.env.local`**
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

You can also set the YouTube API key and AI provider directly in the **Settings** page of the app — no `.env` edit required after first run.

---

## Getting a YouTube API key

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project → APIs & Services → Enable **YouTube Data API v3**
3. Credentials → Create API Key
4. (Optional) Restrict to YouTube Data API v3

**Daily quota:** 10,000 units — importing 25 videos with comments uses ~125 units per creator.

---

## Deployment

See [`DEPLOYMENT.md`](DEPLOYMENT.md) for step-by-step guides for Railway, Render, Fly.io, and VPS.

**Docker**
```bash
cp .env.example .env
docker compose up -d
```

---

## Architecture

```
Browser (Next.js 14)
        │
        ▼
  FastAPI (Python)
        │
        ├── YouTube Data API v3
        ├── SQLite (persistent, swappable to Postgres)
        └── AI Provider (optional)
                ├── OpenAI
                ├── Anthropic
                ├── Gemini
                ├── OpenRouter
                └── Ollama (local)
```

---

## Database

SQLite at `backend/youtube_intelligence.db`. For production, mount a persistent disk and point `DATABASE_URL` there. The SQLAlchemy layer means you can swap to PostgreSQL by changing one env var.

**Scale reference:** 1M comments ≈ 200MB · ~50ms queries with indexes. For 10M+ migrate to Postgres.
