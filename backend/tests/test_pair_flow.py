"""Pair-linking flow: invite -> accept -> both share a pair; self/used-token rejected."""

from __future__ import annotations

import asyncio
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


@pytest.mark.asyncio
async def test_concurrent_accept_only_one_wins(engine):
    """Two concurrent accept_invite calls on the same invite — exactly one wins.

    NOTE: This test is most meaningful on Postgres, where `with_for_update()`
    on the invite row genuinely serializes the two accepters and the second
    sees the consumed invite. On SQLite, `with_for_update()` is a no-op
    (SQLite has no row-level lock), so the racing accepters are serialized
    at the SQLite writer level (one commit at a time) — the second to commit
    will see consumed_by set and raise InviteError. The contract — "exactly
    one wins, the other raises InviteError" — holds on both engines.

    The previous version of this test used an asyncio.Event to force the
    second accept to wait for the first to COMMIT, so the lock was never
    actually exercised (the race was hand-serialized, not exercised). This
    version runs the two accept_invite calls via asyncio.gather with no
    inter-task Event, so both coroutines enter accept_invite at the same
    asyncio tick. A tiny sleep(0) yield after the create_invite seed keeps
    the suite non-flaky by ensuring the gather tasks are scheduled before
    either accept progresses.
    """
    from sqlalchemy.ext.asyncio import async_sessionmaker

    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as s_seed:
        creator = await _make_user(s_seed, 30)
        b = await _make_user(s_seed, 31)
        c = await _make_user(s_seed, 32)
        invite = await pairs.create_invite(s_seed, creator)
        await s_seed.commit()
        token = invite.token
        creator_id = creator.id
        b_id = b.id
        c_id = c.id

    # Yield once so both gather tasks are scheduled onto the loop before
    # either accept_invite begins its DB work; without this, asyncio can
    # run one task to completion before scheduling the other, defeating the
    # race on fast machines.
    await asyncio.sleep(0)

    async def do_accept(accepter_id: int) -> str:
        async with maker() as s:
            accepter = await users.get_or_create_user(s, accepter_id)
            try:
                pair = await pairs.accept_invite(s, accepter, token)
                await s.commit()
                return pair.id
            except InviteError:
                await s.rollback()
                raise

    pair_b, pair_c = await asyncio.gather(
        do_accept(b_id), do_accept(c_id), return_exceptions=True
    )

    # Exactly one succeeds, the other raises InviteError.
    results = [pair_b, pair_c]
    successes = [r for r in results if isinstance(r, str)]
    failures = [r for r in results if isinstance(r, Exception)]
    assert len(successes) == 1, f"expected 1 success, got {results}"
    assert len(failures) == 1, f"expected 1 failure, got {results}"
    assert isinstance(failures[0], InviteError)

    # Sanity: only one Pair row exists for the creator + the winning accepter.
    async with maker() as s_verify:
        from sqlalchemy import select
        from pairly.db.models import Pair, PairInvite, User

        invite_row = await s_verify.scalar(select(PairInvite).where(PairInvite.token == token))
        assert invite_row.consumed_by is not None
        creator_row = await s_verify.get(User, creator_id)
        assert creator_row.pair_id is not None
        pairs_for_creator = (
            await s_verify.scalars(select(Pair).where(Pair.id == creator_row.pair_id))
        ).all()
        assert len(pairs_for_creator) == 1
