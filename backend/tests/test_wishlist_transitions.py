"""Wishlist state-machine guards (set_status).

Only legal transitions are allowed. PENDING → DONE (skips partner consent) is
rejected. ARCHIVED is terminal.
"""

from __future__ import annotations

import pytest

from pairly.db.models import WishlistStatus
from pairly.repositories import pairs, users, wishlist
from pairly.repositories.wishlist import WishlistStateError


async def _pair(session):
    a = await users.get_or_create_user(session, 9101, display_name="a")
    b = await users.get_or_create_user(session, 9102, display_name="b")
    invite = await pairs.create_invite(session, a)
    pair = await pairs.accept_invite(session, b, invite.token)
    await session.commit()
    return a, b, pair


async def _create(session, pair, user, *, status=WishlistStatus.OPEN):
    item = await wishlist.create_item(
        session, pair_id=pair.id, user_id=user.id, title="x", status=status
    )
    await session.commit()
    return item


@pytest.mark.asyncio
async def test_pending_to_done_rejected(session):
    """PENDING → DONE would skip partner consent (two-tap). Must raise."""
    a, _b, pair = await _pair(session)
    item = await _create(session, pair, a, status=WishlistStatus.PENDING)
    with pytest.raises(WishlistStateError):
        await wishlist.set_status(
            session, pair_id=pair.id, user_id=a.id, item_id=item.id,
            status=WishlistStatus.DONE,
        )


@pytest.mark.asyncio
async def test_done_to_open_rejected(session):
    """Once DONE, you can only ARCHIVE. Going back to OPEN is illegal."""
    a, _b, pair = await _pair(session)
    item = await _create(session, pair, a, status=WishlistStatus.DONE)
    with pytest.raises(WishlistStateError):
        await wishlist.set_status(
            session, pair_id=pair.id, user_id=a.id, item_id=item.id,
            status=WishlistStatus.OPEN,
        )


@pytest.mark.asyncio
async def test_archived_to_open_rejected(session):
    """ARCHIVED is terminal — cannot be reopened."""
    a, _b, pair = await _pair(session)
    item = await _create(session, pair, a, status=WishlistStatus.ARCHIVED)
    with pytest.raises(WishlistStateError):
        await wishlist.set_status(
            session, pair_id=pair.id, user_id=a.id, item_id=item.id,
            status=WishlistStatus.OPEN,
        )


@pytest.mark.asyncio
async def test_open_to_planned_accepted(session):
    a, _b, pair = await _pair(session)
    item = await _create(session, pair, a, status=WishlistStatus.OPEN)
    out = await wishlist.set_status(
        session, pair_id=pair.id, user_id=a.id, item_id=item.id,
        status=WishlistStatus.PLANNED,
    )
    await session.commit()
    assert out.status == WishlistStatus.PLANNED


@pytest.mark.asyncio
async def test_open_to_done_accepted(session):
    a, _b, pair = await _pair(session)
    item = await _create(session, pair, a, status=WishlistStatus.OPEN)
    out = await wishlist.set_status(
        session, pair_id=pair.id, user_id=a.id, item_id=item.id,
        status=WishlistStatus.DONE,
    )
    await session.commit()
    assert out.status == WishlistStatus.DONE
