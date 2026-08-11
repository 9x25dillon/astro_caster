#!/usr/bin/env bash
# Point astra-arcana.com at the origin, via the Cloudflare API.
#
#   ./cloudflare_dns.sh            # PREFLIGHT — reads only, changes nothing
#   ./cloudflare_dns.sh --apply    # upsert records + HTTPS settings
#
# Idempotent: records are matched by type+name and PATCHed if they exist,
# POSTed if they don't. Safe to re-run after the origin IP changes.
#
# The token is read from a file, never echoed and never put on a command line.
#
# TOKEN PERMISSIONS (all zone-scoped, resource = the astra-arcana.com zone):
#   Zone -> DNS -> Edit                    the A records
#   Zone -> Zone Settings -> Edit          always_use_https, min_tls_version
#   Zone -> SSL and Certificates -> Edit   ssl mode
#   Zone -> Zone -> Read                   find the zone
# NOTE: creating a zone needs Zone:Edit bound to the ACCOUNT as its resource,
# which is a different and fiddlier grant. Adding the site through the
# dashboard once is faster than getting that right; this script assumes the
# zone already exists and says so plainly if it doesn't.
set -euo pipefail

TOKEN_FILE="${TOKEN_FILE:-$HOME/.cloudflare-token}"
API="https://api.cloudflare.com/client/v4"
ZONE="${ZONE:-astra-arcana.com}"

# The origin IP is NOT hardcoded here: this repo is public, and the whole point
# of proxying every record through Cloudflare is that the origin address is not
# published. The Hetzner firewall (80/443 from Cloudflare ranges only) is the
# real control, but handing out the address for free discards a layer for no
# benefit. Real values live in ops/origin.env, which is gitignored.
# shellcheck source=/dev/null
[ -f "$(dirname "$0")/origin.env" ] && . "$(dirname "$0")/origin.env"
ORIGIN_IP="${ORIGIN_IP:-}"
[ -n "$ORIGIN_IP" ] || {
  echo "ORIGIN_IP is not set. Either export it, or create ops/origin.env:"
  echo "    ORIGIN_IP=<the server's public IPv4>"
  exit 1
}

APPLY=0
[ "${1:-}" = "--apply" ] && APPLY=1

[ -f "$TOKEN_FILE" ] || { echo "No token at $TOKEN_FILE"; exit 1; }
CF="$(tr -d ' \t\n\r' < "$TOKEN_FILE")"
[ -n "$CF" ] || { echo "Token file is empty."; exit 1; }

cf() { # method path [json]
  local m=$1 p=$2 b=${3:-}
  if [ -n "$b" ]; then
    curl -sS -X "$m" "$API$p" -H "Authorization: Bearer $CF" \
         -H "Content-Type: application/json" -d "$b"
  else
    curl -sS -X "$m" "$API$p" -H "Authorization: Bearer $CF"
  fi
}
ok() { echo "$1" | jq -e '.success' >/dev/null 2>&1; }
errs() { echo "$1" | jq -r '(.errors // []) | map(.message) | join("; ")'; }

echo "=== zone ==="
z=$(cf GET "/zones?name=$ZONE")
ok "$z" || { echo "  cannot read zones: $(errs "$z")"; exit 1; }
ZID=$(echo "$z" | jq -r '.result[0].id // empty')
[ -n "$ZID" ] || { echo "  zone '$ZONE' does not exist — add the site in the Cloudflare dashboard first"; exit 1; }
echo "$z" | jq -r '.result[0] | "  " + .name + "  status=" + .status + "  id=" + .id
  + "\n  nameservers: " + ((.name_servers // []) | join(", "))'
st=$(echo "$z" | jq -r '.result[0].status')
[ "$st" = "active" ] || echo "  NOTE: status is '$st' — the registrar's nameservers are not pointing here yet."

echo
echo "=== records (want: apex, www, app -> $ORIGIN_IP, all proxied) ==="
recs=$(cf GET "/zones/$ZID/dns_records?per_page=100")
ok "$recs" || { echo "  cannot read records: $(errs "$recs")"; exit 1; }

for sub in "@" "www" "app"; do
  [ "$sub" = "@" ] && fqdn="$ZONE" || fqdn="$sub.$ZONE"
  existing=$(echo "$recs" | jq -r --arg n "$fqdn" '.result[] | select(.name==$n and .type=="A") | .id' | head -1)
  # A stale CNAME on the same name blocks the A record (Cloudflare rejects the
  # conflict). Namecheap's import leaves `www -> parkingpage.namecheap.com`,
  # so clear any CNAME occupying the name before writing the A.
  stale=$(echo "$recs" | jq -r --arg n "$fqdn" '.result[] | select(.name==$n and .type=="CNAME") | .id' | head -1)
  body=$(jq -n --arg n "$fqdn" --arg c "$ORIGIN_IP" \
    '{type:"A", name:$n, content:$c, proxied:true, ttl:1, comment:"Astra origin"}')
  if [ "$APPLY" != "1" ]; then
    if [ -n "$existing" ]; then echo "  would UPDATE A $fqdn"; else echo "  would CREATE A $fqdn"; fi
    [ -n "$stale" ] && echo "    (and delete a conflicting CNAME on $fqdn)"
    continue
  fi
  [ -n "$stale" ] && cf DELETE "/zones/$ZID/dns_records/$stale" >/dev/null
  if [ -n "$existing" ]; then
    r=$(cf PATCH "/zones/$ZID/dns_records/$existing" "$body"); act=UPDATE
  else
    r=$(cf POST "/zones/$ZID/dns_records" "$body"); act=CREATE
  fi
  ok "$r" && echo "  $act A $fqdn -> $ORIGIN_IP  ok" || echo "  $act A $fqdn FAILED: $(errs "$r")"
done

echo
echo "=== HTTPS settings ==="
# ⚠️ ssl mode is deliberately NOT set here. "full" and "strict" both require the
# ORIGIN to answer TLS on 443, and frontend/nginx.conf listens on 80 only —
# setting either before the origin serves HTTPS turns the whole site into a 502.
# Choosing between (a) an origin certificate + a 443 listener and (b) flexible
# is a deploy decision, documented in DEPLOY.md §3.1.
cur=$(cf GET "/zones/$ZID/settings/ssl")
echo "  ssl mode (unchanged by this script): $(echo "$cur" | jq -r '.result.value // "?"')"
for kv in always_use_https=on automatic_https_rewrites=on min_tls_version=1.2; do
  k=${kv%%=*}; v=${kv#*=}
  if [ "$APPLY" != "1" ]; then echo "  would set $k=$v"; continue; fi
  r=$(cf PATCH "/zones/$ZID/settings/$k" "$(jq -n --arg v "$v" '{value:$v}')")
  ok "$r" && echo "  $k -> $(echo "$r" | jq -r '.result.value')" || echo "  $k FAILED: $(errs "$r")"
done

[ "$APPLY" = "1" ] || { echo; echo "=== PREFLIGHT ONLY — re-run with --apply ==="; }
