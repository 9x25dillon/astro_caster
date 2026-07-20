#!/usr/bin/env bash
# run.sh — launch backend (FastAPI) and frontend (Vite) together for local dev.
# Usage: ./run.sh [--personal]   (Ctrl-C stops both)
#   --personal   Edition P: everything unlocked for this instance — oracle
#                tier with no tokens, no purchase gates, no rate limits, no
#                telemetry. The backend refuses to boot in this mode if any
#                public-facing signal (treasury, payment rails, production
#                env) is configured. Equivalent to AAE_PERSONAL_MODE=1.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PERSONAL=""
for arg in "$@"; do
  case "$arg" in
    --personal) PERSONAL=1 ;;
    *) echo "unknown option: $arg (usage: ./run.sh [--personal])"; exit 2 ;;
  esac
done
[[ -n "$PERSONAL" ]] && export AAE_PERSONAL_MODE=1

# Kill any existing listeners before starting so re-runs don't hit EADDRINUSE.
_free_port() {
  local port=$1
  local pids
  pids=$(ss -Htlnp "sport = :${port}" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | sort -u)
  if [[ -n "$pids" ]]; then
    echo "⚠  port $port in use — clearing old instance (pids: $pids)…"
    echo "$pids" | xargs kill -9 2>/dev/null || true
    sleep 0.4
  fi
}

_free_port 8787
_free_port 5173

# Each child runs in its own session (setsid) so kill -- -$PID reaches all
# descendants — uvicorn reloader + worker, vite + esbuild, etc.
_stop() {
  echo; echo "stopping…"
  [[ -n "${BACK:-}"  ]] && kill -- -"$BACK"  2>/dev/null || true
  [[ -n "${FRONT:-}" ]] && kill -- -"$FRONT" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap _stop INT TERM

# --- Backend ---------------------------------------------------------------
cd "$ROOT/backend"
if [[ ! -d .venv ]]; then
  echo "▶  creating backend venv…"
  uv venv --python 3.12 .venv 2>/dev/null || python3 -m venv .venv
fi
echo "▶  installing backend deps…"
if command -v uv >/dev/null 2>&1; then
  VIRTUAL_ENV=.venv uv pip install -q -r requirements.txt
else
  .venv/bin/pip install -q -r requirements.txt
fi
echo "▶  starting backend on :8787"
# Declare the local dev environment. Production must set AAE_ENV explicitly and
# provide a real AAE_SECRET, or the app fails closed and refuses to boot.
# (load_dotenv does not override an already-exported var, so a .env can't weaken this.)
export AAE_ENV="${AAE_ENV:-development}"
setsid .venv/bin/uvicorn main:app --host 127.0.0.1 --port 8787 --reload &
BACK=$!

# --- Frontend --------------------------------------------------------------
cd "$ROOT/frontend"
if [[ ! -d node_modules ]]; then
  echo "▶  installing frontend deps…"
  npm install
fi
echo "▶  starting frontend on :5173"
setsid npm run dev &
FRONT=$!

echo
echo "  AAE running →  http://127.0.0.1:5173"
echo "  API docs    →  http://127.0.0.1:8787/docs"
[[ -n "$PERSONAL" ]] && echo "  Edition P   →  personal mode: everything unlocked, nothing tracked"
echo

wait $BACK $FRONT
