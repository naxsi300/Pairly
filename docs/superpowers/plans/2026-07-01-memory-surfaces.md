# Memory Surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Fulfilled-dreams gallery + monthly recap (FE-only, do first) + QOTD archive + mood pulse (BE+FE).

**Architecture:** Two FE-only tasks (Bucket tab, Home recap), then two BE+FE tasks (qotd archive endpoint+UI, mood pulse endpoint+UI). Do FE tasks first (immediate value, no backend risk).

**Tech Stack:** React+TS+Vite (FE), FastAPI+SQLAlchemy2 (BE), vitest+pytest.

## Global Constraints
- Russian copy in copy.ts. Colors via var(--tg-*).
- Privacy: mood pulse exposes ONLY "both marked" bool, never per-user values. QOTD archive shows answered Q&As only.
- No per-user streaks/leaderboards.
- TDD; frequent commits.

---

### Task 1: Fulfilled-dreams gallery (FE)
- Files: `Bucket.tsx`, `copy.ts`, `Bucket.test.tsx`.
- Segmented toggle "Мечты | Сбылось 🌠"; "Сбылось" = timeline of doneItems (status "done") newest-first with completedAt.
- copy: fulfilledTab, dreamsTab, fulfilledEmpty, fulfilledOn(date).
- Test: toggle switches view; done items in timeline; empty state.

### Task 2: Monthly recap card (FE)
- Files: new `MonthlyRecap.tsx`, `Home.tsx`, `copy.ts`, test.
- Show when `stats.together_days >= 7`; reads existing Home counts (qotd, goodDeeds, doneCount, notes).
- copy: recapTitle, recapBody(qotd,deeds,dreams).
- Test: hidden < 7 days; shown >= 7 with counts.

### Task 3: QOTD archive (BE+FE)
- BE: `GET /api/qotd/archive?limit=50` → repo `list_answered_qotd` (join QOTDAnswer+Question, both answered, desc). + test.
- FE: QOTD screen "📜 История" → sheet listing past Q&As grouped by month. + test.
- copy: qotd.historyButton, qotd.historyTitle, qotd.historyEmpty.

### Task 4: Mood pulse (BE+FE)
- BE: `GET /api/mood/pulse?days=7` → `[{date, both}]` (both = >=2 distinct users with mood that day). + test (privacy: no values).
- FE: Mood screen 7-cell ribbon; fill warm when both. + test.
- copy: mood.pulseCaption.

### Task 5: Full build, test, deploy

## Self-Review
- 4 surfaces covered, FE-first ordering, privacy preserved.
