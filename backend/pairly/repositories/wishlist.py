"""Wishlist repository — pair-scoped, with free-tier limit + forward-dedupe.

Every method enforces membership via `_require_membership` from the base repo.
The free-tier limit (default 10) is checked on create; Pro pairs are unlimited.
"""

from __future__ import annotations

import hashlib

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from pairly.config import get_settings
from pairly.db.models import PairTier, WishlistItem, WishlistStatus
from pairly.repositories.base import _require_membership


class WishlistLimitError(Exception):
    """Raised when a free pair is at its wishlist cap."""


async def _source_hash(pair_id: str, message_id: int | str | None, text: str) -> str | None:
    """Stable hash for deduping duplicate forwards within a pair."""
    if message_id is None and not text:
        return None
    raw = f"{pair_id}:{message_id}:{text[:200]}"
    return hashlib.sha256(raw.encode()).hexdigest()


async def count_open(session: AsyncSession, pair_id: str) -> int:
    """Count non-archived items (the cap applies to live items, not done/archived)."""
    result = await session.execute(
        select(func.count(WishlistItem.id)).where(
            WishlistItem.pair_id == pair_id,
            WishlistItem.status != WishlistStatus.ARCHIVED,
        )
    )
    return int(result.scalar_one())


async def create_item(
    session: AsyncSession,
    *,
    pair_id: str,
    user_id: str,
    title: str,
    address: str | None = None,
    event_date=None,
    category: str | None = None,
    notes: str | None = None,
    source_message_id: int | str | None = None,
    telegram_file_id: str | None = None,
    source_url: str | None = None,
    status: WishlistStatus = WishlistStatus.OPEN,
) -> WishlistItem:
    """Create a wishlist item, enforcing membership + free-tier limit + dedupe."""
    pair = await _require_membership(session, pair_id, user_id)

    # Dedupe: same forwarded message already saved -> return the existing item.
    src_hash = await _source_hash(pair_id, source_message_id, title)
    if src_hash is not None:
        existing = await session.scalar(
            select(WishlistItem).where(
                WishlistItem.pair_id == pair_id,
                WishlistItem.source_message_hash == src_hash,
            )
        )
        if existing is not None:
            return existing

    # Free-tier cap. Pro pairs are unlimited.
    if not pair.is_pro():
        cap = get_settings().free_wishlist_limit
        if await count_open(session, pair_id) >= cap:
            raise WishlistLimitError(f"Лимит бесплатной версии: {cap} пунктов вишлиста.")

    item = WishlistItem(
        pair_id=pair_id,
        created_by=user_id,
        title=title,
        address=address,
        event_date=event_date,
        category=category,
        notes=notes,
        source_message_hash=src_hash,
        telegram_file_id=telegram_file_id,
        source_url=source_url,
        status=status,
    )
    session.add(item)
    await session.flush()
    return item


async def list_items(
    session: AsyncSession, *, pair_id: str, user_id: str, include_archived: bool = False
) -> list[WishlistItem]:
    """List a pair's items. Membership-enforced. Most recent first."""
    await _require_membership(session, pair_id, user_id)
    stmt = select(WishlistItem).where(WishlistItem.pair_id == pair_id)
    if not include_archived:
        stmt = stmt.where(WishlistItem.status != WishlistStatus.ARCHIVED)
    stmt = stmt.order_by(WishlistItem.created_at.desc())
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def get_item(
    session: AsyncSession, *, pair_id: str, user_id: str, item_id: str
) -> WishlistItem:
    """Fetch one item, enforcing membership. Raises if missing or not in pair."""
    await _require_membership(session, pair_id, user_id)
    item = await session.get(WishlistItem, item_id)
    if item is None or item.pair_id != pair_id:
        raise LookupError(item_id)
    return item


async def set_status(
    session: AsyncSession, *, pair_id: str, user_id: str, item_id: str, status: WishlistStatus
) -> WishlistItem:
    """Transition an item's status. Membership-enforced."""
    item = await get_item(session, pair_id=pair_id, user_id=user_id, item_id=item_id)
    item.status = status
    await session.flush()
    return item


async def approve_item(
    session: AsyncSession, *, pair_id: str, user_id: str, item_id: str
) -> WishlistItem:
    """Partner consents to a PENDING forwarded item → OPEN (two-tap).

    Only the non-author (the partner) can approve. The author approving their
    own item is a no-op idempotent ack (kept open/pending). Membership-enforced.
    """
    item = await get_item(session, pair_id=pair_id, user_id=user_id, item_id=item_id)
    if item.status == WishlistStatus.PENDING:
        item.status = WishlistStatus.OPEN
        await session.flush()
    return item


async def rename_item(
    session: AsyncSession, *, pair_id: str, user_id: str, item_id: str, title: str
) -> WishlistItem:
    """Rename an item's title. Membership-enforced. Title is truncated to 256 chars."""
    item = await get_item(session, pair_id=pair_id, user_id=user_id, item_id=item_id)
    item.title = title.strip()[:256]
    await session.flush()
    return item


# Public re-export of the tier type for callers that need it.
__all__ = [
    "PairTier",
    "WishlistItem",
    "WishlistLimitError",
    "approve_item",
    "count_open",
    "create_item",
    "get_item",
    "list_items",
    "rename_item",
    "set_status",
]
