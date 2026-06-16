"""Bot entrypoint: builds the Dispatcher, registers routers, starts in polling or webhook mode.

Run: `make bot` (polling dev) or set `PAIRLY_WEBHOOK_URL=https://...` for prod.
"""

from __future__ import annotations

import asyncio
import logging
import secrets

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.webhook.aiohttp_server import (
    SimpleRequestHandler,
    setup_application,
)
from aiohttp import web

from pairly.bot import admin_router
from pairly.bot import router as main_router
from pairly.bot.menu import setup_menu
from pairly.config import get_settings
from pairly.db.base import init_db

log = logging.getLogger("pairly.bot")


def build_dispatcher() -> Dispatcher:
    dp = Dispatcher()
    # Admin router registered first so /admin is checked BEFORE the user-facing
    # fallback handlers (which assume an unpaired context and would reply with
    # "объединитесь в пару" to a legitimate admin).
    dp.include_router(admin_router)
    dp.include_router(main_router)

    # Register the "/" command menu + Mini App menu button on startup. Works for
    # both polling and webhook (Dispatcher emits startup in both modes).
    dp.startup.register(_on_startup)
    return dp


async def _on_startup(bot: Bot, **_kwargs) -> None:
    await setup_menu(bot)


async def _run_polling(bot: Bot, dp: Dispatcher) -> None:
    log.info("Pairly bot starting in polling mode.")
    await dp.start_polling(bot)


async def _run_webhook(bot: Bot, dp: Dispatcher, settings) -> None:
    """Webhook mode: spin up an aiohttp server that proxies /telegram-webhook to the dispatcher."""
    if not settings.webhook_url:
        raise SystemExit("webhook mode requires PAIRLY_WEBHOOK_URL")

    # Random secret token to ensure the webhook is from Telegram. Caddy / your proxy
    # must forward the exact same path.
    secret_token = secrets.token_urlsafe(16)

    await bot.set_webhook(
        url=settings.webhook_url + settings.webhook_path,
        allowed_updates=dp.resolve_used_update_types(),
        secret_token=secret_token,
    )
    log.info("Pairly bot webhook set: %s%s", settings.webhook_url, settings.webhook_path)

    app = web.Application()
    handler = SimpleRequestHandler(dispatcher=dp, bot=bot, secret_token=secret_token)
    handler.register(app, path=settings.webhook_path)
    setup_application(app, dp, bot=bot)

    log.info("Webhook server listening on %s:%d", settings.webhook_host, settings.webhook_port)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, settings.webhook_host, settings.webhook_port)
    await site.start()
    # Idle — aiohttp handles requests in its own loop.
    try:
        await asyncio.Event().wait()
    finally:
        await bot.delete_webhook()
        await runner.cleanup()


async def main() -> None:
    settings = get_settings()
    logging.basicConfig(
        level=logging.DEBUG if settings.debug else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    # Dev convenience: ensure tables exist. In prod Alembic is the source of truth.
    await init_db()

    bot = Bot(
        token=settings.bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    dp = build_dispatcher()

    try:
        if settings.bot_polling and not settings.webhook_url:
            await _run_polling(bot, dp)
        else:
            await _run_webhook(bot, dp, settings)
    finally:
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())
