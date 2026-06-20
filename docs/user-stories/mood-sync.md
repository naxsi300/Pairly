# Mood sync

## User story
As a partner, I want to set a one-tap mood my partner can see, so that we have a gentle, no-words way to signal "I'm great today" or "I'm a bit low" without turning every feeling into a conversation.

## Acceptance criteria
- [ ] Each partner can set a current mood from a small fixed set of 8, with Russian labels: сияю / радостно / хорошо / спокойно / ровно / так себе / грустно / паршиво (one emoji per label). One tap, optionally with a short optional note (≤60 chars).
- [ ] The other partner sees the current mood on the shared home view. It is the *latest* mood only — there is no history graph, no trend, no score.
- [ ] Setting a mood updates instantly for the partner (within the Mini App session; bot shows it on next interaction).
- [ ] A mood, once set, is valid until the setter changes it or 24h pass — after which it fades to "no mood set" rather than persisting stale.
- [ ] There is no notification when the partner's mood changes — it's ambient, not an alert. (Explicit choice: notifications would create "why didn't they tell me they were down" pressure.)
- [ ] There is **no** "your partner hasn't updated in X hours," no streak, no consistency metric.
- [ ] A partner can clear their own mood at any time (sets to "no mood set").
- [ ] Unpaired user gets "pair up first"; no mood stored.

## Out of scope
- Mood history, trends, calendar heatmaps (banned — invites "why were you down on Tuesday" interrogation).
- Notifications on partner mood change.
- Multiple moods per day / mood journaling.
- "Suggest an activity based on mood" (patronizing; cut).

## Notes / edge cases
- **Asymmetric reporting:** if one partner updates often and the other never does, do nothing — never nudge the silent one. Any nudge reads as "you're not participating," which is the exact anxiety we avoid.
- **Low/rough mood:** the copy around these must be plain, not clinical. No "support resources" pop-up mid-flow (feels like a diagnosis); a quiet footer link to general wellbeing resources is fine but never triggered automatically by mood value.
- **Both set same mood:** no special celebration copy — neutrality prevents gamification.
- **Fading after 24h:** the stale-mood fade is the single most important anti-anxiety guard here. A mood lingering for days implies "they're still down and not telling me."
- This feature is intentionally the lowest-data one in the product. Resist adding fields.
