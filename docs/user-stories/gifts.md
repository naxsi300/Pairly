# Gift an action — catalog + redemption

## User story
As a partner, I want to give and receive small non-material gestures ("I'll make coffee tomorrow," "you pick the film tonight") that turn a nice intention into something we actually follow through on, so that kindness doesn't evaporate as words.

## Acceptance criteria
- [ ] Each partner can send the other a "gift" chosen from a small built-in catalog (breakfast in bed, a massage, you-pick-the-movie, a home-cooked dinner, an uninterrupted hour, a walk together, etc.). ~12 default gestures at launch.
- [ ] A gift, once sent, appears in the recipient's inbox with state **received**. The recipient sees who it's from and the gesture.
- [ ] The recipient can **accept** (state → **claimed**) or **decline** (state → **declined**, sender notified gently). Free-form text gifts ("I owe you one lazy Sunday") can also be created.
- [ ] A claimed gift moves to **redeemed** when the giver marks it done. Either partner may then mark it fully **complete** — but the gesture must actually have happened (no "redemption" without a claimed state first).
- [ ] Completed gifts optionally land on a soft "good deeds" view, but there is **no score, no streak, no leaderboard**, and no comparison of who gave more. The view is chronological, not ranked.
- [ ] Both partners see the full gift ledger (sent & received) for the pair; there are no hidden or private gifts.
- [ ] A gift left unclaimed for 14 days auto-archives with a gentle nudge to the recipient (no guilt copy — "no rush, want to let this one go?").
- [ ] Free tier: unlimited gifts (this is a core relationship loop, not a storage feature — do not limit it). Pro unlocks custom / user-authored gestures saved to the pair's catalog.

## Out of scope
- Material gifts / shopping links (we are explicitly non-material).
- Reminders that nag the giver ("you haven't redeemed your gift") — anxiety risk.
- Public sharing of gifted gestures.
- Scheduling a gift to a specific future date (it's a promise, redeem whenever).

## Notes / edge cases
- **Recipient leaves the pair:** all gifts hard-deleted with the pair (see `/unpair`).
- **Same gift sent twice:** allowed, each is its own ledger entry.
- **Decline copy must be warm:** "passed on this one — that's totally fine." Never "rejected."
- **Marking complete without claiming:** blocked by state machine — prevents gaming.
- The catalog is shared per pair; a custom gesture added by one is available to both.
- Tone check on every default gesture name: read it out loud as if saying it to a tired partner. If it sounds like an HR email, rewrite.
