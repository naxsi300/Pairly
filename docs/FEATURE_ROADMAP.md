# Pairly — аудит фич и roadmap (AI-verified)

Сгенерировано: workflow-аудит 18 мок-фич + маппинг реального кода Pairly.
Исходник моков: `/tmp/pairly_design/features.mjs`. Галерея: `http://localhost:8847/gallery/features.html`.

## ✅ Отгружено на prod (commit `244e3b8`, 2026-06-19)

Два MUST из roadmap реализованы, протестированы и задеплоены на prod-test сервер (`/opt/pairly`, Docker, real data):

1. **f-forwarding-fix** — пересылка теперь захватывает фото + описание + умный заголовок.
   - `parse.py`: пропуск junk-линий (t.me URL, @handle, цена «🔥 1 990 ₽», emoji-баннер) → правильный заголовок
   - `handlers.py` `on_forward`: persist `notes=` (полный текст), фото через новый `media.py`
   - `media.py`: content-addressed фото в `/data/wishlist_photos/<hash>.jpg` (на Docker volume), served via `/media/wishlist`
   - миграция `0004_wishlist_photo`: колонки `telegram_file_id`, `photo_path`
   - Mini App: карточка рендерит thumbnail + 2-line notes preview
   - **13 тестов** (6 парсер + 4 capture + 3 оригинальных), 71 passed всего
2. **f-bot-entry-point** — бот закрывает loop без выхода в апп:
   - после пересылки: inline «✏️ Переименовать» (FSM rename flow) + «🗂 Открыть вишлист» (WebApp deep link)
   - новый `WishEdit` FSM state, callback `wish:edit:<id>`, repo `rename_item()`

**Осталось (MUST, не сделано):**
- **f-triage-two-tap** — partner consent до записи в shared DB. Самый инвазивный (schema + bot notify + API + UI). Оставлен как отдельная задача — требует аккуратного дизайна, не спешки на real data ночью.

**Прочее из roadmap** (SHOULD/COULD/DROP) — см. таблицу ниже; дропы совпали с решением пользователя.

## 🐛 Корневая причина бага пересылки в wishlist

Пересылка **существует** (`F.forward_origin` в `backend/pairly/bot/handlers.py:254`). Баг = трёхчастный провал захвата, всё подтверждено в коде:

1. **Неверный источник заголовка.** `parse_forwarded_text` (`parse.py:51`) берёт `title = lines[0]` — буквально первую непустую строку. Для поста канала это обычно `https://t.me/...`, `@handle`, цена («🔥 1 990 ₽») или эмодзи-заголовок. Настоящий заголовок — на 2-й строке или в `caption_entities`. `message.text` HTML и `caption_entities` никогда не инспектируются.
2. **Описание не сохраняется.** `on_forward` (`handlers.py:295-302`) не передаёт `notes=`. Колонка (`models.py:141`), kwarg в репо (`repositories/wishlist.py:51`) и поле API (`schemas.py:67`) есть, но forward-путь пишет NULL. Полный текст поста, `date_hint`, `time_hint` теряются.
3. **Фото теряются.** В `backend/pairly/bot/` нет ни одного обращения к `message.photo`/`file_id` (grep подтверждает). Handler читает только `message.text or message.caption`. Схема без image-колонки. `Wishlist.tsx` не рендерит `<img>`. Фото-пересылка → stub «Альбом» или FSM-промпт, байты фото выбрасываются.

**Эффект (ровно жалоба пользователя):** ресторан → заголовок = t.me-ссылка, без описания, без фото.

### Фикс (5 шагов, малые, изолированные)

(a) **Умный выбор заголовка** в `pairly/bot/parse.py`: если `lines[0]` похож на URL, `@handle`, короткий префикс (≤2 слова / чистый эмодзи / ценовой глиф) — идти к `lines[1]`, затем `lines[2]`. Принять опциональный `entities: list[MessageEntity]`: предпочитать текст под bold/heading-сущностью. Передавать `message.caption_entities` из `handlers.py`.

(b) **Сохранять `notes=full_text`** в `on_forward` и `on_title_reply` (`handlers.py:295-302` и `338-340`). Лимит ~4 КБ, вырезать control-символы. Добавить `event_date=parsed.date_hint_parsed` (парсить date_hint+time_hint в aware datetime, падать молча). Репо уже принимает эти kwargs.

(c) **Пайплайн фото** — новый модуль `pairly/bot/media.py`: `async def download_photo(bot, message) -> str | None` → `bot.download(bot.get_file(message.photo[-1].file_id))`, пишет в `data/wishlist_photos/<sha256>.jpg`, возвращает URL `/media/wishlist/<sha256>.jpg`. Примонтировать каталог как `StaticFiles` в FastAPI (`api/app.py`). Альбомы уже дедупятся (`_is_album_followup`, `handlers.py:40`); брать фото максимального разрешения из первого сообщения альбома. Колонки `telegram_file_id` + `photo_path` на `WishlistItem`.

(d) **Схема + миграция**: Alembic `0002_wishlist_photo.py` — добавить `telegram_file_id VARCHAR(128) NULL`, `photo_path VARCHAR(255) NULL` в `wishlist_items`. Расширить `WishlistItemOut` (`schemas.py:61-68`) полями `photo_url` и `telegram_file_id`.

(e) **Mini App**: расширить `WishlistItem` в `miniapp/src/types.ts` полем `photoUrl`. В `miniapp/src/screens/Wishlist.tsx` рендерить `<img src={item.photoUrl}>` (CSS `aspect-ratio`, `object-fit:cover`, M3 surface-tint) в карточке, lazy-load. Добавить мини-афорданс «редактировать заголовок».

**Усилие:** малое (~1 день), полностью изолировано от остальной логики.

## 🗺 Roadmap (MoSCoW)

| Приоритет | Фича | Обоснование |
|---|---|---|
| **MUST** | f-forwarding-fix | Топ-приоритет пользователя; единственный capture-loop в MVP. Без него — демо, теряющее данные с первого раза. |
| **MUST** | f-bot-entry-point | Бот — самый низко-фрикционный surface в Telegram-native продукте. /start → forward → save → /list должно быть мгновенным. |
| **MUST** | f-screens-rationalize | Несколько экранов слабо дифференцированы. Wishlist должен реально показывать фото+описание из фикса; свернуть экраны «одна строка из БД» в карточку на Доме. |
| **MUST** | f-triage-two-tap | Сильнейший couple-specific механик. Решает privacy-by-design (партнёр консентит до записи в shared DB), фиксит дедуп (две пересылки = одна запись, два yes-голоса). |
| **SHOULD** | f-qotd-coupling | Вопрос дня как парадная дверь других примитивов. Почти нулевой surface. |
| **SHOULD** | f-mood-keep-as-is | Уже отгружен и в брифе. Дропнуть mood-sync (риск privacy/ревности). |
| **SHOULD** | f-date-wheel-keep-rescoped | Убрать рандом-рулетку; использовать данные wishlist (возраст + категория + день недели) для самого забытого совпадения. |
| **SHOULD** | f-wishlist-repeat | Превращает тап по завершённому элементу в «повторить». |
| **SHOULD** | f-occasion-nudges | Напоминания о поводах (ДР, годовщины). |
| **SHOULD** | f-rituals-plans | Ритуалы и планы. |
| **SHOULD** | f-mood-history | Паттерны/тренд настроения. |
| **SHOULD** | f-love-notes | Записки, но как Telegram-native scheduled delivery через бота (не геофенсинг). |
| **COULD** | f-our-song | Общий плейлист — низший приоритет. |
| **COULD** | f-gratitude-merge | Благодарность — слить в ежедневный ритуал. |
| **COULD** | f-love-languages-inferred | Языки любви выводить из поведения, а не тестом. |
| **COULD** | f-pro-tier | Платный тир. |
| **DROP** | f-mood-sync | Риск privacy/ревности — асимметрия настроений. |
| **DROP** | f-bot-collector | Избыточен после фикса пересылки (бот уже collector). |
| **DROP** | f-home-radar | Гео — user-нонгоал (запретил радар рядом). |
| **DROP** | f-time-capsule | Лишнее (решение пользователя). |
| **DROP** | f-couple-challenge | Дженерик-геймификация. |
| **DROP** | f-memory-gallery | Слишком дорого хранить столько фото. |
| **DROP** | f-weather-date | Интегрируется в другие фичи, не отдельный экран. |

## 🔝 Топ-задачи (приоритет = фикс пересылки)

Подробно — в `fixApproach` выше. Ключевые файлы:
`backend/pairly/bot/parse.py`, `backend/pairly/bot/handlers.py`, `backend/pairly/bot/media.py` (новый), `backend/pairly/repositories/wishlist.py`, `backend/pairly/db/models.py`, `backend/pairly/api/schemas.py`, `backend/pairly/api/app.py`, миграция Alembic, `miniapp/src/types.ts`, `miniapp/src/screens/Wishlist.tsx`.
