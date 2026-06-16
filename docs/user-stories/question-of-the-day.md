# Question of the day

## User story
As a partner, I want one small prompt every day that both of us answer, so that we have a low-effort reason to check in with each other beyond logistics and chores.

## Acceptance criteria
- [ ] One question is posted to the pair each day (default 12:00 local — per-user timezone) from a curated bank. The bank has enough variety that repeats feel rare in the first 6 months.
- [ ] A question is shown to both partners as "unanswered" until each posts their own reply.
- [ ] **Reveal gate:** a partner can only read the other's answer *after* posting their own. If only one has answered, that one sees only their own answer; the other's stays hidden behind "waiting for you to answer first."
- [ ] Answers are free-text (capped ~280 chars) with optional emoji.
- [ ] Both answers stay visible for 7 days in a "past questions" view, then auto-archive (still readable but no longer pinned).
- [ ] If a partner never answers a given day, that day's question quietly rolls into "past questions" unanswered — no nag, no streak break, no guilt copy.
- [ ] Questions are pair-scoped: an unpaired user gets the "pair up first" message, no question stored.
- [ ] A user can mute QOTD for themselves (not the pair) — they stop seeing the morning prompt; their partner is unaffected.
- [ ] No ranking, no "compatibility score," no comparison of answers by the system. Ever.

## Out of scope
- User-authored questions (Pro / v1.1 candidate).
- Commenting on or reacting to a partner's answer beyond emoji.
- "Best answer" or AI-evaluated "how well you know each other" scoring — explicitly banned (anxiety risk).
- Weekly digests or "your answers this week" recaps.

## Notes / edge cases
- **Different time zones:** each partner sees the prompt on their own morning clock; the reveal gate is independent of who answers first. A 6-hour TZ gap is fine.
- **One answers at 09:01, other at 23:00:** both see their own answer immediately; cross-reveal happens the moment the second one posts.
- **Edited answers:** allowed within the same day until the partner has read; after the partner opens, lock the edit to avoid confusion.
- **Question bank content rules:** nothing that could surface a disagreement as a "test" (no "what's your partner's biggest flaw?"). Warm, curious, occasionally silly.
- **Reveal-gate is the trust mechanic:** breaking it (e.g. letting a partner peek before answering) would poison the feature — treat as a hard invariant.
