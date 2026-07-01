# Milestone presets + label-based celebration copy

**Date:** 2026-06-22
**Status:** Approved design → implementation
**Scope:** Frontend-only (miniapp). No backend changes, no migration.

## Goal

The "milestone" countdown feature (reference date → round dates like 100 days / 1 year) is **universal** — it works for any reference event, not just relationship-start. The milestone chip's hint already says «любую важную дату». But today the UX doesn't *encourage* adding a custom date, and there is **no celebration** when a round date is reached (the `togetherDays*` celebration copy in `copy.ts` is dead code, never referenced).

This change:
1. Adds **preset chips** when the milestone toggle is on, so a pair can quickly seed a common reference date (still universal — includes «своя дата»).
2. Makes the **celebration copy neutral + label-based**: `«N дней · {label}»`, pluralized, so it works for any reference event without assuming "вместе".

It explicitly does **not** re-introduce the relationship-biased «вместе» celebration copy that was removed earlier. Existing milestone items are untouched.

## Non-goals

- No backend changes. The existing `check_together_days` stats path (which emits `newMilestones` for couple-stats) stays as-is.
- No migration of existing milestone rows.
- No removal of the `stats` copy block (also dead, but out of scope — flagged in code as a follow-up).
- No new endpoints, no new toast bus (reuse `milestoneBus`).

## Design

### 1. Preset chips in the Countdowns add/edit modal

In `miniapp/src/screens/Countdowns.tsx`, when the `milestone` toggle is on, render a horizontal row of **preset chips** below the toggle chip (replacing the current hint paragraph):

`День знакомства 💝` `Свадьба 💍` `Переезд 📦` `Первое свидание ☕` `Своя дата ✍️`

- **Tap a relationship preset** → sets `label` (e.g. «День знакомства») and `emoji` (💝) in the modal's form state. The label field remains editable (user can tweak).
- **Tap «Своя дата»** → clears the preset selection (deselects any active preset) and the label field is left for the user to type. (Does not clear an already-typed label; just marks no preset active.)
- The **selected preset** is visually marked (warm-fill, like `.chip.active`). Selecting a preset stores its `id` in modal state; re-tapping it deselects.
- Presets live in `copy.ts` as `countdowns.milestonePresets: { id: string; label: string; emoji: string }[]` so they're easy to edit.
- The existing hint text («Например, укажите любую важную дату…») stays, but moves below the preset chips (it still teaches the universal concept).

State additions to the modal (already has `milestone`, `originalRecurrence`, `label`, `emoji`, `targetDate`):
- `presetId: string | null` — which preset is active (null = none / «своя дата»).

### 2. Neutral label-based celebration copy

New helper `milestoneTitle(countdown, days)` in `miniapp/src/lib/format.ts`:

```ts
/** Format a reached round-date milestone: «100 дней · День знакомства»,
 *  «1 год · Свадьба». Neutral — uses the countdown's own label, pluralized
 *  via ruDays/ruYears. No "вместе" assumption. */
export function milestoneTitle(label: string, days: number, isYear?: boolean): string {
  const unit = isYear ? ruYears(days) : ruDays(days);
  return `${days} ${unit} · ${label}`;
}
```

(`ruDays` already exists locally in Countdowns.tsx; it should be **hoisted to `format.ts`** so both `milestoneTitle` and Countdowns use it. `ruYears` is already in `format.ts` but not exported — export it.)

The `nextMilestone` helper's `label` stays the raw round («100 дней», «1 год») — it's the *unit*, not the display string. `milestoneTitle` composes `unit · {countdown.label}`. **`nextMilestone` keeps its `.label`** (still used by Home's `nearestOccasion` as the occasion-card label) and **adds** `value: number` + `unit: "days" | "years"` alongside it — not a replacement. Existing callers that read `.label` (Home) keep working; new callers read `.value`/`.unit` for the celebration string.

### 3. Where celebration renders

**Countdowns card** (`Countdowns.tsx`, milestone block ~line 287-290): the `stat-big` line currently shows `ms.label` («100 дней»). Change to `milestoneTitle(c.label, ms.value, ms.unit === "years")` → `«100 дней · День знакомства»`. (`ms.value`/`ms.unit` are the new fields from `nextMilestone`; no string parsing.)

**Milestone toast** (when a round date is reached): `Countdowns.tsx` currently imports `emitMilestone` but never calls it. Add: when `nextMilestone(c)` returns a date whose `daysUntil === 0` (i.e. today is the round date) AND the countdown is viewed, emit a one-shot toast `milestoneTitle(...)`. The toast shows via the existing `milestoneBus` → `MilestoneToast` in `App.tsx`. *(Scope note: the home-feed occasion card already surfaces the nearest milestone via `nearestOccasion`; the toast is the celebratory nudge on the actual day. We emit only when `daysUntil === 0` to avoid repeat firing on every fetch — the milestoneBus `lastEvent` + dismiss handles dedup.)*

### 4. Dead-code removal

- Delete `togetherDays30`, `togetherDays100`, `togetherDays365`, `togetherDaysCustom` from `copy.ts` (verified unused — no references).
- Note in the spec: the `stats` copy block (`title: "Вы вместе"`, `days`, `wishlist`, etc.) is also unused (`getPairStats` consumed only by `useIsPro`, which reads `pro`). Leave it for now (out of scope); flag as a follow-up TODO in the code.

### 5. Testing

- **`lib/format.test.ts`**: `milestoneTitle` cases — `milestoneTitle("День знакомства", 100)` → «100 дней · День знакомства»; `(…, 1)` → «1 день · …»; `(…, 22)` → «22 дня · …»; year case `(…, 1, true)` → «1 год · …»; `(…, 2, true)` → «2 года · …». Also `ruDays`/`ruYears` export + pluralization (some exist, extend).
- **`lib/format.test.ts`**: `nextMilestone` returns `{date, daysUntil, label, value, unit}` — update existing tests that assert `.label` (they keep asserting `.label` for the neutral round text, AND now also assert `.value`/`.unit`).
- **`Countdowns.test.tsx`**: preset chip renders when milestone on; tapping «День знакомства 💝» sets label+emoji in the form (assert on submit payload); tapping «Своя дата» deselects; the celebration line in the milestone card renders `«… · {label}»`.
- Verify no existing test references `togetherDays*` (none do).

## Files touched

- `miniapp/src/screens/Countdowns.tsx` — preset chips, milestoneTitle usage, emitMilestone on day-of, modal state.
- `miniapp/src/lib/format.ts` — `milestoneTitle`, hoist `ruDays` from Countdowns + export it, export `ruYears`, add `value`/`unit` to `nextMilestone`'s return (keep `.label`).
- `miniapp/src/lib/format.test.ts` — milestoneTitle + nextMilestone tests.
- `miniapp/src/screens/Countdowns.test.tsx` — preset + celebration tests.
- `miniapp/src/screens/Home.tsx` — no change needed (reads `nextMilestone().label`, which is preserved).
- `miniapp/src/copy.ts` — add `countdowns.milestonePresets`; delete `togetherDays*`.

## Risks / open notes

- `nextMilestone` gets two new fields (`value`, `unit`) but **keeps `.label`**, so Home's `nearestOccasion` (which reads `.label`) is unaffected.
- The day-of toast emission relies on `milestoneBus` dedup (lastEvent + dismiss). Acceptable for a soft nudge; a strict "fire once ever per threshold" would need backend tracking (out of scope, Approach C — not doing).
- The `stats` copy block remains dead; flagged, not removed.

## Success criteria

- A pair can toggle milestone, tap a preset, get label+emoji filled, save → the milestone card shows `«100 дней · День знакомства»`.
- A pair with a custom milestone («Бросили курить») sees `«100 дней · Бросили курить»` — fully neutral, no «вместе».
- On the day a round date is reached, a toast celebrates it (label-based).
- `togetherDays*` dead copy is gone; all tests green.
