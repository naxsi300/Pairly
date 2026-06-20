"""Gifts repository — pair-scoped. Free tier UNLIMITED (core relationship loop).

State machine: received → claimed → redeemed → complete (or declined / archived at
received). The "must have happened" rule: no redemption without a claimed state first.
No score/streak/leaderboard — the "good deeds" view is chronological only.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pairly.db.models import GiftItem, GiftStatus
from pairly.repositories.base import _require_membership, pair_members

# Auto-archive window for unclaimed gifts (docs/copy/gifts.md).
_UNCLAIMED_ARCHIVE_DAYS = 14


class GiftStateError(Exception):
    """Raised on an illegal state transition (e.g. redeeming an unclaimed gift)."""


async def _partner_id(session: AsyncSession, pair_id: str, user_id: str) -> str:
    await _require_membership(session, pair_id, user_id)
    members = await pair_members(session, pair_id)
    for m in members:
        if m.id != user_id:
            return m.id
    raise GiftStateError("pair has no partner")


async def create_gift(
    session: AsyncSession,
    *,
    pair_id: str,
    giver_id: str,
    gesture: str,
    description: str | None = None,
) -> GiftItem:
    """Giver sends a gift to their partner. Receiver is derived from the pair."""
    receiver_id = await _partner_id(session, pair_id, giver_id)
    gift = GiftItem(
        pair_id=pair_id,
        giver_id=giver_id,
        receiver_id=receiver_id,
        gesture=gesture,
        description=description,
        status=GiftStatus.RECEIVED,
    )
    session.add(gift)
    await session.flush()
    return gift


async def list_gifts(
    session: AsyncSession, *, pair_id: str, user_id: str
) -> list[GiftItem]:
    """Both partners see the full ledger (no hidden gifts). Chronological."""
    await _require_membership(session, pair_id, user_id)
    result = await session.execute(
        select(GiftItem)
        .where(GiftItem.pair_id == pair_id)
        .order_by(GiftItem.created_at.desc())
    )
    return list(result.scalars().all())


async def _get(session: AsyncSession, pair_id: str, gift_id: str) -> GiftItem:
    gift = await session.get(GiftItem, gift_id)
    if gift is None or gift.pair_id != pair_id:
        raise LookupError(gift_id)
    return gift


async def transition(
    session: AsyncSession,
    *,
    pair_id: str,
    user_id: str,
    gift_id: str,
    to: GiftStatus,
) -> GiftItem:
    """Apply a legal state transition. Membership- and role-enforced.

    - CLAIMED: recipient accepts (must be the receiver).
    - DECLINED: recipient declines (must be the receiver; only valid from RECEIVED).
    - REDEEMED: giver marks done (must be the giver; only valid from CLAIMED).
    - COMPLETE: either partner, only from REDEEMED.
    """
    await _require_membership(session, pair_id, user_id)
    gift = await _get(session, pair_id, gift_id)

    if to == GiftStatus.CLAIMED and gift.status == GiftStatus.RECEIVED or to == GiftStatus.DECLINED and gift.status == GiftStatus.RECEIVED or to == GiftStatus.REDEEMED and gift.status == GiftStatus.CLAIMED or to == GiftStatus.COMPLETE and gift.status == GiftStatus.REDEEMED:
        pass
    else:
        raise GiftStateError(f"illegal transition {gift.status} -> {to}")

    # Actor-role guard: CLAIM/DECLINE only the receiver, REDEEM only the giver.
    if to in (GiftStatus.CLAIMED, GiftStatus.DECLINED) and user_id != gift.receiver_id:
        raise GiftStateError(
            f"only the receiver may {to.value} a gift"
        )
    if to == GiftStatus.REDEEMED and user_id != gift.giver_id:
        raise GiftStateError("only the giver may redeem a gift")

    gift.status = to
    await session.flush()
    return gift


async def archive_stale_unclaimed(session: AsyncSession, pair_id: str) -> int:
    """Housekeeping: archive gifts unclaimed for 14 days. Returns count archived."""
    cutoff = datetime.now(UTC).timestamp() - _UNCLAIMED_ARCHIVE_DAYS * 86400
    result = await session.execute(
        select(GiftItem).where(
            GiftItem.pair_id == pair_id,
            GiftItem.status == GiftStatus.RECEIVED,
        )
    )
    archived = 0
    now = datetime.now(UTC)
    for gift in result.scalars():
        at = gift.created_at if gift.created_at.tzinfo else gift.created_at.replace(tzinfo=UTC)
        if at.timestamp() < cutoff:
            gift.status = GiftStatus.ARCHIVED
            gift.archived_at = now
            archived += 1
    if archived:
        await session.flush()
    return archived


async def count_completed(session: AsyncSession, *, pair_id: str) -> int:
    """Count gifts that went through the full lifecycle (status = complete)."""
    from sqlalchemy import func

    r = await session.scalar(
        select(func.count(GiftItem.id)).where(
            GiftItem.pair_id == pair_id,
            GiftItem.status == GiftStatus.COMPLETE,
        )
    )
    return r or 0
    return r or 0
