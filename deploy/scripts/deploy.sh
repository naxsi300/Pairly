#!/usr/bin/env bash
# Pairly one-shot deploy on the VPS: pull, build the Mini App locally (npm on the
# VPS — no dist shipped from a dev machine), rebuild the backend image, restart.
#
# Run from the repo root on the VPS:
#   bash deploy/scripts/deploy.sh
#
# Requires: git, node/npm (>=20), docker compose, a populated .env.prod.
set -euo pipefail

cd "$(dirname "$0")/../.."  # repo root

echo "==> git pull"
git pull --ff-only

echo "==> build Mini App (npm on this host)"
pushd miniapp >/dev/null
npm ci
npm run build          # produces miniapp/dist, mounted into Caddy by docker-compose
popd >/dev/null

echo "==> build backend image"
docker compose --env-file .env.prod build init

echo "==> restart services"
docker compose --env-file .env.prod up -d --force-recreate api bot
# Caddy serves miniapp/dist via a read-only bind mount; restart to drop any cache.
docker compose --env-file .env.prod restart caddy

echo "==> health"
sleep 3
curl -fsS https://"${PAIRLY_PUBLIC_DOMAIN:-localhost}"/api/health || \
  curl -fsS http://127.0.0.1:8000/api/health
echo
echo "==> done"
