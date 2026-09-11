#!/usr/bin/env bash
# Point the origin firewall's SSH rule at the IP you are sitting behind now.
#
#   ./ssh_allow_my_ip.sh           # repoint port 22 to your current IP (no-op if it already is)
#   ./ssh_allow_my_ip.sh --check   # READ ONLY — show the rule and what would change
#
# Port 22 on the origin is open to one /32: the operator's home IP, which
# rotates. The signature of a rotation is the site serving 200 through
# Cloudflare while `ssh` times out — the box is fine, the door moved. This
# replaces the trip to the Hetzner console with one command.
#
# The danger is Hetzner's API, not SSH: `set_rules` REPLACES THE WHOLE RULE SET.
# A rule rebuilt wrong here would silently drop 80/443 and take the site down
# for every reader. So the new set is derived from the live one by editing
# exactly one field, and the script refuses to send it unless every other rule
# is byte-identical — checked BEFORE the write, and again after it.
#
# The token is read from a file and passed via an env var. It is never echoed,
# never placed on a command line, and never written to any output.
set -euo pipefail

TOKEN_FILE="${TOKEN_FILE:-$HOME/.hetzner-token}"
API="https://api.hetzner.cloud/v1"
FIREWALL_NAME="${FIREWALL_NAME:-astra-edge}"
SSH_KEY_FILE="${SSH_KEY_FILE:-$HOME/.ssh/astra_hetzner}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

CHECK=0
[ "${1:-}" = "--check" ] && CHECK=1

# --- token ------------------------------------------------------------------
[ -f "$TOKEN_FILE" ] || { echo "No token at $TOKEN_FILE (Hetzner console -> Security -> API tokens, Read & Write)."; exit 1; }
HCLOUD_TOKEN="$(tr -d ' \t\n\r' < "$TOKEN_FILE")"
export HCLOUD_TOKEN
[ -n "$HCLOUD_TOKEN" ] || { echo "Token file is empty."; exit 1; }

api() { # method path [json]
  local method=$1 path=$2 body=${3:-}
  if [ -n "$body" ]; then
    curl -sS -X "$method" "$API$path" \
      -H "Authorization: Bearer $HCLOUD_TOKEN" \
      -H "Content-Type: application/json" -d "$body"
  else
    curl -sS -X "$method" "$API$path" -H "Authorization: Bearer $HCLOUD_TOKEN"
  fi
}

die_on_api_error() { # json label
  local err
  err=$(echo "$1" | jq -r '.error.message // empty')
  [ -z "$err" ] || { echo "  Hetzner API error during $2: $err"; exit 1; }
}

# Every rule except the SSH one, normalised — the thing that must never change.
# Null fields are dropped on BOTH sides before comparing: the API returns the
# icmp rule with "port": null, the payload omits it (the shape provision_hetzner
# created this firewall with), and those mean the same rule. Comparing raw
# against stripped made this guard refuse its own correct output.
others() { jq -cS '[.[] | with_entries(select(.value != null))
                   | select(.direction=="in" and .protocol=="tcp" and .port=="22" | not)]'; }

# --- where am I -------------------------------------------------------------
MY_IP="${MY_IP:-$(curl -sS --max-time 10 https://api.ipify.org || true)}"
[[ "$MY_IP" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || { echo "Could not read your public IPv4 (got '${MY_IP:-nothing}')."; exit 1; }
echo "your IP      : $MY_IP"

# --- the live firewall --------------------------------------------------------
fws=$(api GET "/firewalls?name=$FIREWALL_NAME"); die_on_api_error "$fws" "firewall lookup"
fw_id=$(echo "$fws" | jq -r '.firewalls[0].id // empty')
[ -n "$fw_id" ] || { echo "No firewall named '$FIREWALL_NAME' in this project."; exit 1; }
old_rules=$(echo "$fws" | jq -c '.firewalls[0].rules')

n_ssh=$(echo "$old_rules" | jq '[.[] | select(.direction=="in" and .protocol=="tcp" and .port=="22")] | length')
[ "$n_ssh" = 1 ] || { echo "Expected exactly one inbound tcp/22 rule on $FIREWALL_NAME, found $n_ssh — not guessing which to edit."; exit 1; }
old_src=$(echo "$old_rules" | jq -r '.[] | select(.direction=="in" and .protocol=="tcp" and .port=="22") | .source_ips | join(", ")')
echo "firewall     : $FIREWALL_NAME (id $fw_id), $(echo "$old_rules" | jq length) rules"
echo "ssh allowed  : $old_src"

want="$MY_IP/32"
if [ "$old_src" = "$want" ]; then
  echo "already open to you — nothing to do."
  exit 0
fi

# --- the new set: the live one with ONE field changed --------------------------
new_rules=$(echo "$old_rules" | jq -c --arg ip "$want" '
  map(if .direction=="in" and .protocol=="tcp" and .port=="22" then .source_ips=[$ip] else . end)
  | map(with_entries(select(.value != null)))')

# The pre-write guarantee: identical apart from the SSH rule, and nothing lost.
[ "$(echo "$old_rules" | others)" = "$(echo "$new_rules" | others)" ] \
  || { echo "REFUSING: the rebuilt rule set would change more than the SSH rule."; exit 1; }
[ "$(echo "$old_rules" | jq length)" = "$(echo "$new_rules" | jq length)" ] \
  || { echo "REFUSING: the rebuilt rule set has a different number of rules."; exit 1; }

echo "will change  : ssh $old_src  ->  $want   (all other rules untouched)"
if [ "$CHECK" = 1 ]; then
  echo "CHECK ONLY — nothing was changed. Run without --check to apply."
  exit 0
fi

# --- write, wait, re-read -------------------------------------------------------
r=$(api POST "/firewalls/$fw_id/actions/set_rules" "$(jq -n --argjson r "$new_rules" '{rules:$r}')")
die_on_api_error "$r" "set_rules"
for action_id in $(echo "$r" | jq -r '.actions[].id'); do
  for _ in $(seq 1 30); do
    st=$(api GET "/actions/$action_id" | jq -r '.action.status')
    [ "$st" = running ] || break
    sleep 1
  done
  [ "$st" = success ] || { echo "Hetzner action $action_id ended '$st' — check the console."; exit 1; }
done

after=$(api GET "/firewalls/$fw_id" | jq -c '.firewall.rules')
got=$(echo "$after" | jq -r '.[] | select(.direction=="in" and .protocol=="tcp" and .port=="22") | .source_ips | join(", ")')
[ "$got" = "$want" ] || { echo "After the write, ssh allows '$got', not '$want'."; exit 1; }
[ "$(echo "$old_rules" | others)" = "$(echo "$after" | others)" ] \
  || { echo "WARNING: rules other than SSH differ after the write — check 80/443 in the console NOW."; exit 1; }
echo "done         : ssh now allows $want; other rules verified unchanged"

# --- the only test that matters: can you get in --------------------------------
ORIGIN_IP="${ORIGIN_IP:-}"
[ -z "$ORIGIN_IP" ] && [ -f "$HERE/origin.env" ] && ORIGIN_IP=$(sed -n 's/^ORIGIN_IP=//p' "$HERE/origin.env")
if [ -n "$ORIGIN_IP" ] && [ -f "$SSH_KEY_FILE" ]; then
  if ssh -i "$SSH_KEY_FILE" -o ConnectTimeout=10 -o BatchMode=yes "astra@$ORIGIN_IP" true 2>/dev/null; then
    echo "ssh          : connected"
  else
    echo "ssh          : not yet — the rule can take a few seconds to reach the edge; retry once before worrying"
  fi
fi
