#!/usr/bin/env bash
# Astra Arcana — the box deploys itself from GitHub.
#
# Runs ON THE BOX as `astra`, every 5 minutes, from a systemd timer that
# ops/install_autodeploy.sh sets up. Merging to `main` on github.com is the
# whole deploy: no SSH key, no laptop, no firewall change, no secret stored in
# GitHub. The box only ever makes OUTBOUND requests (git fetch + one read of
# the public Actions API).
#
# One pass:
#   1. fetch origin/main; nothing new → exit
#   2. CI must have PASSED on that exact commit (pending → wait for the next
#      pass; failed → never deploy it)
#   3. fast-forward, then rebuild only what changed:
#        backend/ packages/ compose/Dockerfiles → the full stack
#        frontend/ landing/                     → the frontend container only
#        anything else (docs, tests)            → nothing to rebuild
#   4. health through nginx, as a reader reaches it. Unhealthy → reset to the
#      previous commit, rebuild that, and mark the bad commit so it is never
#      retried; the next good commit on main deploys normally.
#
# Trust boundary, stated plainly: whoever can merge to `main` can deploy to
# this box. That was already true of a hand deploy; CI is the gate added here.
#
# Logs: `journalctl -u astra-autodeploy -n 50`   State: ~/.astra-autodeploy/
set -uo pipefail

REPO_DIR="${REPO_DIR:-/home/astra/astro-aae}"
GH_REPO="${GH_REPO:-9x25dillon/astro_caster}"
GH_API="${GH_API:-https://api.github.com}"
CI_WORKFLOW="${CI_WORKFLOW:-ci.yml}"
STATE_DIR="${STATE_DIR:-$HOME/.astra-autodeploy}"
HEALTH_WAIT_S="${HEALTH_WAIT_S:-180}"

log() { printf '%s autodeploy: %s\n' "$(date -u +%FT%TZ)" "$*"; }

health() { # 0 when the app answers status ok through the local nginx
  local port
  port=$(sed -n 's/^WEB_PORT=//p' "$REPO_DIR/.env" 2>/dev/null | tail -1)
  curl -s --max-time 10 "http://127.0.0.1:${port:-80}/api/health" \
       -H 'Host: app.astra-arcana.com' \
    | python3 -c 'import sys,json; sys.exit(0 if json.load(sys.stdin).get("status")=="ok" else 1)' \
    2>/dev/null
}

wait_healthy() {
  local t0; t0=$(date +%s)
  while [ $(( $(date +%s) - t0 )) -lt "$HEALTH_WAIT_S" ]; do
    health && return 0
    sleep 5
  done
  return 1
}

ci_verdict() { # prints success | failure | pending for the CI run on $1
  curl -s --max-time 20 -H 'Accept: application/vnd.github+json' \
    "$GH_API/repos/$GH_REPO/actions/workflows/$CI_WORKFLOW/runs?head_sha=$1&per_page=10" \
  | python3 -c '
import sys, json
try:
    runs = json.load(sys.stdin).get("workflow_runs", [])
except Exception:
    print("pending"); sys.exit()        # API unreachable or rate-limited: wait
if any(r.get("conclusion") == "success" for r in runs):
    print("success")
elif runs and all(r.get("status") == "completed" for r in runs):
    print("failure")                     # every run on this commit finished, none passed
else:
    print("pending")                     # not started yet, or still running
'
}

scope_of() { # what a diff between two commits needs rebuilt: full | frontend | none
  local files
  files=$(git diff --name-only "$1" "$2")
  if printf '%s\n' "$files" | grep -qE '^(backend/|packages/|docker-compose\.yml$|\.dockerignore$)'; then
    echo full
  elif printf '%s\n' "$files" | grep -qE '^(frontend/|landing/)'; then
    echo frontend
  else
    echo none
  fi
}

rebuild() { # $1 = full | frontend | none
  case "$1" in
    full)     docker compose up -d --build 2>&1 | tail -5 ;;
    frontend) docker compose build frontend 2>&1 | tail -3 \
                && docker compose up -d --no-deps frontend 2>&1 | tail -3 ;;
    none)     : ;;
  esac
}

main() {
  mkdir -p "$STATE_DIR"
  exec 9>"$STATE_DIR/lock"
  flock -n 9 || { log "another pass is running"; return 0; }
  cd "$REPO_DIR" || { log "no repo at $REPO_DIR"; return 1; }

  git fetch -q origin main || { log "git fetch failed — GitHub unreachable? will retry"; return 0; }
  local cur target
  cur=$(git rev-parse HEAD)
  target=$(git rev-parse origin/main)
  [ "$cur" = "$target" ] && return 0

  if [ "$(cat "$STATE_DIR/failed" 2>/dev/null)" = "$target" ]; then
    return 0   # already tried this commit and rolled it back; wait for a new one
  fi
  if ! git merge-base --is-ancestor "$cur" "$target"; then
    log "HEAD ${cur:0:7} is not an ancestor of origin/main ${target:0:7} — history was rewritten or the box has local commits; refusing (fix by hand)"
    return 1
  fi
  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    log "the box's tree has local edits to tracked files — refusing to deploy over them:"
    git status --short --untracked-files=no
    return 1
  fi

  local verdict
  verdict=$(ci_verdict "$target")
  case "$verdict" in
    pending) log "${target:0:7}: CI not finished — will look again next pass"; return 0 ;;
    failure) # Not the permanent "failed" mark: a re-run on GitHub that passes
             # should deploy. Logged once per commit, re-checked every pass.
             if [ "$(cat "$STATE_DIR/ci_failed" 2>/dev/null)" != "$target" ]; then
               log "${target:0:7}: CI FAILED — not deploying it (a passing re-run will)"
               echo "$target" > "$STATE_DIR/ci_failed"
             fi
             return 0 ;;
  esac

  local scope
  scope=$(scope_of "$cur" "$target")
  log "deploying ${cur:0:7} -> ${target:0:7} (CI passed; rebuild: $scope)"
  git merge -q --ff-only "$target" || { log "fast-forward failed"; return 1; }

  if rebuild "$scope" && wait_healthy; then
    log "LIVE ${target:0:7} — healthy"
    echo "$target $(date -u +%FT%TZ) $scope" > "$STATE_DIR/deployed"
    rm -f "$STATE_DIR/failed"
    return 0
  fi

  log "${target:0:7} did NOT come up healthy — rolling back to ${cur:0:7}"
  echo "$target" > "$STATE_DIR/failed"
  git reset -q --hard "$cur"
  # Rebuild the scope the bad commit touched; for a frontend-only change the
  # backend was never recreated and is still the old one.
  [ "$scope" = none ] && scope=full
  if rebuild "$scope" && wait_healthy; then
    log "ROLLED BACK to ${cur:0:7} — healthy. ${target:0:7} will not be retried."
  else
    log "ROLLBACK ALSO UNHEALTHY at ${cur:0:7} — needs a human (Hetzner web console)"
  fi
  return 1
}

# Everything above is a definition; bash parses all of it before the call
# below runs, so a fast-forward that rewrites this file mid-pass cannot
# change the code that is executing.
main "$@"; exit $?
