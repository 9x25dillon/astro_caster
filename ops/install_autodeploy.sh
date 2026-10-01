#!/usr/bin/env bash
# One-time setup of the self-deploying box (ops/autodeploy.sh). Run as ROOT on
# the box — from the Hetzner web console if you have no SSH key:
#
#   G="sudo -u astra git -C /home/astra/astro-aae"; $G fetch -q origin main && bash <($G show origin/main:ops/install_autodeploy.sh)
#
# Every git call runs AS astra: git run by root inside astra's repo either
# trips git's ownership check or leaves root-owned files in .git that break
# the service's own fetches later.
#
# After this, merging to `main` on github.com deploys within ~5 minutes of CI
# passing. Undo: systemctl disable --now astra-autodeploy.timer
#
# The service runs autodeploy.sh as it is on origin/main (via `git show`), not
# from the working tree. That solves two things at once: the first run can
# deploy the very merge that introduced the script, and a later fix to the
# script takes effect on the next pass without re-running this installer.
set -euo pipefail

USER_NAME="${USER_NAME:-astra}"
REPO_DIR="${REPO_DIR:-/home/$USER_NAME/astro-aae}"

[ "$(id -u)" = 0 ] || { echo "run as root (sudo)"; exit 1; }
[ -d "$REPO_DIR/.git" ] || { echo "no repo at $REPO_DIR"; exit 1; }
id -nG "$USER_NAME" | grep -qw docker || { echo "$USER_NAME is not in the docker group"; exit 1; }
command -v flock >/dev/null && command -v python3 >/dev/null && command -v curl >/dev/null \
  || { echo "needs flock, python3, curl"; exit 1; }
# The fetch must work non-interactively as the service user.
sudo -u "$USER_NAME" git -C "$REPO_DIR" fetch -q origin main \
  || { echo "git fetch as $USER_NAME failed — check the remote (git -C $REPO_DIR remote -v)"; exit 1; }

cat > /etc/systemd/system/astra-autodeploy.service <<EOF
[Unit]
Description=Astra — deploy origin/main when CI has passed
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=oneshot
User=$USER_NAME
WorkingDirectory=$REPO_DIR
Environment=HOME=/home/$USER_NAME REPO_DIR=$REPO_DIR
ExecStart=/bin/bash -c 'git fetch -q origin main && exec bash <(git show origin/main:ops/autodeploy.sh)'
TimeoutStartSec=45min
EOF

cat > /etc/systemd/system/astra-autodeploy.timer <<'EOF'
[Unit]
Description=Astra — check GitHub for a deployable main every 5 minutes

[Timer]
OnBootSec=3min
OnUnitActiveSec=5min
RandomizedDelaySec=30

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now astra-autodeploy.timer
echo "installed. first pass now (this can take several minutes if it rebuilds):"
systemctl start astra-autodeploy.service || true
journalctl -u astra-autodeploy -n 20 --no-pager
systemctl list-timers astra-autodeploy.timer --no-pager
