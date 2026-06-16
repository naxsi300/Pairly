# Question of the day (QOTD) — copy (Russian)

All copy in Russian. Source: docs/user-stories/question-of-the-day.md. Posts daily at 12:00 per-user local TZ.

## Morning prompt (daily, 12:00 local)
- Вопрос дня:
  «{question}»
  Ответь, как чувствуешь — коротко или длинно. Своим ответом разблокируешь ответ {partner_name} 🔒
  - Inline button: `Ответить`

## Answering (free-text ≤280 chars, optional emoji)
- Prompt for reply: Напиши свой ответ (до 280 символов, эмодзи можно):
- After posting (self_answered, partner not yet):
  - Записал твой ответ 💭 Ответ {partner_name} откроется, как только он(а) тоже ответит.

## Reveal gate — HARD: never let partner peek before own answer
- **I have NOT answered yet (try to view):**
  - Сначала ответь сам — тогда увидишь, что ответил(а) {partner_name}. Это честно по отношению к вам обоим 🔒
  - Inline button: `Ответить`
- **I answered, partner not yet:**
  - Твой ответ: «{my_answer}»
  - {partner_name} ещё не ответил(а). Как ответит — сразу откроется.
- **Both answered:**
  - Вопрос дня:
    «{question}»
    🧑 Твой ответ: «{my_answer}»
    💛 {partner_name}: «{partner_answer}»

## Edit (same-day, before partner opens)
- Before partner opens: Ответ ещё можно поправить — {partner_name} ещё не видел(а). Отправь новую версию.
- After partner opens (locked): Ответ больше нельзя изменить — {partner_name} уже прочитал(а).

## Never answered (day ends) — NO nag, NO guilt
- (no message — silently rolls into past questions)

## Past questions view
- 📅 Прошлые вопросы:
  - {date}: «{question}» — оба ответили / ждали ответа / открыт
  - (auto-archive after 7 days, still readable)

## Mute (self only, partner unaffected) — via /settings
- Muted: Вопросы дня выключены для тебя. {partner_name} продолжает их получать, как обычно. Вернуть — в `/settings`.
- Unmuted: Вопросы дня снова включены 👋 Завтра в 12:00 жди новый.
- Entry: команда `/settings` → переключатель «Вопросы дня» (вкл/выкл для себя).

## Empty state (fresh pair, first day)
- Сегодня первый вопрос дня для вашей пары. Отвечайте по очереди — это маленький повод проверить, как вы оба, без повода.

## Unpaired (no question stored)
- (shared message, see docs/copy/pair.md "pair up first")

## Notes
- NEVER: ranking, "compatibility score," comparison of answers by the system.
- NEVER: "почему ты не…", "ты не участвовал", streak break copy.
- Reveal-gate is a hard trust mechanic — breaking it poisons the feature.
- Question bank rules: warm, curious, occasionally silly. Nothing that surfaces a disagreement as a "test."
