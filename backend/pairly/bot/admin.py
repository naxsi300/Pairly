"""Admin router — /admin menu (tg_id-gated).

Layout:
  /admin  -> menu of actions (Grant / Revoke / List / Audit)
  Grant  -> ask tg_id -> look up pair -> confirm -> grant_pro + audit log
  Revoke -> same flow, revoke_pro
  List   -> last 20 pairs (id + members + tier)
  Audit  -> last 20 audit entries

Security: every entry point checks the sender's tg_id against
PAIRLY_ADMIN_TG_IDS. Empty admin set -> the menu is dead (no one can use it).
"""

from __future__ import annotations

import html

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message
from sqlalchemy import select

from pairly.config import admin_tg_id_set
from pairly.db.base import SessionLocal
from pairly.db.models import User as UserModel
from pairly.repositories import admin as admin_repo

router = Router(name="pairly-admin")


class AdminFSM(StatesGroup):
    waiting_tg_id = State()


def _is_admin(message_or_call) -> bool:
    user = getattr(message_or_call, "from_user", None)
    return user is not None and user.id in admin_tg_id_set()


def _menu_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="Выдать Pro", callback_data="admin:grant")],
            [InlineKeyboardButton(text="Снять Pro", callback_data="admin:revoke")],
            [InlineKeyboardButton(text="Список пар", callback_data="admin:list")],
            [InlineKeyboardButton(text="История", callback_data="admin:audit")],
        ]
    )


def _cancel_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text="Отмена", callback_data="admin:menu")]]
    )


def _format_pair_line(pair, members) -> str:
    def label(m):
        handle = f"@{m.tg_username}" if m.tg_username else str(m.tg_id)
        return html.escape(m.display_name or handle), handle

    if len(members) >= 1:
        name_a, handle_a = label(members[0])
    else:
        name_a, handle_a = "—", "—"
    if len(members) >= 2:
        name_b, handle_b = label(members[1])
    else:
        name_b, handle_b = "(нет партнёра)", "—"
    return (
        f"• {pair.id[:8]}… [{pair.tier.value}]\n"
        f"    {name_a} ({handle_a})\n"
        f"    {name_b} ({handle_b})"
    )


# --- /admin ------------------------------------------------------------------


@router.message(Command("admin"))
async def cmd_admin(message: Message) -> None:
    if not _is_admin(message):
        # Silent: don't leak the existence of the menu.
        return
    await message.answer("Pairly — админ-меню:", reply_markup=_menu_kb())


# --- Menu callbacks ----------------------------------------------------------


@router.callback_query(F.data == "admin:menu")
async def cb_menu(call: CallbackQuery, state: FSMContext) -> None:
    if not _is_admin(call):
        await call.answer("нет доступа", show_alert=True)
        return
    await state.clear()
    await call.message.answer("Pairly — админ-меню:", reply_markup=_menu_kb())
    await call.answer()


@router.callback_query(F.data == "admin:grant")
async def cb_grant(call: CallbackQuery, state: FSMContext) -> None:
    if not _is_admin(call):
        return
    await state.set_state(AdminFSM.waiting_tg_id)
    await state.update_data(action="grant_pro")
    await call.message.answer(
        "Кому выдать Pro? Пришлите Telegram id пользователя (число):",
        reply_markup=_cancel_kb(),
    )
    await call.answer()


@router.callback_query(F.data == "admin:revoke")
async def cb_revoke(call: CallbackQuery, state: FSMContext) -> None:
    if not _is_admin(call):
        return
    await state.set_state(AdminFSM.waiting_tg_id)
    await state.update_data(action="revoke_pro")
    await call.message.answer(
        "У кого снять Pro? Пришлите Telegram id пользователя (число):",
        reply_markup=_cancel_kb(),
    )
    await call.answer()


@router.callback_query(F.data == "admin:list")
async def cb_list(call: CallbackQuery) -> None:
    if not _is_admin(call):
        return
    async with SessionLocal() as session:
        counts = await admin_repo.pair_counts(session)
        pairs = await admin_repo.list_pairs(session, limit=20, offset=0)
    lines = [
        f"Пар: всего {counts['total']} · Pro {counts['pro']} · "
        f"Free {counts['free']} · dissolved {counts['dissolved']}",
        "",
    ]
    if pairs:
        lines.extend(_format_pair_line(p, m) for p, m in pairs)
    else:
        lines.append("(пока нет)")
    await call.message.answer("\n".join(lines), reply_markup=_menu_kb())
    await call.answer()


@router.callback_query(F.data == "admin:audit")
async def cb_audit(call: CallbackQuery) -> None:
    if not _is_admin(call):
        return
    async with SessionLocal() as session:
        entries = await admin_repo.recent_audit(session, limit=20)
    if not entries:
        await call.message.answer("История пуста.", reply_markup=_menu_kb())
        await call.answer()
        return
    lines = []
    for e in entries:
        when = e.created_at.strftime("%Y-%m-%d %H:%M")
        target = (e.target_pair_id or "—")[:8]
        detail = (e.detail or "").replace("\n", " ")[:120]
        lines.append(
            f"• {when} · admin {e.actor_tg_id} · {e.action} · {target}… · {html.escape(detail)}"
        )
    await call.message.answer("\n".join(lines), reply_markup=_menu_kb())
    await call.answer()


# --- FSM: tg_id entered -> resolve pair -> confirm button --------------------


@router.message(AdminFSM.waiting_tg_id, F.text)
async def on_tg_id(message: Message, state: FSMContext) -> None:
    if not _is_admin(message):
        await state.clear()
        return
    raw = (message.text or "").strip()
    try:
        tg_id = int(raw)
    except ValueError:
        await message.answer(
            "Не похоже на число. Пришлите Telegram id цифрами, или нажмите «Отмена».",
            reply_markup=_cancel_kb(),
        )
        return
    data = await state.get_data()
    action = data.get("action", "grant_pro")

    async with SessionLocal() as session:
        resolved = await admin_repo.resolve_pair_by_tg_id(session, tg_id)
        if resolved is None:
            await message.answer(
                "Пользователь не найден или не в паре. Пришлите другой id или «Отмена».",
                reply_markup=_cancel_kb(),
            )
            # Keep state so the user can retry with another id without re-clicking.
            return
        user, pair = resolved
        members = list(
            (await session.scalars(select(UserModel).where(UserModel.pair_id == pair.id))).all()
        )

    member_lines = []
    for m in members:
        handle = f"@{m.tg_username}" if m.tg_username else str(m.tg_id)
        member_lines.append(f"  · {html.escape(m.display_name or handle)} ({handle})")
    if not member_lines:
        member_lines.append("  · (нет участников)")

    confirm_kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="Подтвердить",
                    callback_data=f"admin:{action}:{tg_id}",
                ),
                InlineKeyboardButton(text="Отмена", callback_data="admin:menu"),
            ]
        ]
    )
    verb = "Выдать Pro" if action == "grant_pro" else "Снять Pro"
    body = (
        f"{verb} для пары {pair.id[:8]}…?\n"
        f"Текущий тир: {pair.tier.value}\n"
        f"Участники ({len(members)}):\n" + "\n".join(member_lines)
    )
    await message.answer(body, reply_markup=confirm_kb)
    # Don't clear state — confirm callback doesn't carry action, only tg_id.
    # The action was stashed via state and we use the action embedded in the
    # callback_data instead, so clearing is fine here.


@router.callback_query(
    F.data.startswith("admin:grant_pro:") | F.data.startswith("admin:revoke_pro:")
)
async def cb_confirm(call: CallbackQuery) -> None:
    if not _is_admin(call):
        return
    parts = (call.data or "").split(":")
    if len(parts) != 3:
        await call.answer("некорректно", show_alert=True)
        return
    _, action, tg_id_str = parts
    try:
        tg_id = int(tg_id_str)
    except ValueError:
        await call.answer("некорректный id", show_alert=True)
        return

    async with SessionLocal() as session:
        try:
            resolved = await admin_repo.resolve_pair_by_tg_id(session, tg_id)
            if resolved is None:
                await session.rollback()
                await call.message.answer(
                    "Пользователь больше не в паре. Действие отменено.",
                    reply_markup=_menu_kb(),
                )
                await call.answer()
                return
            _, pair = resolved
            if action == "grant_pro":
                pair = await admin_repo.grant_pro(
                    session, actor_tg_id=call.from_user.id, target_pair_id=pair.id
                )
                msg = f"Pro выдан паре {pair.id[:8]}…"
            else:
                pair = await admin_repo.revoke_pro(
                    session, actor_tg_id=call.from_user.id, target_pair_id=pair.id
                )
                msg = f"Pro снят с пары {pair.id[:8]}…"
            await session.commit()
        except admin_repo.AdminError as exc:
            await session.rollback()
            await call.message.answer(f"Не получилось: {exc}", reply_markup=_menu_kb())
            await call.answer()
            return

    await call.message.answer(msg, reply_markup=_menu_kb())
    await call.answer()
