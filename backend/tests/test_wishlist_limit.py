"""Free-tier wishlist limit enforcement (cap set to 3 in conftest)."""

from __future__ import annotations

import pytest
from pairly.db.models import PairTier
from pairly.repositories import pairs, users, wishlist
from pairly.repositories.wishlist import WishlistLimitError


async def _pair(session, tg_a: int, tg_b: int, *, pro: bool = False):
    a = await users.get_or_create_user(session, tg_a, display_name=f"u{tg_a}")
    b = await users.get_or_create_user(session, tg_b, display_name=f"u{tg_b}")
    invite = await pairs.create_invite(session, a)
    pair = await pairs.accept_invite(session, b, invite.token)
    if pro:
        pair.tier = PairTier.PRO
    await session.commit()
    return a, b, pair


@pytest.mark.asyncio
async def test_free_pair_hits_limit_at_cap(session):
    a, b, pair = await _pair(session, 1, 2)
    # cap = 3 (conftest)
    for i in range(3):
        await wishlist.create_item(session, pair_id=pair.id, user_id=a.id, title=f"item {i}")
    await session.commit()

    with pytest.raises(WishlistLimitError):
        await wishlist.create_item(session, pair_id=pair.id, user_id=a.id, title="one too many")


@pytest.mark.asyncio
async def test_pro_pair_unlimited(session):
    a, b, pair = await _pair(session, 3, 4, pro=True)
    for i in range(6):  # over the free cap
        await wishlist.create_item(session, pair_id=pair.id, user_id=a.id, title=f"item {i}")
    await session.commit()

    items = await wishlist.list_items(session, pair_id=pair.id, user_id=a.id)
    assert len(items) == 6


@pytest.mark.asyncio
async def test_manual_create_same_title_does_not_dedupe(session):
    """Two create_item calls without source_message_id must BOTH persist.

    Dedupe only applies to real forwards (message_id present). Manual /
    Mini-App creates share the same title prefix but must not collide.
    """
    a, _b, pair = await _pair(session, 5, 6)
    shared_title = "Ужин при свечах"  # both calls use the same title, no source_message_id
    first = await wishlist.create_item(
        session, pair_id=pair.id, user_id=a.id, title=shared_title
    )
    second = await wishlist.create_item(
        session, pair_id=pair.id, user_id=a.id, title=shared_title
    )
    await session.commit()
    # Both rows persisted, different ids.
    assert first.id != second.id
    items = await wishlist.list_items(session, pair_id=pair.id, user_id=a.id)
    assert len(items) == 2
