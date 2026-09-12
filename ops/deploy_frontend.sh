#!/usr/bin/env bash
# Used for the v1.0.7 deploy (session 41). Run ON THE BOX: scp it over, then
# `bash /tmp/deploy_frontend.sh`. Only for a delta whose pre-flight diff
# (DEPLOY.md / [[deployment-drift-probes]]) is empty and whose backend/ and
# packages/ delta is empty — otherwise the backend image is stale and needs
# `docker compose up -d --build` instead.
# Frontend-only deploy: pull main, rebuild ONLY the frontend image, swap ONLY
# that container. --no-deps keeps the backend container untouched.
set -euo pipefail
cd ~/astro-aae
BEFORE=$(git rev-parse --short HEAD)
git pull --ff-only origin main
AFTER=$(git rev-parse --short HEAD)
echo "box: $BEFORE -> $AFTER"
echo "backend delta:"; git diff --stat "$BEFORE..$AFTER" -- backend/ packages/ docker-compose.yml backend/Dockerfile | tail -1 || true
docker compose build frontend 2>&1 | tail -2
docker compose up -d --no-deps frontend 2>&1 | tail -2
sleep 3
docker compose ps --format '{{.Name}} {{.Status}}'
