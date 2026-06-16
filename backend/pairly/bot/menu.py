"""Bot command menu + chat-menu button setup.

Registers the "/" command list (with descriptions) and the main menu button that
opens the Mini App. Called once on bot startup.
"""

from __future__ import annotations

from aiogram import Bot
from aiogram.types import (
    BotCommand,
    BotCommandScopeDefault,
    MenuButtonWebApp,
    WebAppInfo,
)

from pairly.config import get_settings

# The command palette users see when they tap "/" in the bot.
# Kept short: the Mini App is where the rich UI lives; the bot is for fast capture
# (forward -> wishlist) and pairing.
_DEFAULT_COMMANDS = [
    BotCommand(command="start", description="начать / открыть Pairly"),
    BotCommand(command="pair", description="объединиться в пару"),
    BotCommand(command="list", description="мой вишлист"),
    BotCommand(command="app", description="открыть приложение"),
    BotCommand(command="cancel", description="отменить текущее действие"),
    BotCommand(command="help", description="что умеет бот"),
]


async def setup_menu(bot: Bot) -> None:
    """Register the "/" command menu and the Mini App menu button."""
    settings = get_settings()
    await bot.set_my_commands(_DEFAULT_COMMANDS, scope=BotCommandScopeDefault())

    # The hamburger / menu button opens the Mini App directly (when configured).
    webapp_url = (settings.webapp_url or "").strip()
    if webapp_url:
        await bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(
                text="Открыть Pairly",
                web_app=WebAppInfo(url=webapp_url),
            )
        )
