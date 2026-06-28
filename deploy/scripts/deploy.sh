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
# --remove-orphans: a service rename (e.g. caddy -> web) would otherwise leave
# the old container holding the host ports (80/443), so the new service can't
# bind and the deploy silently serves nothing. Orphans are dropped here.
docker compose --env-file .env.prod up -d --remove-orphans

echo "==> health"
# Poll the public endpoint until /api/health responds 200, OR fall back to
# the in-cluster 127.0.0.1:8000. The previous `sleep 3` was racy: Caddy may
# still be reloading its TLS listener after `up -d` swapped the web
# container, in which case the very first curl hits a half-open TLS socket
# and the deploy falsely "succeeds" with the fallback URL — hiding a broken
# TLS path. We retry the public URL up to 30 × 1s, then the localhost
# fallback once, and emit diagnostics on failure.
HEALTH_URL="https://${PAIRLY_PUBLIC_DOMAIN:-localhost}/api/health"
LOCAL_HEALTH_URL="http://127.0.0.1:8000/api/health"
HEALTH_TRIES=30
ok=0
for ((i = 1; i <= HEALTH_TRIES; i++)); do
	if curl -fsS --max-time 3 "$HEALTH_URL" >/dev/null 2>&1; then
		echo "==> public health OK after ${i}s ($HEALTH_URL)"
		ok=1
		break
	fi
	# 1s between attempts. Total budget: ~30s; the api service healthcheck
	# uses start_period=20s + interval=30s, so 30s covers the worst case.
	sleep 1
done
if (( ok == 0 )); then
	echo "==> WARN: public $HEALTH_URL did not respond after ${HEALTH_TRIES}s; trying localhost"
	if ! curl -fsS --max-time 3 "$LOCAL_HEALTH_URL"; then
		echo "==> ERROR: both public and localhost /api/health failed" >&2
		echo "    public   : $HEALTH_URL" >&2
		echo "    fallback : $LOCAL_HEALTH_URL" >&2
		echo "==> Recent web container logs:" >&2
		docker compose --env-file .env.prod logs --tail=80 web >&2 || true
		echo "==> Recent api container logs:" >&2
		docker compose --env-file .env.prod logs --tail=80 api >&2 || true
		exit 1
	fi
fi
echo
echo "==> done"