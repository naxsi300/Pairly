"""Bucket-list repository — pair-scoped, with free-tier limit (5).

States: dreaming → planning → done. No date by design (open-ended dreams).
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from pairly.config import get_settings
from pairly.db.models import BucketItem, BucketStatus, Pair
from pairly.repositories.base import _require_membership


class BucketLimitError(Exception):
    """Raised when a free pair is at its bucket cap."""


async def count_items(session: AsyncSession, pair_id: str) -> int:
    result = await session.execute(
        select(func.count(BucketItem.id)).where(BucketItem.pair_id == pair_id)
    )
    return int(result.scalar_one())


async def create_item(
    session: AsyncSession,
    *,
    pair_id: str,
    user_id: str,
    title: str,
    note: str | None = None,
    category: str | None = None,
) -> BucketItem:
    pair = await _require_membership(session, pair_id, user_id)
    if not pair.is_pro():
        # Lock the parent Pair row to close the TOCTOU window between
        # count_items and the eventual INSERT under concurrent traffic.
        # A no-op on SQLite; serializes on Postgres.
        await session.execute(
            select(Pair).where(Pair.id == pair_id).with_for_update()
        )
        cap = get_settings().free_bucket_limit
        if await count_items(session, pair_id) >= cap:
            raise BucketLimitError(f"Лимит бесплатной версии: {cap} пунктов списка мечт.")
    item = BucketItem(
        pair_id=pair_id,
        created_by=user_id,
        title=title,
        note=note,
        category=category,
    )
    session.add(item)
    await session.flush()
    return item


async def list_items(
    session: AsyncSession, *, pair_id: str, user_id: str
) -> list[BucketItem]:
    await _require_membership(session, pair_id, user_id)
    result = await session.execute(
        select(BucketItem)
        .where(BucketItem.pair_id == pair_id)
        .order_by(BucketItem.created_at.desc())
    )
    return list(result.scalars().all())


async def set_status(
    session: AsyncSession, *, pair_id: str, user_id: str, item_id: str, status: BucketStatus
) -> BucketItem:
    await _require_membership(session, pair_id, user_id)
    item = await session.get(BucketItem, item_id)
    if item is None or item.pair_id != pair_id:
        raise LookupError(item_id)
    item.status = status
    await session.flush()
    return item


async def delete_item(
    session: AsyncSession, *, pair_id: str, user_id: str, item_id: str
) -> None:
    await _require_membership(session, pair_id, user_id)
    item = await session.get(BucketItem, item_id)
    if item is None or item.pair_id != pair_id:
        raise LookupError(item_id)
    await session.delete(item)
    await session.flush()
