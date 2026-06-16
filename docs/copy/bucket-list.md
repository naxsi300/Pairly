# Bucket list — copy (Russian)

All copy in Russian. Source: docs/user-stories/bucket-list.md. Own budget (5 free), NOT shared with wishlist.

## Add
- **/bucket:**
  - Большая мечта на двоих? Напиши, что хочется когда-нибудь — «увидеть северное сияние», «научиться дайвингу». Без даты, просто мечта.
- After title (optional):
  - Добавишь заметку или категорию? Можно пропустить.
- Stored:
  - Готово! «{title}» в ваших мечтах ✨

## Distinction guidance (onboarding / empty state)
- Подсказка: «сделаем в этом месяце?» → wishlist. «может, в этом году, а может никогда» → сюда, в мечты.

## States
- dreaming → мечтаем
- planning → планируем
- done → сбылось

## Promote to wishlist (from planning, offer don't force)
- У «{title}» появилась конкретика. Перенести в wishlist как задачу, а тут оставить как «планируем»?
  - `Перенести в wishlist` / `Оставить тут`

## Done — small moment for BOTH
- To marker: У вас получилось! «{title}» 🌌
- To partner: {partner_name} отметил(а) «{title}» как сбылось! 🌌
- Completed → chronological "done" section, NOT ranked.

## Edit / delete
- Что меняем? `Название` / `Заметку` / `Категорию` / `🗑 Удалить`
- Edited: Готово, «{title}» обновлён(а).
- Deleted (hard delete): Удалил «{title}».

## Empty state
- Пока нет ни одной большой мечты. С чего начать? «Увидеть северное сияние», «съездить на океан», «выучить язык вместе» — мечтайте вслух. `/bucket`.

## Free-tier limit hit (≥5, own budget) — warm, acknowledged, NOT dropped
- В бесплатной версии максимум 5 мечтаний, и список полон ✨ Эту мы не потеряли — оформим Pro (без лимита) или отпустим какую-то из старых?
  - `Оформить Pro` / `Отпустить старое`

## Unpaired (nothing stored)
- (shared message, see docs/copy/pair.md "pair up first")

## Notes
- No cost/savings tracker, no public sharing, no auto-suggestions (couples dream their own).
- No proof required to mark done (trust).
- Last-write-wins on concurrent edits for MVP.
- List belongs to the COUPLE, not split by owner; "added by me/by partner" filter is optional, not default.
