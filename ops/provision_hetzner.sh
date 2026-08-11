#!/usr/bin/env bash
# Provision the Astra origin server on Hetzner Cloud via the REST API.
#
#   ./provision_hetzner.sh            # PREFLIGHT — reads only, creates nothing
#   ./provision_hetzner.sh --create   # actually creates billable resources
#
# Preflight is the default on purpose: it VERIFIES that the location, server
# type and image names actually exist right now rather than trusting anyone's
# memory of Hetzner's catalogue, and prints the real price before a cent is
# spent. Run it first; --create only after its output looks right.
#
# The token is read from a file and passed via an env var. It is never echoed,
# never placed on a command line, and never written to any output.
set -euo pipefail

TOKEN_FILE="${TOKEN_FILE:-$HOME/.hetzner-token}"
API="https://api.hetzner.cloud/v1"

# All overridable from the environment so re-provisioning elsewhere does not
# mean editing this file. The defaults are what the live server actually is.
SERVER_NAME="${SERVER_NAME:-astra}"
LOCATION="${LOCATION:-nbg1}"            # Nuremberg, DE
SERVER_TYPE="${SERVER_TYPE:-cpx22}"     # 2 vCPU AMD / 4 GB / 80 GB
IMAGE="${IMAGE:-ubuntu-24.04}"
FIREWALL_NAME="${FIREWALL_NAME:-astra-edge}"
SSH_KEY_NAME="${SSH_KEY_NAME:-astra-deploy}"
SSH_KEY_FILE="${SSH_KEY_FILE:-$HOME/.ssh/astra_hetzner}"

CREATE=0
[ "${1:-}" = "--create" ] && CREATE=1

# --- token ------------------------------------------------------------------
if [ ! -f "$TOKEN_FILE" ]; then
  echo "No token at $TOKEN_FILE."
  echo "Create one in the Hetzner Cloud console (project -> Security -> API"
  echo "Tokens -> Generate, Read & Write), then:  umask 077; cat > $TOKEN_FILE"
  exit 1
fi
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

echo "=== 0. token ==="
me=$(api GET "/servers?per_page=1")
die_on_api_error "$me" "auth check"
echo "    token works (project reachable)"

# --- catalogue verification -------------------------------------------------
echo
echo "=== 1. does what we intend to buy actually exist? ==="
locs=$(api GET "/locations"); die_on_api_error "$locs" "locations"
loc_ok=$(echo "$locs" | jq -r --arg l "$LOCATION" '.locations[]|select(.name==$l)|"\(.name) — \(.city), \(.country)"')
[ -n "$loc_ok" ] || { echo "    LOCATION '$LOCATION' not found. Available:";
                      echo "$locs" | jq -r '.locations[]|"      \(.name) — \(.city), \(.country)"'; exit 1; }
echo "    location   : $loc_ok"

types=$(api GET "/server_types?per_page=100"); die_on_api_error "$types" "server types"
t=$(echo "$types" | jq -r --arg t "$SERVER_TYPE" --arg l "$LOCATION" '
  .server_types[]|select(.name==$t)|
  "\(.name) — \(.cores) vCPU \(.cpu_type), \(.memory)GB RAM, \(.disk)GB disk" as $spec |
  (.prices[]|select(.location==$l)) as $p |
  "\($spec)\n    price      : $\($p.price_monthly.gross)/mo gross ($\($p.price_hourly.gross)/hr)"')
[ -n "$t" ] || { echo "    SERVER TYPE '$SERVER_TYPE' unavailable in '$LOCATION'. Available there:";
                 echo "$types" | jq -r --arg l "$LOCATION" '.server_types[]|select(.prices[]?.location==$l)|
                   "      \(.name) — \(.cores) vCPU \(.cpu_type), \(.memory)GB, \(.disk)GB"'; exit 1; }
echo "    server type: $t"

# AVAILABILITY — the price list is NOT a stock list. Hetzner happily quotes
# types it cannot currently place: cx33 lists at $8.99 in every EU location and
# is provisionable in NONE of them, and fsn1 had zero available types of any
# kind. The only signal is datacenters[].server_types.available (type IDs), and
# without this check the first sign of trouble is `error during placement` from
# the create call, AFTER the ssh key and firewall have been made. Cost two
# failed provisions to learn; costs one API call to prevent.
st_id=$(echo "$types" | jq -r --arg t "$SERVER_TYPE" '.server_types[]|select(.name==$t)|.id')
dcs=$(api GET "/datacenters"); die_on_api_error "$dcs" "datacenters"
avail=$(echo "$dcs" | jq -r --arg l "$LOCATION" --argjson id "$st_id" '
  [.datacenters[]|select(.location.name==$l)|select((.server_types.available//[])|index($id))]|length')
if [ "${avail:-0}" -eq 0 ]; then
  echo "    AVAILABILITY: '$SERVER_TYPE' is NOT provisionable in '$LOCATION' right now."
  echo "    Provisionable there (>=4GB), cheapest first:"
  echo "$dcs" | jq -r --arg l "$LOCATION" '.datacenters[]|select(.location.name==$l)|(.server_types.available//[])[]' \
    | sort -u | while read -r id; do
        echo "$types" | jq -r --arg l "$LOCATION" --argjson id "$id" '
          .server_types[]|select(.id==$id)|select(.memory>=4)|
          (.prices[]|select(.location==$l)) as $p |
          "      \(.name)  \(.cores)c \(.cpu_type)  \(.memory)GB  \(.disk)GB  $\($p.price_monthly.gross|tonumber|.*100|round/100)/mo"'
      done | sort -t'$' -k2 -g
  exit 1
fi
echo "    availability: OK — placeable in $LOCATION"

imgs=$(api GET "/images?type=system&per_page=100"); die_on_api_error "$imgs" "images"
img_id=$(echo "$imgs" | jq -r --arg n "$IMAGE" '.images[]|select(.name==$n)|.id' | head -1)
[ -n "$img_id" ] || { echo "    IMAGE '$IMAGE' not found. Available:";
                      echo "$imgs" | jq -r '.images[]|"      \(.name)"'; exit 1; }
echo "    image      : $IMAGE (id $img_id)"

# --- what the firewall will allow -------------------------------------------
echo
echo "=== 2. firewall sources ==="
CF_V4=$(curl -sS https://www.cloudflare.com/ips-v4)
CF_V6=$(curl -sS https://www.cloudflare.com/ips-v6)
CF_COUNT=$(printf '%s\n%s\n' "$CF_V4" "$CF_V6" | grep -c '/')
MY_IP=$(curl -sS https://api.ipify.org || true)
echo "    Cloudflare ranges fetched : $CF_COUNT  (sources for 80/443)"
echo "    your current public IP    : ${MY_IP:-UNKNOWN}  (source for 22)"
echo "    NOTE: 80/443 restricted to Cloudflare is a BUDGET control, not just"
echo "          hygiene — a direct-to-origin caller can forge CF-Connecting-IP"
echo "          and mint unlimited per-IP AI budget buckets."
echo "    NOTE: if your home IP changes, SSH locks out. Recoverable two ways:"
echo "          Hetzner's web console (VNC) always works, and this script's"
echo "          firewall rule can be updated via API in seconds."

cf_json=$(printf '%s\n%s\n' "$CF_V4" "$CF_V6" | grep '/' | jq -R . | jq -s .)
ssh_src=$(jq -n --arg ip "${MY_IP:-0.0.0.0}" '[$ip + "/32"]')

# --- ssh key ----------------------------------------------------------------
echo
echo "=== 3. ssh key ==="
if [ ! -f "$SSH_KEY_FILE" ]; then
  echo "    no key at $SSH_KEY_FILE"
  if [ "$CREATE" = "1" ]; then
    ssh-keygen -t ed25519 -N "" -C "astra-deploy" -f "$SSH_KEY_FILE" >/dev/null
    echo "    generated (passphrase-less, dedicated to this server only)"
  else
    echo "    would generate an ed25519 keypair dedicated to this server"
  fi
fi
PUBKEY=""
[ -f "$SSH_KEY_FILE.pub" ] && PUBKEY=$(cat "$SSH_KEY_FILE.pub")

# --- cloud-init -------------------------------------------------------------
# Everything the box needs on first boot, so no manual server admin is required.
USER_DATA=$(cat <<'CLOUDINIT'
#cloud-config
package_update: true
package_upgrade: true
packages: [ca-certificates, curl, git, ufw, unattended-upgrades]
users:
  - name: astra
    # NOT [sudo, docker] — the docker group does not exist until docker is
    # installed further down, and cloud-init fails user creation on a missing
    # group. usermod -aG docker in runcmd handles it after the install.
    groups: [sudo]
    shell: /bin/bash
    sudo: ["ALL=(ALL) NOPASSWD:ALL"]
    ssh_authorized_keys: ["SSHKEYPLACEHOLDER"]
write_files:
  - path: /etc/ssh/sshd_config.d/99-astra.conf
    content: |
      PermitRootLogin no
      PasswordAuthentication no
      KbdInteractiveAuthentication no
runcmd:
  # 2 GB swap: the frontend image builds npm ci + vite ON THIS BOX, which is
  # the memory-hungry step. Swap turns a hard OOM (which reads like a broken
  # Dockerfile) into a merely slow build.
  - [sh, -c, "fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile"]
  - [sh, -c, "echo '/swapfile none swap sw 0 0' >> /etc/fstab"]
  - [sh, -c, "install -m 0755 -d /etc/apt/keyrings && curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc && chmod a+r /etc/apt/keyrings/docker.asc"]
  - [sh, -c, "echo \"deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable\" > /etc/apt/sources.list.d/docker.list"]
  - [sh, -c, "apt-get update && apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin"]
  - [sh, -c, "usermod -aG docker astra || true"]
  - [systemctl, restart, ssh]
CLOUDINIT
)
# Inject the real pubkey. Via a plain placeholder token, NOT by substituting on
# `ssh_authorized_keys: []` — bash ${var/pat/rep} treats the pattern as a glob,
# where a bare `[]` is an unterminated bracket expression and would silently not
# match, shipping a server with no way in.
if [ -n "$PUBKEY" ]; then
  USER_DATA=${USER_DATA/SSHKEYPLACEHOLDER/$PUBKEY}
else
  echo "    WARNING: no public key available; server would be unreachable by ssh"
fi

if [ "$CREATE" != "1" ]; then
  echo
  echo "=== PREFLIGHT ONLY — nothing was created ==="
  echo "    would create:"
  echo "      ssh key  : $SSH_KEY_NAME"
  echo "      firewall : $FIREWALL_NAME (22 from your IP; 80,443 from Cloudflare)"
  echo "      server   : $SERVER_NAME  $SERVER_TYPE / $IMAGE / $LOCATION"
  echo "    re-run with --create to provision."
  exit 0
fi

# --- create -----------------------------------------------------------------
echo
echo "=== 4. creating (idempotent by name) ==="

key_id=$(api GET "/ssh_keys" | jq -r --arg n "$SSH_KEY_NAME" '.ssh_keys[]|select(.name==$n)|.id' | head -1)
if [ -z "$key_id" ]; then
  r=$(api POST "/ssh_keys" "$(jq -n --arg n "$SSH_KEY_NAME" --arg k "$PUBKEY" '{name:$n,public_key:$k}')")
  die_on_api_error "$r" "ssh key create"
  key_id=$(echo "$r" | jq -r '.ssh_key.id')
  echo "    ssh key created  (id $key_id)"
else
  echo "    ssh key exists   (id $key_id)"
fi

fw_id=$(api GET "/firewalls" | jq -r --arg n "$FIREWALL_NAME" '.firewalls[]|select(.name==$n)|.id' | head -1)
fw_rules=$(jq -n --argjson cf "$cf_json" --argjson ssh "$ssh_src" '[
  {direction:"in", protocol:"tcp", port:"22",  source_ips:$ssh, description:"ssh — operator only"},
  {direction:"in", protocol:"tcp", port:"80",  source_ips:$cf,  description:"http — Cloudflare only"},
  {direction:"in", protocol:"tcp", port:"443", source_ips:$cf,  description:"https — Cloudflare only"},
  {direction:"in", protocol:"icmp", source_ips:["0.0.0.0/0","::/0"], description:"ping"}
]')
if [ -z "$fw_id" ]; then
  r=$(api POST "/firewalls" "$(jq -n --arg n "$FIREWALL_NAME" --argjson r "$fw_rules" '{name:$n,rules:$r}')")
  die_on_api_error "$r" "firewall create"
  fw_id=$(echo "$r" | jq -r '.firewall.id')
  echo "    firewall created (id $fw_id)"
else
  r=$(api POST "/firewalls/$fw_id/actions/set_rules" "$(jq -n --argjson r "$fw_rules" '{rules:$r}')")
  die_on_api_error "$r" "firewall set_rules"
  echo "    firewall updated (id $fw_id)"
fi

srv_id=$(api GET "/servers" | jq -r --arg n "$SERVER_NAME" '.servers[]|select(.name==$n)|.id' | head -1)
if [ -n "$srv_id" ]; then
  echo "    server '$SERVER_NAME' ALREADY EXISTS (id $srv_id) — not creating a second one"
else
  body=$(jq -n --arg n "$SERVER_NAME" --arg t "$SERVER_TYPE" --arg i "$IMAGE" \
               --arg l "$LOCATION" --argjson k "$key_id" --argjson f "$fw_id" \
               --arg u "$USER_DATA" '{
    name:$n, server_type:$t, image:$i, location:$l,
    ssh_keys:[$k], firewalls:[{firewall:$f}], user_data:$u,
    public_net:{enable_ipv4:true, enable_ipv6:true},
    labels:{project:"astra"}
  }')
  r=$(api POST "/servers" "$body")
  die_on_api_error "$r" "server create"
  srv_id=$(echo "$r" | jq -r '.server.id')
  echo "    server created   (id $srv_id)"
fi

# Backups are NOT a create-time flag — they are a separate action, which is
# exactly how a quoted "+20% for backups" silently becomes no backups at all.
# +20% of the server price; the box holds the SQLite entitlement/receipt ledger,
# which is the one piece of state here that cannot be rebuilt from the repo.
bkp=$(api GET "/servers/$srv_id" | jq -r '.server.backup_window // empty')
if [ -z "$bkp" ]; then
  r=$(api POST "/servers/$srv_id/actions/enable_backup" "")
  die_on_api_error "$r" "enable backup"
  echo "    backups enabled  (+20%)"
else
  echo "    backups already on (window $bkp)"
fi

echo
echo "=== 5. result ==="
api GET "/servers/$srv_id" | jq -r '.server |
  "    name : \(.name)\n    ipv4 : \(.public_net.ipv4.ip)\n    ipv6 : \(.public_net.ipv6.ip)\n    type : \(.server_type.name)\n    loc  : \(.datacenter.location.city)\n    stat : \(.status)"'
echo
echo "    ssh: ssh -i $SSH_KEY_FILE astra@<ipv4>   (wait ~2 min for cloud-init)"
