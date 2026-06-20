# Mood sync — copy (Russian)

All copy in Russian. Source: docs/user-stories/mood-sync.md. Lowest-data feature — resist adding fields.

## Mood labels (exactly these 8, one emoji each)
- 😊 сияю
- 😄 радостно
- 🙂 хорошо
- 😌 спокойно
- 😐 ровно
- 🙁 так себе
- 😔 грустно
- 😢 паршиво

## Set mood
- **/mood:**
  - Как ты сейчас?
  - Inline buttons: `😊 сияю` / `🙂 хорошо` / `😐 ровно` / `🙁 так себе` / `😢 паршиво`
- After pick (optional note ≤60 chars):
  - Принято: {emoji} {label}. Хочешь пару слов для партнёра? (можно пропустить)
- After save:
  - Готово, {partner_name} видит: {emoji} {label}{note_line}.

## Clear mood
- Cleared (self): Убрал твоё настроение. Сейчас у тебя «не задано».
- Inline button to clear: `🚫 Убрать настроение`

## Partner view (ambient, on shared home)
- {partner_name}: {emoji} {label}{note_line}
- No mood set (self or partner): {name}: настроение не задано

## Fade after 24h (unchanged) — the key anti-anxiety guard
- After 24h unchanged → shows «настроение не задано» (NOT stale persistence).
- (no message sent — fading is silent)

## No notification on change (by design)
- (NEVER send an alert when partner's mood changes. Ambient only. Notifications would create "why didn't they tell me they were down" pressure.)

## Empty state (never set)
- Настроение ещё не задавали. Один тап — и партнёр увидит, как ты, без лишних слов. `/mood`.

## Low/rough mood copy — plain, never clinical
- (no auto-triggered support pop-up; a quiet footer link to general wellbeing resources is OK but never fired by mood value)
- Setting паршиво / так себе → same plain confirmation as any other mood. No diagnosis tone.

## Unpaired (no mood stored)
- (shared message, see docs/copy/pair.md "pair up first")

## Notes
- NEVER: history graph, trend, score, streak, "your partner hasn't updated in X hours," "both set same mood 🎉" celebration copy.
- NEVER nudge the silent partner. If one updates often and the other never: do nothing.
- Edit = latest mood only. Setting again replaces previous (no journaling).
