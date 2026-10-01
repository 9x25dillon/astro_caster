#!/usr/bin/env bash
# Astra Arcana — the monthly maintenance pass, box + webpage, in one command.
#
# Run from the OPERATOR'S machine (it needs ~/.ssh/astra_hetzner and
# ops/origin.env, neither of which is in this public repo). Read-only until
# told otherwise, like every other script in ops/:
#
#   ops/monthly_maintenance.sh                    # REPORT ONLY — changes nothing anywhere
#   ops/monthly_maintenance.sh --backup           # + encrypted backup, copied home
#   ops/monthly_maintenance.sh --apply            # backup, OS updates, cache prune,
#                                                 #   journal vacuum, reboot if the kernel asks
#   ops/monthly_maintenance.sh --apply --deploy   # ...and pull origin/main + rebuild the stack
#   ops/monthly_maintenance.sh --apply --no-reboot
#   ops/monthly_maintenance.sh --purge-legacy     # NULL any legacy birth-data telemetry columns
#
# --backup / --apply need AAE_BACKUP_PASSPHRASE in the environment. --apply
# REFUSES to change the box without a fresh backup on this machine first: the
# backup is the undo button, and a maintenance pass that can't be undone is
# not maintenance.
#
# What the August pass did by hand, now scripted (Hand_off.md, "The box —
# first maintenance since provisioning"): apt upgrade, kernel reboot (ssh back
# ~30s), `docker builder prune -af` (5.6 GB of cache), a 7-day log scan. Plus
# what it did not do: an application-level backup of the purchase ledger
# (`backend/tools/backup.py` had never been pointed at the deployed layout —
# the ledger lives in the `backend-data` volume and the secrets in the
# repo-root .env, neither of which its defaults found).
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[ -f "$REPO/ops/origin.env" ] && . "$REPO/ops/origin.env"
ORIGIN_HOST="${ORIGIN_HOST:-astra@${ORIGIN_IP:-}}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/astra_hetzner}"
BOX_DIR="${BOX_DIR:-/home/astra/astro-aae}"
APP="https://app.astra-arcana.com"
APEX="https://astra-arcana.com"
WWW="https://www.astra-arcana.com"
LOCAL_BACKUPS="${LOCAL_BACKUPS:-$HOME/astra-backups}"

DO_BACKUP=0; DO_APPLY=0; DO_DEPLOY=0; DO_REBOOT=1; DO_PURGE=0
for a in "$@"; do
  case "$a" in
    --backup)        DO_BACKUP=1 ;;
    --apply)         DO_APPLY=1; DO_BACKUP=1 ;;
    --deploy)        DO_DEPLOY=1 ;;
    --no-reboot)     DO_REBOOT=0 ;;
    --purge-legacy)  DO_PURGE=1; DO_BACKUP=1 ;;
    -h|--help)       sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "unknown option: $a (see --help)"; exit 2 ;;
  esac
done
[ "$DO_DEPLOY" = 1 ] && [ "$DO_APPLY" = 0 ] && { echo "--deploy needs --apply"; exit 2; }

fails=0; warns=0
ok()   { printf '  \033[32mPASS\033[0m  %s\n' "$*"; }
bad()  { printf '  \033[31mFAIL\033[0m  %s\n' "$*"; fails=$((fails+1)); }
warn() { printf '  \033[33mWARN\033[0m  %s\n' "$*"; warns=$((warns+1)); }
note() { printf '  \033[36mNOTE\033[0m  %s\n' "$*"; }
hdr()  { printf '\n\033[1m== %s\033[0m\n' "$*"; }

[ -n "${ORIGIN_IP:-}" ] || [ "${ORIGIN_HOST#astra@}" != "" ] \
  || { echo "ORIGIN_IP unset — cp ops/origin.env.example ops/origin.env and fill it in"; exit 2; }

box() { # run a command string on the box
  timeout "${BOX_TIMEOUT:-120}" ssh -o BatchMode=yes -o ConnectTimeout=15 \
    -i "$SSH_KEY" "$ORIGIN_HOST" "$@"
}

health_ok() { # 0 when the public health endpoint answers status ok
  curl -s --max-time 15 "$APP/api/health" \
    | python3 -c 'import sys,json; sys.exit(0 if json.load(sys.stdin).get("status")=="ok" else 1)' \
    2>/dev/null
}

# ── 0. The door ──────────────────────────────────────────────────────────────
hdr "0. Reaching the box"
if box true 2>/dev/null; then
  ok "ssh $ORIGIN_HOST"
else
  bad "ssh $ORIGIN_HOST failed"
  if health_ok; then
    note "the site answers but ssh does not — the door moved, not the box."
    note "your carrier IP rotated: run  ops/ssh_allow_my_ip.sh --check  then without --check"
  fi
  exit 1
fi

# ── 1. The webpage, from outside ─────────────────────────────────────────────
hdr "1. The webpage, from outside"
h=$(curl -s --max-time 20 "$APP/api/health")
if printf '%s' "$h" | python3 -c 'import sys,json;d=json.load(sys.stdin);assert d["status"]=="ok"' 2>/dev/null; then
  ok "app health: $(printf '%s' "$h" | python3 -c 'import sys,json;d=json.load(sys.stdin);print("ok · ephemeris=%s · ai=%s" % (d.get("ephemeris"), (d.get("ai") or {}).get("mode")))')"
else
  bad "app health did not answer ok"
fi
p=$(curl -s --max-time 20 "$APP/api/pricing")
printf '%s' "$p" | python3 -c '
import sys,json; d=json.load(sys.stdin)
print("        rails: card=%s crypto=%s mode=%s tiers=%s deluxe=$%s" % (
  d["card_available"], d["crypto_available"], d["mode"],
  {t["tier"]: t["usd"] for t in d["tiers"]}, d["report_usd"]))' 2>/dev/null \
  || bad "/api/pricing did not answer"
printf '%s' "$p" | grep -q '"card_available":true' && ok "card rail open" || bad "card rail CLOSED — nobody can subscribe by card"

for url in "$APEX/" "$WWW/" "$APP/"; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$url")
  [ "$code" = 200 ] && ok "$url → 200" || bad "$url → $code"
done
if diff -q <(curl -sS --max-time 20 "$APEX/") "$REPO/landing/index.html" >/dev/null 2>&1; then
  ok "apex byte-identical to landing/index.html (the APK's PURCHASE_URL lands where it should)"
else
  warn "apex differs from landing/index.html — either the box is behind main or main is behind the box"
fi
# The edge certificate is Cloudflare's to renew; say when, so a lapse is never a surprise.
exp=$(echo | openssl s_client -connect astra-arcana.com:443 -servername app.astra-arcana.com 2>/dev/null \
      | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
if [ -n "$exp" ]; then
  days=$(( ( $(date -d "$exp" +%s) - $(date +%s) ) / 86400 ))
  [ "$days" -gt 14 ] && ok "edge TLS cert valid $days more days" || warn "edge TLS cert expires in $days days"
fi

# ── 2. The box ───────────────────────────────────────────────────────────────
hdr "2. The box"
# One round trip; the remote side prints KEY=VALUE lines we grade here. The
# script travels base64-encoded and runs from a file, not from bash's stdin:
# a command inside it that reads stdin (docker, apt) would otherwise swallow
# the rest of the script.
read -r -d '' REMOTE_SCRIPT <<'REMOTE'
cd "$BOX_DIR" 2>/dev/null || { echo "NO_REPO=1"; exit 0; }
echo "UPTIME=$(uptime -p)"
echo "KERNEL=$(uname -r)"
echo "REBOOT_REQUIRED=$([ -f /var/run/reboot-required ] && echo 1 || echo 0)"
up=$(apt list --upgradable 2>/dev/null | grep -c upgradable)
sec=$(apt list --upgradable 2>/dev/null | grep -c -- '-security')
echo "APT_UPGRADABLE=$up"; echo "APT_SECURITY=$sec"
echo "UNATTENDED=$(systemctl is-active unattended-upgrades 2>/dev/null)"
echo "FAILED_UNITS=$(systemctl --failed --no-legend --plain 2>/dev/null | awk '{print $1}' | paste -sd, -)"
echo "DISK_ROOT=$(df -P / | awk 'NR==2{print $5" used, "int($4/1048576)"G free"}')"
echo "DISK_PCT=$(df -P / | awk 'NR==2{gsub("%","",$5);print $5}')"
echo "MEM=$(free -m | awk '/Mem:/{print $3"M/"$2"M used"}')"
echo "SWAP=$(free -m | awk '/Swap:/{print $3"M/"$2"M used"}')"
echo "DOCKER_RECLAIM=$(docker system df --format '{{.Type}}:{{.Reclaimable}}' 2>/dev/null | paste -sd' ' -)"
echo "CONTAINERS=$(docker compose ps --format '{{.Service}}={{.Status}}' 2>/dev/null | paste -sd'|' -)"
git fetch -q origin main 2>/dev/null
echo "HEAD=$(git rev-parse --short HEAD)"
echo "ORIGIN_MAIN=$(git rev-parse --short origin/main 2>/dev/null)"
echo "BEHIND=$(git rev-list --count HEAD..origin/main 2>/dev/null)"
echo "BEHIND_CODE=$(git diff --name-only HEAD..origin/main 2>/dev/null | grep -vcE '^(docs/|backend/evals/|backend/tests/|frontend/e2e/|CHANGELOG)')"
echo "DIRTY=$(git status --porcelain | grep -v '^??' | wc -l)"
since=$(date -d '30 days ago' --iso-8601=seconds)
logs=$(docker compose logs --no-color --since "$since" 2>/dev/null)
# Backend access lines are JSON whose msg reads "POST /api/v1/x 502 123ms"
# (main.py's middleware); nginx's are combined format: ..." 502 ...
echo "LOG_5XX=$(printf '%s\n' "$logs" | grep -cE ' 5[0-9]{2} [0-9]+ms|" 5[0-9]{2} ')"
# A paid report that took >=100s buffered: Cloudflare 524'd it for the reader.
echo "LOG_524_HINT=$(printf '%s\n' "$logs" | grep -cE 'POST /api/(v1/)?(oracle-report|personal-report|course) 200 [0-9]{6,}ms')"
echo "LOG_ERRORS=$(printf '%s\n' "$logs" | grep -cE '"level": "(error|critical)"|\| (ERROR|CRITICAL):|Traceback')"
echo "LOG_WARNINGS=$(printf '%s\n' "$logs" | grep -cE '"level": "warning"|\| WARNING:')"
echo "BACKUP_TIMER=$(systemctl list-timers --all --no-legend 2>/dev/null | grep -c aae-backup)"
# The money, read-only, from inside the backend container (the volume is there).
docker compose exec -T backend python - <<'PY' 2>/dev/null || echo "LEDGER=unreadable"
import sqlite3, time
now = int(time.time()); month = now - 30 * 86400
def q(db, sql, *a):
    c = sqlite3.connect(f"file:data/{db}?mode=ro", uri=True)
    try: return c.execute(sql, a).fetchall()
    finally: c.close()
act = dict(q("receipts.db", "SELECT tier, count(*) FROM entitlement_ledger WHERE status='active' AND exp>? GROUP BY tier", now))
print(f"LEDGER_ACTIVE=supporter:{act.get('supporter',0)} oracle:{act.get('oracle',0)}")
print("LEDGER_NEW_30D=%d" % q("receipts.db", "SELECT count(DISTINCT ref) FROM entitlement_ledger WHERE iat>?", month)[0][0])
print("LEDGER_REVOKED_30D=%d" % q("receipts.db", "SELECT count(*) FROM entitlement_ledger WHERE status='revoked' AND updated>?", month)[0][0])
# A ref with more than one 'renewed' row inside a minute of its mint is the
# webhook race (fixed 2026-10-01): a key handed to a customer and superseded.
print("LEDGER_RACED_30D=%d" % q("receipts.db", """
  SELECT count(DISTINCT a.ref) FROM entitlement_ledger a JOIN entitlement_ledger b
    ON a.ref=b.ref AND a.jti<>b.jti AND a.status='renewed' AND b.iat BETWEEN a.iat AND a.iat+120
  WHERE a.iat>?""", month)[0][0])
paid = q("receipts.db", "SELECT count(*) FROM report_receipts")[0][0]
made = q("telemetry.db", "SELECT count(*) FROM ai_events WHERE lens='personal_report'")[0][0]
print(f"DELUXE_PAID={paid}"); print(f"DELUXE_DELIVERED={made}")
legacy = q("telemetry.db", "SELECT count(*) FROM chart_events WHERE year IS NOT NULL OR month IS NOT NULL OR day IS NOT NULL OR hour IS NOT NULL OR minute IS NOT NULL OR lat IS NOT NULL OR lng IS NOT NULL")[0][0]
preview = q("telemetry.db", "SELECT count(*) FROM ai_events WHERE query_preview IS NOT NULL AND query_preview<>''")[0][0]
print(f"LEGACY_BIRTH_ROWS={legacy}"); print(f"LEGACY_QUERY_ROWS={preview}")
PY
REMOTE
facts=$(box "echo $(printf '%s' "$REMOTE_SCRIPT" | base64 | tr -d '\n') | base64 -d > /tmp/aae_maint.sh \
  && BOX_DIR='$BOX_DIR' bash /tmp/aae_maint.sh; rm -f /tmp/aae_maint.sh" </dev/null)
[ -n "$facts" ] || { bad "the box returned nothing"; exit 1; }
fact() { printf '%s\n' "$facts" | sed -n "s/^$1=//p" | head -1; }
[ "$(fact NO_REPO)" = 1 ] && { bad "no repo at $BOX_DIR on the box"; exit 1; }

note "$(fact UPTIME) · kernel $(fact KERNEL) · mem $(fact MEM) · swap $(fact SWAP)"
[ "$(fact REBOOT_REQUIRED)" = 0 ] && ok "no reboot pending" || warn "reboot required (kernel/libc update installed)"
u=$(fact APT_UPGRADABLE); s=$(fact APT_SECURITY)
[ "${u:-0}" = 0 ] && ok "packages up to date" \
  || { [ "${s:-0}" -gt 0 ] && warn "$u upgradable, $s SECURITY" || note "$u packages upgradable (none security)"; }
[ "$(fact UNATTENDED)" = active ] && ok "unattended-upgrades active" || warn "unattended-upgrades is $(fact UNATTENDED)"
fu=$(fact FAILED_UNITS); [ -z "$fu" ] && ok "no failed systemd units" || warn "failed units: $fu"
dp=$(fact DISK_PCT)
if [ "${dp:-100}" -lt 75 ]; then ok "disk $(fact DISK_ROOT)"
elif [ "${dp:-100}" -lt 90 ]; then warn "disk $(fact DISK_ROOT)"
else bad "disk $(fact DISK_ROOT)"; fi
note "docker reclaimable — $(fact DOCKER_RECLAIM)"

cs=$(fact CONTAINERS)
for svc in backend frontend; do
  st=$(printf '%s' "$cs" | tr '|' '\n' | sed -n "s/^$svc=//p")
  case "$st" in
    *healthy*) case "$st" in *unhealthy*) bad "$svc: $st" ;; *) ok "$svc: $st" ;; esac ;;
    Up*)       note "$svc: $st (no healthcheck)" ;;
    *)         bad "$svc: ${st:-not running}" ;;
  esac
done

b=$(fact BEHIND); bc=$(fact BEHIND_CODE)
if [ "${b:-0}" = 0 ]; then ok "box at origin/main $(fact HEAD)"
elif [ "${bc:-0}" = 0 ]; then note "box $(fact HEAD) is $b behind origin/main — docs/tests only"
else warn "box $(fact HEAD) is $b behind origin/main with $bc product file(s) — deploy with --apply --deploy"; fi
[ "$(fact DIRTY)" = 0 ] && ok "box tree clean" || warn "box tree has $(fact DIRTY) local modification(s) — a pull may refuse"

l5=$(fact LOG_5XX); le=$(fact LOG_ERRORS); lw=$(fact LOG_WARNINGS); l524=$(fact LOG_524_HINT)
[ "${l5:-0}" = 0 ] && ok "0 HTTP 5xx in 30 days of logs" || warn "$l5 HTTP 5xx in 30 days of logs"
[ "${le:-0}" = 0 ] && ok "0 ERROR/Traceback lines in 30 days" || warn "$le ERROR/Traceback lines in 30 days"
note "$lw WARNING lines in 30 days"
[ "${l524:-0}" = 0 ] || warn "$l524 paid report(s) took ≥100s buffered — each was a Cloudflare 524 for the reader"
note "(logs only reach back to the last container recreate — a rebuild starts them over)"

hdr "3. The money"
la=$(fact LEDGER_ACTIVE)
if [ -n "$la" ]; then
  ok "live keys — $la · payment refs minted (30d) $(fact LEDGER_NEW_30D) · revoked (30d) $(fact LEDGER_REVOKED_30D)"
  r=$(fact LEDGER_RACED_30D); [ "${r:-0}" = 0 ] && ok "no key superseded within 2 min of its mint (webhook race)" \
    || warn "$r purchase(s) had their key superseded within 2 min of minting — those customers may hold dead keys; restore by sub_/cs_ reference"
  dpaid=$(fact DELUXE_PAID); dmade=$(fact DELUXE_DELIVERED)
  # Compiles include recompiles and operator test runs, so this can only
  # prove a shortfall, never a full delivery to each buyer.
  if [ "${dmade:-0}" -ge "${dpaid:-0}" ]; then ok "deluxe editions: $dpaid paid, $dmade compiles logged"
  else warn "deluxe editions: $dpaid paid, only $dmade compiles ever logged — at least $((dpaid - dmade)) customer(s) owed a report"; fi
  lb=$(fact LEGACY_BIRTH_ROWS); lq=$(fact LEGACY_QUERY_ROWS)
  if [ "${lb:-0}" = 0 ] && [ "${lq:-0}" = 0 ]; then
    ok "telemetry holds no birth data and no question text (README promise holds)"
  elif [ "$DO_PURGE" = 1 ]; then
    warn "telemetry holds $lb legacy birth-data row(s), $lq question preview(s) — purged below, after the backup"
  else
    bad "telemetry holds $lb legacy birth-data row(s), $lq question preview(s) — the README says none; --purge-legacy clears them"
  fi
else
  bad "could not read the ledger from inside the backend container"
fi
[ "$(fact BACKUP_TIMER)" -gt 0 ] 2>/dev/null && ok "aae-backup timer installed" \
  || warn "no application backup timer on the box — this script's --backup is the only ledger backup (Hetzner's nightly image is crash-consistent, not app-aware)"

# ── 4. Backup (the undo button) ──────────────────────────────────────────────
if [ "$DO_BACKUP" = 1 ]; then
  hdr "4. Encrypted backup"
  [ -n "${AAE_BACKUP_PASSPHRASE:-}" ] || { bad "AAE_BACKUP_PASSPHRASE unset — no backup, so no changes"; exit 1; }
  # Inside a one-off backend container: it mounts the same `backend-data`
  # volume the live one does, and the repo-root .env is mounted read-only.
  # The passphrase crosses ssh on stdin, never on a command line.
  # The trailing newline matters: without it the remote `read` hits EOF,
  # returns non-zero, and the && chain ends before any backup is taken.
  out=$(printf '%s\n' "$AAE_BACKUP_PASSPHRASE" | box "cd '$BOX_DIR' && mkdir -p ~/backups && \
    read -r P && AAE_BACKUP_PASSPHRASE=\"\$P\" docker compose run --rm --no-deps -T \
      -e AAE_BACKUP_PASSPHRASE -v \"\$PWD/.env:/run/aae.env:ro\" -v \"\$HOME/backups:/backups\" \
      backend python tools/backup.py create --out /backups --env /run/aae.env \
    && AAE_BACKUP_PASSPHRASE=\"\$P\" docker compose run --rm --no-deps -T \
      -e AAE_BACKUP_PASSPHRASE -v \"\$PWD/.env:/run/aae.env:ro\" \
      backend python tools/backup.py drill --env /run/aae.env" 2>&1)
  printf '%s\n' "$out" | sed 's/^/        /'
  file=$(printf '%s\n' "$out" | grep -oE '/backups/aae-backup-[0-9TZ]+\.enc' | head -1)
  if [ -n "$file" ] && printf '%s' "$out" | grep -q "DRILL PASSED"; then
    mkdir -p "$LOCAL_BACKUPS"
    if scp -q -i "$SSH_KEY" "$ORIGIN_HOST:backups/$(basename "$file")" "$LOCAL_BACKUPS/"; then
      ok "backup + drill passed; copied home → $LOCAL_BACKUPS/$(basename "$file")"
      box "ls -1t ~/backups/aae-backup-*.enc | tail -n +7 | xargs -r rm -f" \
        && note "box keeps the newest 6 backups"
    else
      bad "backup made on the box but the copy home failed — it is NOT off-box"
    fi
  else
    bad "backup or drill failed on the box — stopping before any change"
    exit 1
  fi
fi

# ── 5. Changes (only with --apply / --purge-legacy) ─────────────────────────
if [ "$DO_PURGE" = 1 ]; then
  hdr "5a. Purging legacy telemetry"
  box "cd '$BOX_DIR' && docker compose exec -T backend python -" <<'PY' && ok "legacy columns NULLed and vacuumed" || bad "purge failed"
import sqlite3
c = sqlite3.connect("data/telemetry.db")
c.execute("UPDATE chart_events SET year=NULL, month=NULL, day=NULL, hour=NULL, minute=NULL, lat=NULL, lng=NULL")
c.execute("UPDATE ai_events SET query_preview=NULL")
c.commit()
c.execute("VACUUM")   # rewrite the file so the old values are not left in free pages
c.close()
PY
  note "the backup taken a moment ago still holds those values — delete it once you are satisfied"
fi

if [ "$DO_APPLY" = 1 ]; then
  hdr "5b. Maintenance"
  BOX_TIMEOUT=1800 box "sudo DEBIAN_FRONTEND=noninteractive apt-get -qq update && \
    sudo DEBIAN_FRONTEND=noninteractive apt-get -y -qq -o Dpkg::Options::=--force-confold upgrade" \
    >/tmp/maint_apt.log 2>&1 \
    && ok "OS packages upgraded ($(grep -c '^Setting up' /tmp/maint_apt.log) set up)" \
    || bad "apt upgrade failed — see /tmp/maint_apt.log"
  BOX_TIMEOUT=600 box "docker builder prune -af >/dev/null && docker image prune -f >/dev/null && \
    sudo journalctl --vacuum-time=60d >/dev/null 2>&1; df -P / | awk 'NR==2{print \$5\" used, \"int(\$4/1048576)\"G free\"}'" \
    > /tmp/maint_prune.log 2>&1 \
    && ok "build cache + dangling images pruned, journal kept to 60 days — disk now $(tail -1 /tmp/maint_prune.log)" \
    || warn "prune step reported an error — see /tmp/maint_prune.log"

  if [ "$DO_DEPLOY" = 1 ]; then
    hdr "5c. Deploy origin/main"
    BOX_TIMEOUT=1800 box "cd '$BOX_DIR' && before=\$(git rev-parse --short HEAD) && \
      git pull -q --ff-only origin main && echo \"box: \$before -> \$(git rev-parse --short HEAD)\" && \
      docker compose up -d --build 2>&1 | tail -3" > /tmp/maint_deploy.log 2>&1 \
      && ok "$(head -1 /tmp/maint_deploy.log)" \
      || { bad "deploy failed — see /tmp/maint_deploy.log"; }
    note "Chrome's service worker serves the OLD bundle for ~2 loads after a frontend deploy"
  fi

  if [ "$DO_REBOOT" = 1 ] && box "[ -f /var/run/reboot-required ]"; then
    hdr "5d. Reboot"
    box "sudo systemctl reboot" >/dev/null 2>&1 || true
    sleep 10
    t0=$(date +%s); back=0
    while [ $(( $(date +%s) - t0 )) -lt 300 ]; do
      if box true 2>/dev/null && health_ok; then back=1; break; fi
      sleep 5
    done
    [ "$back" = 1 ] && ok "rebooted — ssh and site back after $(( $(date +%s) - t0 + 10 ))s" \
                    || bad "box not back within 5 minutes — check the Hetzner console"
  fi

  hdr "6. After"
  sleep 3
  health_ok && ok "app health ok" || bad "app health NOT ok after maintenance"
  after=$(box "cd '$BOX_DIR' && echo \$(uname -r) \$(git rev-parse --short HEAD) && \
               docker compose ps --format '{{.Service}}={{.Status}}' | paste -sd' ' -")
  note "now: $(printf '%s' "$after" | tr '\n' ' ')"
  printf '%s' "$after" | grep -q unhealthy && bad "a container is unhealthy"
fi

hdr "Result"
if [ "$fails" -eq 0 ]; then
  printf '  \033[32mno failures\033[0m · %d warning(s)\n' "$warns"
  [ "$DO_APPLY" = 0 ] && [ "$warns" -gt 0 ] && echo "  next: re-run with --apply (and --deploy if the box is behind main)"
  exit 0
fi
printf '  \033[31m%d failure(s)\033[0m · %d warning(s)\n' "$fails" "$warns"
exit 1
