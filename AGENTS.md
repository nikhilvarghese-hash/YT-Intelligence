# AGENTS.md — YouTube Intelligence Platform

## Project Overview

A YouTube audience intelligence platform with a FastAPI backend and Next.js 14 frontend. It tracks creators/competitors, analyses content topics, generates AI-powered insights, and surfaces content strategy recommendations.

## Repo Layout

```
backend/
  app/
    main.py          # FastAPI app, router registration, startup settings loader
    config.py        # Settings (API keys, DB URL, etc.)
    database.py      # SQLAlchemy engine + session
    models.py        # ORM models
    schemas.py       # Pydantic schemas
    routers/         # One file per feature area
    services/        # Business logic (YouTube API, AI insights, topic clusters)
frontend/
  src/
    app/             # Next.js App Router pages (one dir per route)
    components/      # Shared UI components
    lib/
      api.ts         # All fetch calls to the backend
      utils.ts       # Helpers (formatNumber, etc.)
start.sh             # Local launcher (installs deps + starts both services)
Makefile             # Delegates to start.sh
docker-compose.yml   # Alternative: run via Docker
```

## Running Locally

```bash
make run      # First run: install deps + start backend (port 8000) + frontend (port 3000)
make start    # Start without reinstalling deps
make stop     # Stop both services
make logs     # Tail logs
make reset    # Wipe DB and restart fresh
```

Backend API docs: http://localhost:8000/api/docs  
Frontend: http://localhost:3000

## Backend (FastAPI + SQLite)

- Python 3.11+ required; virtualenv lives at `backend/.venv`
- All routes are prefixed with `/api/`
- Adding a new feature: create `backend/app/routers/<name>.py`, register it in `main.py` with `app.include_router(...)`
- API keys and provider settings are persisted in the DB and loaded into `settings` at startup (`main.py` → `load_settings_on_startup`)
- AI inference goes through `services/ai_insights.py`; it reads the active provider/model from `settings`

## Frontend (Next.js 14 App Router)

- TypeScript, Tailwind CSS, Radix UI, SWR for data fetching, Recharts for charts
- All API calls live in `src/lib/api.ts` — add new fetch functions there, not inline in pages
- Navigation is in `src/components/layout/Sidebar.tsx` — update it when adding a new page
- New pages go in `src/app/<route>/page.tsx`

## Key API Routes

| Route | Purpose |
|---|---|
| `GET /api/creators` | List tracked creators |
| `GET /api/competitors` | List competitor channels |
| `GET /api/analytics/...` | Engagement and performance analytics |
| `GET /api/content-strategy/...` | AI content strategy recommendations |
| `GET /api/topic-intelligence/...` | Topic clustering and gap analysis |
| `GET /api/settings` | Read/write API keys and AI provider config |

## AI Provider

The platform supports multiple AI providers (OpenAI, Anthropic, Gemini, Ollama, OpenRouter). The active provider and model are configured via the Settings page and persisted to the DB. OpenRouter calls include exponential backoff retry on 429s.

## Agent Guidelines

- **Do not** commit `frontend/tsconfig.tsbuildinfo` — it is a build artefact.
- **Do not** commit `frontend/.claude/settings.local.json` — it contains local-only Claude Code config.
- When modifying the backend, verify the frontend's `api.ts` types stay in sync with the updated Pydantic schemas.
- When adding a new page, also add a nav entry in `Sidebar.tsx`.
- Run `make start` (not `npm run dev` directly) to ensure both services start with correct env vars.
- The DB is SQLite at `backend/app.db`; schema changes require a migration or `make reset`.

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
| ------ | ---------- |
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.
