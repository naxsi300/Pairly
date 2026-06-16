# Gifts — copy (Russian)

All copy in Russian. Source: docs/user-stories/gifts.md. Free tier: unlimited (core loop). Pro = custom gestures only.

## Entry
- **/gift:**
  - Хочешь подарить {partner_name} небольшой жест? Выбирай из списка — это обещание, которое потом можно исполнить. 🎁
  - Inline buttons: one row per gesture from catalog (+ `✍️ Свой жест`).

## Send confirmation (sender)
- Отправил(а) «{gesture}» для {partner_name}. Ждём, когда заберёт 💛

## Recipient inbox (received state)
- {partner_name} подарил(а) тебе: «{gesture}» 🎁
  - Inline buttons:
    - `Принять`
    - `Вежливо отказаться`

## Accept (state → claimed)
- To recipient: Принято! «{gesture}» теперь у тебя. Когда случится — пусть {partner_name} отметит, что выполнил.
- To sender: {partner_name} принял(а) твой подарок «{gesture}» 🥰

## Decline (state → declined) — warm, never "rejected"
- To recipient: Окей, «{gesture}» убираем. Всё в порядке, без проблем.
- To sender: {partner_name} пропустил(а) «{gesture}». Это абсолютно нормально — может, в другой раз.

## Redeemed (giver marks done)
- To giver: Отметил(а) «{gesture}» как выполненное 🙌
- To recipient: {partner_name} выполнил(а) «{gesture}» 🥰

## Complete (either partner)
- Готово! «{gesture}» записано в добрые дела 💛

## Custom free-form gesture
- Prompt: Опиши свой жест парой слов — что обещаешь? Например: «ленивое воскресенье», «уборка вместо тебя на этой неделе».
- Stored: Отправил(а) «{custom}» для {partner_name}. (same flow as catalog gesture)

## Empty state (ledger empty)
- Подарков пока нет. Это могут быть мелочи: завтрак в постель, массаж, право выбрать фильм. Загляните в каталог — `/gift`.

## Auto-archive (unclaimed 14 days) — gentle, no guilt
- «{gesture}» от {partner_name} висит нетронутым пару недель. Спешить некуда — оставить или убрать в архив?
  - Inline buttons:
    - `Оставить`
    - `В архив`

## Good deeds view (completed, chronological, NOT ranked)
- 💛 Добрые дела (по порядку):
  1. {gesture} — {date}
  2. ...

## Notes
- Decline copy must be warm: "passed on this one — totally fine." Never "rejected."
- No nag to giver about redemption (anxiety risk).
- Marking complete without claiming = blocked by state machine.
- Full ledger visible to both; no hidden/private gifts.
- Tone check each gesture name: say it to a tired partner; rewrite if it sounds like an HR email.
