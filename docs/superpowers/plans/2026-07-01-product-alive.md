# Product Alive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** MoodCard connector lights on same-mood (resonance); DateWheel result card bounces in + haptic on land.

**Architecture:** Frontend-only. MoodCard: conditional connector style based on `self.mood === partner.mood`. DateWheel: bounce class on result card + haptic. Two `@keyframes` added to index.css.

**Tech Stack:** React 18 + TS + Vite, vitest. R-warm tokens. Russian copy.

## Global Constraints
- Frontend-only. Colors via `var(--tg-*)`.
- Mood-resonance is ambient/visual ONLY — no notification/haptic on mood change (mood-sync contract).
- "Same mood" = exact equal mood value strings, both non-null.
- Bounce = result card, not the wheel.
- TDD; frequent commits.

---

### Task 1: MoodCard resonance

**Files:**
- Modify: `miniapp/src/components/home-cards/MoodCard.tsx`, `miniapp/src/index.css`
- Test: `miniapp/src/components/home-cards/MoodCard.test.tsx`

**Interfaces:** none new.

- [ ] **Step 1: Write failing tests** (read MoodCard.test.tsx first for the mock-mood fixture pattern)

```typescript
it("lights the connector when both partners share the same mood", () => {
  const mood = { self: { mood: "хорошо", note: null, setAt: "…" }, partner: { mood: "хорошо", … }, partnerName: "…" };
  render(<MoodCard mood={mood as any} onClick={() => {}} />);
  const arc = document.querySelector("path"); // the connector arc
  expect(arc?.getAttribute("stroke-dasharray")).toBeFalsy(); // solid (no dash) in resonance
});

it("keeps the dotted calm connector when moods differ", () => {
  const mood = { self: { mood: "хорошо", … }, partner: { mood: "радостно", … }, partnerName: "…" };
  render(<MoodCard mood={mood as any} onClick={() => {}} />);
  const arc = document.querySelector("path");
  expect(arc?.getAttribute("stroke-dasharray")).toBeTruthy(); // dotted
});
```

(Adapt fixture shapes to MoodCard's real MoodResponse. Note: a more robust assertion may be on a data-attr or class — read the impl to pick the cleanest signal; the key is "resonance vs not" is distinguishable in the DOM.)

- [ ] **Step 2: Run → FAIL**

Run: `cd miniapp && npx vitest run src/components/home-cards/MoodCard.test.tsx -t "connector"`

- [ ] **Step 3: Implement**

In `MoodCard.tsx`:
- Compute `const inResonance = !!self?.mood && !!partner?.mood && self.mood === partner.mood;` (after self/partner are derived).
- The SVG path: `strokeDasharray={inResonance ? undefined : "2 3"}`, `strokeWidth={inResonance ? 2 : 1.6}`, `opacity={inResonance ? 1 : 0.85}`.
- The node circle: add `style={inResonance ? { filter: "drop-shadow(0 0 6px var(--tg-warm))", animation: "resonance-pulse 1.6s ease-in-out infinite", transformOrigin: "22px 6px" } : undefined}` and className `resonance-node` when inResonance.
- Label: when inResonance, color warm + fontWeight 700; else current muted.

In `index.css`, add near the other keyframes:
```css
@keyframes resonance-pulse {
  0%, 100% { transform: scale(1); opacity: 0.9; }
  50% { transform: scale(1.4); opacity: 1; }
}
```

- [ ] **Step 4: Run → PASS; full MoodCard suite + build**

Run: `cd miniapp && npx vitest run src/components/home-cards/MoodCard.test.tsx && npm run build`

- [ ] **Step 5: Commit**

```bash
git add miniapp/src/components/home-cards/MoodCard.tsx miniapp/src/components/home-cards/MoodCard.test.tsx miniapp/src/index.css
git commit -m "feat(mood-card): connector resonance when both moods match"
```

---

### Task 2: DateWheel land-bounce + haptic

**Files:**
- Modify: `miniapp/src/components/DateWheel.tsx`, `miniapp/src/index.css`
- Test: `miniapp/src/components/DateWheel.test.tsx`

**Interfaces:** none new.

- [ ] **Step 1: Write failing tests**

In `DateWheel.test.tsx` (read existing test patterns; it mocks endpoints + haptic):

```typescript
it("bounces the result card in and fires a haptic on land", async () => {
  const hapticMock = vi.fn();
  // ... render, trigger a spin, advance to result ...
  const result = await screen.findByText(/<some result text>/);
  expect(result.closest(".date-result-bounce")).not.toBeNull();
  expect(hapticMock).toHaveBeenCalledWith("medium");
});
```

(Adapt to how DateWheel.test mocks haptic + reaches the result phase — likely fake timers + a resolved idea.)

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implement**

In `DateWheel.tsx`:
- On the phase flip to "result" (find where `setPhase("result")` is called), add `haptic("medium")` (import from `../sdk/twa`).
- Wrap the result card JSX (the `{phase === "result" && idea && (...)}` block's outer div) with `className="date-result-bounce"`.

In `index.css`:
```css
@keyframes date-result-bounce {
  0% { transform: translateY(8px) scale(0.94); opacity: 0; }
  60% { transform: translateY(-3px) scale(1.02); opacity: 1; }
  100% { transform: translateY(0) scale(1); opacity: 1; }
}
.date-result-bounce { animation: date-result-bounce 0.5s cubic-bezier(0.2, 0.8, 0.3, 1.2) both; }
```

- [ ] **Step 4: Run → PASS; full DateWheel suite + build**

- [ ] **Step 5: Commit**

```bash
git add miniapp/src/components/DateWheel.tsx miniapp/src/components/DateWheel.test.tsx miniapp/src/index.css
git commit -m "feat(date-wheel): result card land-bounce + haptic"
```

---

### Task 3: Full build, test, deploy

- [ ] **Step 1:** `cd miniapp && npx vitest run && npm run build` → all green.
- [ ] **Step 2:** merge to main + push + deploy.
- [ ] **Step 3:** verify health + live bundle has `date-result-bounce` / `resonance-pulse`.

---

## Self-Review
- Spec coverage: MoodCard resonance (T1), DateWheel bounce+haptic (T2). Both frontend-only, ambient (no notifications).
- No backend, no behavior regression.
