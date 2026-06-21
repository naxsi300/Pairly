"""User repository — get-or-create on first contact."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pairly.db.models import User


async def get_or_create_user(
    session: AsyncSession,
    tg_id: int,
    *,
    tg_username: str | None = None,
    display_name: str | None = None,
    timezone: str | None = None,
) -> User:
    """Return the existing user for tg_id, or create one on first contact.

    ``timezone`` is an IANA name (e.g. ``"Europe/Moscow"``). On create it is
    persisted. On update (existing user), it is refreshed only when a non-None
    value is provided and differs from the stored one — so callers can safely
    pass the per-request header value without churning the row on every contact.
    """
    user = await session.scalar(select(User).where(User.tg_id == tg_id))
    if user is not None:
        # Keep display fields fresh on each contact.
        if tg_username is not None:
            user.tg_username = tg_username
        if display_name is not None:
            user.display_name = display_name
        if timezone is not None and timezone != user.timezone:
            user.timezone = timezone
        await session.flush()
        return user

    user = User(
        tg_id=tg_id,
        tg_username=tg_username,
        display_name=display_name,
        timezone=timezone,
    )
    session.add(user)
    await session.flush()
    return user


async def resolve_user_by_tg(
    session: AsyncSession, tg_id: int
) -> User | None:
    """Look up a user by Telegram ID — no side effects, no creation."""
    return await session.scalar(select(User).where(User.tg_id == tg_id))
