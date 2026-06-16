# Pairly — Product Brief

*One page. Read in 5 minutes.*

## Positioning
Pairly is a Telegram bot + Mini App for couples in their 20s–40s who already live on Telegram. It turns the app they keep open anyway into a quiet shared layer: a wishlist of things to do together, small rituals that repeat, a place to drop "saw this, thought of us." We're not a relationship tracker, not a habit app, not a counselling tool. We're the shared sticky note on the fridge — warm, low-effort, gone when you don't need it.

**Why now:** couples already DM each other links, addresses, and "we should go here" messages that sink into chat history and never resurface. Telegram's Mini App + forwarding primitives make a near-zero-friction capture loop possible for the first time. No new app to install, no second account.

## Insight — the one thing that makes it stick
**Capture must take one tap.** The whole product dies if adding something takes more than forwarding a post. The forward is the wedge: every other feature (catalog, countdowns, QOTD) is built *on top of* the capture loop, not beside it. Secondary stickiness comes from **"gift an action"** — a non-material gesture ("I owe you breakfast in bed") that turns intention into a tiny redeemable promise. That's the loop couples keep coming back to.

## Key MVP features

**Lean core**
- **Forward-to-wishlist** — forward any channel/chat post; bot parses title, address, date, category into a shared list.
- **Gift an action** — a small catalog of redeemable gestures (cook dinner, massage, pick the movie); claim → redeem → done.
- **`/pair` linking** — one user generates an invite token; the other opens it; two accounts become a pair. Shared data flows from here.

**Extras (in MVP)**
- **Question of the day** — one prompt every morning both answer; you see your partner's answer only after posting yours.
- **Countdowns** — "holiday in 12 days," "anniversary in 3." Shared, auto-updating.
- **Mood sync** — a one-tap emoji mood you can set; partner sees it. No score, no history graph, no "why are you down" pressure.
- **Bucket list** — bigger, longer-horizon items than the wishlist ("see the northern lights") that don't expire.

## Monetization — freemium, light, crypto-friendly
- **Free:** up to 10 wishlist items, up to 10 countdowns, up to 5 bucket-list items, full access to all core features, one pair per account. Enough to taste it.
- **Pro (~1 USDT/mo):** unlimited items (wishlist, countdowns, bucket list), custom gift gestures, mood color themes, early access to v1.1 features.
- **Payments:** USDT and other crypto, СБП, and other simple/anonymous methods. No card / Stripe dependency — the audience can't easily pay via Western fiat rails. Payment-provider integration is a future task, not MVP-blocking.
- **Hard rule:** *pair creation is never paywalled.* If one partner is Pro and the other free, the pair inherits Pro limits (virality > upsell precision). A free user inviting a partner must never hit a paywall.

We are not ads, not data-selling, not "relationship coaching" upsells.

## Privacy stance
Pair-by-design. Every row carries a `pair_id`; read/write is permitted only when the requester's `user_id` is a member of that pair — enforced at the repository layer, no caller-side exceptions. Mood, wishlist, gifts, QOTD answers are visible only within the pair; we never aggregate, rank, or compare pairs. EU/GDPR-aware: one-tap export (JSON of everything you and your partner share) and one-tap delete (dissolves the pair, wipes both sides, no soft-delete retention). No tracking SDKs in the Mini App beyond what Telegram itself provides.

## Non-goals (do not build — these break trust)
- Real-time or historical geolocation of either partner.
- "Time apart" / "last seen" / response-time counters of any kind.
- Read receipts, message-frequency scoring, or "your partner ignored this."
- Streaks or gamified pressure mechanics that manufacture guilt.
- Public/shared leaderboards, social feeds, friend lists.
- Anything that implies one partner is performing below par.

The test for any future feature: *would a partner who is slightly anxious feel worse after seeing it?* If yes, it's a non-goal.
