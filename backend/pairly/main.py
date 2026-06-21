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
from pairly.db.base import SessionLocal, init_db

log = logging.getLogger("pairly.bot")

# How often the bot-process outbox drainer polls for retried partner notifications.
# Best-effort: any exception in the tick is swallowed so the periodic task is safe.
_OUTBOX_DRAIN_INTERVAL_SEC = 30.0


def build_dispatcher() -> Dispatcher:
    dp = Dispatcher()
    # Admin router registered first so /admin is checked BEFORE the user-facing
    # fallback handlers (which assume an unpaired context and would reply with
    # "объединитесь в пару" to a legitimate admin).
    dp.include_router(admin_router)
    dp.include_router(main_router)

    # Mirror api/app.py:97's exception shield so any handler raising
    # PairAccessError / NotPairedError / LookupError / GiftStateError / etc.
    # is logged and swallowed instead of crashing the update dispatcher
    # (which would surface as a 500 from Telegram's webhook handler and
    # burn the secret-token retry budget). Handlers already catch the
    # common cases inline; this is the belt-and-suspenders backstop.
    @dp.errors()
    async def _on_error(event) -> None:  # type: ignore[no-untyped-def]
        # aiogram's TelegramEventObserver passes an ErrorEvent; keep the
        # parameter typed as a name (we don't import the type to avoid a
        # hard dep on aiogram's internal layout).
        log.exception(
            "unhandled exception in bot dispatcher: %s",
            getattr(event, "exception", event),
        )

    # Register the "/" command menu + Mini App menu button on startup. Works for
    # both polling and webhook (Dispatcher emits startup in both modes).
    dp.startup.register(_on_startup)
    dp.shutdown.register(_on_shutdown)
    return dp


async def _on_startup(bot: Bot, **_kwargs) -> None:
    await setup_menu(bot)
    # Wire the bot-process outbox drainer. The API process drains on its own
    # request loop (best-effort, no scheduler there); the bot process has
    # none, so we run a tiny periodic task that calls drain_outbox every
    # _OUTBOX_DRAIN_INTERVAL_SEC. Any exception inside drain_outbox is
    # swallowed by drain_outbox itself; we still wrap in a broad try/except
    # so a total scheduling glitch never takes the bot down.
    loop = asyncio.get_running_loop()
    drainer = _OutboxDrainer()
    task = loop.create_task(drainer.run(), name=_OutboxDrainer.TASK_NAME)
    log.info(
        "pairly bot outbox drainer started (interval=%.0fs)", _OUTBOX_DRAIN_INTERVAL_SEC
    )
    # task is referenced only so it's not garbage-collected mid-flight.
    _ = task


async def _on_shutdown(dispatcher: Dispatcher) -> None:
    """Cancel the periodic drainer on shutdown (best-effort)."""
    for task in asyncio.all_tasks():
        if task.get_name() == _OutboxDrainer.TASK_NAME and not task.done():
            task.cancel()
            log.info("pairly bot outbox drainer cancelled on shutdown")


async def _run_polling(bot: Bot, dp: Dispatcher) -> None:
    log.info("Pairly bot starting in polling mode.")
    await dp.start_polling(bot)


async def _run_webhook(bot: Bot, dp: Dispatcher, settings) -> None:
    """Webhook mode: spin up an aiohttp server that proxies /telegram-webhook to the dispatcher."""
    if not settings.webhook_url:
        raise SystemExit("webhook mode requires PAIRLY_WEBHOOK_URL")

    # Stable webhook secret token. In prod set PAIRLY_WEBHOOK_SECRET_TOKEN so the
    # token survives restarts (otherwise Telegram drops every update after each
    # bot restart because the random secret rotates). When unset (dev), generate
    # in-memory — the dev workflow always uses polling so this path is moot.
    if settings.webhook_secret_token:
        secret_token = settings.webhook_secret_token
        log.info(
            "pairly bot using stable webhook secret (fingerprint=%s****)",
            secret_token[:4],
        )
    else:
        secret_token = secrets.token_urlsafe(16)
        log.warning(
            "pairly bot generated a new random webhook secret (fingerprint=%s****) — "
            "Telegram will drop updates on every restart. Set PAIRLY_WEBHOOK_SECRET_TOKEN "
            "in prod.",
            secret_token[:4],
        )

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


class _OutboxDrainer:
    """Periodic task that calls notify.drain_outbox every ~30s.

    Lives only on the bot process (the API process drains on its request loop
    by piggy-backing; we still want a dedicated ticker here because the bot
    process is where most notify_* calls originate from and where retry-after
    queued rows actually need to be delivered from).

    `drain_outbox` is fully exception-safe (it swallows every error), so this
    loop never needs to handle a raised exception itself — but we wrap the
    `await` anyway so a truly broken `asyncio.sleep`/cancellation interplay
    can't take down the bot.
    """

    TASK_NAME = "pairly-outbox-drainer"

    def __init__(self) -> None:
        from pairly.bot.notify import drain_outbox

        self._drain = drain_outbox

    async def run(self) -> None:
        # First sleep, then drain, so we don't block startup.
        try:
            while True:
                await asyncio.sleep(_OUTBOX_DRAIN_INTERVAL_SEC)
                try:
                    await self._drain(SessionLocal)
                except Exception:  # noqa: BLE001
                    log.exception("outbox drain tick crashed; will retry next interval")
        except asyncio.CancelledError:
            log.info("outbox drainer cancelled")
            raise


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
