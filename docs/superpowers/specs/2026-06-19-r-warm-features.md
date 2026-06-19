# R-warm Features Suite — Design Spec (SDD)

**Source of truth for design:** `/tmp/pairly_design/warm-lib.mjs` (the R-warm design system from the approved gallery at `http://192.168.1.3:8847/gallery`). Every screen must look 1:1 like its mock in `/tmp/pairly_design/features.mjs`. The LAN gallery is offline; the lib IS the design.

**Goal:** Port the R-warm design system into the real Mini App (`miniapp/src/index.css` + components), then implement every approved feature using it. 8-hour window, equal time per feature, last hour for integration/e2e.

**Process:** SDD — this spec → TDD per feature (failing test → impl → pass → commit) → deploy → e2e.

## R-warm Design System (port into real app)

The real app currently uses Telegram-derived M3 tokens only. R-warm adds a **warm coral accent** (`--tg-warm:#ff6b6b`) and a set of component classes. The port keeps M3 as the base and layers R-warm on top — both coexist (cards stay `card-m3`, R-warm adds `hero-warm`, `btn-warm`, `pair-bar`, `chip`, `emoji-opt`, `mood-opt`, `countdown`, `empty`, `meta`, `section-label`, `heading`, `sub`).

**Tokens to add to `index.css` `:root`** (light) + dark `@media`:
```css
/* R-warm accent — the chosen warm coral (light/dark differ slightly for legibility) */
--warm: #ff6b6b;
--warm-on: #ffffff;
--warm-container: color-mix(in srgb, var(--warm) 12%, var(--m3-surface-container));
```
dark: `--warm: #ff8a7a;` (lifted for dark bg).

**R-warm component classes** (append to `index.css`, verbatim values from warm-lib, namespaced under `rw-` to avoid clashing with M3 `card-m3`):
- `.rw-hero-warm` — warm gradient hero (22px radius, soft shadow). For CTAs on Home.
- `.rw-btn-warm` — warm-filled button.
- `.rw-pair-bar` — two-column ambient "you / partner" row.
- `.rw-chip` / `.rw-chip.is-active` — pill selectors.
- `.rw-emoji-opt` / `.is-active` — emoji tile picker (4-col grid).
- `.rw-mood-opt` / `.is-active` — 2-col mood tile.
- `.rw-countdown` + `.rw-cd-unit` — countdown blocks.
- `.rw-empty` — centered empty state.
- `.rw-section-label`, `.rw-heading`, `.rw-sub`, `.rw-meta`.

> Mapping decision: rather than 1:1 class names from the static lib (which collide with existing `card`, `btn`), I namespace `rw-`. Visual values are identical. This lets M3 and R-warm coexist without rewriting every existing screen's markup in one pass.

## Approved Features (from roadmap MUST/SHOULD, user-confirmed)

Dropped by user: radar/geo, time-capsule, shared-playlist, memory-gallery, love-languages, weather, mood-sync (privacy), bot-collector (redundant). **These are NOT built.**

Built, in order:

1. **R-warm port** (foundation) — tokens + `rw-*` classes into `index.css`. No feature; enables everything.
2. **Home + 3-tab nav** (`f-screens-rationalize`) — dashboard composing ambient cards; Bucket/Countdowns/Gifts/QOTD as destinations. (plan already at `docs/superpowers/plans/2026-06-19-home-rationalize.md`).
3. **Date-wheel** (`f-date-wheel-keep-rescoped`) — spin from open wishlist, no geo. Modal in Home.
4. **Mood keep-as-is + warm restyle** (`f-mood-keep-as-is`) — Mood screen restyled R-warm; stays a tab; no sync/push.
5. **Wishlist repeat** (`f-wishlist-repeat`) — done-item "повторить" returns it to open.
6. **Daily question coupling** (`f-qotd-coupling`) — QOTD as a Home card + reveal flow (already exists as screen; couple to Home).
7. **Occasion nudges** (`f-occasion-nudges`) — nearest-countdown card on Home + (optional) bot reminder hook.
8. **Rituals/plans** (`f-rituals-plans`) — weekly ritual checklist section on Home.
9. **Mood history** (`f-mood-history`) — last-7-days ambient mini-chart on Mood screen (read-only, no raw logs).
10. **Love notes** (`f-love-notes`) — Telegram-native scheduled note via bot (no geo). Backend table + bot command + Mini App inbox.

**Two-tap consent** (`f-triage-two-tap`) — flagged in roadmap as MUST but most invasive (schema + bot + API + UI). Time-boxed: attempt within the window; if it risks the last-hour integration, defer to a follow-up plan (documented).

## Per-feature build contract
Each feature: write spec-section (above), failing test, impl, passing test, commit. Frontend uses `vitest`+`@testing-library/react`; backend uses `pytest`. Build must pass (`npm run build`) after each frontend task. Deploy after the last feature + integration hour.

## Non-goals
- No geo/location/radar (user-rejected).
- No mood-push notifications (privacy).
- No memory-gallery / time-capsule / playlist / love-languages (user-rejected).
- No redesign of screens not in the approved list beyond what R-warm port gives them.
