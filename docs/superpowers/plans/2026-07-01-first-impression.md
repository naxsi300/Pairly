# First Impression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Replace 7 `alert()` with a warm `<UpgradeModal>`; first-run welcome hero with 3 CTAs; EmptyState one-tap seed action; pair-not-linked banner.

**Architecture:** Frontend-only. New components: `UpgradeModal`, `WelcomeHero`, `PairNotLinkedBanner`. Extend `EmptyState` with `action`. Extend `useIsPro`→`usePairStatus` to expose `hasPair`. Home composes the hero + banner above the cards.

**Tech Stack:** React 18 + TS + Vite, vitest. R-warm tokens. Russian copy.

## Global Constraints
- Frontend-only. Colors via `var(--tg-*)`; reuse `.btn-warm`/`.btn-ghost`/Modal/EmptyState.
- Russian copy in `copy.ts`.
- First-run = `!bucket.length && !wishlist.length && !notes.length`; dismiss via `localStorage["pairly.welcomed"]` (pairId-keyed when available).
- hasPair = `getPairStats` succeeds (412 = unpaired).
- TDD; frequent commits.

---

### Task 1: UpgradeModal + replace 7 alert() calls

**Files:**
- Create: `miniapp/src/components/UpgradeModal.tsx`
- Modify: `miniapp/src/components/Paywall.tsx`, `miniapp/src/screens/Bucket.tsx`, `miniapp/src/screens/Countdowns.tsx`, `miniapp/src/screens/Wishlist.tsx`, `miniapp/src/copy.ts`
- Test: `miniapp/src/components/UpgradeModal.test.tsx`

**Interfaces:** `<UpgradeModal open onClose onDeleteOld? title? />`.

- [ ] Step 1: copy keys — add `common.upgradeSoon: "Скоро подключим оплату — пока можно убрать что-то старое"`, `common.upgradeOK: "Ладно"`, `common.deleteOld: "Убрать старое"`.
- [ ] Step 2: failing test — renders copy, "Убрать старое" calls onDeleteOld, "Ладно" calls onClose.
- [ ] Step 3: implement `UpgradeModal` (a `<Modal>` with title=upgradeSoon; if onDeleteOld, a warm "Убрать старое" submit + "Ладно" ghost; else just "Ладно").
- [ ] Step 4: replace the 7 alert() — each screen/Paywall gets `const [upgradeOpen, setUpgradeOpen] = useState(false)` + renders `<UpgradeModal open={upgradeOpen} onClose={...} onDeleteOld={...optional...} />`. `onUpgrade={() => setUpgradeOpen(true)}`. For onDeleteOld, wire the existing "delete oldest" affordance (or just onClose if none).
- [ ] Step 5: run suites + build; commit.

### Task 2: EmptyState action prop + per-screen wiring

**Files:** Modify `miniapp/src/components/EmptyState.tsx`, `Wishlist.tsx`, `Bucket.tsx`, `Gifts.tsx`, `LoveNotes.tsx`; test `miniapp/src/components/EmptyState.test.tsx`.

- [ ] Step 1: failing test — EmptyState renders `action.label` button + calls onClick.
- [ ] Step 2: implement — add `action?: {label; onClick}` to props; render `.btn-warm` (full width) below hint when provided.
- [ ] Step 3: wire per screen (Wishlist→add modal, Bucket→add modal, Gifts→picker, LoveNotes→composer) using each screen's existing open handler + a Russian label (reuse existing copy.add etc.).
- [ ] Step 4: run + build; commit.

### Task 3: WelcomeHero first-run

**Files:** Create `miniapp/src/components/WelcomeHero.tsx`; Modify `miniapp/src/screens/Home.tsx`, `copy.ts`; test `miniapp/src/components/WelcomeHero.test.tsx` + extend `Home.test.tsx`.

- [ ] Step 1: copy keys — `home.welcomeTitle: "Ваш уголок 👋"`, `home.welcomeSub: "Пара тапов — и здесь станет уютно"`, `home.welcomeGift: "🎁 Отправить первый жест"`, `home.welcomeForward: "🗒 Переслать пост боту"`, `home.welcomeNote: "💌 Написать записку"`.
- [ ] Step 2: failing test — WelcomeHero renders 3 CTAs; clicking one calls its handler.
- [ ] Step 3: implement WelcomeHero (props: `onGift/onForward/onNote/onDismiss`).
- [ ] Step 4: Home — compute `isFirstRun` from bucket/wishlist/notes; `dismissed` state from localStorage; render `<WelcomeHero>` (with handlers that open the destination + dismiss) above cards when isFirstRun && !dismissed.
- [ ] Step 5: extend Home.test for hero shown/hidden.
- [ ] Step 6: run + build; commit.

### Task 4: PairNotLinkedBanner + usePairStatus

**Files:** Create `miniapp/src/components/PairNotLinkedBanner.tsx`; Modify `miniapp/src/lib/useIsPro.ts` (or create `usePairStatus.ts`), `Home.tsx`, `copy.ts`; test.

- [ ] Step 1: copy keys — `home.pairNotLinkedTitle: "Это ваш уголок, но пока только ваш"`, `home.pairNotLinkedSub: "Пригласите партнёра: /pair в боте"`, `home.pairNotLinkedCta: "Открыть бота"`.
- [ ] Step 2: failing test — banner renders when !hasPair; hidden when hasPair; button calls openTelegramLink.
- [ ] Step 3: implement `usePairStatus()` returning `{isPro, hasPair}` (hasPair = !error && data != null).
- [ ] Step 4: Home — render `<PairNotLinkedBanner>` above hero when `!hasPair`.
- [ ] Step 5: run + build; commit.

### Task 5: Full build, test, deploy
- [ ] full vitest + build → merge → push → deploy → verify live.

---

## Self-Review
- 7 alerts → 1 UpgradeModal (T1); EmptyState action (T2); WelcomeHero (T3); PairNotLinked (T4). All spec items covered.
- No backend.
