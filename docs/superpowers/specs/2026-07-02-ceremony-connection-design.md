# Bundle E — Ceremony & Connection

**Date:** 2026-07-02
**Status:** Approved (self-decided, autonomous directive)
**Scope:** Frontend-only (miniapp).

## Goal
Two emotional peaks currently pass in silence, and one feature is disconnected:
1. **Dream-fulfilled ceremony** — `markDone` in Bucket fires only a haptic; no celebration. A fulfilled dream is a top-3 emotional moment in a couples app.
2. **Gift-accepted ceremony** — accepting a gift only celebrates if the backend happens to return a milestone; the accept itself deserves a guaranteed warm moment.
3. **DateWheel → Wishlist connection** — the date-idea result is a dead end. Let the couple "сохранить в вишлист" right from the wheel result.

## Decisions (self-resolved)
1. **Dream fulfilled**: on successful `markDone`, emit a milestone `{kind:"bucket_done_count", value: <count>}` (read the new total from bucket data after the optimistic update) AND add `"bucket_done_count"` to `CONFETTI_KINDS` in Toast.tsx (first fulfilled dream → confetti). Plus keep the haptic. The MilestoneToast copy needs a `bucket_done_count` branch (first dream: "Первая сбылась! ✨").
2. **Gift accepted**: when `act(item, "accept")` resolves, emit `{kind:"gift_received", value: 1}` unconditionally (not relying on backend newMilestones). Add a one-time copy "Жест принят 🤍". No confetti (gifts are frequent; reserve confetti for rare). Keep haptic success.
3. **DateWheel → wishlist**: the result card gains a "Сохранить в вишлист" button (warm, ghost). On click → `endpoints.addWishlist({title: idea.title, ...})` (reuse the create endpoint). Optimistic toast "Добавлено в вишлист". The result stays; user can spin again.
4. **Counts for bucket_done_count**: derive from `data.filter(done).length` after the optimistic setData. Emit on every markDone (the toast dedups via the milestoneBus lastEvent + the Toast idempotency ref).
5. **Copy** additions: `milestones.bucketDoneFirst: "Первая сбылась! ✨"`, `milestones.bucketDoneCustom: (n) => \`${n} мечт сбылось\``, `milestones.giftAccepted: "Жест принят 🤍"`, `dateWheel.saveToWishlist: "Сохранить в вишлист"`, `dateWheel.savedToWishlist: "Добавлено в вишлист"`.

## Out of scope
- Backend milestone tracking for bucket_done (the frontend emits the toast; backend pair-stats already counts total dreams done for the recap — sufficient).
- Sound.
- Confetti for gift accept (too frequent).

## Testing
- Bucket: markDone emits bucket_done_count milestone; first done → confetti kind present.
- Gifts: accept emits gift_received; decline does not.
- DateWheel: result shows "Сохранить в вишлист"; click calls addWishlist; toast shows.

## Success criteria
- Fulfilling the first dream → confetti + "Первая сбылась! ✨".
- Accepting a gift → "Жест принят 🤍" toast (every time).
- DateWheel result → "Сохранить в вишлист" → item appears in wishlist.
