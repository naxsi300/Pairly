"""Soft milestones — pair-scope, one-shot, no streaks.

A milestone is just a fact "this pair reached the threshold once". After the first
record for (pair_id, kind, value), repeat calls for the same triple are a no-op
(returned via `is_new=False`).

ANTI-PRESSURE INVARIANT (CLAUDE.md):
 - We do NOT count over time, do NOT show a progress bar, do NOT notify the
   partner when a milestone is reached. The Mini App shows a soft celebratory toast
   ONCE for the local user; further reaches of the same threshold are silent.

The Mini App should never display a list of "milestones you've unlocked". That
becomes a leaderboard in disguise.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pairly.db.models import PairMilestone


async def list_recent(
    session: AsyncSession, *, pair_id: str, limit: int = 50
) -> list[PairMilestone]:
    """For the home screen — just the latest few, for optional display.

    Prefer NOT calling this; the toast should fire on the same create round-trip.
    """
    result = await session.execute(
        select(PairMilestone)
        .where(PairMilestone.pair_id == pair_id)
        .order_by(PairMilestone.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


async def has_milestone(
    session: AsyncSession, *, pair_id: str, kind: str, value: int
) -> bool:
    existing = await session.scalar(
        select(PairMilestone).where(
            PairMilestone.pair_id == pair_id,
            PairMilestone.kind == kind,
            PairMilestone.value == value,
        )
    )
    return existing is not None


async def record(
    session: AsyncSession, *, pair_id: str, kind: str, value: int
) -> tuple[PairMilestone, bool]:
    """Record a milestone if not already present. Returns (ms, is_new)."""
    existing = await session.scalar(
        select(PairMilestone).where(
            PairMilestone.pair_id == pair_id,
            PairMilestone.kind == kind,
            PairMilestone.value == value,
        )
    )
    if existing is not None:
        return existing, False
    ms = PairMilestone(
        pair_id=pair_id, kind=kind, value=value, created_at=datetime.now(UTC)
    )
    session.add(ms)
    await session.flush()
    return ms, True


# Threshold values (the only "numbers" that ever appear in the product — no
# counters, no progress bars). Adjust carefully: each new threshold is a new
# soft moment; too many = gamified pressure.
WISHLIST_THRESHOLDS = (5, 10, 20)
COUNTDOWN_THRESHOLDS = (5, 10)
QOTD_THRESHOLDS = (7,)
GIFT_THRESHOLDS = (3, 10)


async def check_wishlist(
    session: AsyncSession, *, pair_id: str, count: int
) -> list[PairMilestone]:
    """Record any newly-crossed wishlist threshold. Returns the new ones (for toast)."""
    new: list[PairMilestone] = []
    for v in WISHLIST_THRESHOLDS:
        if count >= v:
            ms, is_new = await record(session, pair_id=pair_id, kind="wishlist_count", value=v)
            if is_new:
                new.append(ms)
    return new


async def check_countdown(
    session: AsyncSession, *, pair_id: str, count: int
) -> list[PairMilestone]:
    new: list[PairMilestone] = []
    for v in COUNTDOWN_THRESHOLDS:
        if count >= v:
            ms, is_new = await record(session, pair_id=pair_id, kind="countdown_count", value=v)
            if is_new:
                new.append(ms)
    return new


async def check_qotd(
    session: AsyncSession, *, pair_id: str, count: int
) -> list[PairMilestone]:
    new: list[PairMilestone] = []
    for v in QOTD_THRESHOLDS:
        if count >= v:
            ms, is_new = await record(session, pair_id=pair_id, kind="qotd_count", value=v)
            if is_new:
                new.append(ms)
    return new


async def check_gift(
    session: AsyncSession, *, pair_id: str, count: int
) -> list[PairMilestone]:
    new: list[PairMilestone] = []
    for v in GIFT_THRESHOLDS:
        if count >= v:
            ms, is_new = await record(session, pair_id=pair_id, kind="gift_count", value=v)
            if is_new:
                new.append(ms)
    return new
