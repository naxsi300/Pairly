# Wishlist — copy (Russian)

All copy in Russian. Source: docs/user-stories/wishlist.md.

## Forward capture
- **Forward received + parsed (has text):**
  - A: Сохранил в ваш wishlist: «{title}»{category_line}{date_line}. Видно вам обоим. 🗒
  - B: Добавил в общие хотелки: «{title}»{category_line}. Готово!
  - (where `{category_line}` = ` · {category}` and `{date_line}` = ` · {date}` if present)
- **No parseable text (photo, no caption) — inline ask:**
  - Тут нет текста, я не угадаю название. Как это назвать? ✍️
  - (await user reply → stored as title; rest optional)
  - After title stored: Готово, «{title}» в списке. Адрес и дату можно добавить позже.
- **Duplicate forward (same message_id already saved):**
  - Это уже в списке 🙂 «{title}», не дублирую.

## Inline buttons (per item, when listed)
- `✅ Сделано`
- `🗑 Удалить`
- `✏️ Изменить`
- `📂 В архив`

## Editing
- Что меняем? Выбирай поле.
  - `Название` / `Адрес` / `Дата` / `Категория` / `Заметка`
- Field updated:
  - Готово, «{title}» обновлён.

## Done confirmation
- To the marker: Отметил «{title}» как сделанное 🙌
- To the partner (light): {partner_name} отметил(а) «{title}» как сделанное 🙌

## Empty state (no items)
- Пока пусто. Перешлите мне любой пост — из канала, из чата, из группы — и он станет первой хотелкой в общем списке.

## Free-tier limit hit (≥10 items) — warm, acknowledged, NOT dropped
- Ой, в бесплатной версии максимум 10 хотелок, и список уже полон 😅 Этот пост я не потерял — давайте решим: оформить Pro и добавить без лимита, или убрать что-то из старого?
- Inline buttons:
  - `Оформить Pro`
  - `Убрать старое`

## /list text fallback
- **With items:**
  - 🗒 Ваш wishlist:
    1. {title} · {category}{· status}
    2. ...
- **Empty:**
  - (see Empty state)

## Delete (hard delete)
- Удалил «{title}». Безвозвратно, как договаривались.

## Unpaired forward (nothing stored)
- (shared message, see docs/copy/pair.md "pair up first")

## Category labels (guessed, overridable)
- eat → `поесть`
- do → `сделать`
- stay → `переночевать`
- watch → `посмотреть`
- buy → `купить`

## Status labels
- open → `открыто`
- planned → `запланировано`
- done → `сделано`
- archived → `в архиве`

## Notes
- Never anxiety-coded: no "не забудь", no pressure on partner to mark done.
- Editable by both; snapshot at forward-time (source edits don't update our copy).
