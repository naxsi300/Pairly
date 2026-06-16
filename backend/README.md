# Pairly backend

Telegram bot (aiogram 3) + FastAPI Mini App API + SQLAlchemy/Alembic.

## Quick start

```bash
cp .env.example .env       # fill in PAIRLY_BOT_TOKEN
make install               # uv sync --extra dev
make migrate               # apply migrations (or just run the bot once — dev creates tables)
make bot                   # start polling
make api                   # start the Mini App API on :8000
```

## Layout

```
backend/pairly/
  main.py          bot entrypoint (Dispatcher + polling)
  config.py        settings (PAIRLY_* env vars, pydantic-settings)
  db/              async SQLAlchemy base + models + Alembic migrations
  repositories/    THE SECURITY BOUNDARY — pair-scoped access, enforced here
  bot/             aiogram routers, FSM, keyboards, forward parser
  api/             FastAPI Mini App API (/api/*)
backend/tests/     pytest + pytest-asyncio
```

## Security invariant

Every user-data row carries `pair_id`. Read/write is allowed only when the requester's
`user_id` is a member of that pair. This is enforced in `repositories/base.py`
(`_require_membership`), not at callers. Tests cover it.

## Free-tier limits

Per pair (Pro = unlimited): 10 wishlist, 10 countdowns, 5 bucket-list items.
Payment gateway is a future task — only the schema + limit checks exist now.

## Commands

```bash
make test      # pytest
make lint      # ruff
make bot       # run the bot
make api       # run the API
make migrate   # alembic upgrade head
```
