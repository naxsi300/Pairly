# Pairly e2e tests

End-to-end + regression coverage for Pairly. Two tracks:

- **Mini App (Playwright, TypeScript)** — drives the React Mini App (`miniapp/`)
  against the Vite dev/preview server. Runs in **mock mode** by default.
- **Bot (pytest, in-process)** — exercises the repository/bot layers against an
  in-memory SQLite DB. No real Telegram (a self-hosted telegram-bot-api harness is
  a noted future task, not MVP).

## Quick start

From the repo root:

```bash
make e2e            # build miniapp (mock) + playwright + pytest bot e2e
make e2e-playwright # just the Mini App suite
make e2e-bot        # just the in-process pytest bot suite
```

First run installs Playwright's chromium browser and the npm deps for both
`e2e/` and `miniapp/`.

To run Playwright directly (after `make e2e-playwright` has built the app once):

```bash
cd e2e
npx playwright test                 # mock-only (default)
npx playwright test --headed        # watch it
npx playwright show-report          # open the last HTML report
```

## Mock vs real

| Track | Default | What it hits |
|-------|---------|--------------|
| Playwright mock specs (`specs/*.spec.ts`) | **on** | the Mini App's client-side mock (`miniapp/src/sdk/mock.ts`). No network. |
| Playwright real-API specs (`specs/real-api/`) | **off** | the FastAPI backend directly. Enable with `E2E_RUN_REAL_API=1`. |
| pytest bot e2e (`bot/`) | always | in-memory SQLite via the repository layer. No Telegram. |

### Why mock mode is the default

The backend ships only `/api/health`, `/api/wishlist` (GET/POST), and
`/api/mark-done` today (see `docs/open-decisions.md` #14). The Mini App also calls
bucket / countdown / mood / qotd / gifts endpoints, which exist only as the
client-side mock until the backend catches up. Mock mode keeps the full UI
exercisable and green now; the real-API specs are gated so they never fail red for
a missing feature.

To run the real-API subset:

```bash
# terminal 1
make api                       # uvicorn pairly.api.app:app --port 8000
# terminal 2
cd e2e && E2E_RUN_REAL_API=1 E2E_API_URL=http://localhost:8000 npx playwright test specs/real-api
```

### Build env caveat (why `make e2e` sets `VITE_API_URL`)

The mock parses the request URL with `new URL(...)`, which requires an **absolute**
URL. If `VITE_API_URL` is empty the app passes a bare `/api/...` path and the mock
throws, so every screen errors. `make e2e-playwright` therefore builds the miniapp
with `VITE_USE_MOCK=true VITE_API_URL=http://localhost:8000`. The host is
irrelevant — the mock only inspects `url.pathname`. Keep this in mind if you run
`vite` by hand: set both vars (e.g. in `miniapp/.env`).

## The reveal-gate test (load-bearing)

`specs/qotd.spec.ts` is the most important test in this suite. It guards the
**QOTD reveal-gate invariant** (`docs/flows/question-of-the-day.mmd` "RevealGate"):
a partner must never read the other's answer before posting their own. Breaking it
poisons the feature.

What it asserts:

- **Before I answer:** the entire "answers" card is absent from the DOM — only the
  locked "answer first" prompt renders. If the `!iAnswered` guard in
  `QuestionOfTheDay.tsx` were removed, the card would render and the test fails.
- **After I answer:** my answer renders; the partner slot shows the warm "waiting"
  copy and NO partner answer body (the mock seeds `partnerAnswered=false`).

### Known strength limitation

A *canary* test (planting a known partner answer into the payload and asserting
its pre-answer absence in the DOM) would be strictly stronger, but it requires
either a real `/api/qotd` backend or a test seam in the mock. The client-side mock
bypasses the network, so Playwright's `page.route` cannot inject a canned partner
answer. This is tracked as a follow-up once the QOTD endpoint lands
(open-decisions #14). The structural assertion above is the honest, non-flaky
guard we can run today.

## Skipped scenarios

| Spec | Reason |
|------|--------|
| `specs/real-api/*` (2) | Off by default; set `E2E_RUN_REAL_API=1` and run the API server. |
| `gifts.spec.ts › declining a received gift…` | Needs a `direction:"them" + status:"received"` gift the mock can't be coerced into (it bypasses the network) and `/api/gifts` isn't shipped yet. The static half (no "rejected"/"отклонён" in the status-label map) IS asserted. Re-enable when the gifts endpoint or a mock seam lands. |

## Health check

`scripts/smoke.sh` — cron-able `GET /api/health` → expect `200 {"status":"ok"}`.
`health/smoke.yml` — the same contract as YAML for config-driven monitors.

```bash
E2E_API_URL=https://pairly.example.com ./e2e/scripts/smoke.sh
```

## Layout

```
e2e/
  package.json            Playwright + TS deps
  playwright.config.ts    chromium project, phone viewport, ru-RU locale
  tsconfig.json
  .env.example            E2E_MINIAPP_URL / E2E_API_URL / E2E_RUN_REAL_API
  lib/copy.ts             Russian UI strings mirrored from miniapp/src/copy.ts
  specs/
    pair.spec.ts          smoke: load + tab navigation
    wishlist.spec.ts      add → list → mark-done; limit-hit banner
    qotd.spec.ts          ★ reveal-gate invariant (load-bearing)
    mood.spec.ts          latest-only; no history graph
    gifts.spec.ts         catalog + send; warm-copy guard
    real-api/             gated real-backend health + wishlist-header checks
  bot/
    conftest.py           in-memory SQLite + async session fixtures
    test_pair_flow_e2e.py invite→accept→shared→dissolve; rejections
    test_forward_to_wishlist_e2e.py  parse→create→list; dedupe; limit; gate
  scripts/smoke.sh        daily /api/health smoke
  health/smoke.yml        same contract as YAML for monitors
  README.md               this file
```
