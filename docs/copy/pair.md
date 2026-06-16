# /pair — copy (Russian)

All copy in Russian. Warm, conversational, non-corporate. Source: docs/user-stories/pair.md.

## Entry / greeting
- **/start (unpaired):**
  - A: Привет! 👋 Я Pairly — общая записная книжка для вас двоих: wishlist, подарки-действия, вопрос дня и всякие мелочи, которые иначе тонут в чате. Чтобы начать, объединитесь в пару.
  - B: Привет! Я Pairly — ваш общий уголок в Telegram: куда сходить, что подарить, о чём поговорить. Сначала объединитесь в пару, и всё станет общим.
- **/start (paired) — welcome back:**
  - С возвращением! Вы с {partner_name} в паре. Всё под рукой ниже 👇

## /pair (fresh, unpaired)
- Message:
  - Готово! Вот ваша ссылка-приглашение. Отправь её партнёру — например, перешли в личку или поделись. Ссылка живёт 7 дней и работает один раз.
  - 🔗 {invite_link}
  - Как только партнёр её откроет, вы станете парой и всё станет общим.

- Inline buttons:
  - `Поделиться ссылкой` (≤20) — switch_inline_query / share
  - `Отменить приглашение`

## /pair (already paired) — NO new token
- Message:
  - Вы уже в паре с {partner_name} 💛 Если хотите начать заново с кем-то другим — сначала расстаньтесь командой `/unpair` (аккуратно: это удалит всё ваше общее).

## Joining (partner opens invite link)
- Self-pair rejected ("can't pair with yourself"):
  - Это же твоя собственная ссылка 🙂 Пригласи партнёра — перешли ему эту ссылку.
- Token expired / already consumed:
  - Ссылка устарела или её уже использовали. Попроси партнёра сгенерировать новую — команда `/pair`.
- Already paired elsewhere:
  - Ты уже состоишь в другой паре. Чтобы объединиться здесь, сначала `/unpair` — но имей в виду: это удалит всё общее из прежней пары.
- Success (both confirmed):
  - Ура! 🎉 Вы с {partner_name} теперь пара. Всё, что вы сохраняете, теперь общее. Можете начинать: перешлите мне пост, киньте подарок или откройте вопрос дня.

## /unpair — confirm step (destructive)
- Message:
  - Это серьёзный шаг. `/unpair` удалит ВСЁ ваше общее для вас обоих: wishlist, подарки, ответы на вопросы, отсчёты, настроение, список желаний. Без возможности восстановить — навсегда. Точно хотите?
- Inline buttons (2-button confirm):
  - `Да, расстаться`
  - `Нет, оставить`
- Cancelled:
  - Славно, остаёмся парой 💛 Ничего не тронуто.
- Confirmed — wiping:
  - Готово. Вы больше не пара, и всё общее удалено. Если захотите начать заново — `/pair`.

## Shared "pair up first" message (unpaired users hit a shared feature)
- Вы пока не в паре. Сначала объединитесь — пришлите `/pair`, и всё станет общим.

## Notes
- Privacy framing: always stress joining = sharing everything with that person. No "link up to find out" dark patterns.
- Keep the unpair friction warm but unambiguous — once-wiped, always-gone is the whole point.
- Button budget: ≤20 chars each, enforced across the board.
