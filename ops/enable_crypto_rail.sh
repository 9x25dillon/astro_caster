#!/usr/bin/env bash
# Run ON THE BOX. Appends the treasury vars (idempotent), recreates the backend
# so the env reaches the container, then probes the rail from inside.
set -euo pipefail
cd ~/astro-aae
grep -q '^AAE_TREASURY_ETH=' .env || echo 'AAE_TREASURY_ETH=0xF3b8151f460598D89919F8bF0155b2Fb8B88723B' >> .env
grep -q '^AAE_ETH_RPC=' .env || echo 'AAE_ETH_RPC=https://ethereum-rpc.publicnode.com' >> .env
grep -E '^(AAE_TREASURY_ETH|AAE_ETH_RPC)=' .env
docker compose up -d backend 2>&1 | tail -2
sleep 4
curl -s http://127.0.0.1:${WEB_PORT:-80}/api/pricing -H 'Host: app.astra-arcana.com' | head -c 200; echo
