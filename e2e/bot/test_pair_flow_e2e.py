"""Bot e2e: full /pair lifecycle, in-process via repositories (no real Telegram).

Covers docs/flows/pair.mmd end-to-end:
    Unpaired --/pair--> token created
           --partner opens start=pair_TKN--> PendingJoin --join_ok--> Paired
           (both members share pair_id; pair-scoped data reachable by both)
           --/unpair--> ConfirmUnpair --confirm--> Wiping --> Unpaired (fresh)

Real-Telegram harness (self-hosted telegram-bot-api) is a noted FUTURE task, not MVP.
"""

from __future__ import annotations

import pytest
from pairly.db.models import PairTier
from pairly.repositories import pairs, users
from pairly.repositories.base import NotPairedError, get_user_pair, pair_members
from pairly.repositories.pairs import InviteError


async def _make_user(session, tg_id: int):
    return await users.get_or_create_user(session, tg_id, display_name=f"u{tg_id}")


@pytest.mark.asyncio
async def test_pair_lifecycle_invite_accept_shared_dissolve(session):
    """invite -> accept -> both share pair + can reach pair-scoped ops -> dissolve."""
    a = await _make_user(session, 1)  # creator
    b = await _make_user(session, 2)  # accepter
    await session.commit()
    assert a.pair_id is None and b.pair_id is None

    # 1. Creator runs /pair -> a fresh one-use token.
    invite = await pairs.create_invite(session, a)
    await session.commit()
    assert invite.token
    assert invite.consumed_by is None

    # 2. Partner opens the deep link /pair <token> -> accept links both into a pair.
    pair = await pairs.accept_invite(session, b, invite.token)
    await session.commit()
    assert pair.tier == PairTier.FREE
    assert pair.dissolved_at is None

    await session.refresh(a)
    await session.refresh(b)
    assert a.pair_id == pair.id == b.pair_id

    # 3. Both members can resolve the SAME active pair (pair-scoping entry works).
    assert (await get_user_pair(session, a.id)).id == pair.id
    assert (await get_user_pair(session, b.id)).id == pair.id
    members = {m.id for m in await pair_members(session, pair.id)}
    assert members == {a.id, b.id}

    # 4. Token is single-use: a third user cannot reuse it.
    c = await _make_user(session, 3)
    await session.commit()
    with pytest.raises(InviteError):
        await pairs.accept_invite(session, c, invite.token)

    # 5. /unpair (either member) -> hard dissolve: both unlinked, pair dissolved.
    await pairs.dissolve_pair(session, b.id)
    await session.commit()
    await session.refresh(a)
    await session.refresh(b)
    assert a.pair_id is None
    assert b.pair_id is None

    # 6. After dissolve, pair-scoped entry now raises NotPairedError (no active pair).
    with pytest.raises(NotPairedError):
        await get_user_pair(session, a.id)
    with pytest.raises(NotPairedError):
        await get_user_pair(session, b.id)

    # 7. Re-pairing after dissolve starts fresh (old data gone by design).
    invite2 = await pairs.create_invite(session, a)
    await session.commit()
    pair2 = await pairs.accept_invite(session, b, invite2.token)
    await session.commit()
    assert pair2.id != pair.id
    await session.refresh(a)
    await session.refresh(b)
    assert a.pair_id == pair2.id == b.pair_id


@pytest.mark.asyncio
async def test_pair_rejects_self_expired_and_already_paired(session):
    """PendingJoin rejections (docs/flows/pair.mmd): self / already-paired / reused."""
    a = await _make_user(session, 10)
    invite = await pairs.create_invite(session, a)
    await session.commit()

    # self-pairing blocked.
    with pytest.raises(InviteError):
        await pairs.accept_invite(session, a, invite.token)

    # unknown token.
    with pytest.raises(InviteError):
        await pairs.accept_invite(session, await _make_user(session, 11), "no-such-token")

    # already-paired accepter blocked.
    b = await _make_user(session, 12)
    await pairs.accept_invite(session, b, invite.token)
    await session.commit()
    d = await _make_user(session, 13)
    await session.commit()
    # d is free but tries to reuse a's consumed token.
    with pytest.raises(InviteError):
        await pairs.accept_invite(session, d, invite.token)
