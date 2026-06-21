"""Telegram WebApp initData validation.

The Mini App client sends `X-Telegram-Init-Data` (raw query-string) on every request.
We validate it per the official algorithm:

  1. Parse the query string.
  2. Check that `hash` is present and matches the others.
  3. Build a check_string: key=value pairs sorted by key, joined with "\\n", excluding hash.
  4. secret_key = HMAC-SHA256(key=b"WebAppData", data=BOT_TOKEN)
  5. Recomputed hash must equal the provided `hash` (constant-time compare).
  6. auth_date must be within max_age (default 24h) — replay protection.

On success: extract the `user` JSON field (contains tg_id, username, etc.) and
return the User row, creating it on first contact.

The Mini App also sends an optional ``X-Client-Timezone`` header (an IANA name
like ``Europe/Moscow``) so per-user time-of-day scheduling (QOTD at 12:00 local,
date-wheel smart-mode prompt) honors the caller's local clock. The header is
validated loosely (ZoneInfo in a try/except); a bad value falls back to None
and never crashes auth.

Dev mode: PAIRLY_DEV_AUTH=1 skips validation. Use ONLY for local dev and tests — never
set this in production. The client must still send the dev headers in dev mode.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from pairly.config import get_settings
from pairly.db.base import get_session
from pairly.db.models import User
from pairly.repositories import users as users_repo

DEFAULT_MAX_AGE_SECONDS = 24 * 3600


@dataclass(slots=True)
class AuthContext:
    """Resolved identity from the request."""

    user: User
    raw_user: dict
    dev_mode: bool


def _calc_secret(bot_token: str) -> bytes:
    """secret_key = HMAC-SHA256(key=b"WebAppData", data=BOT_TOKEN)."""
    return hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()


def _check_string(parsed: dict[str, str]) -> str:
    """Sort key=value pairs (excluding hash), join with \\n."""
    parts = []
    for k in sorted(parsed):
        if k == "hash":
            continue
        parts.append(f"{k}={parsed[k]}")
    return "\n".join(parts)


def _coerce_timezone(raw: str | None) -> str | None:
    """Parse the X-Client-Timezone header into a valid IANA name, or None.

    Loose validation: a bad / unknown zone returns None rather than raising —
    auth must never crash on a malformed header. Empty / whitespace strings
    also collapse to None.
    """
    if not raw:
        return None
    candidate = raw.strip()
    if not candidate:
        return None
    try:
        ZoneInfo(candidate)
    except ZoneInfoNotFoundError:
        return None
    return candidate


def validate_init_data(
    init_data: str, *, bot_token: str, max_age: int = DEFAULT_MAX_AGE_SECONDS
) -> dict:
    """Validate init_data and return the parsed fields dict (string->str|dict)."""
    if not init_data:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="missing initData")
    # parse_qs to allow parsing duplicates robustly
    from urllib.parse import parse_qs

    parsed_list = parse_qs(init_data, keep_blank_values=True)
    parsed: dict[str, str] = {k: v[0] for k, v in parsed_list.items()}

    received_hash = parsed.pop("hash", None)
    if not received_hash:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="missing hash")

    # Replay guard.
    auth_date_str = parsed.get("auth_date")
    if not auth_date_str:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="missing auth_date")
    try:
        auth_date = int(auth_date_str)
    except ValueError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="bad auth_date") from exc
    if abs(int(time.time()) - auth_date) > max_age:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="auth_date too old")

    # HMAC check.
    secret = _calc_secret(bot_token)
    computed = hmac.new(secret, _check_string(parsed).encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(computed, received_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="bad signature")

    # The user JSON is a string in parse_qs.
    if "user" in parsed:
        try:
            parsed["user"] = json.loads(parsed["user"])
        except json.JSONDecodeError as exc:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="bad user json") from exc
    return parsed


def _telegram_name(u: dict) -> str | None:
    first = (u.get("first_name") or "").strip()
    last = (u.get("last_name") or "").strip()
    full = f"{first} {last}".strip()
    return full or u.get("username") or None


async def resolve_init_data(
    init_data: str,
    session: AsyncSession,
    *,
    dev_user_id: str = "",
    timezone: str | None = None,
) -> AuthContext:
    """Resolve AuthContext. Dev mode (PAIRLY_DEV_AUTH=1) trusts dev_user_id instead.

    ``timezone`` is the value of the ``X-Client-Timezone`` header (already
    loosely validated via :func:`_coerce_timezone`). On new users it is
    persisted; on existing users it is refreshed when it differs, and always
    exposed on ``ctx.user.timezone`` so date_idea / QOTD scheduling can read
    it without an extra DB round-trip.
    """
    tz = _coerce_timezone(timezone)

    settings = get_settings()
    if settings.dev_auth:
        if not dev_user_id:
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED,
                detail="dev auth: provide X-Dev-User-Id",
            )
        user = await session.get(User, dev_user_id)
        if user is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="dev auth: unknown user")
        # Reflect the current request's timezone on the returned object even
        # in dev mode — keeps behavior symmetric with the prod path.
        if tz is not None and tz != user.timezone:
            user.timezone = tz
            await session.flush()
        return AuthContext(user=user, raw_user={}, dev_mode=True)

    if not settings.bot_token:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail="BOT_TOKEN not set")
    parsed = validate_init_data(init_data, bot_token=settings.bot_token)
    raw_user = parsed.get("user") or {}
    if "id" not in raw_user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="missing user in initData")
    tg_id = int(raw_user["id"])
    user = await users_repo.get_or_create_user(
        session,
        tg_id,
        tg_username=raw_user.get("username"),
        display_name=_telegram_name(raw_user),
        timezone=tz,
    )
    # Mirror the header value on the in-memory object so downstream code
    # (date_idea, QOTD) sees the freshest tz without a re-read. Only when the
    # header disagrees with the stored value AND the header is None: leave
    # the stored value alone (it may already be correct from a previous
    # contact).
    if tz is None and user.timezone is None:
        pass  # both None — nothing to do
    elif tz is not None and tz != user.timezone:
        user.timezone = tz
        await session.flush()
    return AuthContext(user=user, raw_user=raw_user, dev_mode=False)


async def current_auth(
    session: AsyncSession = Depends(get_session),
    x_telegram_init_data: str = Header("", alias="X-Telegram-Init-Data"),
    x_dev_user_id: str = Header("", alias="X-Dev-User-Id"),
    x_client_timezone: str | None = Header(None, alias="X-Client-Timezone"),
) -> AuthContext:
    """FastAPI dependency: returns AuthContext for the current request.

    Reads ``X-Client-Timezone`` (optional, IANA name) so per-user time-of-day
    scheduling honors the caller's local clock. A bad value is silently
    dropped — see :func:`resolve_init_data`.
    """
    return await resolve_init_data(
        x_telegram_init_data,
        session,
        dev_user_id=x_dev_user_id,
        timezone=x_client_timezone,
    )