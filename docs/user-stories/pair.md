# /pair — linking two users into a pair

## User story
As a person in a couple, I want to link my Telegram account to my partner's with a single invite, so that everything we save becomes shared automatically instead of living in separate chat histories.

## Acceptance criteria
- [ ] Any user can run `/pair` and receive a unique invite token + a t.me/pairlybot?start=pair_<token> link. Token is single-use, expires after 7 days.
- [ ] A user may belong to exactly one pair. Running `/pair` when already paired shows the current partner's first name + a `/unpair` hint, and does **not** generate a new token.
- [ ] Opening the invite link on a fresh account joins the pair; both users get a confirmation message naming the other. Shared features (wishlist, gifts, QOTD, etc.) become immediately available to both.
- [ ] A token cannot be used by the account that created it ("can't pair with yourself").
- [ ] A token that is expired or already consumed returns a friendly error and points to generating a fresh one.
- [ ] Either member can run `/unpair`. This requires a confirm step ("this deletes all shared data for both of you — type your partner's name to confirm" or a 2-button confirm). On confirm: all pair-scoped rows are hard-deleted, the pair record is removed, both users are returned to unpaired state.
- [ ] After `/unpair`, neither user can read any of the former pair's data (wishlist, moods, QOTD, gifts, countdowns, bucket list) — zero retained rows.
- [ ] A previously-paired user can `/pair` again into a new pair with no leftover data from the old one.

## Out of scope
- Group/throuple/poly configurations (see roadmap v2 "family tier" — not couples-only).
- Pair recovery / re-link after accidental unpair (data is gone by design).
- Pairing via a Mini App button (bot-first in MVP; Mini App is read/interact only).

## Notes / edge cases
- **Account switching in Telegram:** if a user has multiple accounts, the token binds to whichever account opens the link. No way to prevent; document it.
- **One partner already paired elsewhere:** refuse the join, tell them they must `/unpair` first — and that unpairing wipes the old pair.
- **Privacy framing:** copy must stress that joining a pair shares everything with that person. No "link up to find out" dark patterns.
- **Token format & storage:** opaque random token (not the pair_id), hashed at rest, not enumerable.
- The confirm-on-unpair friction is deliberate — once-wiped, always-gone is the whole point.
