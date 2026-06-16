# Countdowns

## User story
As a partner, I want to pin upcoming moments we care about ("holiday in 12 days," "our anniversary in 3 weeks") so that anticipation is shared and nothing important sneaks up on us.

## Acceptance criteria
- [ ] Any partner can create a countdown: a label + a target date (+ optional emoji). It appears on both partners' shared countdown view.
- [ ] The countdown shows days-remaining (and, within the final 48h, hours). Past dates flip to "X days ago" and stay visible until archived.
- [ ] On the target day, both partners get a single, warm notification ("today's the day: 🎂 anniversary"). No multi-day nag chain.
- [ ] Countdowns are editable and deletable by either partner; deletes are hard deletes.
- [ ] **10 countdowns** on free tier; creating past the limit prompts upgrade, never silent-drop.
- [ ] Recurring countdowns (annual anniversary, monthly "first-Saturday") are supported — they auto-roll to the next occurrence the day after passing.
- [ ] An unpaired user attempting to create a countdown gets the "pair up first" message.
- [ ] No view that ranks or compares countdowns, and no "you have N days to prepare" pressure copy.

## Out of scope
- Countdowns tied to a wishlist item's date (keep the two features separate in MVP; v1.1 may soft-link).
- Shared calendar / week-grid view (different feature).
- Countdowns shared outside the pair.
- Push reminders more than once per event.

## Notes / edge cases
- **TZ on the target date:** use the creator's TZ at creation; store the resolved instant, not a floating date, so the "today" boundary is unambiguous.
- **Past date on creation:** allowed (e.g. "met on…") — shows as "X days ago," no error.
- **Duplicate labels:** allowed; pair can have two "holiday" countdowns.
- **Recurring edge (Feb 29):** annual recurrence on a non-leap year rolls to Feb 28.
- **Notification at boundary:** the single "today's the day" message is the only push; the day-after there is no follow-up unless the user set recurring.
- Keep the on-the-day copy short and warm; never "don't forget" (that's anxiety-coded).
