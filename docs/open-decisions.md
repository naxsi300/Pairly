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

---

## 2026-06-16 — API field-mismatch fix

**18. The Mini App sent camelCase (targetDate, answer), the API expected snake_case (target_date, body).**
Decision: Pydantic schemas in `pairly/api/schemas.py` with `Field(alias=...)` for inputs + `populate_by_name=True`, plus `validation_alias` for fields whose python name is snake_case but the wire form is camelCase. Output is always camelCase via `serialization_alias`.
Alternative: change the client to snake_case — rejected, would break JS conventions across the whole Mini App.
✅ **CLOSED 2026-06-16:** all POST/POST-status endpoints now accept either casing on the way in, serialize camelCase on the way out. 9 new Pydantic-only tests in `test_api_schema.py`. Live smoke on VPS: `POST /api/countdowns` with `{label, targetDate}` returns 401 (auth) — not 500 (validation) — confirming the schema accepts the wire shape.

---

## 2026-06-16 — Hotfix round 2 (4 user-reported issues)

**19. CountdownOut serialized as `target_date` (snake) — client read `targetDate` → NaN.**
Decision: `target_date: datetime | None = Field(default=None, serialization_alias="targetDate")`. Output JSON has `targetDate`. Verified live: `serialized: {'targetDate': datetime(2026,12,12,0,0), ...}`.
Alternative: change client to read `target_date` — rejected, breaks JS convention across whole Mini App.

**20. WishlistStatusUpdate required `status`, but `/api/mark-done` client sends only `{item_id}`. → 422, optimistic update reverted.**
Decision: `status: str = Field(default="done", ...)`. The `/api/mark-done` endpoint treats absent status as "mark done". The RESTful `/wishlist/{id}/status` still requires status explicitly.
Alternative: two separate schemas for the two routes — rejected, adds code for no real benefit (mark-done is just sugar).

**21. GiftItemOut had `i_am_giver: bool` only — client used `direction: "me"|"them"`.**
Decision: compute both in `_to_gift_out`. `direction` and `i_am_giver` now both serialized.

**22. actOnGift on client sent `body: {action}` but server expected `body: {status}` (and action was the URL param). After my refactor of the URL, client still passed the wrong field.**
Decision: client now maps `Action` (accept/decline/redeem/complete) → `GiftStatus` (claimed/declined/redeemed/complete) before calling the endpoint with `{status}`. Helper in `act()` does the mapping.

**23. cd.yml was failing email notifications every push.**
Decision: changed `on:` to `workflow_dispatch` (never auto-triggers) and replaced the "stub" job with a no-op `notify` job that just prints a message. The workflow now never "fails" in the email sense. To re-enable: provision VPS secrets, uncomment the deploy job.
Alternative: delete the file — rejected, leaves a "missing workflow" gap that's harder to fix later.
✅ **All 4 reported issues closed.**

---

## 2026-06-16 — Wire-format root cause + bot experience overhaul

**24. Mood/QOTD save "did nothing" — root cause was a CASCADING wire-format mismatch, not the save buttons.**
`_CamelModel` had NO `alias_generator`, so every `response_model=` route serialized snake_case (`set_at`, `mine`, `partner_name`). The client read camelCase (`self`, `partnerName`, `setAt`). Mood was structured `mine/partner` (client: `self/partner`); QOTD was nested `{mine:{body}}` (client: flat `{myAnswer, partnerAnswered, partnerAnswer}`). Mock data matched the client, so the UI was NEVER tested against the real backend — the bug only surfaced in production.
Decision: ONE `to_camel` `alias_generator` on `_CamelModel` fixes ALL casing at once; restructure Mood (`mine`→`self`) and QOTD (nested→flat) to the client's shape; add `partner_has_answered()` non-leaking check for `partnerAnswered`; populate `partnerName` on mood/qotd/gifts. 6 new contract tests in `test_wire_format.py`.
Alternative: change the client to the server's shapes — rejected (the client is the product surface; also would have hidden the deeper casing bug). PROOF: live signed requests on VPS now return `{self:{mood}, partnerName}` / `{myAnswer, partnerAnswered}` / `{targetDate}`.

**25. Forwarded albums spammed "Как это назвать?" ×(N−1).**
A Telegram album arrives as N updates sharing one `media_group_id`, only the first carrying the caption. Each caption-less photo entered the FSM-title flow (and clobbered state).
Decision: in-memory `media_group_id` dedup (300s TTL set) — first photo per group is handled, the rest ignored. A caption-less album gets default title "Альбом" instead of prompting.
Alternative: Redis-based album aggregator — rejected (premature for a single bot process; the map is tiny).

**26. Partner notifications: API and Bot are separate processes — how does the API send a Telegram message?**
The API (uvicorn) has no handle to the Bot running in the bot process. Options: (a) inter-process queue/Redis pubsub, (b) the API builds its own `Bot(token)` and calls `send_message` directly.
Decision: (b). `Bot` is cheap to construct (stateless HTTP client), so `pairly/bot/notify.py` lazily builds one per process. Avoids Redis/queue infra for MVP. Risk: per-process cooldown state (a pair hitting both processes could double-fire on mood/qotd) — accepted because gifts/wishlist (the always-notify path) are single-process, and mood/qotd are cooldown-soft.
Alternative: Redis pubsub where the API publishes and the bot consumes — rejected for MVP infra cost; revisit if we add a second API worker.

**27. Notification spam vs intimacy — which actions notify, and how often.**
Decision: gifts (received/redeemed) + wishlist additions ALWAYS notify (rare, relationship-core); mood (30-min cooldown) and qotd (60-min cooldown) are soft-gated (they repeat). Never notify the actor about their own action. Silent if the partner blocked the bot. `notify_*` NEVER raises (best-effort — a delivery failure can't abort the business operation).
Alternative: notify on everything, no cooldown — rejected (kills intimacy); notify on nothing but a daily digest — rejected (misses the "they're thinking of you" moment that's the whole point).

**28. Bot had no "/" command menu and no menu button.**
Decision: `pairly/bot/menu.py` registers the command list (start/pair/list/app/help, Russian descriptions) + a chat-menu button that opens the Mini App directly, on Dispatcher startup (works in polling AND webhook). `/help` and `/list` reformatted with feature emojis + counts; `/list` caps at 15 with a teaser.
Alternative: a custom ReplyKeyboard — rejected (clutters the chat; the Mini App is the rich UI).

**29. `pair_start_kb` and `wishlist_category_kb` are defined but unused.**
Decision: left in place (no harm), flagged here. `pair_start_kb` was superseded by the `/pair` deep-link text; `wishlist_category_kb` (category override on forward) was never wired. To close: either wire category buttons into the forward flow, or delete. DEFERRED — not blocking.

---

## 2026-06-16 — Material3 + gamification (user request, OPEN)

**30. "Мы переходили на Material3" — no Material3 migration is in the codebase.**
The Mini App is styled with Tailwind + Telegram CSS variables (var(--tg-theme-*)), following the user's device light/dark scheme. The recent "visual refresh" commits (cb2b43f, 482e886) are a Telegram-native SOFT design (rounded cards, soft shadows, fade/pop keyframes), NOT Material Design 3.
Decision: do NOT bolt on a Material3 component library (md3/Material Web) — it would (a) fight the Telegram theme vars (M3 brings its own tonal color system), (b) add ~heavy bundle weight to a 6-screen app, (c) visually clash with the native Telegram UI the Mini App lives inside. The Telegram-native approach is the better fit for a Telegram Mini App.
Alternative (if the user really wants M3): adopt only M3 *principles* (tonal elevation, FAB, ripple) via Tailwind, not a lib. DEFERRED — needs user confirmation since the request conflicts with the established design direction.
Status: **needs user input** — is "Material3" a hard requirement or a loose descriptor for "make it look modern"?

**31. Gamification — there is a SOFT milestone system, no XP/streaks/leaderboards.**
Current state: `pairly/repositories/milestones.py` + `miniapp/src/lib/milestoneBus.ts` emit soft one-time toasts (5 wishlist / 5-10 countdowns / 7 qotd / 3-10 gifts). This is deliberately gentle — Pairly is an intimacy product, not a game; competitive mechanics (streaks, scores, "you're behind your partner") were previously rejected as pressure-inducing.
Decision: KEEP the soft milestone system as the gamification layer. Do NOT add streaks/XP/levels/leaderboards — they contradict the product's anti-pressure stance (see mood-sync.md "NEVER nudge the silent partner").
Alternative the user may have meant: richer milestone tiers + a gentle "shared memory counter" (e.g. "вместе 100 дней", total gifts given) shown as ambient stats, not goals. VIABLE — tracked as a possible enhancement once the user confirms scope.
Status: **needs user input** — what flavor of gamification? (a) nothing more [current], (b) ambient shared-counters, (c) full XP/streaks [recommend against].

**32. Forward bug — album "Как это назвать?" ×3 (user report 2026-06-16 23:30).**
Root cause analysis: the album-dedup (`_is_album_followup`, keyed on `media_group_id`) WAS present and is deployed. The reported 3 prompts came from a version/container older than rev e3eacff, OR from 3 individually-forwarded caption-less photos (no shared `media_group_id` — the dedup can't group them, each legitimately needs a name).
Decision: dedup stays (handles true albums); added `/cancel` + non-text FSM fallback so a stuck title flow is always escapable and never silently drops input. Did NOT add cross-photo batching for unrelated forwards — that would merge distinct items the user intended as separate.
Alternative: prompt once for N rapid forwards, let the user title a batch — rejected (ambiguous; merges distinct wishes).

**33. CI now builds the Mini App — committed `miniapp/dist` is a transitional artifact.**
The Mini App `dist/` is still git-tracked because docker-compose mounts it into Caddy and the VPS doesn't yet build from npm. The user wants `npm run build` ON the VPS (so dist isn't shipped from the dev machine).
Decision: staged. (1) DONE — CI now typechecks + builds the Mini App on every push, so the build is always green. (2) TODO — add a build step to the VPS deploy (a `miniapp-build` service or a Makefile target run before `docker compose up`), then untrack `dist/`. Tracked here; not breaking the working deploy until the VPS build path exists.
