# Countdowns — copy (Russian)

All copy in Russian. Source: docs/user-stories/countdowns.md.

## Create
- **/countdown:**
  - Поставим отсчёт до важной даты? Напиши название — например, «отпуск», «год вместе».
- After label:
  - Отлично. Теперь дату — в любом удобном формате, например `25.12.2026` или `через 3 недели`. (Можно и прошлую — «познакомились».)
- After date (optional):
  - Добавь эмодзи для настроения? Можно пропустить.
- Created:
  - Готово! {emoji} «{label}» — через {N} дн. Теперь видно вам обоим.

## Display (shared view)
- More than 48h out: {emoji} {label} — через {N} дн.
- Within 48h: {emoji} {label} — через {H} ч
- Past date: {emoji} {label} — {N} дн. назад
- On the day: {emoji} {label} — сегодня!

## On-the-day notification — single, warm, NO nag chain, NO "don't forget"
- Сегодня тот самый день: {emoji} {label} 🎉
- (A: Сегодня тот самый день: {emoji} {label}. Пусть будет классным!)
- (only ONE push per event; day-after has NO follow-up unless recurring)

## Recurring
- Set recurring: Повторять каждый год? Каждый месяц (например, первая суббота)?
  - `Каждый год` / `Каждый месяц` / `Без повтора`
- Auto-rolled: {emoji} «{label}» перекатился на следующий раз — теперь {N} дн. вперёд.

## Edit / delete
- What to change? `Название` / `Дату` / `Эмодзи` / `Повтор` / `🗑 Удалить`
- Edited: Готово, «{label}» обновлён.
- Deleted (hard delete): Удалил «{label}».

## Empty state
- Пока нет ни одного отсчёта. Добавьте дату, которую ждёте вместе — отпуск, годовщину, чей-то день рождения. `/countdown`.

## Free-tier limit hit (≥10) — warm, acknowledged, NOT dropped
- В бесплатной версии максимум 10 отсчётов, и всё место занято 😊 Этот мы не потеряли — оформим Pro (без лимита) или уберём старый отсчёт?
  - `Оформить Pro` / `Убрать старое`

## Past date on creation (allowed)
- (no error — stored, shows "{N} дн. назад")

## Unpaired (nothing stored)
- (shared message, see docs/copy/pair.md "pair up first")

## Notes
- NEVER: "don't forget", "you have N days to prepare", pressure copy.
- Store resolved instant (creator's TZ), not floating date — unambiguous "today" boundary.
- Feb 29 non-leap year → rolls to Feb 28 for annual recurrence.
- Duplicate labels allowed (two "отпуск" countdowns fine).
