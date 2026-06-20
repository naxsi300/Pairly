"""Two-tap wishlist consent: pending → open on partner approval."""

from __future__ import annotations

import pytest

from pairly.db.models import WishlistStatus
from pairly.repositories import pairs, users, wishlist


async def _pair(session):
    a = await users.get_or_create_user(session, 9001, display_name="a")
    b = await users.get_or_create_user(session, 9002, display_name="b")
    invite = await pairs.create_invite(session, a)
    pair = await pairs.accept_invite(session, b, invite.token)
    await session.commit()
    return a, b, pair


@pytest.mark.asyncio
async def test_forward_creates_pending(session):
    a, _b, pair = await _pair(session)
    item = await wishlist.create_item(
        session, pair_id=pair.id, user_id=a.id, title="Пицца", status=WishlistStatus.PENDING
    )
    await session.commit()
    assert item.status == WishlistStatus.PENDING


@pytest.mark.asyncio
async def test_partner_approval_opens_item(session):
    a, b, pair = await _pair(session)
    item = await wishlist.create_item(
        session, pair_id=pair.id, user_id=a.id, title="Пицца", status=WishlistStatus.PENDING
    )
    await session.commit()
    approved = await wishlist.approve_item(
        session, pair_id=pair.id, user_id=b.id, item_id=item.id
    )
    await session.commit()
    assert approved.status == WishlistStatus.OPEN


@pytest.mark.asyncio
async def test_approve_is_idempotent(session):
    a, b, pair = await _pair(session)
    item = await wishlist.create_item(
        session, pair_id=pair.id, user_id=a.id, title="Пицца", status=WishlistStatus.PENDING
    )
    await session.commit()
    await wishlist.approve_item(session, pair_id=pair.id, user_id=b.id, item_id=item.id)
    again = await wishlist.approve_item(session, pair_id=pair.id, user_id=b.id, item_id=item.id)
    await session.commit()
    assert again.status == WishlistStatus.OPEN  # stays open, no error
