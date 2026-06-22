# Home Cards + R-warm Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Мечты/Подарки/Записки Home cards into live previews (variant A — dissolve; the waiting gift warms up), and consolidate the whole miniapp onto R-warm as the single design system by purging M3 entirely.

**Architecture:** Frontend-only (`miniapp/`), no backend/API changes — all data exists via `listBucket` / `listGifts` / `listLoveNotes`. Phase 0 removes the M3 token + component-class layer from `index.css` and migrates every M3 usage to canonical R-warm classes/tokens (adding `--tg-danger`). Phase 1 adds a `PreviewCard` to `Home.tsx` fed by three existing list endpoints. Phase 2A reworks the three destination pages (Gifts gets action-first hero). Phase 2B finishes the R-warm fidelity sweep on the remaining screens.

**Tech Stack:** React 18 + TypeScript, Vite, Tailwind. Tests: `vitest` + `@testing-library/react`. The design language is defined in `miniapp/src/index.css` (canonical R-warm classes: `.card`, `.card-title`, `.card-sub`, `.meta`, `.section-label`, `.btn`/`.btn-ghost`/`.btn-warm`, `.hero-warm`, `.chip`/`.chip.is-active`, `.card-actions`/`.card-act`, `.toast`, `.input`, `.empty-state`, `.stat-big`, plus `rw-*`).

## Global Constraints

- **Copy:** all user-facing strings are Russian, sourced from `miniapp/src/copy.ts`. Never inline Russian literals in components — add to `COPY` and reference.
- **No M3:** after Phase 0, zero `m3-` / `--m3-` occurrences anywhere in `src/` or `index.css`. Enforced by `miniapp/scripts/check-no-m3.sh` (CI) + a vitest guard test. M3 means: `--m3-*` tokens, `card-m3`, `card-m3-low`, `input-m3`, `surface-m3`, `navbar-m3`, `btn-m3-filled/outlined/text/icon`, `text-m3-label/body/title/headline`.
- **Tokens only:** colors via `--tg-*` tokens (`--tg-text`, `--tg-hint`, `--tg-button`, `--tg-bg`, `--tg-sec`, `--tg-warm`, `--tg-danger`). No raw `text-red-500` / hex literals in components.
- **Run tests:** `cd miniapp && npx vitest run`.
- **Build check:** after any `miniapp/` change, `cd miniapp && npm run build` — must pass with zero TS errors.
- **M3 purge verification:** `cd miniapp && grep -rn "m3" src index.css` → must print nothing (after Task 0.6).
- **Branch:** `feat/home-cards-rwarm` (already created). Commit each task.
- **Commit footer:** end every commit message with `Co-Authored-By: Claude <noreply@anthropic.com>`.

---

## File Structure

**`miniapp/src/index.css`** — MODIFY: rewire `--m3-*`→`--tg-*`, add `--tg-danger`, relocate ripple, delete M3 sections. (Phase 0)

**Components — MODIFY/DELETE (Phase 0 + 2B):**
- `components/Field.tsx` — `input-m3`→`input`.
- `components/Modal.tsx` — `surface-m3`→`card`; title→`.heading`.
- `components/Button.tsx` — `--m3-error`→`--tg-danger`.
- `components/Ripple.tsx` — doc comment `--m3-on-surface`→`--tg-text`.
- `components/Toast.tsx` — M3 tokens→`.toast`.
- `components/LimitBanner.tsx` — `--m3-primary-container`→`--tg-button`.
- `components/Stats.tsx` — DELETE (orphaned; `App.tsx` does not import `StatsCard`).
- `components/EmptyState.tsx`, `components/Ambient.tsx` — 2B polish (inline→classes).

**Screens — MODIFY:**
- `screens/Home.tsx` — `PreviewCard` + 3 hooks (Phase 1).
- `screens/Home.test.tsx` — extend (Phase 1).
- `screens/Bucket.tsx` — R-warm sweep (Phase 2A).
- `screens/Gifts.tsx` — action-first hero + R-warm sweep (Phase 2A).
- `screens/Gifts.test.tsx` — extend (Phase 2A).
- `screens/LoveNotes.tsx` — unread badge + 2 spots (Phase 2A).
- `screens/Wishlist.tsx` — chip M3 + `text-red-500` (Phase 0); raw-tailwind rest (2B).
- `screens/Countdowns.tsx` — chip M3 + `text-red-500` (Phase 0); stat inline rest (2B).
- `screens/QuestionOfTheDay.tsx` — `text-red-500` (Phase 0); raw-tailwind rest (2B).
- `screens/Mood.tsx` — `--m3-error` (Phase 0); inline rest (2B).

**Core — MODIFY:**
- `App.tsx` — back-button `--m3-primary`→`--tg-button` (Phase 0).
- `copy.ts` — `home` card strings (Phase 1), `gifts.waitingForYou` (Phase 2A).

**Tooling — CREATE (Phase 0):**
- `miniapp/scripts/check-no-m3.sh` — grep guard.
- `miniapp/src/no-m3.guard.test.ts` — vitest guard.
- `.github/workflows/ci.yml` — add guard step.

---

## Phase 0 — Foundation: full M3 purge

### Task 0.1: Add `--tg-danger` token

**Files:** Modify `miniapp/src/index.css`

- [ ] **Step 1: Add the light token**

In the canonical R-warm `:root` block (the one containing `--tg-bg: #ffffff;`, ~line 625), add inside the braces:

```css
  --tg-danger: #dc2626;
```

- [ ] **Step 2: Add the dark token**

In the `@media (prefers-color-scheme: dark)` block immediately after it (the one overriding `--tg-bg: #1c1c1e;` etc., ~line 638), add inside the braces:

```css
  --tg-danger: #ff453a;
```

- [ ] **Step 3: Build check**

Run: `cd miniapp && npm run build`
Expected: success, 0 TS errors (CSS-only change).

- [ ] **Step 4: Commit**

```bash
git add miniapp/src/index.css
git commit -m "feat(rwarm): add --tg-danger token (light/dark)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 0.2: Rewire `--m3-*` references to `--tg-*` (no deletion yet)

**Files:** Modify `miniapp/src/index.css`

Apply this find-replace **within the `rw-*` block (lines ~368–617), the canonical token bridge (`--tg-button:`/`--tg-button-text:`, ~634–635), `--warm-container` (~116), and `.card-act.danger` (~779–780)**. Do NOT touch the M3 definition blocks (58–105, 138–338) yet.

| find | replace with |
|---|---|
| `var(--m3-on-surface-variant)` | `var(--tg-hint)` |
| `var(--m3-on-surface)` | `var(--tg-text)` |
| `var(--m3-primary)` | `var(--tg-button)` |
| `var(--m3-on-primary)` | `var(--tg-button-text)` |
| `var(--m3-surface-container-lowest)` | `var(--tg-sec)` |
| `var(--m3-surface-container-high)` | `var(--tg-sec)` |
| `var(--m3-surface-container)` | `var(--tg-sec)` |
| `var(--m3-surface)` | `var(--tg-bg)` |
| `var(--m3-error)` | `var(--tg-danger)` |

- [ ] **Step 1: Apply the 9 replacements** in the ranges above.

- [ ] **Step 2: Fix the two bridge lines explicitly**

```css
  --tg-button: var(--tg-theme-button-color);
  --tg-button-text: var(--tg-theme-button-text-color);
```

- [ ] **Step 3: Verify the surviving CSS no longer references `--m3-*`**

Run: `cd miniapp && grep -n "m3" src/index.css`
Expected: matches ONLY in the M3 definition blocks (lines ~58–338). Nothing in the `rw-*`, bridge, `.card-act.danger`, or `--warm-container` ranges.

- [ ] **Step 4: Build check**

Run: `cd miniapp && npm run build && npx vitest run`
Expected: success; all tests green (pure token rename — `--tg-*` resolve to the same values).

- [ ] **Step 5: Commit**

```bash
git add miniapp/src/index.css
git commit -m "refactor(rwarm): rewire --m3-* refs to --tg-* in surviving CSS

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 0.3: Relocate ripple primitives out of the M3 layer

**Files:** Modify `miniapp/src/index.css`

The `.ripple-container` / `.ripple-effect` / `@keyframes ripple-expand` rules currently live inside the M3 `@layer components` block (~lines 280–299). They are interaction primitives (used by `Ripple.tsx`, chips, nav), not M3 theming — move them so they survive the M3 deletion in Task 0.6.

- [ ] **Step 1: Cut the ripple rules** (`.ripple-container`, `.ripple-effect`, `@keyframes ripple-expand`) from the M3 `@layer components` block.

- [ ] **Step 2: Paste them into the canonical R-warm section** (anywhere after line ~645, e.g. right before the `.card` definition ~941), and rewire the one `--m3-*` reference:

```css
  /* — Ripple (interaction primitive; relocated from the removed M3 layer) — */
  .ripple-container {
    position: relative;
    overflow: hidden;
  }
  .ripple-effect {
    position: absolute;
    border-radius: 50%;
    background: var(--tg-text);
    opacity: 0.1;
    transform: scale(0);
    animation: ripple-expand 400ms ease-out forwards;
    pointer-events: none;
  }
  @keyframes ripple-expand {
    to {
      transform: scale(4);
      opacity: 0;
    }
  }
```

- [ ] **Step 3: Build + test**

Run: `cd miniapp && npm run build && npx vitest run`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add miniapp/src/index.css
git commit -m "refactor(rwarm): relocate ripple primitives out of M3 layer

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 0.4: Sweep M3 usages in components (+ delete dead Stats)

**Files:** Modify `components/Field.tsx`, `components/Modal.tsx`, `components/Button.tsx`, `components/Ripple.tsx`, `components/Toast.tsx`, `components/LimitBanner.tsx`; DELETE `components/Stats.tsx`.

- [ ] **Step 1: Field.tsx** — replace both `input-m3` with `input`:

```tsx
  return <input {...rest} className={`input ${className}`} />;
```
```tsx
  return <textarea {...rest} className={`input resize-y ${className}`} />;
```

- [ ] **Step 2: Modal.tsx** — `surface-m3` → `card`; title → `.heading`:

old: `className="w-full max-w-md surface-m3 p-5"` → new: `className="w-full max-w-md card p-5"`
old: `<h2 className="mb-3 text-lg font-semibold text-tg-text">{title}</h2>` → new: `<h2 className="heading">{title}</h2>`

- [ ] **Step 3: Button.tsx** — both `--m3-error` → `--tg-danger` in the `dangerStyle` object:

```tsx
  const dangerStyle =
    variant === "danger"
      ? {
          color: "var(--tg-danger)",
          borderColor: "color-mix(in srgb, var(--tg-danger) 30%, transparent)",
          ...style,
        }
      : style;
```

- [ ] **Step 4: Ripple.tsx** — update the doc comment only:

old: `/** Ripple color override. Default: var(--m3-on-surface). */` → new: `/** Ripple color override. Default: var(--tg-text). */`

- [ ] **Step 5: Toast.tsx** — replace the M3-styled inner div (lines ~116–122) with the `.toast` class:

old:
```tsx
        <div
          className="rounded-full px-6 py-3 shadow-[var(--m3-elevation-3)]"
          style={{
            background: "var(--m3-surface-container-high)",
            color: "var(--m3-on-surface)",
          }}
        >
```
new:
```tsx
        <div className="toast">
```

- [ ] **Step 6: LimitBanner.tsx** — `border-[var(--m3-primary-container)]` → `border-[var(--tg-button)]`:

old: `<Card className="border border-[var(--m3-primary-container)]">` → new: `<Card className="border border-[var(--tg-button)]">`

- [ ] **Step 7: Confirm Stats.tsx is orphaned, then delete**

Run: `cd miniapp && grep -rn "StatsCard\|components/Stats" src`
Expected: no matches other than within `components/Stats.tsx` itself (App.tsx does not import it).
Then: `cd miniapp && git rm src/components/Stats.tsx`

- [ ] **Step 8: Build + test**

Run: `cd miniapp && npm run build && npx vitest run`
Expected: green.

- [ ] **Step 9: Commit**

```bash
git add miniapp/src/components/Field.tsx miniapp/src/components/Modal.tsx miniapp/src/components/Button.tsx miniapp/src/components/Ripple.tsx miniapp/src/components/Toast.tsx miniapp/src/components/LimitBanner.tsx
git rm miniapp/src/components/Stats.tsx
git commit -m "refactor(rwarm): purge M3 from components; drop dead StatsCard

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 0.5: Sweep M3 + `text-red-500` in screens + App

**Files:** Modify `screens/Wishlist.tsx`, `screens/Countdowns.tsx`, `screens/QuestionOfTheDay.tsx`, `screens/Mood.tsx`, `App.tsx`.
(Note: `Bucket.tsx`/`Gifts.tsx` HIGH spots are handled in Phase 2A to avoid double-editing. `LoveNotes.tsx` has no HIGH spots.)

- [ ] **Step 1: App.tsx** — back-button color:

old: `<button onClick={onBack} className="mb-2 text-sm" style={{ color: "var(--m3-primary)" }}>← Назад</button>`
new: `<button onClick={onBack} className="mb-2 text-sm" style={{ color: "var(--tg-button)" }}>← Назад</button>`

- [ ] **Step 2: Wishlist.tsx** — convert the category chip (lines ~304–315) from inline M3 styles to the `.chip` class. Replace the whole `<button>` opening through its `style`/`className`:

old:
```tsx
              className="ripple-container rounded-full px-3 py-1.5 text-sm transition"
              style={{
                background: category === c
                  ? "var(--m3-primary-container)"
                  : "var(--m3-surface-container)",
                color: category === c
                  ? "var(--m3-on-primary-container)"
                  : "var(--m3-on-surface)",
              }}
```
new:
```tsx
              className={`chip ripple-container ${category === c ? "is-active" : ""}`}
```

- [ ] **Step 3: Wishlist.tsx** — error text `text-red-500` → `text-[var(--tg-danger)]` (line ~202):

old: `<p className="py-10 text-center text-red-500">{COPY.common.error}</p>` → new: `<p className="py-10 text-center text-[var(--tg-danger)]">{COPY.common.error}</p>`

- [ ] **Step 4: Countdowns.tsx** — convert the milestone chip (lines ~287–292) to `.chip`:

old:
```tsx
          className="ripple-container rounded-full px-3 py-2 text-left text-sm transition"
          style={{
            background: milestone ? "var(--m3-primary-container)" : "var(--m3-surface-container)",
            color: milestone ? "var(--m3-on-primary-container)" : "var(--tg-text)",
          }}
```
new:
```tsx
          className={`chip ripple-container ${milestone ? "is-active" : ""}`}
```

- [ ] **Step 5: Countdowns.tsx** — both `text-red-500` → `text-[var(--tg-danger)]` (lines ~203, ~276). Replace the literal class string `text-red-500` with `text-[var(--tg-danger)]` in both spots.

- [ ] **Step 6: QuestionOfTheDay.tsx** — error `text-red-500` → `text-[var(--tg-danger)]` (line ~58). Replace the literal `text-red-500` with `text-[var(--tg-danger)]`.

- [ ] **Step 7: Mood.tsx** — `--m3-error` → `--tg-danger` (line ~136):

old: `style={{ marginTop: 8, color: "var(--m3-error)", borderColor: "color-mix(in srgb, var(--m3-error) 30%, transparent)" }}`
new: `style={{ marginTop: 8, color: "var(--tg-danger)", borderColor: "color-mix(in srgb, var(--tg-danger) 30%, transparent)" }}`

- [ ] **Step 8: Verify no M3 / no raw red remains in these files**

Run: `cd miniapp && grep -rn "m3\|text-red-500" src/App.tsx src/screens/Wishlist.tsx src/screens/Countdowns.tsx src/screens/QuestionOfTheDay.tsx src/screens/Mood.tsx`
Expected: empty.

- [ ] **Step 9: Build + test**

Run: `cd miniapp && npm run build && npx vitest run`
Expected: green.

- [ ] **Step 10: Commit**

```bash
git add miniapp/src/App.tsx miniapp/src/screens/Wishlist.tsx miniapp/src/screens/Countdowns.tsx miniapp/src/screens/QuestionOfTheDay.tsx miniapp/src/screens/Mood.tsx
git commit -m "refactor(rwarm): purge M3 + text-red-500 from screens + App

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 0.6: Delete the M3 layer from `index.css`

**Files:** Modify `miniapp/src/index.css`

All M3 usages are now migrated; the M3 definition blocks are dead code.

- [ ] **Step 1: Delete the M3 Design Tokens block** — the section headed by the `M3 Design Tokens` comment (defines `--m3-primary`, `--m3-surface*`, `--m3-outline*`, `--m3-error`, elevation, shape), from its header comment through the closing of that `:root`/shape block. Keep the `R-warm — the chosen warm design direction` block that follows it.

- [ ] **Step 2: Delete the M3 `@layer components { … }` block** — the whole layer (defines `card-m3`, `card-m3-low`, `btn-m3-filled/outlined/text/icon`, `input-m3`, `surface-m3`, `navbar-m3`, `text-m3-label/body/title/headline`). The ripple rules are no longer in it (relocated in Task 0.3). Keep the keyframe-animations block that follows it.

- [ ] **Step 3: Verify zero M3 remains**

Run: `cd miniapp && grep -rn "m3" src index.css`
Expected: empty.

- [ ] **Step 4: Build + test + visual sanity**

Run: `cd miniapp && npm run build && npx vitest run`
Expected: green.
Then visually confirm (dev server / build preview) that Home, a Modal, a Toast, and a chip still render correctly in light AND dark mode — cards must NOT be "black pills" in dark mode.

- [ ] **Step 5: Commit**

```bash
git add miniapp/src/index.css
git commit -m "refactor(rwarm): delete the M3 token + component layer

R-warm is now the sole design system. Fixes the dark-mode black-pills
root cause (M3 containers derived from Telegram's secondary-bg).

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 0.7: Add the no-M3 guard (script + vitest + CI)

**Files:** Create `miniapp/scripts/check-no-m3.sh`, `miniapp/src/no-m3.guard.test.ts`; modify `.github/workflows/ci.yml`.

- [ ] **Step 1: Create the guard script**

`miniapp/scripts/check-no-m3.sh`:
```bash
#!/usr/bin/env bash
# Fail if any M3 reference remains in the miniapp source or CSS.
set -euo pipefail
cd "$(dirname "$0")/.."
if grep -rnE --include="*.tsx" --include="*.ts" --include="*.css" \
  "(--m3-|card-m3|card-m3-low|input-m3|surface-m3|navbar-m3|btn-m3-|text-m3-)" src index.css; then
  echo "❌ M3 reference found — purge it (see R-warm consolidation plan)."
  exit 1
fi
echo "✓ no M3 references."
```
Make it executable: `chmod +x miniapp/scripts/check-no-m3.sh`

- [ ] **Step 2: Create the vitest guard test**

`miniapp/src/no-m3.guard.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const M3 = /\b(--m3-[a-z-]+|card-m3|card-m3-low|input-m3|surface-m3|navbar-m3|btn-m3-[a-z]+|text-m3-[a-z]+)\b/;

describe("no M3 references", () => {
  it("no source file or index.css references M3 tokens/classes", () => {
    const offenders: string[] = [];
    const check = (path: string, text: string) => {
      const m = text.match(M3);
      if (m) offenders.push(`${path}: ${m[0]}`);
    };
    // index.css
    check("index.css", readFileSync(join(ROOT, "index.css"), "utf8"));
    // recurse src
    const visit = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name === "dist") continue;
        const p = join(dir, e.name);
        if (e.isDirectory()) visit(p);
        else if (/\.(tsx?|css)$/.test(e.name)) check(p, readFileSync(p, "utf8"));
      }
    };
    visit(ROOT);
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the guard — expect PASS (all M3 already purged in 0.6)**

Run: `cd miniapp && bash scripts/check-no-m3.sh && npx vitest run src/no-m3.guard.test.ts`
Expected: script prints `✓ no M3 references.`; test PASS.

- [ ] **Step 4: Wire the script into CI**

In `.github/workflows/ci.yml`, add a step in the miniapp job (after install, before/with build):
```yaml
      - name: No-M3 guard
        run: bash miniapp/scripts/check-no-m3.sh
```
(Place it adjacent to the existing `npm run build` / `vitest` steps for miniapp — read the file first to match the existing job structure.)

- [ ] **Step 5: Build + full test**

Run: `cd miniapp && npm run build && npx vitest run`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add miniapp/scripts/check-no-m3.sh miniapp/src/no-m3.guard.test.ts .github/workflows/ci.yml
git commit -m "test(rwarm): add no-M3 guard (script + vitest + CI)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Phase 1 — Home cards (variant A)

### Task 1.1: Add Home card copy

**Files:** Modify `miniapp/src/copy.ts`

- [ ] **Step 1: Add card strings to the `home` section**

Inside the existing `home: { … }` block, add (near the other `card*Title` entries):

```ts
    cardDreamsTitle: "Мечты",
    dreamsMeta: (open: number, done: number) => `${open} мечтаем · ${done} сбылось →`,
    dreamsEmpty: "Добавьте первую мечту →",
    cardGiftsTitle: "Подарки",
    giftsWaitingMeta: "ждёт вас — примите →",
    giftsMeta: (active: number, deeds: number) => `${active} в пути · ${deeds} добрых дел →`,
    giftsEmpty: "Подарите доброе дело →",
    cardNotesTitle: "Записки",
    notesMetaNew: (unread: number, days: number) =>
      `${unread} новых · последняя ${days} дн. назад →`,
    notesMeta: (days: number) => `последняя ${days} дн. назад →`,
    notesEmpty: "Напишите тёплые слова →",
```

- [ ] **Step 2: Build check**

Run: `cd miniapp && npm run build`
Expected: 0 TS errors.

- [ ] **Step 3: Commit**

```bash
git add miniapp/src/copy.ts
git commit -m "feat(home): add copy for dreams/gifts/notes preview cards

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 1.2: `PreviewCard` + live Home cards

**Files:** Modify `miniapp/src/screens/Home.tsx`; extend `miniapp/src/screens/Home.test.tsx`.

**Interfaces:**
- Consumes: `endpoints.listBucket` → `BucketItem[]` (`BucketItem` from `../types`); `endpoints.listGifts` → `GiftsResponse` (`{ items: GiftItem[]; partnerName: string }`, `GiftsResponse` from `../sdk/api`); `endpoints.listLoveNotes` → `LoveNoteItem[]` (`LoveNoteItem` from `../sdk/api`).
- Produces: `<Home onOpen={…} />` renders three `PreviewCard`s replacing the old `EntryCard`s; same `onOpen` prop signature.

- [ ] **Step 1: Verify the `LoveNoteItem.createdAt` field name**

Run: `cd miniapp && grep -n "LoveNoteItem\|createdAt" src/sdk/api.ts`
Confirm `LoveNoteItem` has a `createdAt: string` field. Use whatever timestamp field it actually has in Step 4's `daysAgo` computation.

- [ ] **Step 2: Write the failing test (extend Home.test.tsx)**

Add `listBucket`, `listGifts`, `listLoveNotes` to the mocked `endpoints` in `Home.test.tsx`, and add assertions. Replace the existing endpoints mock block's contents to include:

```ts
      listBucket: vi.fn().mockResolvedValue([
        { id: "b1", title: "Увидеть северное сияние", note: null, status: "dreaming" },
        { id: "b2", title: "Съездить на океан", note: null, status: "dreaming" },
        { id: "b3", title: "Старая мечта", note: null, status: "done" },
      ]),
      listGifts: vi.fn().mockResolvedValue({
        items: [
          { id: "g1", gesture: "Массаж", description: null, status: "received", direction: "them", createdAt: new Date().toISOString() },
        ],
        partnerName: "Маша",
      }),
      listLoveNotes: vi.fn().mockResolvedValue([
        { id: "n1", body: "очень личный текст", mine: false, readByRecipient: false, createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString() },
      ]),
```

Add a new test inside the `describe("Home", …)` block:

```ts
  it("shows live previews: a dream, a waiting gift (warm), notes count — not the note body", async () => {
    render(<Home onOpen={() => {}} />);
    // a dream title from the open items appears
    await waitFor(() => {
      expect(screen.getByText(/Увидеть северное сияние|Съездить на океан/)).toBeTruthy();
    });
    // the waiting gift warms the card (hero-warm) and shows the gesture + "примите"
    expect(screen.getByText("Массаж")).toBeTruthy();
    expect(screen.getByText(/примите/)).toBeTruthy();
    // notes: count shown, body NEVER rendered on Home (privacy)
    expect(screen.queryByText("очень личный текст")).toBeNull();
    expect(screen.getByText(/новых/)).toBeTruthy();
  });
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd miniapp && npx vitest run src/screens/Home.test.tsx`
Expected: FAIL — the dream title / "примите" not rendered yet (old EntryCard has static subtitles).

- [ ] **Step 4: Implement — replace EntryCard with PreviewCard + live data**

In `Home.tsx`:
- Add `useMemo` to the React import.
- Add imports: `import type { BucketItem } from "../types";`, `import type { GiftsResponse, LoveNoteItem } from "../sdk/api";`
- Add the three hooks and derived values inside `Home`:

```tsx
  const bucket = useApi<BucketItem[]>(endpoints.listBucket);
  const gifts = useApi<GiftsResponse>(endpoints.listGifts);
  const notes = useApi<LoveNoteItem[]>(endpoints.listLoveNotes);

  const dreaming = (bucket.data ?? []).filter((b) => b.status === "dreaming");
  const doneCount = (bucket.data ?? []).filter((b) => b.status === "done").length;
  const dream = useMemo(
    () => (dreaming.length ? dreaming[Math.floor(Math.random() * dreaming.length)] : null),
    [dreaming],
  );

  const gItems = gifts.data?.items ?? [];
  const waiting = gItems.find((g) => g.direction === "them" && g.status === "received") ?? null;
  const activeCount = gItems.filter((g) => !["declined", "archived"].includes(g.status)).length;
  const goodDeeds = gItems.filter((g) => g.status === "complete").length;
  const lastDeed = gItems.find((g) => g.status === "complete") ?? null;

  const nItems = notes.data ?? [];
  const unread = nItems.filter((n) => !n.mine && !n.readByRecipient).length;
  const latest = nItems[0] ?? null;
  const daysAgo = latest
    ? Math.max(0, Math.round((Date.now() - new Date(latest.createdAt).getTime()) / 86_400_000))
    : null;
```

- Replace the three `<EntryCard … />` calls at the bottom of the returned JSX with:

```tsx
      <PreviewCard
        label={COPY.home.cardDreamsTitle}
        title={dream ? `🌌 ${dream.title}` : COPY.home.dreamsEmpty}
        meta={dream ? COPY.home.dreamsMeta(dreaming.length, doneCount) : ""}
        onClick={() => onOpen("bucket")}
      />
      <PreviewCard
        label={COPY.home.cardGiftsTitle}
        warm={!!waiting}
        title={waiting ? `🎁 ${waiting.gesture}` : lastDeed ? `🎁 ${lastDeed.gesture}` : COPY.home.giftsEmpty}
        meta={waiting ? COPY.home.giftsWaitingMeta : lastDeed ? COPY.home.giftsMeta(activeCount, goodDeeds) : ""}
        onClick={() => onOpen("gifts")}
      />
      <PreviewCard
        label={COPY.home.cardNotesTitle}
        title={latest ? COPY.home.notesMetaNew(unread, daysAgo ?? 0) : COPY.home.notesEmpty}
        meta=""
        onClick={() => onOpen("notes")}
      />
```

- Delete the old `EntryCard` function definition and replace it with `PreviewCard`:

```tsx
/** Variant-A preview card: indistinguishable from the ambient cards; the only
 *  accent cue is the meta line. `warm` swaps .card → .hero-warm (used when a
 *  gift is waiting, to draw the eye to the action). */
function PreviewCard({
  label,
  title,
  meta,
  warm = false,
  onClick,
}: {
  label: string;
  title: string;
  meta?: string;
  warm?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={warm ? "hero-warm" : "card"}
      style={{ border: "none", cursor: "pointer", textAlign: "left" }}
    >
      <div className="section-label" style={{ margin: "0 0 4px" }}>{label}</div>
      <div className="card-title">{title}</div>
      {meta ? (
        <div className="meta" style={warm ? { color: "var(--tg-warm)" } : undefined}>{meta}</div>
      ) : null}
    </button>
  );
}
```

> Note: the `style={{ border: "none", cursor: "pointer", textAlign: "left" }}` matches the existing ambient card-buttons in `Home.tsx` (the mood/occasion/qotl cards use the same). Kept for consistency.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd miniapp && npx vitest run src/screens/Home.test.tsx`
Expected: PASS.

- [ ] **Step 6: Build + full test**

Run: `cd miniapp && npm run build && npx vitest run`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add miniapp/src/screens/Home.tsx miniapp/src/screens/Home.test.tsx
git commit -m "feat(home): live preview cards for dreams/gifts/notes (variant A)

Replaces the empty nav EntryCards with content cards fed by
listBucket/listGifts/listLoveNotes. The waiting gift warms (hero-warm).
Notes show only a count (privacy), never the body.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Phase 2A — Three destination pages

### Task 2A.1: Bucket page — R-warm sweep

**Files:** Modify `miniapp/src/screens/Bucket.tsx`

- [ ] **Step 1: Replace raw-tailwind text classes with semantic R-warm classes**

- old: `<p className="text-[15px] font-medium text-tg-text">{item.title}</p>` → new: `<p className="card-title">{item.title}</p>`
- old: `{item.note ? <p className="mt-1 text-sm text-tg-hint">{item.note}</p> : null}` → new: `{item.note ? <p className="card-sub">{item.note}</p> : null}`
- old: `<p className="mt-1 text-xs text-tg-hint">{bucketStatusLabel(item.status)}</p>` → new: `<p className="meta">{bucketStatusLabel(item.status)}</p>`
- old: `<span className="self-center text-sm text-tg-hint">🌌 сбылось</span>` → new: `<span className="meta" style={{ alignSelf: "center" }}>🌌 сбылось</span>`
- old: `<p className="py-10 text-center text-tg-hint">{COPY.common.loading}</p>` → new: `<p className="meta" style={{ textAlign: "center", padding: "40px 0" }}>{COPY.common.loading}</p>`
- old: `<p className="py-10 text-center text-red-500">{COPY.common.error}</p>` → new: `<p className="meta" style={{ textAlign: "center", padding: "40px 0", color: "var(--tg-danger)" }}>{COPY.common.error}</p>`
- old: `<Button variant="warm" onClick={() => setAdding(true)} disabled={atLimit} style={{ marginBottom: 12 }}>` → new: `<Button variant="warm" onClick={() => setAdding(true)} disabled={atLimit} className="mb-3">`

- [ ] **Step 2: Build + test**

Run: `cd miniapp && npm run build && npx vitest run src/screens/Bucket.test.tsx`
Expected: green (behavior unchanged; class swaps only).

- [ ] **Step 3: Commit**

```bash
git add miniapp/src/screens/Bucket.tsx
git commit -m "refactor(rwarm): Bucket page to canonical classes

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2A.2: Gifts page — action-first hero + R-warm sweep

**Files:** Modify `miniapp/src/screens/Gifts.tsx`, `miniapp/src/copy.ts`, extend `miniapp/src/screens/Gifts.test.tsx`.

**Interfaces:**
- Consumes: `GiftsResponse` (`items: GiftItem[]`, `partnerName`); `GiftItem` has `direction: "me"|"them"`, `status`, `gesture`, `description`.
- Produces: a `.hero-warm` block at the top when a gift awaits the recipient (`direction==="them" && status==="received"`), with accept/decline; the list excludes that gift.

- [ ] **Step 1: Add copy**

In `copy.ts` `gifts` section add: `waitingForYou: "Ждёт вас",`

- [ ] **Step 2: Write the failing test (extend Gifts.test.tsx)**

Add a waiting gift to the mock and assert it renders first. In the `vi.mock("../sdk/api", …)` block, change `listGifts` to return a waiting gift:

```ts
      listGifts: vi.fn().mockResolvedValue({
        items: [
          { id: "g-w", gesture: "Массаж", description: "15 минут", status: "received", direction: "them", createdAt: new Date().toISOString() },
        ],
        partnerName: "Маша",
      }),
```

Add a describe block:

```ts
describe("Gifts — action-first hero", () => {
  it("renders a waiting gift in the hero with an accept button", async () => {
    render(<Gifts />);
    expect(await screen.findByText("Ждёт вас")).toBeTruthy();
    expect(screen.getByText("Массаж")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Принять/ })).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd miniapp && npx vitest run src/screens/Gifts.test.tsx`
Expected: FAIL — "Ждёт вас" not rendered.

- [ ] **Step 4: Implement the hero + R-warm sweep**

In `Gifts.tsx`, compute the waiting gift (reuse the `act()` helper that already exists):

```tsx
  const waiting = items.find((g) => g.direction === "them" && g.status === "received") ?? null;
```

Insert the hero immediately after the `<Button …>🎁 {COPY.common.add}</Button>` line (and before the `loading ? …` block):

```tsx
      {waiting ? (
        <div className="hero-warm" style={{ marginTop: 12 }}>
          <div className="section-label" style={{ margin: "0 0 4px" }}>{COPY.gifts.waitingForYou}</div>
          <p className="card-title">🎁 {waiting.gesture}</p>
          {waiting.description ? <p className="card-sub">{waiting.description}</p> : null}
          <div className="card-actions">
            <button type="button" className="card-act warm" onClick={() => act(waiting, "accept")}>
              {COPY.gifts.acceptButton}
            </button>
            <button type="button" className="card-act" onClick={() => act(waiting, "decline")}>
              {COPY.gifts.declineButton}
            </button>
          </div>
        </div>
      ) : null}
```

In the active list `.map`, exclude the waiting gift so it isn't shown twice:

old: `{active.map((g) => (` → new: `{active.filter((g) => g.id !== waiting?.id).map((g) => (`

R-warm sweep on the existing list cards + good-deeds heading:
- old: `<p className="text-[15px] font-medium text-tg-text">{g.gesture}</p>` → new: `<p className="card-title">{g.gesture}</p>`
- old: `<p className="mt-1 text-sm text-tg-hint">{g.description}</p>` → new: `<p className="card-sub">{g.description}</p>`
- old: `<p className="mt-1 text-xs text-tg-hint">` (the direction/status line) → new: `<p className="meta">`
- old: `<h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-tg-hint">` (good-deeds heading) → new: `<h2 className="section-label">`
- catalog tile: old: `className="card-m3 p-3 text-left transition active:scale-[0.98] disabled:opacity-50"` → new: `className="card p-3 text-left transition active:scale-[0.98] disabled:opacity-50"`
- catalog tile gesture/desc: old `text-sm font-medium text-tg-text` → `card-title`; old `text-xs text-tg-hint` → `card-sub`.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd miniapp && npx vitest run src/screens/Gifts.test.tsx`
Expected: PASS.

- [ ] **Step 6: Build + full test**

Run: `cd miniapp && npm run build && npx vitest run`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add miniapp/src/screens/Gifts.tsx miniapp/src/screens/Gifts.test.tsx miniapp/src/copy.ts
git commit -m "feat(gifts): action-first hero for waiting gifts + R-warm sweep

The gift awaiting the recipient is lifted into a hero-warm card above the
list, answering the home card's promise. Catalog/list -> canonical classes.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2A.3: LoveNotes page — unread badge + R-warm spots

**Files:** Modify `miniapp/src/screens/LoveNotes.tsx`

- [ ] **Step 1: R-warm sweep + unread emphasis**

- old: `<p className="text-[15px] leading-snug text-tg-text">{n.body}</p>` → new: `<p className="card-title">{n.body}</p>`
- old: `<p className="rw-meta mt-1">новое</p>` → new: `<span className="meta" style={{ color: "var(--tg-warm)" }}>● новое</span>`
- old (loaders): `<p className="py-10 text-center text-tg-hint">{COPY.common.loading}</p>` → new: `<p className="rw-empty">{COPY.common.loading}</p>`; likewise the error line `text-red-500` → `style={{ color: "var(--tg-danger)" }}` on a `.rw-empty`.

- [ ] **Step 2: Build + test**

Run: `cd miniapp && npm run build && npx vitest run`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add miniapp/src/screens/LoveNotes.tsx
git commit -m "refactor(rwarm): LoveNotes — unread badge + canonical classes

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Phase 2B — R-warm fidelity sweep (rest of app)

> Mechanical: replace raw tailwind utilities that duplicate a canonical R-warm class, and inline cosmetic styles, with the canonical class. Each task: apply the swaps, then `npm run build && npx vitest run` green, then commit. The find-string is the exact current className/style fragment.

### Task 2B.1: Wishlist.tsx (raw-tailwind rest)

- `text-tg-hint` (loader, ~200) → `meta`
- `style={{ marginBottom: 12 }}` (~183) → `className="… mb-3"`
- inline `flex/textAlign/fontSize` (~207, 211, 219, 243, 245, 249, 251, 329, 332, 334, 340, 342, 354, 364) → equivalent Tailwind utilities (`flex-1 text-center justify-center`, `truncate`, `line-clamp-2`, `text-3xl`, `w-14 h-14 rounded-2xl object-cover shrink-0`, etc.); `fontSize: 13` → `.card-sub`/`.meta`; `color: var(--tg-button)` → `.meta`.

Apply each, then:
- [ ] build+test green; commit `refactor(rwarm): Wishlist raw-tailwind → canonical classes`.

### Task 2B.2: Countdowns.tsx (inline stat rest)

- inline `fontSize: 28, fontWeight: 700, color: "var(--tg-warm|button)"` (~223, 236) → `.stat-big` (override color inline only if needed)
- `text-sm`/`text-xs` (~287, 296) → `card-sub`/`meta`; `style={{ color: "var(--tg-hint)" }}` (~296) → `.meta`
- cosmetic inline margins → Tailwind utilities.

Apply, then build+test green; commit `refactor(rwarm): Countdowns inline → canonical classes`.

### Task 2B.3: QuestionOfTheDay.tsx (raw-tailwind rest)

- `text-xs uppercase tracking-wide text-tg-hint` (~76) → `section-label`
- `text-[15px] leading-relaxed text-tg-text` (~77, 108) → `card-title`
- `mb-2 text-sm text-tg-text` (~82) → `card-sub`
- `mt-1 text-right text-xs text-tg-hint` (~91) → `meta`
- `text-sm text-tg-text` (~117) → `card-title`; `mt-2 text-sm text-tg-text` (~121) → `card-title`; `text-tg-hint` (~118, 122) → `meta`; `mt-2 text-sm text-tg-hint` (~128) → `meta`.

Apply, then build+test green; commit `refactor(rwarm): QOTD raw-tailwind → canonical classes`.

### Task 2B.4: Mood.tsx (inline rest)

- inline `fontSize: 24` (~94, 98) → leave on the emoji span (acceptable) or extract; `style={partner.hint ? { color: "var(--tg-hint)" } : undefined}` (~97) → `.meta`
- inline `display: flex, gap: 8, marginTop: 8` / `flex: 1` (~121, 122, 125) → `flex gap-2 mt-2` / `flex-1`.

Apply, then build+test green; commit `refactor(rwarm): Mood inline → canonical classes`.

### Task 2B.5: Shared components polish

- `Field.tsx`: no further M3; ensure no inline (clean — skip if none).
- `Modal.tsx`: title already `.heading` (Phase 0); skip if none remain.
- `Toast.tsx`: `text-sm font-medium` (~124) → `card-sub`/`.meta`.
- `EmptyState.tsx`: audit found it uses `.empty-state` (canonical) — verify; if raw utilities, swap to `.empty-state .emoji/.title/.desc`.
- `Ambient.tsx`: inline `fontSize` overrides (~14, 17, 38, 39, 66, 83, 166) → drop redundant `.stat-big` override; move one-shot emoji sizes to a utility or leave (LOW — acceptable to defer).

Apply the non-deferred swaps, then build+test green; commit `refactor(rwarm): shared components raw-tailwind/inline → canonical`.

---

## Self-Review

**1. Spec coverage:**
- Home cards variant A (live previews, gift warms, notes privacy): Task 1.2 ✅
- Full M3 purge (rewire, `--tg-danger`, delete, lint): Tasks 0.1–0.7 ✅
- Three destination pages (Gifts action-first hero; Bucket/LoveNotes cleanup): 2A.1–2A.3 ✅
- R-warm fidelity sweep (rest of app): 2B.1–2B.5 ✅
- `text-red-500` → danger: handled in 0.5 (screens) + 2A.1 (Bucket) ✅
- Gaps: none. (Admin polish `.meta-mono`/`.card-highlight`, feed length — explicitly non-goals.)

**2. Placeholder scan:** No TBD/TODO. Every code step shows the actual edit. 2B tasks use "find-string → class" form with exact current fragments from the audit; acceptable as complete for mechanical class swaps. The Stats.tsx delete is gated on a grep (concrete).

**3. Type consistency:**
- `BucketItem` (`../types`), `GiftsResponse` + `GiftItem` (`../sdk/api`), `LoveNoteItem` (`../sdk/api`) — imported consistently in Task 1.2. `createdAt` field verified in Step 1 of 1.2.
- `PreviewCard` props (`label/title/meta?/warm?/onClick`) match all three call sites.
- `act(item, action)` signature reused in 2A.2 matches the existing `Gifts.tsx` helper.
- `.chip.is-active` class exists in `index.css` (canonical). `.hero-warm`, `.card-actions`, `.card-act.warm`, `.stat-big`, `.meta`, `.section-label`, `.card-title`, `.card-sub`, `.toast`, `.input`, `.empty-state` — all defined in `index.css`.

**4. Ordering safety:** M3 usages are migrated (0.4, 0.5) and ripple relocated (0.3) BEFORE the M3 CSS block is deleted (0.6), so no intermediate commit references a deleted class/token. `--tg-danger` added (0.1) before any `--m3-error`/`text-red-500` migration (0.4, 0.5, 2A.1).
