"""Bot command + message handlers (aiogram 3).

Copy is in Russian (warm, non-corporate). All DB writes go through the repository layer,
which enforces the pair-scoping invariant. Unpaired users get a "сначала объединитесь в пару"
gate on shared features.
"""

from __future__ import annotations

import contextlib
import html
import time

from aiogram import Bot, F, Router
from aiogram.filters import Command, CommandObject, StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message

from pairly.db.base import SessionLocal
from pairly.db.models import WishlistStatus
from pairly.repositories import base, pairs, users, wishlist
from pairly.repositories.base import NotPairedError
from pairly.repositories.pairs import InviteError
from pairly.repositories.wishlist import WishlistLimitError

from pairly.bot.text import truncate_graphemes

router = Router(name="pairly-main")


# --- Album de-duplication -----------------------------------------------------
# Telegram delivers a media album (several photos) as N separate updates sharing
# one `media_group_id`, but only the FIRST carries the caption. Without this guard,
# every caption-less photo in the album would trigger a separate "Как это назвать?"
# prompt (and corrupt the FSM state). We remember each group id for a short window
# and ignore every photo after the first in its group.
# In-memory + per-process: fine for a single bot process (the deploy model).
_SEEN_ALBUM_TTL = 300  # seconds; albums arrive within seconds, keep margin.
_seen_albums: dict[str, float] = {}


def _forward_source_url(origin) -> str | None:
    """Build a t.me deep link to the original forwarded post, when possible.

    Only public-channel forwards expose a usable URL (chat.username + message_id).
    Returns None for private forwards / hidden senders.
    """
    if origin is None:
        return None
    try:
        # MessageOriginChannel / MessageOriginChat have chat + message_id.
        chat = getattr(origin, "chat", None)
        msg_id = getattr(origin, "message_id", None)
        username = getattr(chat, "username", None) if chat else None
        if username and msg_id:
            return f"https://t.me/{username}/{msg_id}"
    except Exception:  # noqa: BLE001
        return None
    return None


def _is_album_followup(message: Message) -> bool:
    mgid = message.media_group_id
    if not mgid:
        return False
    now = time.monotonic()
    # Opportunistic GC of expired entries (tiny map, cheap).
    expired = [k for k, t in _seen_albums.items() if now - t > _SEEN_ALBUM_TTL]
    for k in expired:
        _seen_albums.pop(k, None)
    if mgid in _seen_albums:
        return True  # we already saw this album -> ignore (follow-up photo)
    _seen_albums[mgid] = now
    return False


# --- FSM for the "no text -> ask for a title" inline flow ---------------------


class WishTitle(StatesGroup):
    waiting_for_title = State()


class WishEdit(StatesGroup):
    """Editing an existing item's title after a forward (wish:edit callback)."""
    waiting_for_new_title = State()


# --- /start -------------------------------------------------------------------


@router.message(Command("start"))
async def cmd_start(message: Message, command: CommandObject) -> None:
    """Greet + handle the /pair deep-link payload from an invite."""
    async with SessionLocal() as session:
        user = await users.get_or_create_user(
            session,
            message.from_user.id,
            tg_username=message.from_user.username,
            display_name=_display_name(message),
        )

        # Deep link payload = invite token (when arriving via the partner's link).
        payload = (command.args or "").strip()
        if payload:
            try:
                await pairs.accept_invite(session, user, payload)
                await session.commit()
            except InviteError:
                # Don't commit; just greet. The token may be stale/used.
                await session.rollback()
            else:
                from pairly.bot.keyboards import webapp_open_kb
                kb = webapp_open_kb()
                await message.answer(
                    "Вы в паре! 🎉 Теперь у вас общий вишлист, подарки и всё остальное.\n"
                    "Перешлите сюда любой пост — и он попадёт в ваш общий список.",
                    reply_markup=kb,
                )
                return
            finally:
                # commit/rollback already handled per-branch above
                pass

        await session.commit()

    from pairly.bot.keyboards import webapp_open_kb_or_pair

    await message.answer(
        "Привет! Это Pairly — общий уголок для вас двоих.\n\n"
        "Перешлите сюда пост из любого канала или чата — и он станет пунктом в общем "
        "вишлисте. Ещё можно дарить друг другу «действия», считать дни до важных дат "
        "и отвечать на вопрос дня.\n\n"
        "Чтобы начать, объединитесь в пару: /pair",
        reply_markup=webapp_open_kb_or_pair(),
    )


# --- /pair --------------------------------------------------------------------


@router.message(Command("pair"))
async def cmd_pair(message: Message, command: CommandObject) -> None:
    """Create an invite, or accept one if a token is passed: `/pair <token>`."""
    async with SessionLocal() as session:
        user = await users.get_or_create_user(
            session,
            message.from_user.id,
            tg_username=message.from_user.username,
            display_name=_display_name(message),
        )
        token = (command.args or "").strip()

        if token:
            try:
                await pairs.accept_invite(session, user, token)
                await session.commit()
            except InviteError as exc:
                await session.rollback()
                await message.answer(f"Не получилось: {exc}")
                return
            await message.answer("Вы в паре! 🎉 Общий вишлист ждёт — перешлите сюда пост.")
            return

        # No token -> create an invite for this user.
        try:
            invite = await pairs.create_invite(session, user)
            await session.commit()
        except InviteError as exc:
            await session.rollback()
            await message.answer(f"Не получилось: {exc}")
            return

    me = await message.bot.me()
    link = f"https://t.me/{me.username}?start={invite.token}"
    await message.answer(
        "Отправьте эту ссылку партнёру — и вы объединитесь в пару:\n\n"
        f"{link}\n\n"
        "Когда партнёр откроет её, у вас появится общий вишлист."
    )


# --- /help --------------------------------------------------------------------


@router.message(Command("help"))
async def cmd_help(message: Message) -> None:
    from pairly.bot.keyboards import webapp_open_kb
    kb = webapp_open_kb()
    await message.answer(
        "<b>Pairly</b> — общий уголок для вас двоих\n\n"
        "📥 <b>Вишлист</b> — перешлите сюда любой пост, и он станет пунктом общего "
        "списка.\n"
        "💝 <b>Действия и подарки</b> — дарите друг другу небольшие «действия».\n"
        "🗓 <b>Отсчёты</b> — считайте дни до важных дат.\n"
        "🌤 <b>Настроение</b> — покажите партнёру, как у вас дела.\n"
        "💬 <b>Вопрос дня</b> — отвечайте по очереди.\n\n"
        "<i>Команды:</i>\n"
        "/pair — объединиться в пару\n"
        "/list — мой вишлист\n"
        "/app — открыть Pairly\n"
        "/unpair — расстаться (удалит всё общее)\n"
        "/help — эта подсказка",
        reply_markup=kb,
    )


@router.message(Command("app"))
async def cmd_app(message: Message) -> None:
    """Open the Mini App. Hidden if PAIRLY_WEBAPP_URL is unset (e.g. local dev)."""
    from pairly.bot.keyboards import webapp_open_kb

    kb = webapp_open_kb()
    if kb is None:
        await message.answer(
            "Мини-приложение не настроено. Установите PAIRLY_WEBAPP_URL в .env.prod "
            "и зарегистрируйте домен через @BotFather → /setdomain."
        )
        return
    await message.answer("Открыть мини-приложение:", reply_markup=kb)


# --- /list --------------------------------------------------------------------


@router.message(Command("list"))
async def cmd_list(message: Message) -> None:
    async with SessionLocal() as session:
        user = await users.get_or_create_user(
            session,
            message.from_user.id,
            tg_username=message.from_user.username,
            display_name=_display_name(message),
        )
        try:
            pair = await base.get_user_pair(session, user.id)
        except NotPairedError:
            await session.commit()
            await message.answer("Сначала объединитесь в пару: /pair")
            return

        items = await wishlist.list_items(session, pair_id=pair.id, user_id=user.id)
        await session.commit()

    if not items:
        from pairly.bot.keyboards import webapp_open_kb

        await message.answer(
            "Ваш вишлист пока пуст. Перешлите сюда пост — и он появится.",
            reply_markup=webapp_open_kb(),
        )
        return

    # Render: header + numbered list with status mark + category emoji.
    _CAT_EMOJI = {"eat": "🍽", "do": "🎉", "stay": "🛌", "watch": "🎬", "buy": "🛍"}
    done = sum(1 for it in items if it.status.value == "done")
    lines = [f"🗒 <b>Ваш вишлист</b> — {done}/{len(items)} сделано", ""]
    shown = items[:15]
    for i, it in enumerate(shown, 1):
        mark = "✅" if it.status.value == "done" else "☐"
        cat = _CAT_EMOJI.get(it.category or "", "")
        prefix = f"{cat} " if cat else ""
        lines.append(f"{i}. {mark} {prefix}{html.escape(it.title)}")
    rest = len(items) - len(shown)
    if rest > 0:
        lines.append(f"\n…и ещё {rest} — все в приложении 👇")
    from pairly.bot.keyboards import webapp_open_kb

    await message.answer("\n".join(lines), reply_markup=webapp_open_kb())


# --- Forwarded message -> wishlist -------------------------------------------


@router.message(F.forward_origin)
async def on_forward(message: Message, state: FSMContext, bot: Bot) -> None:
    """The core capture loop: a forwarded post becomes a wishlist item.

    The incoming ``bot`` is injected by aiogram (unused for capture now — photos
    are resolved on demand from telegram_file_id by the API).
    """
    """The core capture loop: a forwarded post becomes a wishlist item."""
    # FSM guard: if a WishTitle / WishEdit flow is open, the user's "forward" is
    # almost certainly meant as the answer to that flow (a forwarded post can
    # carry text the user wants to use as the title). Without this guard, the
    # capture loop would create a NEW wishlist item AND clobber the FSM state
    # — both wrong. Drop the forward silently and let the FSM handlers deal
    # with it (a text-only forward will just be ignored as a "no-text" reply
    # via on_non_text_in_*_state).
    if await state.get_state() is not None:
        return

    # An album arrives as several updates; only handle the first photo per group.
    # Later photos (no caption of their own) would otherwise each ask for a title.
    if _is_album_followup(message):
        return

    text = message.text or message.caption or ""
    # A photo album without any caption: give it a sensible default title instead
    # of prompting — the album is one logical item, not a title-less void.
    if not text.strip() and message.media_group_id and (message.photo or message.video):
        text = "Альбом"  # localized default; the user can rename in the Mini App.

    async with SessionLocal() as session:
        user = await users.get_or_create_user(
            session,
            message.from_user.id,
            tg_username=message.from_user.username,
            display_name=_display_name(message),
        )
        try:
            pair = await base.get_user_pair(session, user.id)
        except NotPairedError:
            await session.commit()
            await message.answer("Сначала объединитесь в пару: /pair")
            return

        if not text.strip():
            # Photo with no caption, etc. -> ask the user what to call it.
            await state.set_state(WishTitle.waiting_for_title)
            await state.update_data(pair_id=pair.id, user_id=user.id)
            await session.commit()
            await message.answer("Как это назвать? Напишите заголовок — и я сохраню в вишлист.")
            return

        from pairly.bot.parse import parse_forwarded_text

        parsed = parse_forwarded_text(text)
        title = parsed.title or truncate_graphemes(text.strip(), 256)

        # Capture the forwarded photo's file_id (best-effort). We store ONLY the
        # Telegram file_id — no disk. The API resolves it to a temp URL on demand
        # (so no storage ops, no volume, and photos survive container recreate).
        telegram_file_id: str | None = message.photo[-1].file_id if message.photo else None

        # Deep link to the original post (public channels only). The Mini App opens
        # this when the user taps an item.
        source_url = _forward_source_url(message.forward_origin)

        # Full description = the forwarded text beyond the title, capped to ~4 KB.
        notes = text.strip()[:4096] if text.strip() else None

        try:
            item = await wishlist.create_item(
                session,
                pair_id=pair.id,
                user_id=user.id,
                title=title,
                address=parsed.address,
                category=parsed.category,
                notes=notes,
                telegram_file_id=telegram_file_id,
                source_url=source_url,
                source_message_id=message.message_id,
                status=WishlistStatus.PENDING,  # two-tap: partner must approve
            )
            await session.commit()
        except WishlistLimitError:
            await session.rollback()
            from pairly.bot.keyboards import upgrade_kb

            await message.answer(
                "В бесплатной версии — 10 пунктов вишлиста. Хотите больше?",
                reply_markup=upgrade_kb(),
            )
            return

        # Two-tap consent: notify the partner, who must approve before the item
        # becomes open. Best-effort; silent if blocked.
        from pairly.bot.notify import notify_wishlist_pending

        await notify_wishlist_pending(
            session, pair_id=pair.id, actor_id=user.id, title=title, item_id=item.id
        )

    from pairly.bot.keyboards import wishlist_saved_kb

    await message.answer(
        f"Готово — отправил партнёру на согласие: «{html.escape(title)}». "
        "Как только подтвердит — появится в общем списке.",
        reply_markup=wishlist_saved_kb(item.id),
    )


# FSM handler: user replied with a title for a media forward.
@router.message(StateFilter(WishTitle.waiting_for_title), F.text)
async def on_title_reply(message: Message, state: FSMContext) -> None:
    data = await state.get_data()
    pair_id = data.get("pair_id")
    user_id = data.get("user_id")
    await state.clear()
    if not pair_id or not user_id or not message.text:
        await message.answer("Не получилось сохранить. Попробуйте переслать ещё раз.")
        return

    title = truncate_graphemes(message.text.strip(), 256)
    async with SessionLocal() as session:
        try:
            await wishlist.create_item(
                session,
                pair_id=pair_id,
                user_id=user_id,
                title=title,
                source_message_id=f"fsm-colon-{message.message_id}",
            )
            await session.commit()
        except WishlistLimitError:
            await session.rollback()
            await message.answer("В бесплатной версии — 10 пунктов вишлиста.")
            return
        from pairly.bot.notify import notify_wishlist_added

        await notify_wishlist_added(
            session, pair_id=pair_id, actor_id=user_id, title=title
        )
    await message.answer(f"Готово — добавил в вишлист: «{html.escape(title)}»")


@router.message(StateFilter(WishTitle.waiting_for_title))
async def on_non_text_in_title_state(message: Message) -> None:
    """Sticker/photo/voice while we expected a title: re-prompt, don't drop silently.

    Keeps the FSM in the title state so the user can still type the name next.
    """
    await message.answer(
        "Нужно название текстом — пришлите заголовок, или /cancel чтобы отменить."
    )


# --- Edit title of a saved wishlist item (wish:edit callback) -----------------


@router.callback_query(F.data.startswith("wish:edit:"))
async def cb_wish_edit(call: CallbackQuery, state: FSMContext) -> None:
    """User tapped «✏️ Переименовать» on a saved item — ask for the new title."""
    item_id = call.data.split(":", 2)[-1] if call.data else ""
    if not item_id:
        await call.answer("Не нашёл пункт.", show_alert=True)
        return
    await state.set_state(WishEdit.waiting_for_new_title)
    await state.update_data(item_id=item_id)
    await call.message.answer("Напишите новое название — и я сохраню.")
    await call.answer()


@router.callback_query(F.data.startswith("wish:approve:"))
async def cb_wish_approve(call: CallbackQuery) -> None:
    """Partner taps «👍 Ок» on a pending forwarded item → two-tap consent."""
    item_id = call.data.split(":", 2)[-1] if call.data else ""
    if not item_id:
        await call.answer("Не нашёл пункт.", show_alert=True)
        return
    user = call.from_user
    if user is None:
        await call.answer()
        return
    async with SessionLocal() as session:
        me = await users.get_or_create_user(session, user.id, tg_username=user.username)
        try:
            pair = await base.get_user_pair(session, me.id)
        except NotPairedError:
            await session.commit()
            await call.answer("Сначала объединитесь в пару.", show_alert=True)
            return
        try:
            item = await wishlist.approve_item(
                session, pair_id=pair.id, user_id=me.id, item_id=item_id
            )
            await session.commit()
        except (LookupError, base.PairAccessError):
            await session.rollback()
            await call.answer("Не нашёл пункт.", show_alert=True)
            return
    await call.answer("👍 Добавил в общий список!" if item.status == WishlistStatus.OPEN else "Уже добавлено.")
    try:
        await call.message.edit_reply_markup(reply_markup=None)
    except Exception:  # noqa: BLE001
        pass


@router.callback_query(F.data == "wish:approve:skip")
async def cb_wish_approve_skip(call: CallbackQuery) -> None:
    """Partner defers consent — dismiss the approve keyboard. The item stays pending."""
    await call.answer("Ок, отложили.")
    try:
        await call.message.edit_reply_markup(reply_markup=None)
    except Exception:  # noqa: BLE001
        pass


@router.message(StateFilter(WishEdit.waiting_for_new_title), F.text)
async def on_rename_reply(message: Message, state: FSMContext) -> None:
    """User replied with a new title for the item being renamed."""
    data = await state.get_data()
    item_id = data.get("item_id")
    await state.clear()
    if not item_id or not message.text:
        await message.answer("Не получилось переименовать. Попробуйте ещё раз.")
        return

    async with SessionLocal() as session:
        user = await users.get_or_create_user(
            session,
            message.from_user.id,
            tg_username=message.from_user.username,
            display_name=_display_name(message),
        )
        try:
            pair = await base.get_user_pair(session, user.id)
        except NotPairedError:
            await session.commit()
            await message.answer("Сначала объединитесь в пару: /pair")
            return
        try:
            item = await wishlist.rename_item(
                session, pair_id=pair.id, user_id=user.id, item_id=item_id, title=message.text
            )
            await session.commit()
        except (LookupError, base.PairAccessError):
            await session.rollback()
            await message.answer("Не нашёл этот пункт.")
            return
    await message.answer(f"Готово — теперь это «{html.escape(item.title)}»")


@router.message(StateFilter(WishEdit.waiting_for_new_title))
async def on_non_text_in_rename_state(message: Message) -> None:
    await message.answer("Нужно название текстом — или /cancel чтобы отменить.")


@router.message(Command("cancel"))
async def cmd_cancel(message: Message, state: FSMContext) -> None:
    """Escape any in-progress flow (e.g. waiting-for-title). Safe to call anytime."""
    if await state.get_state() is None:
        await message.answer("Нечего отменять 🙂")
        return
    await state.clear()
    await message.answer("Отменил.")


# --- "no webapp configured" hint (keyboards.py:43) -----------------------------


@router.callback_query(F.data == "hint:pair")
async def cb_hint_pair(call: CallbackQuery) -> None:
    """Dev-fallback CTA when no Mini App is configured: explain /pair in 1 tap.

    The button is emitted by webapp_open_kb_or_pair() in keyboards.py when
    PAIRLY_WEBAPP_URL is empty (local dev). Without this handler the tap was
    a silent no-op and confused new users.
    """
    await call.answer(
        "Нажмите /pair и пришлите код приглашения, чтобы объединиться.",
        show_alert=True,
    )


# --- Free-tier upgrade CTAs (keyboards.py:88-89) ------------------------------


@router.callback_query(F.data == "upgrade:dismiss")
async def cb_upgrade_dismiss(call: CallbackQuery) -> None:
    """User tapped «Не сейчас» on the upgrade prompt — just hide the keyboard."""
    await call.answer()
    try:
        await call.message.edit_reply_markup(reply_markup=None)
    except Exception:  # noqa: BLE001
        pass


@router.callback_query(F.data == "upgrade:info")
async def cb_upgrade_info(call: CallbackQuery) -> None:
    """User tapped «Узнать про Pro» — show a short Pro pitch inline + dismiss."""
    await call.answer(
        "Pairly Pro: безлимит на вишлист, отсчёты и подарки. "
        "Когда запустим — пришлём ссылку 🙌",
        show_alert=True,
    )
    try:
        await call.message.edit_reply_markup(reply_markup=None)
    except Exception:  # noqa: BLE001
        pass


# --- /unpair (destructive, 2-step confirm) -----------------------------------


@router.message(Command("unpair"))
async def cmd_unpair(message: Message) -> None:
    """Begin the destructive unpair flow. Only meaningful when paired."""
    from pairly.bot.keyboards import unpair_confirm_kb

    async with SessionLocal() as session:
        user = await users.get_or_create_user(
            session,
            message.from_user.id,
            tg_username=message.from_user.username,
            display_name=_display_name(message),
        )
        try:
            await base.get_user_pair(session, user.id)
        except NotPairedError:
            await session.commit()
            await message.answer("Вы пока не в паре — расставаться не с кем 🙂 /pair")
            return
        await session.commit()

    await message.answer(
        "Это серьёзный шаг. <b>/unpair удалит ВСЁ ваше общее</b> для вас обоих: "
        "вишлист, подарки, ответы на вопросы, отсчёты, настроение, список желаний. "
        "Без возможности восстановить — навсегда. Точно хотите?",
        reply_markup=unpair_confirm_kb(),
    )


@router.callback_query(F.data == "unpair:cancel")
async def cb_unpair_cancel(call: CallbackQuery) -> None:
    await call.message.edit_text("Славно, остаёмся парой 💛 Ничего не тронуто.")
    await call.answer()


@router.callback_query(F.data == "unpair:confirm")
async def cb_unpair_confirm(call: CallbackQuery) -> None:
    """Wipe all shared data + unlink both members, then notify the partner warmly."""
    async with SessionLocal() as session:
        user = await users.resolve_user_by_tg(session, call.from_user.id)
        if user is None:
            await call.answer("Сначала откройте /start")
            return
        try:
            pair = await base.get_user_pair(session, user.id)
        except NotPairedError:
            await session.commit()
            await call.message.edit_text("Вы уже не в паре. /pair — начать заново.")
            await call.answer()
            return

        # Capture the partner BEFORE dissolving (after, the link is gone).
        from pairly.repositories.base import pair_members

        partner_tg_ids = [
            m.tg_id for m in await pair_members(session, pair.id) if m.id != user.id
        ]

        await pairs.dissolve_pair(session, user.id)
        await session.commit()

    # Tell the partner gently (best-effort; the bot may be blocked).
    if partner_tg_ids:
        from pairly.bot.notify import _get_bot

        for tg_id in partner_tg_ids:
            with contextlib.suppress(Exception):
                await _get_bot().send_message(
                    tg_id,
                    "Ваша пара была расторгнута, и всё общее удалено. "
                    "Если захотите начать заново — /pair.",
                )

    await call.message.edit_text(
        "Готово. Вы больше не пара, и всё общее удалено. "
        "Если захотите начать заново — /pair."
    )
    await call.answer()


# --- helpers ------------------------------------------------------------------


def _display_name(message: Message) -> str | None:
    u = message.from_user
    if u is None:
        return None
    return (u.full_name if hasattr(u, "full_name") else None) or u.username or None


__all__ = ["router", "WishTitle"]
