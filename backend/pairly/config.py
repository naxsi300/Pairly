"""Application configuration loaded from environment via pydantic-settings.

All service identifiers use the lowercase `pairly` prefix (see CLAUDE.md naming).
"""

from __future__ import annotations

import contextlib
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings. Override via env vars or a `.env` file at repo root."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_prefix="PAIRLY_",
        extra="ignore",
    )

    # --- Telegram bot ---
    bot_token: str = Field(description="Telegram Bot API token from @BotFather.")

    # --- Database ---
    # SQLite (dev default) -> Postgres (prod). Async drivers chosen from the scheme.
    database_url: str = "sqlite+aiosqlite:///./pairly.db"

    # --- API (FastAPI, separate process from the bot) ---
    api_host: str = "127.0.0.1"
    api_port: int = 8000

    # --- Pair invite tokens ---
    # Bytes of entropy for `/pair` invite tokens.
    invite_token_bytes: int = 16

    # --- Free-tier limits (per pair). Pro = unlimited. ---
    free_wishlist_limit: int = 10
    free_countdown_limit: int = 10
    free_bucket_limit: int = 5

    # --- Misc ---
    # When True the bot starts in polling mode (dev). In prod set False and run a webhook.
    bot_polling: bool = True
    # Webhook configuration (prod). If set, bot_polling is ignored and bot runs in webhook mode.
    # Example: https://example.com/telegram-webhook
    webhook_url: str | None = None
    webhook_path: str = "/telegram-webhook"
    webhook_host: str = "0.0.0.0"
    webhook_port: int = 8080
    # API auth: True = trust X-Dev-User-Id header (no HMAC). DEV/TEST ONLY. Never True in prod.
    dev_auth: bool = False
    # Admin gating: comma-separated Telegram user ids that may use /admin. Empty disables the menu.
    admin_tg_ids: str = ""
    # OmniRoute (OpenAI-compatible) LLM endpoint for the wheel's «Умный»/«Мне повезёт»
    # modes. Empty base_url → AI disabled (the wheel falls back to random). Point
    # this at your local OmniRoute and set a model it routes to.
    omnirout_base_url: str = ""
    omnirout_api_key: str = ""
    omnirout_model: str = "gpt-4o-mini"
    # Public URL of the Mini App. Must be the SAME domain that is registered with
    # @BotFather (/setdomain) so WebAppInfo can open it from a button in the bot.
    # Examples:
    #   prod:  https://app.example.com
    #   dev:   empty -> the /app button is hidden (so local dev doesn't render a broken URL)
    webapp_url: str = ""
    debug: bool = False


def admin_tg_id_set() -> set[int]:
    """Parse PAIRLY_ADMIN_TG_IDS into a set of integers (empty set if unset)."""
    raw = get_settings().admin_tg_ids.strip()
    if not raw:
        return set()
    out: set[int] = set()
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        with contextlib.suppress(ValueError):
            out.add(int(part))
    return out


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton."""
    return Settings()  # type: ignore[call-arg]
