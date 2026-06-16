# Project: Pairly (Telegram bot + Mini App for couples)

## Mission
Help couples build shared rituals, keep track of things they want to do together,
and discover new ways to be present for each other.

## Naming
- **Product name:** Pairly
- **Code / service identifiers** (packages, Docker images, systemd units, DB names, env prefixes): lowercase `pairly`.
- The `Pairly` folder is intentionally left as-is; do not rename it.

## Stack
- **Backend:** Python 3.12 + aiogram 3 (async) + SQLAlchemy 2.0 + Alembic
- **DB:** SQLite (dev) → Postgres (prod), switched via `DATABASE_URL`
- **Mini App API:** FastAPI (separate process/port from the bot)
- **Mini App:** React 18 + Vite + TypeScript + Tailwind + `@twa-dev/sdk` (PWA, offline via service worker)
- **Deploy:** cheap VPS (Hetzner/Reg.ru, 4–8 EUR/mo), systemd + Caddy, hourly SQLite backup to S3-compatible storage
- **CI:** GitHub Actions

## Repo structure
- `/backend` — Telegram bot (aiogram) + FastAPI for the Mini App
  - `bot/` handlers, keyboards, FSM
  - `api/` REST for the Mini App
  - `db/` models, Alembic migrations
  - `tests/` pytest
- `/miniapp` — Telegram Mini App (React)
- `/docs` — product / UX / architecture docs
- `/deploy` — systemd units, Caddyfile, scripts
- `/e2e` — Playwright (Mini App) + telegram e2e
- `/infra` — Terraform / Ansible (if/when needed)

## Decision log
Architecture decisions live in `/docs/adr/NNN-title.md`.

## Roadmap
See `/docs/roadmap.md`.

## MVP scope
**Lean core:**
1. Forward a channel/chat post → bot parses title / address / date / category → shared wishlist
2. "Gift an action" catalog with a "done / redemption" state
3. `/pair` to link two users into a pair via invite token

**Extras (also MVP):** Question of the day, Countdowns, Mood sync, Bucket list.

**Hard non-goals (do not build):** real-time geolocation, "time apart" counters, anything
that generates jealousy/anxiety. Privacy-by-design.

**Pair-scoping rule:** every DB row carries `pair_id`; access is allowed only if
`user_id ∈ pair.members`. No exceptions.

## Definition of Done (MVP)
- [ ] `/start` works, bot answers in < 1s
- [ ] Forwarding a post → parsed → wishlist entry created
- [ ] Gift catalog with "done" checkmark
- [ ] Mini App: shared wishlist + shared bucket list
- [ ] 50 closed/open pairs in prod (smoke)
- [ ] Backup works, rollback tested

## Team (sub-agents)
Sub-agents live conceptually under this repo. Each is an isolated session with its own
task name and deliverables. They communicate via files in `/docs` and explicit hand-offs.

- `product` — specs, user stories, prioritization, roadmap
- `ux-tg-bot` — bot dialog flows, copy, Mini App prototypes
- `backend` — aiogram bot + FastAPI + DB
- `frontend` — React Mini App
- `infra-data` — deploy, CI/CD, backups, monitoring
- `qa-e2e` — end-to-end tests, regression, health checks
