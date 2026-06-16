# Pairly Mini App

React 18 + Vite + TypeScript + Tailwind Telegram Mini App for **Pairly** — a shared
notebook for couples (wishlist, bucket list, countdowns, mood, question of the day,
gift-actions). Single-page, bottom-tab navigation, themed via Telegram CSS variables.

## Stack

- React 18 + Vite 5 + TypeScript (strict)
- Tailwind CSS (no component library; colors map to `--tg-theme-*`)
- `@twa-dev/sdk` (typed `WebApp` object)
- PWA via `vite-plugin-pwa` — **shell-only cache** (no offline data sync)

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173 (mock data by default)
```

By default `VITE_USE_MOCK=true`, so the UI runs standalone with canned Russian data
and never touches the network. No backend needed.

## Scripts

| command             | description                                  |
| ------------------- | -------------------------------------------- |
| `npm run dev`       | Vite dev server (mock data by default)       |
| `npm run build`     | `tsc -b` typecheck + `vite build` → `dist/`  |
| `npm run preview`   | serve the production build locally           |
| `npm run typecheck` | typecheck only                               |

## Environment

Copy `.env.example` → `.env`:

| var              | default              | purpose                                              |
| ---------------- | -------------------- | --------------------------------------------------- |
| `VITE_API_URL`   | `http://localhost:8000` | FastAPI Mini App API base URL                     |
| `VITE_USE_MOCK`  | `true`               | when `true`, serve canned data (no network)         |
| `VITE_DEV_PAIR_ID`  | `pair-dev-0001`   | dev-only pair id (header stand-in auth)             |
| `VITE_DEV_USER_ID`  | `user-self`       | dev-only user id (header stand-in auth)             |

To talk to the real backend: set `VITE_USE_MOCK=false` and `VITE_API_URL` to the API
origin (Caddy proxies `/api/*`).

## Architecture

- `src/main.tsx` — entry, PWA SW registration.
- `src/App.tsx` — bottom-tab shell, `useState`-driven tab (no router).
- `src/sdk/api.ts` — `useApi` hook + typed endpoint helpers; mock toggle.
- `src/sdk/mock.ts` — canned Russian data + mock fetch.
- `src/sdk/twa.ts` — TWA init / theme / back-button / haptics.
- `src/screens/*` — one file per tab.
- `src/components/*` — Button, Card, EmptyState, Modal, Field, MoodPicker, LimitBanner.
- `src/copy.ts` — single source of Russian UI strings (mirrors `docs/copy/`).
- `src/lib/format.ts` — pure display helpers (countdown, labels, mood fade).

### Auth (transient)

Pair context is sent via `X-Pair-Id` / `X-User-Id` headers to match the current
backend stub (`backend/pairly/api/app.py`). **TODO(auth):** replace with validated
Telegram `initData` HMAC — the backend derives pair/user from it; the client then
sends `initData`. See `docs/open-decisions.md` #5.

### Privacy invariants enforced in the UI

- **No surveillance**: mood shows latest-only (no graph/streak); no "last updated"
  guilt copy. Moods fade to "не задано" after 24h.
- **QOTD reveal gate (hard)**: the partner's answer is never rendered before the
  viewer posts their own (`src/screens/QuestionOfTheDay.tsx`).
- **Free-tier limits are warm**: 10 wishlist / 10 countdowns / 5 bucket — when hit,
  offer "Оформить Pro" or "Убрать старое", never silently block.

## Bundle

Production build: ~232 KB JS (~72 KB gzip) + service worker (shell-only precache).
```
dist/index.html
dist/assets/index-*.css   ~13 KB
dist/assets/index-*.js    ~232 KB
dist/sw.js + workbox      PWA shell cache
```
