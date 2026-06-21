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
# Caddy serves miniapp/dist via a read-only bind mount — new files are visible
# immediately, no restart needed (and a restart causes a brief TLS-reload outage).
# Force-recreate caddy: the Caddyfile is a bind-mounted single file, and `git pull`
# replaces it via atomic rename (new inode). A plain `up -d` sees no service-definition
# change and leaves the old container running with a stale (old-inode) mount, so
# Caddyfile edits silently never take effect (and `caddy reload` re-reads the same
# stale bytes). --force-recreate re-mounts the current file. Brief TLS gap is acceptable.
docker compose --env-file .env.prod up -d --force-recreate caddy

echo "==> health"
sleep 3
curl -fsS https://"${PAIRLY_PUBLIC_DOMAIN:-localhost}"/api/health || \
  curl -fsS http://127.0.0.1:8000/api/health
echo
echo "==> done"
