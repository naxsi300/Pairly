# Design: Home cards as live previews + full R-warm consolidation

**Date:** 2026-06-22
**Status:** Design approved (all sections) — pending implementation plan
**Owner:** frontend (miniapp), presentation-layer only

## Context / Problem

Two issues, one root cause each:

1. **Home cards are empty nav in content-card clothing.** On `miniapp/src/screens/Home.tsx` the three bottom cards — 🌌 Мечты (Bucket), 🎁 Подарки (Gifts), 💌 Записки (LoveNotes) — are pure-navigation `EntryCard`s (emoji + title + static subtitle + `›` chevron). They sit on the same `.card` surface as the live ambient cards above (mood / occasion / QOTD), which show real data. With nothing inside, they read as menu links pretending to be content — the "unnatural" feeling the user reported.

2. **Two coexisting design systems.** The app runs M3 (`--m3-*` tokens, `card-m3`/`input-m3`/`surface-m3`/`btn-m3-*`/`text-m3-*`) **and** R-warm (`--tg-*`, `.card`/`.card-title`/`.card-sub`/`.meta`/`.section-label`/…/`.rw-*`). R-warm is ~70 % adopted; M3 persists and is the root cause of the "black pills" in dark mode (M3 containers derive from Telegram's `--tg-theme-secondary-bg-color`, which in a dark Telegram theme turns cards black). An automated fidelity audit (13 agents) found **0 clean clusters, 9 major / 4 minor, ~110 deviations**: 18 HIGH (M3 leftovers + hardcoded `text-red-500`), 22 MED, ~70 LOW.

## Goals

- Home cards become **live previews** (variant **A — dissolve**): each card shows a live element + counter, indistinguishable from the ambient cards; the card with a pending action (a gift waiting) warms up via `.hero-warm`. Tap → its page.
- Consolidate onto a **single** design system (R-warm): purge M3 completely.
- Destination pages: R-warm + **UX-aligned** with their card (the page answers the card's promise).
- Finish the R-warm fidelity sweep across the whole app.

## Non-goals (explicit)

- Home feed length / IA rework (the feed is ~10 cards; separate task).
- Admin-menu polish utilities (`.meta-mono` / `.card-highlight` serve admin only).
- Backend schema/API changes — all needed data already exists via `listBucket` / `listGifts` / `listLoveNotes` / `getPairStats`.
- Real-time geo, "time apart", jealousy features (CLAUDE.md hard non-goals).

---

## Phase 0 — Foundation: full M3 purge

Presentation-layer only. No API/DB. Touches `index.css`, className/style in TSX, lint, CI.

### 0.1 `index.css` — three operations, in safe order (a → b → c)

**(a) Rewire ~30 surviving `--m3-*` references** in the R-warm sections (`rw-*` block lines ~368–617, the canonical token bridge `--tg-button: var(--m3-primary)` ~625–637, `.card-act.danger` ~779–780, `--warm-container` ~116) to `--tg-*` per the mapping table below. Relocate the **ripple** primitives (`.ripple-container`/`.ripple-effect`) out of the M3 `@layer` into the canonical R-warm block (they are not "M3 in spirit"; needed by `Ripple.tsx`/Countdowns/admin), rewiring `--m3-on-surface` → `--tg-text`.

**(b) Add `--tg-danger`** — light `#dc2626`, dark `#ff453a`, with fallback to `--tg-theme-destructive-text-color`. There is no danger token today (hence `text-red-500`). Point `.card-act.danger` at it.

**(c) Delete the entire M3 layer (~275 lines):** the M3 token block (~63–105: `--m3-primary`/`surface*`/`outline*`/`error`, shape, elevation) and the M3 `@layer components` (~138–338: `card-m3`, `card-m3-low`, `btn-m3-filled/outlined/text/icon`, `input-m3`, `surface-m3`, `navbar-m3`, `text-m3-*`). The `--m3-shape-*` / `--m3-outline*` / `--m3-elevation-*` tokens live only inside this block and die with it — no rewiring needed.

#### M3 → R-warm token mapping

| M3 | → R-warm |
|---|---|
| `--m3-on-surface` | `--tg-text` |
| `--m3-on-surface-variant` | `--tg-hint` |
| `--m3-primary` | `--tg-button` |
| `--m3-on-primary` | `--tg-button-text` |
| `--m3-surface` | `--tg-bg` |
| `--m3-surface-container` (-lowest/-high) | `--tg-sec` |
| `--m3-error` | `--tg-danger` (new) |

### 0.2 Codebase sweep (TSX) — 21 spots

**6 M3-class usages** (`card-m3`/`input-m3`/`surface-m3`/`text-m3-*`/`btn-m3-*`) in `Field`, `Modal`, `Gifts`, `Stats`, `Toast` → canonical R-warm classes (`input`/`card`/`.card-title`/`.card-sub`/`.meta`/`.section-label`/`.btn`/`.btn-ghost`/`.btn-warm`).

**15 inline `var(--m3-*)` references** → mapping or canonical class:
- `Button` ×2 (`--m3-error`) → `--tg-danger`
- `Wishlist` ×4 (chip colors: `--m3-primary-container` etc.) → `.chip` / `.chip.is-active`
- `Mood` (`--m3-error`) → `--tg-danger`
- `Countdowns` ×2 → `.chip` / canonical
- `Toast` ×3 (`--m3-elevation-3`/`surface-container-high`/`on-surface`) → `.toast` class
- `Ripple` (`--m3-on-surface`) → `--tg-text`
- `LimitBanner` (`--m3-primary-container`) → `--tg-button` / banner class
- `App` (`--m3-primary`) → `--tg-button`

### 0.3 Lint guard

`miniapp/scripts/check-no-m3.sh` — `grep -rn "m3-\|--m3" src index.css --include=*.tsx --include=*.css` → non-zero exit on match; wired as a CI step. Plus one vitest test that reads the sources + `index.css` and asserts zero `m3` occurrences (regression net).

### 0.4 Verification (Phase 0 DoD)

- `npm run build` — 0 TS errors; `npx vitest run` — green (tests do not depend on M3 classes).
- `grep -rn "m3" src index.css` → **0**.
- Light **and** dark theme screenshot of key surfaces (Home, a Modal, a Toast, a chip). Pass criterion: cards are **not** "black pills" in dark mode. `--tg-*` are fixed to the gallery palette, so the purge must not regress.

**Risk:** dark-mode visual regression from a wrong rewire. Mitigation: order (a)→(b)→(c); 1:1 mapping to already-working `--tg-*`; screenshot verify both themes.

---

## Phase 1 — Home cards (variant A: dissolve)

### 1.1 Data — no new endpoints

Add three `useApi` hooks to `Home.tsx` (`listBucket`, `listGifts`, `listLoveNotes`) and derive everything client-side. Lists are tiny (free-tier caps); parallel fetch on mount is fine. `getPairStats` lacks bucket/notes counts and the live element (dream title, gift gesture) needs the list anyway, so a separate meta-endpoint is unnecessary (YAGNI).

### 1.2 `PreviewCard` component (replaces `EntryCard`)

Variant A = indistinguishable from ambient cards (not `card-row` + chevron):

```tsx
<button className={warm ? "hero-warm" : "card"} onClick={…}>
  <div className="section-label">{label}</div>
  <div className="card-title">{title}</div>
  <div className={metaWarm ? "meta" : "card-sub"}>{meta}</div>
</button>
```

`warm` is dynamic (decides `.hero-warm` vs `.card`).

### 1.3 Per-card content

| Card | Title (live) | Meta | Empty | Warm? |
|---|---|---|---|---|
| 🌌 **Мечты** | a random **open** dream (`status==="dreaming"`) | `и ещё N мечтаем · M сбылось →` | `Добавьте первую мечту →` | no (always `.card`) |
| 🎁 **Подарки** | gift waiting for you (`direction==="them"` & `status==="received"`) → `примите`; else last good deed | `N в пути · M добрых дел →` | `Подарите доброе дело →` | **yes** when one waits |
| 💌 **Записки** | `N новых` (**no body**) | `последняя X дн. назад →` | `Напишите тёплые слова →` | no |

- **Мечты random:** stable pick per mount — `useMemo(() => pickRandom(openItems), [openItems])`. Doesn't flicker on re-render; refreshes when the list changes / on tab return.
- **Записки "X дн. назад":** from the latest note's `createdAt` (verify the field name at implementation; use the existing date-format util).
- **Privacy (Записки):** the body is never rendered on Home — only the count. (Fetching the list is authenticated + pair-scoped; a body-less meta endpoint was considered and rejected as YAGNI.)

### 1.4 Copy

Add to `copy.ts` → `home`: `cardDreamsTitle` / `cardGiftsTitle` / `cardNotesTitle` + meta + empty strings. No inline Russian literals in components (CLAUDE.md).

### 1.5 Placement

Three cards remain at the **bottom of the feed** (today → this week → collections). Only their content and surface change. *Out of scope:* the feed itself is long (~10 cards) — separate task.

### 1.6 Tests (`Home.test.tsx`, extend)

- Мечты: with items → a dream title from open items + counter; empty → empty CTA.
- Подарки: a waiting gift → gesture + `примите` + `hero-warm` class; none waiting → last good deed; empty → CTA.
- **Записки (privacy):** a note body is **not** rendered on Home — only the counter.
- Random: the shown dream title ∈ open dream titles.

### 1.7 Error handling

Each list via its own `useApi`. On error, the card renders label + muted `…`; the rest of the feed is unaffected (current behavior). Build + vitest green.

---

## Phase 2A — Three destination pages (R-warm + UX alignment)

### 🌌 Bucket (Мечты) — R-warm cleanup, minimal UX

- List of dreams (`dreaming`/`done`) on `.card`; done items → `.card.done` (strikethrough, dimmed — class exists).
- `text-[15px] font-medium text-tg-text` → `.card-title`; `text-sm/xs text-tg-hint` → `.card-sub`/`.meta`; `text-red-500` → `--tg-danger`.
- **No hero** — the list is the content; the card leads to the list. Avoid redundancy.

### 🎁 Gifts (Подарки) — R-warm + action-first reordering (real UX improvement)

- If a gift "ждёт вас" (`direction==="them"` & `status==="received"`) exists → lift it into a `.hero-warm` card **above the list** with `примите / отклоните`. Directly answers the home card.
- Remaining active gifts (claimed/redeemed) → `.card`s with their actions.
- Good deeds (chronological) → `.section-label` + list.
- Catalog picker grid: `card-m3` already purged in Phase 0 → `.card`. Raw classes → semantic.

### 💌 LoveNotes (Записки) — R-warm cleanup (already nearly there) + unread emphasis

- Unread notes → a warm badge/dot for prominence (replaces the plain text "новое").
- 2 audit spots: `text-[15px] leading-snug text-tg-text` → `.card-title`; loader line → `.rw-empty`/`.meta`.
- Note body stays behind a tap — privacy preserved.

### Tests

- `Bucket.test.tsx`, `Gifts.test.tsx` — extend: Gifts asserts the waiting gift renders first in the hero; status transitions/actions still work; R-warm classes present.
- `LoveNotes` — unread badge.
- Existing screen tests stay green.

### Verification

`npm run build` + `vitest` green; screenshot the three pages in light/dark. Pass criterion: the page visually continues the card (same tone, `.hero-warm` on the action).

---

## Phase 2B — R-warm fidelity sweep (rest of app)

Mechanical sweep of the audit's remaining MED/LOW across: `Wishlist`, `Countdowns` (inline `fontSize:28/700` → `.stat-big`/`.rw-stat`), `QuestionOfTheDay`, `Mood`, and shared components (`Field`, `Modal`, `Toast`, `EmptyState`, `Ambient`, …). raw-tailwind → semantic classes; inline styles → classes. **No new warm-lib utilities needed** — use existing ones. (The audit's `.meta-mono`/`.card-highlight` gaps serve admin only → out of scope.)

### Verification

Build + vitest green; `check-no-m3.sh` green; screenshot the swept screens in both themes.

---

## Audit reference (condensed, self-contained)

Full per-file:line detail will be transcribed into the implementation plan. Headline:

- **HIGH (18):** M3 leftovers (~14) — `card-m3` (Gifts:188, Stats:47), `input-m3`+`surface-m3` (Field/Modal), `--m3-primary-container`/`--m3-on-surface`/`--m3-surface-container*`/`--m3-elevation-3` (Wishlist:306-311, Countdowns:289, Toast:117-120, LimitBanner, App); hardcoded `text-red-500` (×5: Wishlist:202, Bucket:105, Countdowns:203/276, QOTD:58).
- **MED (22):** raw-tailwind duplicating semantic classes (`text-[15px] font-medium text-tg-text`→`.card-title`; `text-sm/xs text-tg-hint`→`.card-sub`/`.meta`; `text-xs uppercase tracking-wide text-tg-hint`→`.section-label`) across Bucket/Gifts/QOTD/forms/admin; medium inline styles (Home:48/140, Countdowns:223/236, Toast:168/178/179, admin).
- **LOW (~70):** cosmetic inline layout (margins/fontSize) → Tailwind utilities; redundant `.stat-big` overrides.
- **Root causes:** (1) incomplete M3→R-warm migration; (2) no danger token; (3) raw-tailwind duplicating semantic classes; (4) inline styles as shortcuts; (5) a few missing utility classes (mostly admin-only).
- **Positive signal:** R-warm is alive and adopted — `.card`, `.card-row`, `.card-title`, `.card-sub`, `.meta`, `.section-label`, `.btn-warm`, `.chip`, `.rw-*` are used everywhere; `--tg-*` tokens are the primary color source. This is a finishing sweep, not a rewrite.

## Deferred / future

- Admin polish: `.meta-mono` / `.card-highlight` / `.code-pill`.
- Home feed length / IA.
- `/api/home` aggregate endpoint (perf, if 6 parallel fetches ever matter).
