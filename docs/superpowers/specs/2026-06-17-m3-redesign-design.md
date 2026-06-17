# M3 Redesign — Design Spec

**Date:** 2026-06-17
**Status:** approved
**Scope:** Full Material 3 transition for the Mini App (React + Tailwind)

## Decisions

| # | Topic | Decision |
|---|-------|----------|
| 1 | Visual system | Pure M3 — opaque surfaces, tonal elevation, no glass-morphism |
| 2 | Implementation | M3 principles via Tailwind CSS — no Material Web Components library |
| 3 | Color source | Telegram `--tg-theme-*` vars as primary source → M3 roles on top |
| 4 | Approach | Bottom-up: tokens → NavBar → cards/buttons → rest |
| 5 | Glass | `.top-blur` class removed; `backdrop-blur` removed from all components |
| 6 | Scope | Tokens + NavBar + all 6 screens + StatsCard + Toast + type scale + shape + ripple |

---

## 1. CSS Token System

Added to `miniapp/src/index.css`. All components reference `--m3-*` variables, never hardcoded values.

### 1.1 Color roles

M3 roles derived from Telegram theme vars (light/dark auto-switch inherited):

```css
--m3-primary: var(--tg-theme-button-color)
--m3-on-primary: var(--tg-theme-button-text-color)
--m3-primary-container: color-mix(in srgb, var(--tg-theme-button-color) 12%, transparent)
--m3-on-primary-container: var(--tg-theme-text-color)
--m3-secondary: var(--tg-theme-hint-color)
--m3-on-secondary: #fff
--m3-secondary-container: color-mix(in srgb, var(--tg-theme-hint-color) 12%, transparent)
--m3-surface: var(--tg-theme-bg-color)
--m3-surface-container-lowest: color-mix(in srgb, var(--tg-theme-secondary-bg-color) 40%, var(--tg-theme-bg-color))
--m3-surface-container: var(--tg-theme-secondary-bg-color)
--m3-surface-container-high: color-mix(in srgb, var(--tg-theme-secondary-bg-color) 80%, var(--tg-theme-hint-color))
--m3-on-surface: var(--tg-theme-text-color)
--m3-on-surface-variant: var(--tg-theme-hint-color)
--m3-outline: color-mix(in srgb, var(--tg-theme-hint-color) 30%, transparent)
--m3-outline-variant: color-mix(in srgb, var(--tg-theme-hint-color) 16%, transparent)
--m3-error: var(--tg-theme-destructive-text-color, #dc2626)
--m3-on-error: #fff
--m3-error-container: color-mix(in srgb, var(--tg-theme-destructive-text-color, #dc2626) 12%, transparent)
```

### 1.2 Elevation (shadows — replace glass)

```css
--m3-elevation-0: none
--m3-elevation-1: 0 1px 2px 0 rgba(0,0,0,.08), 0 1px 3px 1px rgba(0,0,0,.04)
--m3-elevation-2: 0 1px 2px 0 rgba(0,0,0,.12), 0 2px 6px 2px rgba(0,0,0,.06)
--m3-elevation-3: 0 4px 8px 3px rgba(0,0,0,.08), 0 1px 3px 0 rgba(0,0,0,.06)
```

Elevation usage:
- `0` — base surface (page background)
- `1` — cards, chips, list items
- `2` — NavBar, FAB, dialogs
- `3` — modal overlays

### 1.3 Shape (border-radius tokens)

```css
--m3-shape-extra-small: 4px
--m3-shape-small: 8px
--m3-shape-medium: 12px   /* default card radius */
--m3-shape-large: 16px    /* modal, large card */
--m3-shape-full: 9999px   /* pill, chip, FAB */
```

### 1.4 Typography scale

```css
.text-m3-label     { font-size: 12px; line-height: 16px; font-weight: 500; letter-spacing: 0.5px; }
.text-m3-body      { font-size: 14px; line-height: 20px; font-weight: 400; }
.text-m3-title     { font-size: 16px; line-height: 24px; font-weight: 500; }
.text-m3-headline  { font-size: 24px; line-height: 32px; font-weight: 400; }
```

These are Tailwind `@layer utilities` classes applied directly — no CSS custom properties needed (type scale is not a single scalar value).

---

## 2. NavBar Component

**New file:** `miniapp/src/components/NavBar.tsx`

### 2.1 Visual spec

| Property | Value |
|----------|-------|
| Background | `var(--m3-surface-container)` |
| Elevation | `var(--m3-elevation-2)` |
| Active indicator | Pill: `var(--m3-primary-container)` bg, `--m3-shape-full` edges, 32px height |
| Indicator width | ~64px (content-driven, min-width) |
| Indicator transition | `transform: translateX(...)` with `transition: transform 300ms ease-out` |
| Tab label size | 12px, `--m3-typescale-label-medium` |
| Tab icon | Emoji, 20px, `scale(1.1)` when active |
| Active label | `var(--m3-primary)` color |
| Inactive label | `var(--m3-on-surface-variant)` color |
| Ripple | Radial background from touch point, fades over 400ms |
| Height | 80px (incl. safe area) |
| Layout | 6-column grid, `max-w-md`, `mx-auto` |

### 2.2 Component API

```tsx
interface NavBarProps {
  tab: Tab;
  onTabChange: (tab: Tab) => void;
}
```

### 2.3 Animation details

**Pill slide:** The active indicator `<span>` is absolutely positioned inside each `<li>`. On tab change, `transform: translateX(calc(index * width))` moves it. The `<li>` acts as the positioning container.

**Ripple:** On `pointerdown`, create a `<span>` at the event coordinates with `absolute` positioning. Animate: scale from 0 → circle, opacity 0.3 → 0, duration 400ms. Remove after animation.

**Icon bounce:** Active emoji gets `transform: scale(1.1); transition: transform 200ms ease-out`.

### 2.4 What changes in App.tsx

- Remove inline `<nav>` element (lines 60-88)
- Add `<NavBar tab={tab} onTabChange={setTab} />`
- Remove `text-tg-link`/`text-tg-hint` references in nav context
- `TABS` array content moves into NavBar (or stays and is passed as prop)

---

## 3. Cards (all screens)

### 3.1 Current state
Each screen has ad-hoc card styling: glass `backdrop-blur`, semi-transparent `bg`, inconsistent padding and radius.

### 3.2 M3 card spec

| Property | Value |
|----------|-------|
| Background | `var(--m3-surface-container)` or `var(--m3-surface-container-lowest)` (varies by card level) |
| Shadow | `var(--m3-elevation-1)` |
| Border-radius | `var(--m3-shape-medium)` (12px) |
| Padding | 16px |
| Gap between cards | 12px |
| Border | `1px solid var(--m3-outline-variant)` (subtle) |

### 3.3 Card variants

- **List card** (wishlist items, bucket items, gifts): `surface-container` + `elevation-1` + 12px radius
- **Input card** (mood, QOTD, add-form): `surface-container-lowest` + `elevation-0` + `outline-variant` border
- **Highlight card** (active countdown): `primary-container` bg, `on-primary-container` text

### 3.4 Migration approach
One screen at a time. Remove `backdrop-blur` / `.top-blur` classes, replace with `shadow-[var(--m3-elevation-1)]` and `bg-[var(--m3-surface-container)]`. Apply uniform `rounded-[12px] p-4`.

---

## 4. Buttons

### 4.1 Current state
Ad-hoc buttons: `<button>` with emoji labels, sometimes text-only, inconsistent sizing.

### 4.2 M3 button variants (Tailwind utility classes)

| Variant | Background | Text | Border | Usage |
|---------|-----------|------|--------|-------|
| `.btn-m3-filled` | `primary` | `on-primary` | none | Primary action (Save, Add) |
| `.btn-m3-outlined` | transparent | `primary` | `outline` 1px | Secondary action (Cancel) |
| `.btn-m3-text` | transparent | `primary` | none | Tertiary (Edit, Delete, small) |

All: 14px medium, 8-16px horizontal padding, 10px vertical, `--m3-shape-full` (pill), ripple on press.

### 4.3 Icon button
24px × 24px icon-only: transparent bg, `on-surface-variant` color, ripple. For: close, action icons.

---

## 5. Input Fields

M3 Outlined Text Field style:

| Property | Value |
|----------|-------|
| Background | `surface-container-lowest` |
| Border | `1px solid outline-variant` |
| Focus border | `2px solid primary` |
| Border-radius | `--m3-shape-extra-small` (4px) |
| Padding | 12px 16px |
| Font | `--m3-typescale-body-medium` |
| Label | 12px, `on-surface-variant`, above the field |

---

## 6. StatsCard (`components/Stats.tsx`)

| Change | From | To |
|--------|------|----|
| Background | Glass blur | `surface-container` + `elevation-1` |
| Border | Glass hairline | `outline-variant` 1px |
| Typography | Ad-hoc sizes | `label-medium` (numbers), `body-medium` (labels) |
| Shape | Default | `--m3-shape-medium` (12px) |
| Gap | Default | 16px between stat items |

Stats icons (emoji): 24px, inline with text. No extra styling needed beyond the card container.

---

## 7. MilestoneToast (`components/Toast.tsx`)

| Change | From | To |
|--------|------|----|
| Background | Glass + blur | `surface-container-high` + `elevation-3` |
| Border | Glass hairline | `outline-variant` 1px |
| Shape | Default | `--m3-shape-full` (pill) |
| Position | Fixed, top | Fixed, bottom (above NavBar in M3 style) |
| Animation | Fade | Slide up + fade (M3 Snackbar enter) |

Toast stays at the bottom (M3 Snackbar position), above the NavBar. Auto-dismiss 3s.

---

## 8. Ripple Component

**New file:** `miniapp/src/components/Ripple.tsx`

### 8.1 Props

```tsx
interface RippleProps {
  children: React.ReactNode;
  className?: string;
}
```

### 8.2 Behavior
- Wraps children in a `relative overflow-hidden` container
- On `pointerdown` inside: creates a `<span>` at (clientX, clientY) relative to container
- Span starts at scale 0, animates to circle covering the element, then fades
- `bg-[var(--m3-on-surface)]` at opacity 0.1
- Duration: 400ms expand, 200ms fade
- After animation: remove the span from DOM

### 8.3 Usage
- NavBar tab buttons
- All `.btn-m3-*` buttons
- Interactive cards (optional — tap feedback)

---

## 9. Implementation Order

| Step | What | Files |
|------|------|-------|
| 1 | **CSS tokens** | `index.css` — add M3 vars |
| 2 | **Remove glass** | `index.css` — delete `backdrop-blur` references, `.top-blur` class |
| 3 | **NavBar component** | New `components/NavBar.tsx` + update `App.tsx` |
| 4 | **Ripple** | New `components/Ripple.tsx` |
| 5 | **Type scale classes** | `index.css` — `.text-m3-label`, `.text-m3-body`, `.text-m3-title`, `.text-m3-headline` |
| 6 | **Cards** | All 6 `screens/*.tsx` — replace glass with elevation + surface tokens |
| 7 | **Buttons** | Add `.btn-m3-*` classes to `index.css`, use in all screens |
| 8 | **Inputs** | Style text inputs in Mood, QOTD, Wishlist add-form |
| 9 | **StatsCard** | `components/Stats.tsx` — glass → surface + elevation |
| 10 | **Toast** | `components/Toast.tsx` — glass → Snackbar-style |
| 11 | **Polish** | Verify light/dark, spacing, pass over all screens for missed glass |

---

## 10. Non-goals (explicitly scoped out)

- Adding a component library (Material Web Components, shadcn/ui)
- Changing app logic, data flow, or API calls
- FAB (Floating Action Button) — evaluate after core transition
- Changing the 6-tab model or screen count
- Dark/light mode system — inherited from Telegram already
- `tailwind.config.js` changes — staying with utility classes, no Tailwind config theme extension

---

## 11. Risk: Telegram theme var changes

If Telegram changes their CSS variable names or values, M3 tokens break. Mitigation: all M3 tokens are in one CSS block; Telegram vars are referenced only there. A future Telegram theme change is a single-block fix.