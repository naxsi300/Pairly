# First Impression — Bundle C

**Date:** 2026-07-01
**Status:** Approved (self-decided)
**Scope:** Frontend-only (miniapp).

## Goal
The day-1 experience and error/limit surfaces are the most-seen, least-polished parts. Four fixes:
1. **Warm Modal vs `alert()`** — 7 native `alert()` calls (limit-hit CTAs) break the warm tone; replace with a `<Modal>` "info" sheet.
2. **First-run welcome hero** — a brand-new pair sees 9 empty cards; instead show ONE hero with 3 guided CTAs until they create anything.
3. **EmptyState one-tap seed action** — `EmptyState` gains an optional `action` prop so empty lists have a single tap to seed.
4. **Pair-not-linked banner** — an unpaired user sees empty cards; show "Invite partner: /pair in bot" with an open-bot button.

## Decisions (self-resolved)
1. **alert() → a single `<UpgradeModal>` component** (not 7 bespoke modals). It takes `open/onClose/onDeleteOld?`. Copy: "Скоро подключим оплату — пока можно убрать что-то старое" + a "Убрать старое" button (calls `onDeleteOld`) and "Ладно". Reused by Paywall + the 3 limit handlers.
2. **First-run detection**: `isFirstRun = !bucket.length && !wishlist.length && !notes.length` (all three empty). Persist dismissal in `localStorage["pairly.welcomed." + pairId]` so it doesn't reappear after they seed one thing. If pairId unknown, key by a stable "welcomed" flag.
3. **First-run hero CTAs**: "🎁 Отправить первый жест" (open Gifts picker), "🗒 Переслать пост боту" (open TG bot via WebApp.openTelegramLink), "💌 Написать записку" (open LoveNotes composer). Tapping any → also dismiss the hero.
4. **EmptyState action**: optional `action: {label, onClick}`. Per-screen wiring: Wishlist→open add modal, Bucket→open add modal, Gifts→open picker, Notes→open composer. Out of scope: Countdowns/QOTD/Mood (they have their own affordances).
5. **Pair-not-linked**: extend `useIsPro` (or a new `usePairStatus`) to expose `hasPair` (true when getPairStats succeeds, false on 412). Home shows the banner above the hero when `!hasPair`. Button → `openTelegramLink("https://t.me/<bot>?start=pair")` (or the bot's chat). Hide once paired.
6. **The two existing banner pills on Home** (loading/error from the earlier audit fix) stay; the welcome hero + pair banner sit above them.

## Design

### `UpgradeModal` component (`miniapp/src/components/UpgradeModal.tsx`)
- Props: `open: boolean; onClose: () => void; onDeleteOld?: () => void; title?: string`.
- Renders `<Modal>` with warm tone, copy from `copy.ts` (`common.upgradeSoon`, `common.deleteOld`).
- If `onDeleteOld` provided, show "Убрать старое" button (warm) + "Ладно" (ghost). Else just "Ладно".
- Replace the 7 `alert()` calls: each `onUpgrade={() => alert(...)}` → `onUpgrade={() => setUpgradeOpen(true)}` (local state per screen) + render `<UpgradeModal onDeleteOld={...} />`.

### First-run hero (`miniapp/src/components/WelcomeHero.tsx` + Home)
- Renders only when `isFirstRun` and not yet dismissed.
- Three big warm buttons (CTAs). On click: call the open-handler + dismiss.
- Home adds `dismissedWelcome` state seeded from localStorage; `WelcomeHero` sits between the loading pill and the cards.

### EmptyState action
- Add `action?: { label: string; onClick: () => void }` to `EmptyStateProps`; render a `.btn-warm` (content-width) below the hint when provided.
- Wire per-screen (Wishlist, Bucket, Gifts, Notes) — minimal: each passes its existing "open add" handler.

### Pair-not-linked banner (`miniapp/src/components/PairNotLinkedBanner.tsx` + usePairStatus)
- `usePairStatus()` (extend useIsPro or new hook): `{ isPro, hasPair }` — `hasPair = !error && data != null`.
- Banner: warm-wash card "Это ваш уголок, но пока только ваш. Пригласите партнёра: /pair в боте" + button "Открыть бота" → `openTelegramLink`. Hidden when `hasPair`.

### Copy (`copy.ts`)
- `common.upgradeSoon`, `common.upgradeOK`, `common.deleteOld`.
- `home.welcomeTitle`, `home.welcomeSub`, `home.welcomeGift`, `home.welcomeForward`, `home.welcomeNote`, `home.welcomeDismissed`.
- `home.pairNotLinkedTitle`, `home.pairNotLinkedSub`, `home.pairNotLinkedCta`.
- (EmptyState action labels reuse existing screen copy, no new keys.)

## Out of scope
- Actual payment integration (still "soon").
- Onboarding tour / multi-step.
- Changing the limit caps.

## Testing
- UpgradeModal: renders copy; "Убрать старое" calls onDeleteOld; dismisses.
- Home: first-run hero shows when all 3 lists empty + not dismissed; dismisses on CTA tap + localStorage set; hidden after.
- EmptyState: action button renders + fires.
- PairNotLinkedBanner: shows when !hasPair; hidden when hasPair; button calls openTelegramLink.

## Success criteria
- No more native `alert()` in the app.
- A new pair sees a calm welcome hero with 3 actions, not 9 empty cards.
- Empty lists have a one-tap seed action.
- An unpaired user sees a clear "invite partner" nudge with a button.
