# Pairly — Roadmap

Three phases. Ordering is deliberate: each phase unlocks the next by establishing a habit loop, then deepening it, then extending it outward.

---

## Phase 0 — MVP  *(ship this first)*

**In it**
- `/pair` invite-token linking + `/unpair` with confirm + hard wipe
- Forward-to-wishlist with parsing (title / address / date / category)
- "Gift an action" catalog + claim/redeem/complete state machine
- Question of the day (reveal-gated)
- Countdowns (incl. recurring, single on-the-day nudge)
- Mood sync (latest-only, ambient, 24h fade)
- Bucket list (separate from wishlist, own budget)
- Freemium limits in place from day one; pair creation never paywalled
- Mini App: shared views for all of the above; bot as the capture + notification layer

**Why this ordering**
The capture loop (forward → wishlist) is the entry wedge; it has to feel instant or nothing else matters. `/pair` is the prerequisite for *every* shared feature, so it ships alongside. Gifts and QOTD are the two repeat-engagement hooks — gifts give a reason to open weekly, QOTD daily. Countdowns and Mood are low-cost ambient layers that fill out the "shared home" feel without demanding effort. Bucket list rounds out the ambition side so the wishlist doesn't get polluted with "someday" items. Ship lean core + all four extras together so the product feels whole, not skeletal.

**What this unlocks**
A working, warm, pair-scoped product with a daily reason to return and a clear privacy story. That daily-return habit is the asset Phase 1 builds on.

---

## Phase 1 — v1.1  *(deepen the ritual, after the habit exists)*

**In it**
- **Memory jar** — drop small moments ("today she laughed at the worst joke") into a jar; periodically (monthly / on a low day) the pair opens one together.
- **Mystery date** — one partner secretly plans something; the other gets only a time + dress-code hint until it happens.
- **"Reason I love you" weekly prompts** — one gentle weekly nudge to note a specific thing; builds a private, pair-only archive of affirmations.
- Polish: user-authored QOTD questions & custom gift gestures (Pro), Mini App themes, onboarding refinements based on MVP usage data, perf/cost pass before scaling.

**Why this ordering, and why not MVP**
Memory jar, Mystery date, and weekly-affirmation prompts are higher-effort rituals — they only pay off once a couple already trusts the product and is in the daily-return habit. Shipping them in MVP would dilute focus and they'd land cold. Once Phase 0 proves the capture + ritual loop works, these deepen it: more emotional surface area, more reasons the pair keeps Pairly around for months rather than weeks. Polish lives here deliberately — don't optimize what you might throw away in Phase 0.

**What this unlocks**
Emotional stickiness that survives a couple's busier weeks, and a Pro tier worth paying for (custom gestures, custom questions). That retention + revenue base is what funds the outward-looking Phase 2.

---

## Phase 2 — v2  *(extend outward, carefully)*

**In it**
- **Affiliate / booking integrations** on Mystery date and wishlist (reserve a table, book the experience) — opt-in, never auto-affiliate-spammy.
- **Family / household tier** — a small, non-couples-only configuration (co-parents, close-knit small group). Re-uses the pair-scoping primitive generalized to a `group_id`. NOT a social network; stays tiny and private.
- **Cross-platform helpers** — share-to-Pairly from other apps, a small browser extension, calendar two-way sync for countdowns.
- **Localization** beyond the launch language(s), region-tuned gift catalog & QOTD bank.
- Optional: a read-only "time capsule" the pair can seal and open on a future date.

**Why this ordering**
Phase 2 only makes sense with retention (Phase 1) and a paying base (Pro). Affiliate integrations are the obvious revenue lever but they're trust-sensitive — ship them only after privacy expectations are well-set, and keep them strictly opt-in per action. The family tier is the riskiest item (it touches the couples-only identity); it's deliberately last and deliberately tiny, reusing the existing scoping rather than introducing a new social graph. Everything in v2 must re-pass the non-goal test: *would an anxious partner feel worse?*

**What this unlocks**
A sustainable, multi-revenue-stream product that has grown without abandoning its pair-first, privacy-by-design core.
