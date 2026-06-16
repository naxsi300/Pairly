# Open decisions — autonomous choices for review

This file records decisions the orchestrator made autonomously while working without
live confirmation. If you disagree with any, edit this file (mark a line `OVERRULED:`)
or tell Claude directly.

Conventions:
- Each entry has a date, the decision, the rationale, and an "alternative considered" line.
- Decisions that merely execute already-agreed plans (e.g. "used aiogram 3") are NOT logged.

---

## 2026-06-15 — Frontend (React Mini App) choices

**1. Single-page, bottom-tab navigation, no router lib.**
Decision: a `useState`-driven tab switcher (Wishlist / Bucket / Countdowns / Mood / QOTD / Gifts), no react-router. Telegram Mini Apps are single-view by nature; a router adds weight for no benefit.
Alternative: MemoryRouter — rejected as premature.

**2. Tailwind only, no component library.**
Decision: hand-rolled components with Tailwind classes, themed via Telegram CSS variables (`var(--tg-theme-*)`). Keeps bundle small and respects the user's device theme.
Alternative: shadcn/ui — rejected; too heavy for a 6-screen app and fights the Telegram theme vars.

**3. Data fetching: hand-rolled async hooks, no SWR/React Query.**
Decision: a small `useApi` hook (loading/error/data) built on `fetch`. The API surface is tiny (a handful of pair-scoped endpoints); a query cache lib is overkill at MVP.
Alternative: SWR — note for later if we add polling/optimistic updates.

**4. Mock API client behind a flag for now.**
Decision: the Mini App calls the FastAPI `/api/*`, but since the real Telegram initData auth is still a TODO in the backend, the client includes a dev-mode mock that returns canned data so the UI is demonstrable standalone. Toggled via `VITE_USE_MOCK`.
Alternative: hardwire to real API — rejected, would make the UI undemoable until auth lands.

**5. Pair context passed via headers (`X-Pair-Id`, `X-User-Id`) to match the current backend stub.**
Decision: the client mirrors the backend's current stand-in auth (header-based). When real Telegram initData HMAC auth is implemented, the client switches to sending `initData` and the backend derives pair/user from it. This is a known transient.
Alternative: implement initData now — out of scope for frontend task; belongs to a backend auth task.

**6. PWA / offline: service worker caches the shell only.**
Decision: a Vite PWA plugin caches the static shell (HTML/JS/CSS) so the app loads offline; data still needs network. Full offline data sync is a non-goal for MVP.
Alternative: full offline cache of pair data — rejected (adds sync-conflict complexity for little value).

---

## 2026-06-15 — Infra (deploy/CI/backups) choices

**7. Two systemd units (bot + api), not one.**
Decision: `pairly-bot.service` (polling) and `pairly-api.service` (uvicorn), because the bot and FastAPI run as separate processes (per CLAUDE.md "separate process/port"). Independent restart/restart-on-failure each.
Alternative: single supervisor process — rejected (couples failure domains).

**8. Caddy, not nginx.**
Decision: Caddy per CLAUDE.md stack. Auto-HTTPS, tiny config. Caddy reverse-proxies `/api/*` → uvicorn and serves the built Mini App as static.
Alternative: nginx — already ruled out by stack decision.

**9. SQLite hourly backup → S3-compatible, retention 7 daily + 4 weekly.**
Decision: a `backup.sh` cron'd hourly; it keeps the last hourly backup within 24h, promotes one per day to daily (7 retained) and one per week (4 retained). Uses `sqlite3 .backup` (online, consistent). For prod-Postgres this is replaced by `pg_dump` — the script is DB-agnostic via a dispatch on `DATABASE_URL` scheme.
Alternative: WAL checkpoint + file copy — rejected (less consistent than `.backup`).

**10. CI runs lint + test on every push; no auto-deploy in CI yet.**
Decision: `.github/workflows/ci.yml` runs `make lint` + `make test` on push/PR. A `cd.yml` (deploy on tag via SSH) is stubbed but commented out — auto-deploy needs secrets + a chosen VPS; enable manually when the VPS is provisioned.
Alternative: full CD now — rejected (no VPS credentials yet).

**11. Dockerfile provided but not the only deploy path.**
Decision: a multi-stage `Dockerfile` builds the backend wheel and runs uvicorn+bot via a single entrypoint script, for those who prefer container deploys. The default documented path remains systemd (lighter on a 4-8 EUR VPS).
Alternative: docker-only — rejected (overhead on a tiny VPS).

---

## 2026-06-15 — Backend (already built) — retroactive notes

**12. Auth stub via headers is intentionally weak.**
Decision: the API currently trusts `X-Pair-Id`/`X-User-Id` headers. This is a DEV ONLY stand-in; real Telegram WebApp initData HMAC validation is a tracked TODO in `api/app.py`. Must be implemented before any public deploy.
Alternative: block on auth before any API work — rejected (would block the whole stack).
✅ **CLOSED 2026-06-15:** `pairly/auth/telegram.py` implements the official HMAC-SHA256 algorithm with replay protection (24h). Production path reads `X-Telegram-Init-Data`, validates `hash` + `auth_date`, and resolves the user via `tg_id` from the `user` JSON field. Dev/test path is gated by `PAIRLY_DEV_AUTH=1` and trusts `X-Dev-User-Id`. All 20 API routes use the new `current_auth` dependency. Mini App client (`src/sdk/api.ts`) sends the raw `initData` in production. 6 new HMAC tests in `test_auth_hmac.py` cover valid, bad-sig, wrong-token, expired, empty, missing-hash.

**13. Payment gateway deferred; only tier schema + limits exist.**
Decision: per the payments memory, no gateway is wired. The `Pair.tier` field and free-tier limit checks exist; promoting a pair to Pro is a manual/DB-level action until the gateway task runs.
Alternative: pick a crypto gateway now — deferred by explicit user decision.

---

## 2026-06-15 — Frontend delivered — follow-up gaps (TRACKED, not blocked)

**14. API surface gap: frontend calls endpoints the backend doesn't have yet.**
The backend ships only `/api/health`, `/api/wishlist` (GET/POST), `/api/mark-done`. The Mini App client (now built) also calls bucket, countdown, mood, qotd, gifts + deletes/done-on-bucket/mood-clear. These are mock-backed in the client today.
Decision: log this as a concrete follow-up task ("extend backend API to match the frontend client"), NOT block the frontend release. The frontend runs in `VITE_USE_MOCK=true` standalone.
Alternative: hold the frontend until the backend catches up — rejected (frontend is the visible deliverable; mock mode keeps it demoable).
TODO list to close this: `GET/POST/DELETE /api/bucket`, `GET/POST/DELETE /api/countdowns`, `GET/POST /api/mood`, `GET/POST /api/qotd`, `GET/POST /api/gifts`, `POST /api/wishlist/{id}/done` (vs current `/api/mark-done`).

✅ **CLOSED 2026-06-15:** feature repos (`bucket`, `countdowns`, `mood`, `qotd`, `gifts`) + 15 new routes. API at 24 routes. 19/19 tests pass incl. QOTD reveal-gate + pair-scoping across all repos. Frontend can target the REAL API (`VITE_USE_MOCK=false`).

**15. `/api/mark-done` vs `/api/wishlist/{id}/done`.**
Decision: keep the existing `/api/mark-done` AND add the RESTful `/wishlist/{id}/status` (accepts any status). Both work; client may use either. No breakage.


---

## 2026-06-16 — Deploy day fixes

**16. Bot → Mini App: nothing linked the bot to the Mini App.**
Decision: add `PAIRLY_WEBAPP_URL` config + `webapp_open_kb()` in `bot/keyboards.py` using `WebAppInfo`. Show the button on `/start` (paired), `/help`, `/list`, and a dedicated `/app` command. Caddy serves the Telegram manifest at `/.well-known/telegram-bot-app.json` for @BotFather `/setdomain`.
Alternative: a URL button (open in browser) — rejected, kills the in-Telegram UX.
Notes: requires `/setdomain` in @BotFather pointing at the same domain as `PAIRLY_WEBAPP_URL`. If `PAIRLY_WEBAPP_URL` is empty, the button is hidden (no broken URL rendered).

**17. Forwarded-post handler fired 3x for the same message.**
Decision: drop the legacy `forward_from` / `forward_from_chat` OR conditions; use only `F.forward_origin` (the current Telegram API). The legacy fields are sometimes populated redundantly, causing the handler to be entered multiple times for a single forwarded message.
Alternative: dedupe by `forward_origin.date_unix` — rejected, the simpler filter fix removes the cause.
