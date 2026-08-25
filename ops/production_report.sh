#!/usr/bin/env bash
# Astra Arcana — production report.
#
# Runs every gate the CI workflow enforces, then dates the live deployment from
# OUTSIDE. Local green is not the same claim as CI green is not the same claim
# as production working; this prints all three so the gap is visible instead of
# assumed.
#
#   bash production_report.sh          # local gates + external probes
#   bash production_report.sh --e2e    # also run the e2e suite (~3 min, boots run.sh)
#   bash production_report.sh --ssh    # also read the deployed SHA off the box
#
# Exit 0 only if every gate this run attempted passed.

set -uo pipefail
REPO="${REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
PY="$REPO/backend/.venv/bin/python"
APP="https://app.astra-arcana.com"
APEX="https://astra-arcana.com"
# The server's IP lives in ops/origin.env, which is gitignored on purpose.
# Nothing tracked in this repo should carry it.
[ -f "$REPO/ops/origin.env" ] && . "$REPO/ops/origin.env"
ORIGIN_HOST="${ORIGIN_HOST:-astra@${ORIGIN_IP:-}}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/astra_hetzner}"

RUN_E2E=0; RUN_SSH=0
for a in "$@"; do case "$a" in --e2e) RUN_E2E=1;; --ssh) RUN_SSH=1;; --all) RUN_E2E=1; RUN_SSH=1;; esac; done

fails=0
ok()   { printf '  \033[32mPASS\033[0m  %s\n' "$*"; }
bad()  { printf '  \033[31mFAIL\033[0m  %s\n' "$*"; fails=$((fails+1)); }
note() { printf '  \033[33mNOTE\033[0m  %s\n' "$*"; }
hdr()  { printf '\n\033[1m== %s\033[0m\n' "$*"; }

# ── 1. Where the code is ─────────────────────────────────────────────────────
hdr "1. Repo vs origin"
cd "$REPO" || exit 1
git fetch --prune --tags -q 2>/dev/null
LOCAL=$(git rev-parse --short main)
REMOTE=$(git rev-parse --short origin/main)
read -r behind ahead < <(git rev-list --left-right --count origin/main...main | tr '\t' ' ')
[ "$LOCAL" = "$REMOTE" ] && ok "main == origin/main @ $LOCAL" \
  || bad "main $LOCAL vs origin/main $REMOTE (ahead $ahead / behind $behind)"
[ -z "$(git status --porcelain)" ] && ok "working tree clean" || bad "working tree DIRTY"
nb=$(git ls-remote --heads origin | wc -l)
[ "$nb" -eq 1 ] && ok "origin has exactly 1 branch" || note "origin has $nb branches"

# Local branches that exist nowhere on origin AND carry a patch main doesn't have.
# `git cherry` matches by patch-id, so a squash-merge still shows as contained;
# an unmatched '+' is genuinely unique work with no copy on GitHub.
orphans=""
for b in $(git for-each-ref --format='%(refname:short)' refs/heads/ | grep -v '^main$'); do
  [ "$(git rev-list --count main.."$b")" -gt 0 ] || continue
  [ "$(git cherry main "$b" | grep -c '^+')" -gt 0 ] && orphans="$orphans $b"
done
if [ -n "$orphans" ]; then
  for b in $orphans; do
    if git tag --list 'archive/*' | grep -qx "archive/$b"; then
      note "local-only '$b' — archived at tag archive/$b"
    else
      bad "local-only '$b' has unique commits and NO archive tag"
    fi
  done
else
  ok "no local branch holds work missing from main"
fi

# ── 2. The gates CI enforces ─────────────────────────────────────────────────
hdr "2. CI gates, run locally"
export AAE_ENV=test
cd "$REPO/backend" || exit 1
"$PY" -m pytest -q >/tmp/pr_pytest.log 2>&1 \
  && ok "pytest — $(grep -oE '[0-9]+ passed' /tmp/pr_pytest.log | tail -1)" \
  || bad "pytest — see /tmp/pr_pytest.log"
"$PY" -m evals.runner >/tmp/pr_evals.log 2>&1 \
  && ok "evals (replay) — $(grep -oE '[0-9]+/[0-9]+ passed' /tmp/pr_evals.log)" \
  || bad "evals — see /tmp/pr_evals.log"
"$PY" tools/gen_parity_vectors.py --check >/dev/null 2>&1 && ok "parity vectors tripwire" || bad "parity vectors DRIFTED"
"$PY" tools/gen_gazetteer.py   --check >/dev/null 2>&1 && ok "gazetteer tripwire"      || bad "gazetteer DRIFTED"
"$PY" tools/check_tolerance_ratchet.py >/dev/null 2>&1 && ok "tolerance ratchet"       || bad "a bound widened without an ADR"
"$PY" -c "import main; assert len([r for r in main.app.routes if r.path.startswith('/api')])>=30" 2>/dev/null \
  && ok "boot smoke — route table intact" || bad "boot smoke — route table shrank"
# The prod boot guard cannot be exercised here: backend/.env supplies a real
# AAE_SECRET, so import legitimately succeeds. CI has no .env, which is the
# only condition under which the guard is meant to fire. Not a local gate.
note "prod boot guard — CI-only (local backend/.env holds a real AAE_SECRET)"
command -v ruff >/dev/null 2>&1 && { ruff check . >/dev/null 2>&1 && ok "ruff" || bad "ruff"; } \
  || note "ruff not installed locally — CI installs it per-run"

cd "$REPO/frontend" || exit 1
npm run build >/tmp/pr_build.log 2>&1 && ok "frontend tsc -b + vite build" || bad "frontend build — see /tmp/pr_build.log"
npm test      >/tmp/pr_fetest.log 2>&1 && ok "frontend unit tests"          || bad "frontend unit tests"
cd "$REPO/packages/astra-core" && npm test >/tmp/pr_core.log 2>&1 \
  && ok "@astra/core parity vs golden vectors" || bad "@astra/core parity"
cd "$REPO" && "$PY" -m unittest discover -s resonarium/tests >/tmp/pr_res.log 2>&1 \
  && ok "resonarium Python<->JS seed parity" || bad "resonarium parity"

if [ "$RUN_E2E" = 1 ]; then
  cd "$REPO/frontend" || exit 1
  npm run e2e >/tmp/pr_e2e.log 2>&1 \
    && ok "e2e — desktop + mobile" \
    || bad "e2e — $(grep -cE '^\s+[0-9]+\) ' /tmp/pr_e2e.log) failing; see /tmp/pr_e2e.log"
else
  note "e2e skipped (--e2e to run; this is the gate currently red on CI)"
fi

# ── 3. What CI actually says ─────────────────────────────────────────────────
hdr "3. CI on origin/main"
if command -v gh >/dev/null 2>&1; then
  concl=$(gh run list --workflow=CI --limit 1 --json conclusion,headSha -q '.[0] | "\(.conclusion) \(.headSha[0:7])"' 2>/dev/null)
  case "$concl" in
    success*) ok "CI $concl" ;;
    "")       note "gh could not reach GitHub" ;;
    *)        bad "CI $concl"
              gh run view "$(gh run list --workflow=CI --limit 1 --json databaseId -q '.[0].databaseId')" \
                --json jobs -q '.jobs[] | select(.conclusion=="failure") | "        failing job: \(.name)"' 2>/dev/null ;;
  esac
else
  note "gh not installed — CI status unknown"
fi

# ── 4. The product, from outside ─────────────────────────────────────────────
hdr "4. Production, probed from outside"
h=$(curl -s --max-time 20 "$APP/api/health")
[ "$(printf '%s' "$h" | python3 -c 'import sys,json;print(json.load(sys.stdin)["status"])' 2>/dev/null)" = "ok" ] \
  && ok "health: ok — ephemeris=$(printf '%s' "$h" | python3 -c 'import sys,json;print(json.load(sys.stdin)["ephemeris"])')" \
  || bad "health did not answer ok"
printf '%s' "$h" | python3 -c 'import sys,json
d=json.load(sys.stdin); a=d["ai"]
print(f"        ai={a[\"mode\"]} key={a[\"key_fingerprint\"]} tiers={a[\"tier_models\"]}")' 2>/dev/null

# Dating the deploy: a 422 names the SpreadType Literal the running build knows.
sp=$(curl -sS --max-time 20 -X POST "$APP/api/tarot-reading" -H 'Content-Type: application/json' \
     -d '{"chart":{},"spread":"__probe__"}' \
   | python3 -c 'import sys,json;print([e for e in json.load(sys.stdin)["detail"] if e["loc"][-1]=="spread"][0]["msg"])' 2>/dev/null)
n=$(printf '%s' "$sp" | grep -o "'" | wc -l); n=$((n/2))
[ "$n" -ge 12 ] && ok "spread Literal has $n members (celtic_cross era or later)" \
                || bad "spread Literal has $n members — production predates session 31"

# A router 404 and a handler 404 look identical in the status code and nowhere else.
r=$(curl -sS --max-time 20 "$APP/api/replay/anykey")
case "$r" in
  *"Replay sync needs a key"*) ok "/api/replay/{key} — handler answers (route present)" ;;
  *"Not Found"*)               bad "/api/replay/{key} — router 404, production predates session 30" ;;
  *)                           note "/api/replay/{key} — unexpected: $r" ;;
esac

bundle=$(curl -sS --max-time 20 "$APP/" | grep -oE 'index-[A-Za-z0-9_-]+\.js' | head -1)
ok "bundle: $bundle"
# The apex is load-bearing: the signed APK's PURCHASE_URL is the immutable
# string https://astra-arcana.com/#support. It must not move.
if diff -q <(curl -sS --max-time 20 "$APEX/") "$REPO/landing/index.html" >/dev/null 2>&1; then
  ok "apex byte-identical to landing/index.html (APK PURCHASE_URL intact)"
else
  bad "apex DIFFERS from landing/index.html"
fi

# ── 5. Deployed SHA vs main ──────────────────────────────────────────────────
hdr "5. Deployment drift"
if [ "$RUN_SSH" = 1 ]; then
  prod=$(timeout 45 ssh -o BatchMode=yes -o ConnectTimeout=15 -i "$SSH_KEY" "$ORIGIN_HOST" \
         'cd /home/astra/astro-aae && git rev-parse --short HEAD' 2>/dev/null)
  if [ -n "$prod" ]; then
    cd "$REPO"
    n=$(git rev-list --count "$prod"..main)
    prod_code=$(git diff --name-only "$prod"..main | grep -vE '^(docs/|backend/evals/|backend/tests/)' || true)
    if [ "$n" -eq 0 ]; then ok "production == main @ $prod"
    elif [ -z "$prod_code" ]; then ok "production @ $prod is $n behind main — docs/evals/tests only, nothing to ship"
    else bad "production @ $prod is $n behind main, INCLUDING product code:"; printf '        %s\n' $prod_code
    fi
  else
    note "ssh to $ORIGIN_HOST failed — could not read the deployed SHA"
  fi
else
  note "deployed SHA not read (--ssh to check); external probes above bound it only from below"
fi

# ── 6. Pre-flight, if a deploy is on the table ───────────────────────────────
hdr "6. Deploy pre-flight (informational)"
cd "$REPO"
env_diff=$(git diff a8c2b34..main -- .env.example docker-compose.yml \
             frontend/nginx.conf frontend/Dockerfile backend/Dockerfile --stat)
[ -z "$env_diff" ] && ok "no env/compose/Dockerfile change since the deployed commit" \
                   || note "env/compose surface CHANGED — check for a var missing from compose 'environment:' before pulling"

hdr "Result"
[ "$fails" -eq 0 ] && { printf '  \033[32mall attempted gates passed\033[0m\n'; exit 0; } \
                   || { printf '  \033[31m%d gate(s) failed\033[0m\n' "$fails"; exit 1; }
