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
    echo "[entrypoint] starting uvicorn on 0.0.0.0:${PAIRLY_API_PORT:-8000}"
    exec uvicorn pairly.api.app:app \
        --host 0.0.0.0 \
        --port "${PAIRLY_API_PORT:-8000}" \
        --proxy-headers
elif [[ "$MODE" == "bot" ]]; then
    echo "[entrypoint] starting bot"
    exec python -m pairly.main
else
    echo "[entrypoint] unknown mode: $MODE (use api, bot, or init)" >&2
    exit 1
fi
