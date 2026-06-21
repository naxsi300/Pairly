"""Cluster 6 — user.timezone plumbing.

Bug: ``auth.user.timezone`` was always None because:
  - ``resolve_init_data`` never read a timezone
  - ``get_or_create_user`` had no timezone param

Fix:
  - ``current_auth`` reads the ``X-Client-Timezone`` header, validates it loosely
    (ZoneInfo(header) in try/except -> None on failure), and threads it into
    ``get_or_create_user`` so:
      * new users: persisted
      * existing users: refreshed on change, in-memory set even if unchanged so
        ``auth.user.timezone`` is always populated for the current request
  - ``get_or_create_user`` accepts ``timezone: str | None = None`` and persists
    it on create / refreshes on change for existing rows
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from urllib.parse import urlencode

import pytest
from pairly.auth import resolve_init_data
from pairly.db.models import User
from pairly.repositories import users as users_repo
from sqlalchemy import select

BOT_TOKEN = "tz-test-bot-token"


def _make_init_data(bot_token: str, *, user_id: int, auth_date: int | None = None) -> str:
    auth_date = auth_date if auth_date is not None else int(time.time())
    user = json.dumps(
        {"id": user_id, "username": "alice", "first_name": "Alice"},
        separators=(",", ":"),
    )
    params = {"user": user, "auth_date": str(auth_date), "query_id": "AAH123"}
    pairs = sorted((k, v) for k, v in params.items() if k != "hash")
    check_string = "\n".join(f"{k}={v}" for k, v in pairs)
    secret = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    params["hash"] = hmac.new(secret, check_string.encode(), hashlib.sha256).hexdigest()
    return urlencode(params)


@pytest.mark.asyncio
async def test_get_or_create_user_persists_timezone_on_create(session):
    """Cluster 6 (b): new users get their timezone persisted at first contact."""
    user = await users_repo.get_or_create_user(
        session, 777, display_name="TZA", timezone="Europe/Moscow"
    )
    await session.commit()
    assert user.timezone == "Europe/Moscow"

    # Read it back from the DB — persistence, not just in-memory.
    fetched = await session.scalar(select(User).where(User.tg_id == 777))
    assert fetched is not None
    assert fetched.timezone == "Europe/Moscow"


@pytest.mark.asyncio
async def test_get_or_create_user_refreshes_timezone_on_change(session):
    """Cluster 6 (b): existing user — update when the new tz differs."""
    user = await users_repo.get_or_create_user(
        session, 888, display_name="TZB", timezone="Europe/Moscow"
    )
    await session.commit()
    assert user.timezone == "Europe/Moscow"

    refreshed = await users_repo.get_or_create_user(
        session, 888, display_name="TZB", timezone="Asia/Tokyo"
    )
    await session.commit()
    assert refreshed.timezone == "Asia/Tokyo"


@pytest.mark.asyncio
async def test_get_or_create_user_none_timezone_keeps_existing(session):
    """Cluster 6 (b): passing timezone=None on update must NOT clobber a stored value."""
    user = await users_repo.get_or_create_user(
        session, 999, display_name="TZC", timezone="Europe/Moscow"
    )
    await session.commit()
    assert user.timezone == "Europe/Moscow"

    refreshed = await users_repo.get_or_create_user(
        session, 999, display_name="TZC", timezone=None
    )
    await session.commit()
    assert refreshed.timezone == "Europe/Moscow"


@pytest.mark.asyncio
async def test_resolve_init_data_picks_up_timezone_header(monkeypatch, session):
    """Cluster 6 (a)+(c): resolve_init_data reads X-Client-Timezone and populates
    auth.user.timezone for both new and existing users."""
    monkeypatch.setattr("pairly.auth.telegram.get_settings", lambda: _Settings(BOT_TOKEN))
    init = _make_init_data(BOT_TOKEN, user_id=4242)

    ctx = await resolve_init_data(init, session, timezone="Europe/Moscow")
    assert ctx.user.timezone == "Europe/Moscow"

    # Second contact — existing user, header still drives the value.
    ctx2 = await resolve_init_data(init, session, timezone="Europe/Moscow")
    assert ctx2.user.timezone == "Europe/Moscow"


@pytest.mark.asyncio
async def test_resolve_init_data_garbage_timezone_falls_back_to_none(monkeypatch, session):
    """Cluster 6 (a): a bad header must NOT raise — falls back to None (no crash)."""
    monkeypatch.setattr("pairly.auth.telegram.get_settings", lambda: _Settings(BOT_TOKEN))
    init = _make_init_data(BOT_TOKEN, user_id=5151)

    ctx = await resolve_init_data(init, session, timezone="Not/A_Real_Zone_!!")
    assert ctx.user.timezone is None


@pytest.mark.asyncio
async def test_resolve_init_data_absent_header_is_none(monkeypatch, session):
    """Cluster 6 (c): no header -> user.timezone stays None (backward compatible)."""
    monkeypatch.setattr("pairly.auth.telegram.get_settings", lambda: _Settings(BOT_TOKEN))
    init = _make_init_data(BOT_TOKEN, user_id=6262)

    ctx = await resolve_init_data(init, session, timezone=None)
    assert ctx.user.timezone is None


@pytest.mark.asyncio
async def test_resolve_init_data_changes_tz_without_db_write_on_match(
    monkeypatch, session
):
    """Cluster 6 (c): if the in-memory value already matches, the header does not
    force a redundant DB write per request. The returned object reflects it."""
    monkeypatch.setattr("pairly.auth.telegram.get_settings", lambda: _Settings(BOT_TOKEN))
    init = _make_init_data(BOT_TOKEN, user_id=7373)

    ctx = await resolve_init_data(init, session, timezone="Europe/Moscow")
    assert ctx.user.timezone == "Europe/Moscow"

    # Second request with the same tz — still populated, no error.
    ctx2 = await resolve_init_data(init, session, timezone="Europe/Moscow")
    assert ctx2.user.timezone == "Europe/Moscow"


# --- helpers ---------------------------------------------------------------


class _Settings:
    def __init__(self, bot_token: str):
        self.bot_token = bot_token
        self.dev_auth = False
