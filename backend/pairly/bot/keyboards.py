"""Inline keyboards for the bot (labels in Russian, ≤20 chars)."""

from __future__ import annotations

from aiogram.types import InlineKeyboardMarkup, WebAppInfo
from aiogram.utils.keyboard import InlineKeyboardBuilder

from pairly.config import get_settings


def pair_start_kb(invite_token: str, bot_username: str) -> InlineKeyboardMarkup:
    """Button that sends the partner a /pair <token> deep link."""
    url = f"https://t.me/{bot_username}?start={invite_token}"
    kb = InlineKeyboardBuilder()
    kb.button(text="Пригласить партнёра", url=url)
    return kb.as_markup()


def webapp_open_kb() -> InlineKeyboardMarkup | None:
    """Button that opens the Mini App in Telegram. Returns None if webapp_url is unset.

    Requires the SAME domain to be registered in @BotFather -> /setdomain, otherwise
    Telegram refuses to open the WebApp from this button.
    """
    url = get_settings().webapp_url.strip().rstrip("/")
    if not url:
        return None
    kb = InlineKeyboardBuilder()
    kb.button(text="Открыть Pairly", web_app=WebAppInfo(url=url))
    return kb.as_markup()


def webapp_open_kb_or_pair() -> InlineKeyboardMarkup:
    """Primary CTA: open the Mini App if configured, else invite-to-pair fallback.

    Always returns a keyboard (never None) so it's safe to attach to any answer.
    """
    webapp = webapp_open_kb()
    if webapp is not None:
        return webapp
    # No webapp configured (dev) — fall back to a pair-up hint button.
    kb = InlineKeyboardBuilder()
    kb.button(text="Объединиться в пару", callback_data="hint:pair")
    return kb.as_markup()


def wishlist_category_kb() -> InlineKeyboardMarkup:
    """Category override buttons (default is guessed; user can fix)."""
    kb = InlineKeyboardBuilder()
    for code, label in (
        ("eat", "🍽 Поесть"),
        ("stay", "🛌 Переночевать"),
        ("watch", "🎬 Посмотреть"),
        ("buy", "🛍 Купить"),
    ):
        kb.button(text=label, callback_data=f"wish:cat:{code}")
    kb.adjust(2, 3)
    return kb.as_markup()


def wishlist_saved_kb(item_id: str) -> InlineKeyboardMarkup:
    """Post-forward affordances: edit the title (inline) + open the Mini App.

    The edit button carries the item_id so the callback handler knows which item
    to rename. The Mini App button is omitted if no webapp_url is configured.
    """
    kb = InlineKeyboardBuilder()
    kb.button(text="✏️ Переименовать", callback_data=f"wish:edit:{item_id}")
    webapp = webapp_open_kb()
    if webapp is not None:
        kb.button(text="🗂 Открыть вишлист", web_app=WebAppInfo(url=get_settings().webapp_url.strip().rstrip("/")))
    kb.adjust(1)  # stacked — each action on its own row
    return kb.as_markup()


def upgrade_kb() -> InlineKeyboardMarkup:
    """Shown on free-tier limit hit. Warm, not pushy."""
    kb = InlineKeyboardBuilder()
    kb.button(text="Узнать про Pro", callback_data="upgrade:info")
    kb.button(text="Не сейчас", callback_data="upgrade:dismiss")
    return kb.as_markup()


def unpair_confirm_kb() -> InlineKeyboardMarkup:
    """Destructive 2-button confirm for /unpair (docs/copy/pair.md)."""
    kb = InlineKeyboardBuilder()
    kb.button(text="Да, расстаться", callback_data="unpair:confirm")
    kb.button(text="Нет, оставить", callback_data="unpair:cancel")
    kb.adjust(1, 1)  # stacked — make the destructive choice deliberate
    return kb.as_markup()
