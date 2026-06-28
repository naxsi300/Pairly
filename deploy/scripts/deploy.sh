#!/usr/bin/env bash
# Pairly one-shot deploy on the VPS: pull, rebuild images, restart services.
#
# Run from the repo root on the VPS:
#   bash deploy/scripts/deploy.sh
#
# Requires: git, docker compose, a populated .env.prod.
#
# The Mini App is now built INSIDE Docker (Dockerfile.web: node:22-alpine
# build stage -> caddy:2-alpine runtime, with /srv/miniapp baked in). The
# host no longer needs Node/npm — the previous on-VPS `npm ci && npm run
# build` step and the `./miniapp/dist:/srv/miniapp:ro` bind-mount are gone,
# which means no more stale-dist / force-recreate / TLS-gap failures.
set -euo pipefail

cd "$(dirname "$0")/../.."  # repo root

echo "==> git pull"
git pull --ff-only

echo "==> build images"
# build (no --service) so both pairly:latest (Dockerfile) and the web tier
# (Dockerfile.web) are rebuilt. --pull fetches updated base layers.
docker compose --env-file .env.prod build --pull

echo "==> restart services"
# A plain `up -d` picks up the new image references and replaces running
# containers. No --force-recreate needed: the previous host bind-mount of
# miniapp/dist (the source of the inode-replacement deploy failure) is gone.
docker compose --env-file .env.prod up -d

echo "==> health"
sleep 3
curl -fsS https://"${PAIRLY_PUBLIC_DOMAIN:-localhost}"/api/health || \
  curl -fsS http://127.0.0.1:8000/api/health
echo
echo "==> done"