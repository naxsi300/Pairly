"""Pair-linking flow: invite -> accept -> both share a pair; self/used-token rejected."""

from __future__ import annotations

import pytest
from pairly.db.models import PairTier
from pairly.repositories import pairs, users
from pairly.repositories.pairs import InviteError


async def _make_user(session, tg_id: int):
    return await users.get_or_create_user(session, tg_id, display_name=f"u{tg_id}")


@pytest.mark.asyncio
async def test_invite_creates_and_accept_links_pair(session):
    creator = await _make_user(session, 1)
    accepter = await _make_user(session, 2)
    await session.commit()

    invite = await pairs.create_invite(session, creator)
    await session.commit()

    pair = await pairs.accept_invite(session, accepter, invite.token)
    await session.commit()

    assert pair.tier == PairTier.FREE
    # Refresh membership from DB.
    await session.refresh(creator)
    await session.refresh(accepter)
    assert creator.pair_id == pair.id
    assert accepter.pair_id == pair.id


@pytest.mark.asyncio
async def test_self_pairing_rejected(session):
    creator = await _make_user(session, 10)
    invite = await pairs.create_invite(session, creator)
    await session.commit()

    with pytest.raises(InviteError):
        await pairs.accept_invite(session, creator, invite.token)


@pytest.mark.asyncio
async def test_reused_token_rejected(session):
    a, b, c = [await _make_user(session, i) for i in (20, 21, 22)]
    invite = await pairs.create_invite(session, a)
    await pairs.accept_invite(session, b, invite.token)
    await session.commit()

    # Third user can't reuse the consumed token.
    with pytest.raises(InviteError):
        await pairs.accept_invite(session, c, invite.token)
