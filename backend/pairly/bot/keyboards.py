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


def wishlist_category_kb() -> InlineKeyboardMarkup:
    """Category override buttons (default is guessed; user can fix)."""
    kb = InlineKeyboardBuilder()
    for code, label in (
        ("eat", "🍽 Поесть"),
        ("do", "🎉 Сделать"),
        ("stay", "🛌 Переночевать"),
        ("watch", "🎬 Посмотреть"),
        ("buy", "🛍 Купить"),
    ):
        kb.button(text=label, callback_data=f"wish:cat:{code}")
    kb.adjust(2, 3)
    return kb.as_markup()


def upgrade_kb() -> InlineKeyboardMarkup:
    """Shown on free-tier limit hit. Warm, not pushy."""
    kb = InlineKeyboardBuilder()
    kb.button(text="Узнать про Pro", callback_data="upgrade:info")
    kb.button(text="Не сейчас", callback_data="upgrade:dismiss")
    return kb.as_markup()
