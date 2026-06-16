"""THE SECURITY TEST: a user NOT in a pair cannot read or write another pair's data.

If this test fails, the core privacy invariant (CLAUDE.md) is broken.
"""

from __future__ import annotations

import pytest
from pairly.repositories import base, pairs, users, wishlist
from pairly.repositories.base import NotPairedError, PairAccessError


async def _make_pair(session, tg_a: int, tg_b: int):
    """Helper: create two users and link them into a fresh pair."""
    a = await users.get_or_create_user(session, tg_a, display_name=f"u{tg_a}")
    b = await users.get_or_create_user(session, tg_b, display_name=f"u{tg_b}")
    invite = await pairs.create_invite(session, a)
    pair = await pairs.accept_invite(session, b, invite.token)
    await session.commit()
    return a, b, pair


@pytest.mark.asyncio
async def test_outsider_cannot_read_pair_wishlist(session):
    insider_a, insider_b, pair = await _make_pair(session, 1, 2)
    outsider = await users.get_or_create_user(session, 99, display_name="outsider")
    await session.commit()

    # Outsider is not a member -> list must raise.
    with pytest.raises(PairAccessError):
        await wishlist.list_items(session, pair_id=pair.id, user_id=outsider.id)


@pytest.mark.asyncio
async def test_outsider_cannot_write_to_pair_wishlist(session):
    insider_a, insider_b, pair = await _make_pair(session, 3, 4)
    outsider = await users.get_or_create_user(session, 98, display_name="outsider")
    await session.commit()

    # Outsider cannot create items in a pair they're not in.
    with pytest.raises(PairAccessError):
        await wishlist.create_item(
            session, pair_id=pair.id, user_id=outsider.id, title="sneaky"
        )


@pytest.mark.asyncio
async def test_member_can_access_their_own_pair(session):
    """Positive control: a real member can read/write."""
    insider_a, insider_b, pair = await _make_pair(session, 5, 6)
    await session.commit()

    item = await wishlist.create_item(
        session, pair_id=pair.id, user_id=insider_a.id, title="our dinner"
    )
    await session.commit()

    items = await wishlist.list_items(session, pair_id=pair.id, user_id=insider_b.id)
    assert len(items) == 1
    assert items[0].id == item.id


@pytest.mark.asyncio
async def test_unpaired_user_gated(session):
    """An unpaired user hitting a shared feature gets NotPairedError (the 'pair up first' gate)."""
    loner = await users.get_or_create_user(session, 7, display_name="loner")
    await session.commit()

    with pytest.raises(NotPairedError):
        await base.get_user_pair(session, loner.id)
