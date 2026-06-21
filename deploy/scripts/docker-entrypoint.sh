#!/usr/bin/env bash
# Entrypoint for the Pairly Docker image. Takes one arg:
#   api  -> run uvicorn (FastAPI)
#   bot  -> run python -m pairly.main (polling or webhook, based on env)
#   init -> run alembic + seed and exit (used by an init container in compose)
#
# Always runs alembic upgrade head before starting the chosen process so a fresh
# stack is self-bootstrapping.

set -eu

MODE="${1:-api}"

echo "[entrypoint] mode=$MODE"
echo "[entrypoint] alembic upgrade head"
alembic -c backend/pairly/migrations/alembic.ini upgrade head

if [[ "$MODE" == "init" ]]; then
    echo "[entrypoint] seeding QOTD bank (idempotent)"
    python -m pairly.db.seed
    echo "[entrypoint] init done"
    exit 0
fi

if [[ "$MODE" == "api" ]]; then
    # Mark this process as running inside Docker so the create_app() boot
    # guard refuses dev_auth regardless of api_host (the old env-only
    # api_host check was bypassable because the entrypoint hard-pinned
    # --host 0.0.0.0 below). Native (non-docker) deployments don't set
    # this and keep the original api_host-only guard.
    export PAIRLY_API_DEPLOY="${PAIRLY_API_DEPLOY:-docker}"
    # Honor PAIRLY_API_HOST so the entrypoint doesn't silently override
    # the operator's bind choice. Default is 0.0.0.0 inside the container
    # (Caddy terminates TLS and proxies in — no public socket here is
    # expected to be loopback).
    PAIRLY_API_HOST="${PAIRLY_API_HOST:-0.0.0.0}"
    echo "[entrypoint] starting uvicorn on ${PAIRLY_API_HOST}:${PAIRLY_API_PORT:-8000} (api_deploy=${PAIRLY_API_DEPLOY})"
    exec uvicorn pairly.api.app:app \
        --host "${PAIRLY_API_HOST}" \
        --port "${PAIRLY_API_PORT:-8000}" \
        --proxy-headers
elif [[ "$MODE" == "bot" ]]; then
    echo "[entrypoint] starting bot"
    exec python -m pairly.main
else
    echo "[entrypoint] unknown mode: $MODE (use api, bot, or init)" >&2
    exit 1
fi
