# Milestone Presets + Label-Based Celebration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the milestone countdown feature universal-friendly: add preset chips for common reference dates, and show neutral label-based celebration copy `«N дней · {label}»` instead of nothing (or relationship-biased «вместе»).

**Architecture:** Frontend-only. Hoist `ruDays` to `lib/format.ts`, export `ruYears`, add a `milestoneTitle()` formatter, extend `nextMilestone()` to return `value`+`unit` (keep `.label`). Wire preset chips into the Countdowns modal, render celebration in the milestone card, and emit a day-of milestone toast. Delete dead `togetherDays*` copy.

**Tech Stack:** React 18 + TypeScript, Vite, Tailwind + inline styles, vitest + @testing-library/react. R-warm design system (`--tg-*` tokens, `.chip`/`.chip.active`/`.stat-big` classes). All user-facing strings Russian, live in `miniapp/src/copy.ts`.

## Global Constraints

- Frontend-only: **no backend changes, no migration, no new endpoints.**
- Russian copy only; new copy keys go in `miniapp/src/copy.ts` under `countdowns`.
- All colors via `var(--tg-*)` tokens (auto light/dark). No hardcoded hex.
- `nextMilestone`'s existing `.label` field MUST stay (Home's `nearestOccasion` reads it). Only ADD `value` + `unit`.
- `ruDays`/`ruYears` Russian pluralization rules: mod10===1 && mod100!==11 → singular; mod10∈2..4 && (mod100<10||mod100>=20) → "few"; else "many".
- TDD: write failing test → run (fail) → implement → run (pass) → commit. Frequent commits.
- Run commands from repo root `cd /root/MyProjects/TelegramMiniApps/Pairly` unless noted.

---

### Task 1: Hoist `ruDays` to format.ts + export `ruYears` + add `milestoneTitle`

**Files:**
- Modify: `miniapp/src/lib/format.ts`
- Test: `miniapp/src/lib/format.test.ts`

**Interfaces:**
- Produces:
  - `export function ruDays(n: number): string` — returns "день"/"дня"/"дней".
  - `export function ruYears(n: number): string` — returns "год"/"года"/"лет" (currently module-private; just add `export`).
  - `export function milestoneTitle(label: string, value: number, isYear?: boolean): string` — returns `«{value} {unit} · {label}»`.

- [ ] **Step 1: Write the failing tests**

Add to `miniapp/src/lib/format.test.ts` (inside a new `describe` block):

```typescript
import { ruDays, ruYears, milestoneTitle } from "./format";

describe("ruDays", () => {
  it.each([
    [1, "день"],
    [2, "дня"],
    [5, "дней"],
    [22, "дня"],
    [100, "дней"],
    [11, "дней"],
    [21, "день"],
  ])("%i → %s", (n, expected) => {
    expect(ruDays(n)).toBe(expected);
  });
});

describe("ruYears", () => {
  it.each([
    [1, "год"],
    [2, "года"],
    [5, "лет"],
    [21, "год"],
    [22, "года"],
  ])("%i → %s", (n, expected) => {
    expect(ruYears(n)).toBe(expected);
  });
});

describe("milestoneTitle", () => {
  it("formats a day milestone with the pair's label", () => {
    expect(milestoneTitle("День знакомства", 100)).toBe("100 дней · День знакомства");
  });
  it("pluralizes 1 day", () => {
    expect(milestoneTitle("Переезд", 1)).toBe("1 день · Переезд");
  });
  it("pluralizes 22 days", () => {
    expect(milestoneTitle("Первое свидание", 22)).toBe("22 дня · Первое свидание");
  });
  it("formats a year milestone", () => {
    expect(milestoneTitle("Свадьба", 1, true)).toBe("1 год · Свадьба");
  });
  it("pluralizes 2 years", () => {
    expect(milestoneTitle("Свадьба", 2, true)).toBe("2 года · Свадьба");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd miniapp && npx vitest run src/lib/format.test.ts`
Expected: FAIL — "ruDays is not exported" / "milestoneTitle is not exported" / "ruYears is not exported".

- [ ] **Step 3: Implement in `format.ts`**

(a) Add `export` to `ruYears` (currently `function ruYears`). Change `function ruYears(n: number): string {` → `export function ruYears(n: number): string {`.

(b) Add `ruDays` (hoisted from `Countdowns.tsx`) right after `ruYears`:

```typescript
export function ruDays(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "день";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "дня";
  return "дней";
}
```

(c) Add `milestoneTitle` after `ruDays`:

```typescript
/** Format a reached round-date milestone, label-based + neutral:
 *  «100 дней · День знакомства», «1 год · Свадьба». Uses the countdown's own
 *  label, so it works for any reference event — no "вместе" assumption. */
export function milestoneTitle(label: string, value: number, isYear?: boolean): string {
  const unit = isYear ? ruYears(value) : ruDays(value);
  return `${value} ${unit} · ${label}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd miniapp && npx vitest run src/lib/format.test.ts`
Expected: PASS (all ruDays/ruYears/milestoneTitle cases).

- [ ] **Step 5: Remove the now-duplicate local `ruDays` from Countdowns.tsx**

In `miniapp/src/screens/Countdowns.tsx`:
- Delete the local `function ruDays(n: number): string { ... }` block.
- Add `ruDays` to the existing `import { ... } from "../lib/format"` line (which already imports `nextMilestone` etc.). Keep `milestoneDays` render using `ruDays(milestoneDays)` — it now resolves to the imported one.

- [ ] **Step 6: Verify build + Countdowns tests still pass**

Run: `cd miniapp && npm run build 2>&1 | tail -3 && npx vitest run src/screens/Countdowns.test.tsx 2>&1 | grep -E "Tests "`
Expected: build OK, Countdowns tests PASS.

- [ ] **Step 7: Commit**

```bash
git add miniapp/src/lib/format.ts miniapp/src/lib/format.test.ts miniapp/src/screens/Countdowns.tsx
git commit -m "feat(format): add milestoneTitle + export ruDays/ruYears"
```

---

### Task 2: Extend `nextMilestone` to return `value` + `unit`

**Files:**
- Modify: `miniapp/src/lib/format.ts`
- Test: `miniapp/src/lib/format.test.ts`

**Interfaces:**
- Produces: `nextMilestone(c, now?)` return type becomes `{ date: Date; daysUntil: number; label: string; value: number; unit: "days" | "years" } | null`. The `.label` field is unchanged.
- Consumes: `DAY_MILESTONES` (already in format.ts).

- [ ] **Step 1: Write the failing tests**

Add to the `nextMilestone` describe block in `miniapp/src/lib/format.test.ts` (find the existing block; read it first to match its `now`/reference-date style):

```typescript
it("returns value+unit for a day milestone", () => {
  // ref 100 days ago → next is the 200-day mark (100 days from now).
  const c = makeMilestone("2026-03-14T00:00:00Z"); // NOW=2026-06-22 → ref ~100 days ago
  const m = nextMilestone(c, new Date("2026-06-22T12:00:00Z"));
  expect(m).not.toBeNull();
  if (!m) return;
  expect(m.unit).toBe("days");
  expect(typeof m.value).toBe("number");
  expect(m.label).toBe(`${m.value} дней`); // label still the raw round
});

it("returns value+unit for a year milestone", () => {
  // ref ~2 years ago → next round is 3 years.
  const c = makeMilestone("2024-06-22T00:00:00Z");
  const m = nextMilestone(c, new Date("2026-06-22T12:00:00Z"));
  expect(m).not.toBeNull();
  if (!m) return;
  expect(m.unit).toBe("years");
  expect(m.value).toBe(3);
  expect(m.label).toBe("3 года");
});
```

(If `makeMilestone` helper doesn't exist in the test file, define a minimal one: `const makeMilestone = (iso: string) => ({ id: "x", label: "ref", emoji: "🎯", targetDate: iso, recurrence: "milestone" }) as Countdown` — match the test file's existing `Countdown` import + shape. Read the existing nextMilestone tests first and reuse their helper if present.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd miniapp && npx vitest run src/lib/format.test.ts -t "value"`
Expected: FAIL — "m.unit is undefined" / property `unit` does not exist.

- [ ] **Step 3: Implement in `format.ts` `nextMilestone`**

Change the candidates to carry `value` + `unit`, and include them in the return. Replace the function body:

```typescript
export function nextMilestone(
  c: Countdown,
  now: Date = new Date(),
): { date: Date; daysUntil: number; label: string; value: number; unit: "days" | "years" } | null {
  const ref = new Date(c.targetDate);
  if (Number.isNaN(ref.getTime())) return null;
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const candidates: { date: Date; label: string; value: number; unit: "days" | "years" }[] = [];
  for (const d of DAY_MILESTONES) {
    candidates.push({ date: new Date(ref.getTime() + d * 86_400_000), label: `${d} дней`, value: d, unit: "days" });
  }
  for (let y = 1; y <= 100; y++) {
    candidates.push({ date: addYears(ref, y), label: ruYears(y), value: y, unit: "years" });
  }
  const first = candidates
    .filter((cand) => cand.date.getTime() >= todayStart.getTime())
    .sort((a, b) => a.date.getTime() - b.date.getTime())[0];
  if (!first) return null;
  return {
    date: first.date,
    daysUntil: Math.max(0, localDayDelta(first.date, now)),
    label: first.label,
    value: first.value,
    unit: first.unit,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd miniapp && npx vitest run src/lib/format.test.ts`
Expected: PASS (all nextMilestone + new value/unit cases).

- [ ] **Step 5: Verify Home (reads .label) still builds**

Run: `cd miniapp && npm run build 2>&1 | tail -3`
Expected: build OK (Home reads `nextMilestone().label`, which is preserved).

- [ ] **Step 6: Commit**

```bash
git add miniapp/src/lib/format.ts miniapp/src/lib/format.test.ts
git commit -m "feat(format): nextMilestone returns value+unit (label preserved)"
```

---

### Task 3: Add `milestonePresets` to copy.ts

**Files:**
- Modify: `miniapp/src/copy.ts`

**Interfaces:**
- Produces: `COPY.countdowns.milestonePresets: { id: string; label: string; emoji: string }[]`.

- [ ] **Step 1: Add the presets to the `countdowns` block**

In `miniapp/src/copy.ts`, inside the `countdowns: { ... }` object (after `limitHit`), add:

```typescript
    milestonePresets: [
      { id: "met", label: "День знакомства", emoji: "💝" },
      { id: "wedding", label: "Свадьба", emoji: "💍" },
      { id: "moved", label: "Переезд", emoji: "📦" },
      { id: "first-date", label: "Первое свидание", emoji: "☕" },
      { id: "custom", label: "Своя дата", emoji: "✍️" },
    ],
```

- [ ] **Step 2: Verify build**

Run: `cd miniapp && npm run build 2>&1 | tail -3`
Expected: build OK.

- [ ] **Step 3: Commit**

```bash
git add miniapp/src/copy.ts
git commit -m "feat(copy): add countdowns.milestonePresets"
```

---

### Task 4: Preset chips in the Countdowns milestone modal

**Files:**
- Modify: `miniapp/src/screens/Countdowns.tsx`
- Test: `miniapp/src/screens/Countdowns.test.tsx`

**Interfaces:**
- Consumes: `COPY.countdowns.milestonePresets` (Task 3), existing modal state `label`/`emoji`/`milestone`.
- Produces: a `presetId` state in the modal; tapping a preset sets `label`+`emoji`; tapping «Своя дата» (id `custom`) clears preset selection only.

- [ ] **Step 1: Write the failing tests**

Add to `miniapp/src/screens/Countdowns.test.tsx` (inside a new `describe` block — read the file first to match its mock setup; it mocks `endpoints` and renders `<Countdowns />`):

```typescript
describe("Countdowns — milestone presets", () => {
  it("shows preset chips only when the milestone toggle is on", async () => {
    // listMock returns an empty list; open the add modal.
    render(<Countdowns />);
    fireEvent.click(await screen.findByText(/\+ .*Добавить|Добавить/i));
    // Before toggling milestone: no preset chips.
    expect(screen.queryByText(/День знакомства/)).not.toBeInTheDocument();
    // Toggle milestone on.
    fireEvent.click(screen.getByText(/Считать круглые даты/));
    expect(await screen.findByText(/День знакомства/)).toBeInTheDocument();
    expect(screen.getByText(/Свадьба/)).toBeInTheDocument();
    expect(screen.getByText(/Своя дата/)).toBeInTheDocument();
  });

  it("tapping a preset fills label + emoji", async () => {
    render(<Countdowns />);
    fireEvent.click(await screen.findByText(/Добавить/i));
    fireEvent.click(screen.getByText(/Считать круглые даты/));
    fireEvent.click(await screen.findByText(/День знакомства/));
    const labelInput = screen.getByPlaceholderText(/Название|например: отпуск/i) as HTMLInputElement;
    expect(labelInput.value).toBe("День знакомства");
  });
});
```

(Adjust the text matchers to the real button/placeholder text in the file — read the render first. The add button is `<Button>+ {COPY.common.add}</Button>`; the label field placeholder is `COPY.countdowns.labelPlaceholder`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd miniapp && npx vitest run src/screens/Countdowns.test.tsx -t "milestone presets"`
Expected: FAIL — "День знакомства" not found (no preset chips rendered yet).

- [ ] **Step 3: Add `presetId` state + chip handler**

In `miniapp/src/screens/Countdowns.tsx`, near the other modal state (after `const [originalRecurrence, ...]`):

```typescript
  const [presetId, setPresetId] = useState<string | null>(null);
```

Reset it in `openAdd` and `openEdit` (read those functions; add `setPresetId(null)` in each, and in `openEdit` set `setPresetId(null)` — editing never re-selects a preset).

Add a handler:

```typescript
  function applyPreset(p: { id: string; label: string; emoji: string }) {
    if (p.id === "custom") {
      // «Своя дата»: just deselect; leave label editable.
      setPresetId("custom");
      return;
    }
    setPresetId(p.id);
    setLabel(p.label);
    setEmoji(p.emoji);
  }
```

- [ ] **Step 4: Render the preset chips in the modal**

In `miniapp/src/screens/Countdowns.tsx`, the milestone block currently is (around line 417-421):

```jsx
        {milestone ? (
          <p className="text-xs" style={{ color: "var(--tg-hint)" }}>
            Например, укажите любую важную дату — и ближайший повод сам покажет круглую отметку: 100 дней, 1 год, 1000 дней.
          </p>
        ) : null}
```

Replace it with (chips row + the existing hint below):

```jsx
        {milestone ? (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "8px 0 6px" }}>
              {COPY.countdowns.milestonePresets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p)}
                  aria-pressed={presetId === p.id}
                  className={`chip ${presetId === p.id ? "active" : ""}`}
                  style={{ fontSize: 13 }}
                >
                  {p.emoji} {p.label}
                </button>
              ))}
            </div>
            <p className="text-xs" style={{ color: "var(--tg-hint)" }}>
              Например, укажите любую важную дату — и ближайший повод сам покажет круглую отметку: 100 дней, 1 год, 1000 дней.
            </p>
          </>
        ) : null}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd miniapp && npx vitest run src/screens/Countdowns.test.tsx -t "milestone presets"`
Expected: PASS.

- [ ] **Step 6: Run full Countdowns test file**

Run: `cd miniapp && npx vitest run src/screens/Countdowns.test.tsx`
Expected: PASS (existing tests unaffected).

- [ ] **Step 7: Commit**

```bash
git add miniapp/src/screens/Countdowns.tsx miniapp/src/screens/Countdowns.test.tsx
git commit -m "feat(countdowns): milestone preset chips"
```

---

### Task 5: Label-based celebration in the milestone card

**Files:**
- Modify: `miniapp/src/screens/Countdowns.tsx`
- Test: `miniapp/src/screens/Countdowns.test.tsx`

**Interfaces:**
- Consumes: `milestoneTitle` + `nextMilestone().value`/`.unit` (Tasks 1-2).

- [ ] **Step 1: Write the failing test**

Add to the milestone describe block in `Countdowns.test.tsx`:

```typescript
it("shows the milestone celebration as «unit · label»", async () => {
  // A milestone countdown with label "День знакомства" whose next round is ~100 days.
  listMock.mockResolvedValue([
    { id: "m1", label: "День знакомства", emoji: "💝", targetDate: "2026-03-14T00:00:00Z", recurrence: "milestone" },
  ]);
  render(<Countdowns />);
  // The milestone card's stat-big line should read "100 дней · День знакомства"
  // (or whatever the next round is — assert it contains the label + "дней").
  await screen.findByText(/День знакомства/);
  expect(screen.getByText(/\d+ дн(?:ей|я|ень) · День знакомства/)).toBeInTheDocument();
});
```

(Adjust the regex if the next round at the test's `now` is a year — but pick a ref date so the next round is a day-count, e.g. ref 100 days ago. Confirm the mock's shape matches the test file's existing mock countdown.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd miniapp && npx vitest run src/screens/Countdowns.test.tsx -t "milestone celebration"`
Expected: FAIL — the card shows `ms.label` («100 дней») alone, not `«… · День знакомства»`.

- [ ] **Step 3: Use `milestoneTitle` in the milestone card**

In `miniapp/src/screens/Countdowns.tsx`, import `milestoneTitle` (add to the `../lib/format` import). The milestone card block (around line 287-290):

```jsx
                  {isMilestone && ms ? (
                    <>
                      <div className="stat-big mt-1" style={{ color: "var(--tg-warm)" }}>{ms.label}</div>
                      <div className="card-sub mt-0.5">следующая круглая дата · через {ms.daysUntil} дн.</div>
                    </>
                  ) : ...
```

Change the `stat-big` line to use `milestoneTitle`:

```jsx
                      <div className="stat-big mt-1" style={{ color: "var(--tg-warm)" }}>{milestoneTitle(c.label, ms.value, ms.unit === "years")}</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd miniapp && npx vitest run src/screens/Countdowns.test.tsx -t "milestone celebration"`
Expected: PASS.

- [ ] **Step 5: Run full Countdowns test file**

Run: `cd miniapp && npx vitest run src/screens/Countdowns.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add miniapp/src/screens/Countdowns.tsx miniapp/src/screens/Countdowns.test.tsx
git commit -m "feat(countdowns): label-based milestone celebration in card"
```

---

### Task 6: Day-of milestone toast

**Files:**
- Modify: `miniapp/src/screens/Countdowns.tsx`
- Test: `miniapp/src/screens/Countdowns.test.tsx`

**Interfaces:**
- Consumes: `emitMilestone` (already imported in Countdowns.tsx), `milestoneTitle`, `nextMilestone().daysUntil`.
- Produces: when the Countdowns list is fetched and any milestone has `daysUntil === 0`, emit one `emitMilestone` call with the label-based title as `value`-agnostic payload. (The toast reads `kind` + `value`; we map `value` to the round number for the kind the toast already understands — see Step 3.)

- [ ] **Step 1: Write the failing test**

Add to the milestone describe block in `Countdowns.test.tsx`:

```typescript
it("emits a milestone toast when a round date is reached today", async () => {
  // ref exactly 100 days ago → 100-day round is today (daysUntil === 0).
  const now = new Date();
  const ref = new Date(now.getTime() - 100 * 86_400_000).toISOString();
  const emitSpy = vi.spyOn(milestoneBus, "emitMilestone").mockImplementation(() => {});
  listMock.mockResolvedValue([
    { id: "m1", label: "День знакомства", emoji: "💝", targetDate: ref, recurrence: "milestone" },
  ]);
  render(<Countdowns />);
  await screen.findByText(/День знакомства/);
  expect(emitSpy).toHaveBeenCalled();
  const lastCall = emitSpy.mock.calls[emitSpy.mock.calls.length - 1][0];
  expect(lastCall.kind).toBe("milestone");
  emitSpy.mockRestore();
});
```

(Read the test file's imports — it likely already mocks `../lib/milestoneBus` via `vi.mock`; if so, capture the spy there instead of `vi.spyOn`. Match the existing pattern.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd miniapp && npx vitest run src/screens/Countdowns.test.tsx -t "round date is reached today"`
Expected: FAIL — `emitMilestone` never called (Countdowns imports it but never calls it).

- [ ] **Step 3: Emit the toast on day-of**

In `miniapp/src/screens/Countdowns.tsx`, add a `useEffect` after the data is loaded (the component already has the `items` from `useApi`). Find where `items` is available (after the `useApi<Countdown[]>(...)` destructure) and add:

```typescript
  const lastEmittedMilestoneRef = useRef<string | null>(null);
  useEffect(() => {
    if (!items || items.length === 0) return;
    for (const c of items) {
      if (c.recurrence !== "milestone") continue;
      const ms = nextMilestone(c);
      if (ms && ms.daysUntil === 0) {
        // Emit once per (countdown id + round value) so a re-fetch doesn't re-fire.
        const key = `${c.id}:${ms.value}:${ms.unit}`;
        if (lastEmittedMilestoneRef.current !== key) {
          lastEmittedMilestoneRef.current = key;
          emitMilestone({ kind: "milestone", value: ms.value });
        }
      }
    }
  }, [items]);
```

(Add `useRef`, `useEffect` to the React import at the top of the file if not present. The toast component renders from `kind`+`value`; the existing `MilestoneToast` uses the milestoneBus `MilestoneEvent`. If the toast's copy needs the label-based title, check `components/Toast.tsx` — it may render a generic message; if so, this is acceptable for the soft nudge, OR pass the title via a new field. Keep it minimal: emit `kind: "milestone"`, `value: ms.value` for now. **Note in the commit message** that the toast copy is generic; label-based toast text is a follow-up if Toast.tsx doesn't already format it.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd miniapp && npx vitest run src/screens/Countdowns.test.tsx -t "round date is reached today"`
Expected: PASS.

- [ ] **Step 5: Run full Countdowns test file**

Run: `cd miniapp && npx vitest run src/screens/Countdowns.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add miniapp/src/screens/Countdowns.tsx miniapp/src/screens/Countdowns.test.tsx
git commit -m "feat(countdowns): day-of milestone toast (one-shot per round)"
```

---

### Task 7: Delete dead `togetherDays*` copy

**Files:**
- Modify: `miniapp/src/copy.ts`

**Interfaces:** none (dead code).

- [ ] **Step 1: Confirm still-unused (sanity)**

Run: `cd miniapp && grep -rn "togetherDays" src --include="*.ts" --include="*.tsx"`
Expected: only the definitions in `copy.ts` (no consumers).

- [ ] **Step 2: Delete the four keys**

In `miniapp/src/copy.ts`, delete the lines:

```typescript
    togetherDays30: "30 дней вместе. Месяц маленьких историй 🗓",
    togetherDays100: "100 дней вместе. Целая эпоха для двоих 💫",
    togetherDays365: "Год вместе. Круг прочерчен — и дальше только интереснее 🌟",
    togetherDaysCustom: (v: number) => `${v} дней вместе.`,
```

(Also check if the surrounding object — likely a `milestones` block — becomes empty and can be removed; if it had ONLY these keys, remove the whole block. Read the surrounding lines.)

- [ ] **Step 3: Build + full test**

Run: `cd miniapp && npm run build 2>&1 | tail -3 && npx vitest run 2>&1 | grep -E "Test Files|Tests "`
Expected: build OK, all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add miniapp/src/copy.ts
git commit -m "chore(copy): remove dead togetherDays* celebration copy"
```

---

### Task 8: Full build, test, deploy

**Files:** none (verification + deploy).

- [ ] **Step 1: Full miniapp test suite**

Run: `cd miniapp && npx vitest run`
Expected: ALL PASS (count includes new tests).

- [ ] **Step 2: Full build (typecheck + vite)**

Run: `cd miniapp && npm run build`
Expected: build succeeds, 0 TS errors.

- [ ] **Step 3: Push + deploy**

```bash
cd /root/MyProjects/TelegramMiniApps/Pairly
git push origin main
ssh hiplet-97620 'cd /opt/pairly && git pull --ff-only && nohup bash deploy/scripts/deploy.sh > /tmp/dep-milestone.log 2>&1 &'
```

- [ ] **Step 4: Verify deploy**

Poll until done, then verify `https://pairly.mnepo.fyi/api/health` → `{"status":"ok"}` and the served bundle contains `milestoneTitle`-style copy (e.g. grep the live asset for `· День знакомства` is too specific — instead grep for the preset label `Свадьба` and the neutral milestone hint `любую важную дату`).

- [ ] **Step 5: Commit any final fixups**

If deploy surfaced a fix, commit + push it.

---

## Self-Review notes

- **Spec coverage:** preset chips (Task 4), label-based celebration copy (Tasks 1+5), day-of toast (Task 6), dead-code removal (Task 7), `nextMilestone` `value`/`unit` (Task 2), `milestonePresets` copy (Task 3). All spec sections covered.
- **Type consistency:** `milestoneTitle(label, value, isYear?)`, `nextMilestone` returns `{... value; unit}` — used consistently in Tasks 2, 5, 6.
- **`nextMilestone.label` preserved** (Home unaffected) — verified in Task 2 Step 5.
- **Toast copy caveat:** the existing `MilestoneToast` may render generic copy from `kind`+`value`. Task 6 emits a soft nudge; full label-based toast *text* depends on Toast.tsx — flagged in the commit message as a possible follow-up if it doesn't already format nicely. (This is honest scope; not a placeholder.)
