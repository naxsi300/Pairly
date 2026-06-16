"""Bot command + message handlers (aiogram 3).

Copy is in Russian (warm, non-corporate). All DB writes go through the repository layer,
which enforces the pair-scoping invariant. Unpaired users get a "сначала объединитесь в пару"
gate on shared features.
"""

from __future__ import annotations

import html

from aiogram import F, Router
from aiogram.filters import Command, CommandObject, StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import Message

from pairly.db.base import SessionLocal
from pairly.repositories import base, pairs, users, wishlist
from pairly.repositories.base import NotPairedError
from pairly.repositories.pairs import InviteError
from pairly.repositories.wishlist import WishlistLimitError

router = Router(name="pairly-main")


# --- FSM for the "no text -> ask for a title" inline flow ---------------------


class WishTitle(StatesGroup):
    waiting_for_title = State()


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

    await message.answer(
        "Привет! Это Pairly — общий уголок для вас двоих.\n\n"
        "Перешлите сюда пост из любого канала или чата — и он станет пунктом в общем "
        "вишлисте. Ещё можно дарить друг другу «действия», считать дни до важных дат "
        "и отвечать на вопрос дня.\n\n"
        "Чтобы начать, объединитесь в пару: /pair"
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
        "Pairly — что умеет:\n\n"
        "• Перешлите пост → он станет пунктом вишлиста\n"
        "• /pair — объединиться в пару\n"
        "• /list — посмотреть вишлист\n"
        "• /app — открыть мини-приложение\n"
        "• /help — эта подсказка",
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

    lines = []
    for it in items:
        mark = "✅" if it.status.value == "done" else "☐"
        lines.append(f"{mark} {html.escape(it.title)}")
    from pairly.bot.keyboards import webapp_open_kb

    await message.answer("\n".join(lines), reply_markup=webapp_open_kb())


# --- Forwarded message -> wishlist -------------------------------------------


@router.message(F.forward_origin)
async def on_forward(message: Message, state: FSMContext) -> None:
    """The core capture loop: a forwarded post becomes a wishlist item."""
    text = message.text or message.caption or ""

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
        title = parsed.title or text.strip()[:256]
        try:
            await wishlist.create_item(
                session,
                pair_id=pair.id,
                user_id=user.id,
                title=title,
                address=parsed.address,
                category=parsed.category,
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

    await message.answer(f"Готово — добавил в вишлист: «{html.escape(title)}»")


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

    title = message.text.strip()[:256]
    async with SessionLocal() as session:
        try:
            await wishlist.create_item(
                session, pair_id=pair_id, user_id=user_id, title=title
            )
            await session.commit()
        except WishlistLimitError:
            await session.rollback()
            await message.answer("В бесплатной версии — 10 пунктов вишлиста.")
            return
    await message.answer(f"Готово — добавил в вишлист: «{html.escape(title)}»")


# --- helpers ------------------------------------------------------------------


def _display_name(message: Message) -> str | None:
    u = message.from_user
    if u is None:
        return None
    return (u.full_name if hasattr(u, "full_name") else None) or u.username or None


__all__ = ["router", "WishTitle"]
