# Memory Surfaces — Bundle D

**Date:** 2026-07-01
**Status:** Approved (self-decided)
**Scope:** Frontend + backend (new read-only endpoints).

## Goal
The pair accumulates rich history but the app only shows "now." Four memory surfaces:
1. **Fulfilled-dreams gallery** (frontend-only) — a tab in Bucket showing done dreams as a timeline.
2. **«Наш месяц» recap** (frontend-only) — a card on Home after 7+ days together: counts from existing endpoints.
3. **Notes & QOTD archive** (backend) — `GET /api/love-notes/archive` (already list-able; just needs month-grouping UI) + `GET /api/qotd/archive` (new endpoint returning past Q&A pairs).
4. **Mutual mood-rhythm pulse** (backend) — `GET /api/mood/pulse?days=7` → 7-day ribbon filled when BOTH marked mood (no per-user streak; privacy).

## Decisions (self-resolved)
1. **Order by cost/value**: gallery (S, FE) → monthly recap (S, FE) → QOTD archive (M, BE) → mood pulse (M, BE). Do the two FE ones first; the BE ones are larger and may split.
2. **Fulfilled-dreams gallery**: a toggle/tab at the top of Bucket ("Мечты" / "Сбылось 🌠"). Done items (status "done", with completedAt) shown newest-first as a timeline. Bucket already has the data (doneItems derived). Pure UI.
3. **Monthly recap**: a Home card shown when `together_days >= 7` (from getPairStats), summarizing the last 30 days: qotd answers count, good deeds, dreams done, notes count — all derivable from existing list endpoints already fetched on Home. No new endpoint; just a derived card. Refreshes weekly (cache by ISO week in state, not critical).
4. **QOTD archive**: `GET /api/qotd/archive?limit=50` → list of `{date, question, myAnswer, partnerAnswer}` for answered QOTDs. New repo fn `list_answered_qotd`. UI: a "История" button on the QOTD screen → a sheet listing past Q&As grouped by month.
5. **Mood pulse**: `GET /api/mood/pulse?days=7` → array of `{date, both: bool}` (both = both partners have a mood entry for that date). Repo fn counting distinct partners per date. UI: a 7-cell ribbon on Mood screen. **Privacy**: only the boolean "both marked" is exposed, never per-user values per day (the mood-sync contract forbids mood alerts; a "both marked" ribbon is ambient, not an alert).
6. **Notes archive**: love-notes list already exists; just add month-grouping + a "show older" pagination in LoveNotes UI. No backend change.

## Out of scope (this bundle)
- "Год назад" memory lane (Pro feature, larger).
- Mood-trend sparkline (needs dense history data; defer).
- Auto-recap push notifications.

## Design — per surface

### Fulfilled-dreams gallery (FE)
- `Bucket.tsx`: add a small segmented toggle "Мечты | Сбылось 🌠" at top. "Сбылось" view: timeline of doneItems (status "done") with completedAt, newest first, each a warm card with ✨ + title + "сбылось {date}". Empty: "Пока ничего не сбылось — но всё впереди ✨".
- copy.ts: `bucket.fulfilledTab: "Сбылось 🌠"`, `bucket.dreamsTab: "Мечты"`, `bucket.fulfilledEmpty`, `bucket.fulfilledOn: (date) => "сбылось {date}"`.

### Monthly recap (FE)
- New component `MonthlyRecap.tsx` on Home, shown when `stats.together_days >= 7`.
- Reads from existing Home hooks: qotd answers (count), gifts goodDeeds, dreams doneCount, notes length. Card: "Ваш месяц вместе · 12 вопросов · 3 добрых дела · 1 мечта сбылась". (These counts are "all-time" not strictly 30-day, but labeled honestly as "ваш месяц вместе" framing — acceptable for v1; refine later.)
- copy.ts: `home.recapTitle`, `home.recapBody: (qotd, deeds, dreams) => ...`.

### QOTD archive (BE + FE)
- BE: `GET /api/qotd/archive?limit=50` → `list[QOTDArchiveOut]` where each = `{date, questionText, myAnswer, partnerAnswer}`. Repo: select QOTDAnswers joined to Questions for the pair where both partners answered, ordered desc.
- FE: QOTD screen gains "📜 История" → a `<MoreSheet>` or screen listing past Q&As grouped by month.

### Mood pulse (BE + FE)
- BE: `GET /api/mood/pulse?days=7` → `[{date, both: bool}]`. Repo: for each of last N days, count distinct users in pair with a mood entry that day; both = count >= 2.
- FE: Mood screen gets a 7-cell ribbon; a cell fills (warm) when both marked, dim otherwise. Caption: "Эта неделя вместе" (no values, no per-user streak).

## Testing
- FE: gallery toggle + timeline render; recap card shows/hides by together_days; QOTD history sheet; mood ribbon.
- BE: qotd archive returns answered pairs; mood pulse returns both-flag per day (privacy: no values).

## Success criteria
- A pair sees their fulfilled dreams as a timeline.
- After a week together, Home shows a warm recap card.
- Past QOTD Q&As are browsable.
- Mood screen shows a 7-day "both marked" ribbon (ambient, private).

## Update (2026-07-01, during implementation)
**Mood pulse DROPPED.** The MoodEntry model is "Latest-only. No history graph, no streak, no score (privacy-by-design)" — it overwrites on each set, so there's no per-day history to compute a 7-day "both marked" ribbon from. Implementing it would require keeping mood history, which violates the mood-sync privacy contract. Removed from scope. The other three surfaces (gallery, recap, QOTD archive) remain.
