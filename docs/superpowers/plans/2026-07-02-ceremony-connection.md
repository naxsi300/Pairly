# Bundle E — Ceremony & Connection Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Dream-fulfilled confetti + gift-accepted toast + DateWheel→wishlist save. Frontend-only.

**Architecture:** Toast.tsx KIND_LABEL gains `bucket_done_count` + `gift_received` branches + `bucket_done_count` joins CONFETTI_KINDS. Bucket markDone + Gifts accept emit milestones. DateWheel result gains a save-to-wishlist button.

## Global Constraints
- Frontend-only. Russian copy in copy.ts. Colors via var(--tg-*).
- Confetti ONLY for bucket_done_count (first dream); NOT for gift accept (too frequent).
- TDD; frequent commits.

---

### Task 1: Dream-fulfilled ceremony (Bucket + Toast)
Files: Bucket.tsx, Toast.tsx, copy.ts; Tests.
- copy: milestones.bucketDoneFirst "Первая сбылась! ✨", bucketDoneCustom(n)=>`${n} мечт сбылось`.
- Toast KIND_LABEL: add `bucket_done_count` branch (v===1→first, else custom). Add `"bucket_done_count"` to CONFETTI_KINDS.
- Bucket markDone: after optimistic setData, compute new done count, emit `{kind:"bucket_done_count", value: count}`. (import emitMilestone.)
- Test: markDone emits; first-done → confetti kind fires.
- Commit "feat(bucket): dream-fulfilled confetti ceremony".

### Task 2: Gift-accepted toast (Gifts + Toast)
Files: Gifts.tsx, Toast.tsx, copy.ts; Tests.
- copy: milestones.giftAccepted "Жест принят 🤍".
- Toast KIND_LABEL: add `gift_received` branch (always giftAccepted, ignore value).
- Gifts act(): on "accept" success, emit `{kind:"gift_received", value:1}` (unconditional). NOT on decline/redeem/complete.
- Test: accept emits gift_received; decline does not.
- Commit "feat(gifts): accepted-gift toast".

### Task 3: DateWheel → wishlist save
Files: DateWheel.tsx, copy.ts; Test.
- copy: dateWheel.saveToWishlist "Сохранить в вишлист", dateWheel.savedToWishlist "Добавлено в вишлист".
- DateWheel result card: add "Сохранить в вишлист" ghost button → endpoints.addWishlist({title: idea.title}). Optimistic toast "Добавлено в вишлист" (reuse useToast or a local state line).
- Test: button present on result; click calls addWishlist with idea.title.
- Commit "feat(date-wheel): save idea to wishlist".

### Task 4: build, test, deploy

## Self-Review
- 3 ceremonies + 1 connection covered. Confetti only on first dream. Gift toast every accept. No backend.
