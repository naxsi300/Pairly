# Wishlist — forward a post → parsed → shared list

## User story
As someone who keeps seeing places and things I want to do with my partner, I want to forward any Telegram post to Pairly and have it show up on our shared wishlist, so that "we should try this" stops vanishing into chat scroll.

## Acceptance criteria
- [ ] Forwarding any message (channel post, DM, group message) to the bot creates one wishlist item in the active pair, owned by the forwarder but visible to both.
- [ ] The bot extracts, where present: title, address/place, date/time, category. Category is guessed from text hashtags/keywords (eat / do / stay / watch / buy) and can be overridden by the user.
- [ ] When the post has no parseable text (e.g. a photo with no caption), the bot asks "what should I call this?" inline and stores the user's reply as the title; everything else optional.
- [ ] Every item is editable: title, address, date, category, notes. Both partners can edit.
- [ ] An item has states: **open → planned → done** (and **archived**). Any partner can mark done; the other sees a small confirmation.
- [ ] Wishlist is scoped to the pair: unpaired user gets a friendly "pair up first" message on forward, with a `/pair` link — nothing is stored.
- [ ] Items are listable via Mini App (primary) and via `/list` in-bot (text fallback). Default sort: most recent first; filter by category & status.
- [ ] Free-tier limit (**10 wishlist items**): forwarding past the limit prompts an upgrade, **does not** silently drop the item — the forward is acknowledged and the user chooses to upgrade or remove an old item.
- [ ] Deleting an item is a hard delete (no tombstone in either partner's view).

## Out of scope
- Auto-booking / deep-linking into reservation services (v2 affiliate work).
- Collaborative comments / threads on a single item (keep it flat in MVP).
- Location map rendering (we store an address string; opening it delegates to the OS maps app).
- Price tracking, stock alerts, "notify when cheap."

## Notes / edge cases
- **No address:** common for "watch this film" forwards. Address field left empty; not forced.
- **No date:** most forwards have no date. Fine — item is just open-ended.
- **Duplicate forwards:** if the exact same message_id is forwarded twice, dedupe into one item (the "you already saved this" nudge is nicer than a duplicate list).
- **Edited source post:** we parse at forward-time; later edits to the original do not update our copy (it's a snapshot).
- **Quoting a forwarded post:** treat the forwarded payload, not the wrapper message, as the source.
- Category guess confidence low → default to "do" and let user fix.
