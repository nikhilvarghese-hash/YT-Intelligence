#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  YouTube Intelligence — Local Launcher (macOS / Apple Silicon optimised)
#
#  ./start.sh          first run: install deps + start everything
#  ./start.sh start    start (skip install)
#  ./start.sh stop     stop both services
#  ./start.sh logs     tail live logs
#  ./start.sh reset    wipe DB and start fresh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

BACKEND_PORT=8000
FRONTEND_PORT=3000
VENV_DIR="backend/.venv"
PID_FILE=".pids"
LOG_DIR=".logs"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

log()  { echo -e "${CYAN}▶${NC}  $1"; }
ok()   { echo -e "${GREEN}✓${NC}  $1"; }
warn() { echo -e "${YELLOW}⚠${NC}  $1"; }
err()  { echo -e "${RED}✗${NC}  $1" >&2; exit 1; }

# ─── Apple Silicon: ensure Homebrew PATH is present ──────────────────────────
if [[ $(uname -m) == "arm64" ]]; then
  export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:$PATH"
fi

# ─── Prerequisites ────────────────────────────────────────────────────────────

check_prereqs() {
  local missing=()

  command -v python3 &>/dev/null || missing+=("python3  →  brew install python@3.12")
  command -v node    &>/dev/null || missing+=("node     →  brew install node")
  command -v npm     &>/dev/null || missing+=("npm      →  brew install node")

  if [[ ${#missing[@]} -gt 0 ]]; then
    echo -e "${RED}Missing dependencies:${NC}"
    for m in "${missing[@]}"; do echo "  $m"; done
    echo ""
    echo "Install Homebrew first if needed:  https://brew.sh"
    exit 1
  fi

  local py_minor
  py_minor=$(python3 -c 'import sys; print(sys.version_info.minor)')
  (( py_minor >= 11 )) || warn "Python 3.11+ recommended (you have 3.$py_minor). Run: brew install python@3.12"

  ok "Python $(python3 --version | cut -d' ' -f2)  |  Node $(node --version)  |  $(uname -m)"
}

# ─── Backend setup ────────────────────────────────────────────────────────────

setup_backend() {
  log "Setting up backend..."
  mkdir -p "$LOG_DIR"

  if [[ ! -d "$VENV_DIR" ]]; then
    python3 -m venv "$VENV_DIR"
  fi

  # shellcheck disable=SC1091
  source "$VENV_DIR/bin/activate"

  # Upgrade pip silently
  pip install -q --upgrade pip

  # Install with no binary cache warning on arm64
  pip install -q -r backend/requirements.txt
  ok "Backend Python dependencies installed"

  # Create .env from example if missing
  if [[ ! -f "backend/.env" ]]; then
    cp backend/.env.example backend/.env
    echo ""
    warn "Created ${BOLD}backend/.env${NC}${YELLOW} — open it and paste your YouTube API key:"
    warn "  YOUTUBE_API_KEY=AIzaXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
    echo ""
  fi
}

# ─── Frontend setup ───────────────────────────────────────────────────────────

setup_frontend() {
  log "Setting up frontend..."

  if [[ ! -d "frontend/node_modules" ]]; then
    (cd frontend && npm install --silent)
    ok "Frontend npm packages installed"
  else
    ok "Frontend node_modules already present"
  fi

  # API calls are proxied through Next.js rewrites — no NEXT_PUBLIC_API_URL needed.
  # The rewrite in next.config.mjs forwards /api/* to the backend server-side,
  # so the app works from any device (phone, Tailscale, LAN) without reconfiguration.
  if [[ ! -f "frontend/.env.local" ]]; then
    touch frontend/.env.local
    ok "Created frontend/.env.local"
  fi
}

# ─── Start ────────────────────────────────────────────────────────────────────

start_services() {
  mkdir -p "$LOG_DIR"
  rm -f "$PID_FILE"

  # ── Backend
  log "Starting backend on :${BACKEND_PORT}..."
  # shellcheck disable=SC1091
  source "$VENV_DIR/bin/activate"
  (
    cd backend
    uvicorn app.main:app \
      --host 0.0.0.0 \
      --port "$BACKEND_PORT" \
      --log-level warning \
      >> "../$LOG_DIR/backend.log" 2>&1
  ) &
  echo "$!" >> "$PID_FILE"

  # Wait up to 10 s for backend to respond
  for i in $(seq 1 20); do
    if curl -sf "http://localhost:${BACKEND_PORT}/api/health" &>/dev/null; then
      ok "Backend ready"
      break
    fi
    sleep 0.5
    if [[ $i -eq 20 ]]; then
      warn "Backend slow to start — check .logs/backend.log"
    fi
  done

  # ── Frontend (Next.js dev server)
  log "Starting frontend on :${FRONTEND_PORT}..."
  (
    cd frontend
    npm run dev -- --port "$FRONTEND_PORT" \
      >> "../$LOG_DIR/frontend.log" 2>&1
  ) &
  echo "$!" >> "$PID_FILE"

  # Wait for Next.js to be ready (it takes a few seconds on first run)
  for i in $(seq 1 30); do
    if curl -sf "http://localhost:${FRONTEND_PORT}" &>/dev/null; then
      break
    fi
    sleep 0.5
  done

  # Detect LAN IP for mobile/remote access
  LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "")

  echo ""
  echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}${BOLD}  YouTube Intelligence is running!${NC}"
  echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo -e "  ${BOLD}Local${NC}    http://localhost:${FRONTEND_PORT}"
  echo -e "  ${BOLD}API${NC}      http://localhost:${BACKEND_PORT}/api/docs"
  if [[ -n "$LOCAL_IP" ]]; then
    echo ""
    echo -e "  ${BOLD}📱 On your phone (same WiFi):${NC}"
    echo -e "  ${CYAN}  http://${LOCAL_IP}:${FRONTEND_PORT}${NC}"
    echo -e "  ${CYAN}  API: http://${LOCAL_IP}:${BACKEND_PORT}${NC}"
  fi
  echo ""
  echo -e "  Stop:   ${YELLOW}./start.sh stop${NC}"
  echo -e "  Logs:   ${YELLOW}./start.sh logs${NC}"
  echo ""

  if grep -q "^YOUTUBE_API_KEY=$" backend/.env 2>/dev/null; then
    warn "No YouTube API key set yet — go to ${BOLD}Settings${NC}${YELLOW} in the app to add it"
  fi

  # Keep script alive so Ctrl-C stops both services
  wait
}

# ─── Stop ─────────────────────────────────────────────────────────────────────

stop_services() {
  if [[ ! -f "$PID_FILE" ]]; then
    warn "No .pids file found — services may not be running"
    return
  fi
  while IFS= read -r pid; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" && ok "Stopped PID $pid"
    fi
  done < "$PID_FILE"
  rm -f "$PID_FILE"
  ok "All services stopped"
}

# ─── Logs ─────────────────────────────────────────────────────────────────────

show_logs() {
  [[ -d "$LOG_DIR" ]] || err "No logs yet — run ./start.sh first"
  echo -e "${CYAN}=== backend.log ===${NC}"
  tail -n 30 "$LOG_DIR/backend.log" 2>/dev/null || true
  echo -e "${CYAN}=== frontend.log ===${NC}"
  tail -n 30 "$LOG_DIR/frontend.log" 2>/dev/null || true
  echo ""
  log "Following logs (Ctrl-C to quit)..."
  tail -f "$LOG_DIR/backend.log" "$LOG_DIR/frontend.log"
}

# ─── Reset ────────────────────────────────────────────────────────────────────

reset_db() {
  stop_services 2>/dev/null || true
  rm -f backend/youtube_intelligence.db backend/data/youtube_intelligence.db
  ok "Database wiped"
  warn "Run ./start.sh start to restart with a fresh database"
}

# ─── Dispatch ────────────────────────────────────────────────────────────────

trap 'stop_services 2>/dev/null; exit' INT TERM

CMD="${1:-run}"
case "$CMD" in
  run|"")
    check_prereqs
    setup_backend
    setup_frontend
    start_services
    ;;
  start)
    check_prereqs
    start_services
    ;;
  stop)   stop_services ;;
  logs)   show_logs ;;
  reset)  reset_db ;;
  setup)
    check_prereqs
    setup_backend
    setup_frontend
    ok "Setup done. Run: ./start.sh start"
    ;;
  *)
    echo "Usage: ./start.sh [run|start|stop|logs|reset|setup]"
    exit 1
    ;;
esac
