# Bucket list

## User story
As a partner, I want a place for the bigger, longer-horizon things we dream of doing together ("see the northern lights," "learn to dive," "drive the coast in a convertible") that don't belong on the everyday wishlist, so that our shared ambitions have a home and don't get lost.

## Acceptance criteria
- [ ] Any partner can add a bucket-list item: a title (+ optional note + optional category). No date required by design — these are open-ended dreams.
- [ ] Items live on a shared bucket-list view, distinct from the wishlist. Visual separation is clear (different tab/section), so everyday items and big dreams don't blur.
- [ ] States: **dreaming → planning → done**. "Planning" is the bridge: when a dream gets a date/plan it can optionally promote to a wishlist item (cross-link, not move).
- [ ] Completing an item is a small moment ("you did it! 🌌") for both partners; completed items move to a "done" section, chronologically, not ranked.
- [ ] Either partner can edit or delete; deletes are hard deletes.
- [ ] Bucket list does **not** share the 50-item free-tier budget with the wishlist — it has its own: **5 items on Free, unlimited on Pro.** Dreams shouldn't evict errands.
- [ ] Unpaired user gets "pair up first"; nothing stored.

## Out of scope
- Cost estimation / savings tracker toward an item (different product).
- Public sharing of a bucket list.
- Auto-suggestions ("popular bucket list ideas") — couples should dream their own.
- Difficulty/location metadata and filtering (keep it flat and simple in MVP).

## Notes / edge cases
- **Wishlist vs bucket distinction:** the rule of thumb for users — "would we do it this month?" → wishlist; "this year or beyond / maybe never" → bucket list. Surface this in onboarding copy so people don't agonize.
- **Promote to wishlist:** when an item gets a concrete date, offer (don't force) a one-tap move that creates a wishlist entry and leaves the bucket item as "planning" with a back-reference.
- **Done with no proof:** there's no photo/proof requirement; marking done is on trust.
- **Editing the same item simultaneously:** last-write-wins is acceptable for MVP; note in copy that both can edit.
- **One partner's solo dream:** if an item is really one person's, it still belongs in the shared list — the list is the couple's, not split by owner. Filter "added by me / by partner" is optional, not a default.
