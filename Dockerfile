# Pairly Dockerfile.
#
# Used by docker-compose.yml. The image carries both the FastAPI app and the bot
# (aiogram). A single CMD argument chooses which process to run:
#
#   CMD ["api"]   # uvicorn pairly.api.app:app
#   CMD ["bot"]   # python -m pairly.main (webhook mode when WEBHOOK_URL is set)
#
# On first start, an init-container runs `alembic upgrade head` and `pairly.db.seed`.
#
# TLS is terminated by Caddy (separate container) with automatic Let's Encrypt.

# ---- stage 1: build the wheel ----------------------------------------
FROM python:3.12-slim AS builder

WORKDIR /build

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

COPY pyproject.toml uv.lock* ./
COPY backend ./backend

RUN uv build --wheel --out-dir /dist

# ---- stage 2: runtime ------------------------------------------------
FROM python:3.12-slim AS runtime

# sqlite3 for backups/maintenance, libpq5 for asyncpg (prod Postgres), curl for
# healthchecks, bash for the entrypoint script, tini for proper signal handling.
RUN apt-get update \
	&& apt-get install -y --no-install-recommends sqlite3 libpq5 curl bash tini ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

# Unprivileged user.
RUN useradd --system --create-home --uid 1000 pairly

WORKDIR /app

COPY --from=builder /dist/*.whl /tmp/
RUN pip install --no-cache-dir /tmp/*.whl && rm -f /tmp/*.whl

COPY --chown=pairly:pairly backend/pairly/migrations ./backend/pairly/migrations
COPY --chown=pairly:pairly deploy/scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

ENV PAIRLY_DATABASE_URL=sqlite+aiosqlite:////data/pairly.db
RUN mkdir -p /data /app && chown -R pairly:pairly /data /app

USER pairly

EXPOSE 8000 8080

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["api"]
