"""Countdowns repository — pair-scoped, with free-tier limit (10).

A target date is a resolved instant (store the datetime, not a floating date) so the
"today" boundary is unambiguous across time zones. Recurrence ('annual'/'monthly') is
interpreted at READ time by the Mini App (it rolls forward to the next occurrence once
the stored date passes); the row itself is never mutated, so the original date survives.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from pairly.config import get_settings
from pairly.db.models import Countdown
from pairly.repositories.base import _require_membership


class CountdownLimitError(Exception):
    """Raised when a free pair is at its countdown cap."""


async def count_items(session: AsyncSession, pair_id: str) -> int:
    result = await session.execute(
        select(func.count(Countdown.id)).where(Countdown.pair_id == pair_id)
    )
    return int(result.scalar_one())


async def create_item(
    session: AsyncSession,
    *,
    pair_id: str,
    user_id: str,
    label: str,
    target_date: datetime,
    emoji: str | None = None,
    recurrence: str | None = None,
) -> Countdown:
    pair = await _require_membership(session, pair_id, user_id)
    if not pair.is_pro():
        cap = get_settings().free_countdown_limit
        if await count_items(session, pair_id) >= cap:
            raise CountdownLimitError(f"Лимит бесплатной версии: {cap} отсчётов.")
    item = Countdown(
        pair_id=pair_id,
        created_by=user_id,
        label=label,
        emoji=emoji,
        target_date=target_date,
        recurrence=recurrence,
    )
    session.add(item)
    await session.flush()
    return item


async def list_items(
    session: AsyncSession, *, pair_id: str, user_id: str
) -> list[Countdown]:
    await _require_membership(session, pair_id, user_id)
    result = await session.execute(
        select(Countdown)
        .where(Countdown.pair_id == pair_id)
        .order_by(Countdown.target_date.asc())
    )
    return list(result.scalars().all())


async def delete_item(
    session: AsyncSession, *, pair_id: str, user_id: str, item_id: str
) -> None:
    await _require_membership(session, pair_id, user_id)
    item = await session.get(Countdown, item_id)
    if item is None or item.pair_id != pair_id:
        raise LookupError(item_id)
    await session.delete(item)
    await session.flush()


async def update_item(
    session: AsyncSession,
    *,
    pair_id: str,
    user_id: str,
    item_id: str,
    fields: dict,
) -> Countdown:
    """Apply a partial update. `fields` keys are python column names (label,
    target_date, emoji, recurrence); only provided keys are written, so a key
    explicitly passed as None clears it (e.g. recurrence → one-shot)."""
    await _require_membership(session, pair_id, user_id)
    item = await session.get(Countdown, item_id)
    if item is None or item.pair_id != pair_id:
        raise LookupError(item_id)
    for key in ("label", "target_date", "emoji", "recurrence"):
        if key in fields:
            setattr(item, key, fields[key])
    await session.flush()
    return item
