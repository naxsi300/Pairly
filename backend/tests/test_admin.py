"""Admin repository — grant/revoke Pro + audit log.

Run with PAIRLY_ADMIN_TG_IDS set in env (or via tests/conftest fixture patching it).
"""

from __future__ import annotations

import pytest
from pairly.db.models import PairTier
from pairly.repositories import admin as admin_repo
from pairly.repositories import pairs, users
from pairly.repositories.admin import AdminError


async def _make_pair(session, tg_a: int, tg_b: int):
    a = await users.get_or_create_user(session, tg_a, display_name=f"u{tg_a}")
    b = await users.get_or_create_user(session, tg_b, display_name=f"u{tg_b}")
    invite = await pairs.create_invite(session, a)
    pair = await pairs.accept_invite(session, b, invite.token)
    await session.commit()
    return a, b, pair


@pytest.mark.asyncio
async def test_resolve_pair_by_tg_id(session):
    a, b, pair = await _make_pair(session, 1, 2)
    resolved = await admin_repo.resolve_pair_by_tg_id(session, a.tg_id)
    assert resolved is not None
    user, got_pair = resolved
    assert got_pair.id == pair.id
    assert user.id == a.id


@pytest.mark.asyncio
async def test_resolve_pair_no_user(session):
    resolved = await admin_repo.resolve_pair_by_tg_id(session, 99999)
    assert resolved is None


@pytest.mark.asyncio
async def test_grant_pro(session):
    a, b, pair = await _make_pair(session, 10, 11)
    assert pair.tier == PairTier.FREE
    updated = await admin_repo.grant_pro(
        session, actor_tg_id=42, target_pair_id=pair.id, note="manual comp"
    )
    await session.commit()
    assert updated.tier == PairTier.PRO

    audit = await admin_repo.recent_audit(session, limit=10)
    assert len(audit) == 1
    assert audit[0].action == "grant_pro"
    assert audit[0].actor_tg_id == 42
    assert audit[0].target_pair_id == pair.id
    assert "manual comp" in (audit[0].detail or "")


@pytest.mark.asyncio
async def test_grant_pro_idempotent_guard(session):
    a, b, pair = await _make_pair(session, 20, 21)
    await admin_repo.grant_pro(session, actor_tg_id=42, target_pair_id=pair.id)
    await session.commit()
    with pytest.raises(AdminError, match="already Pro"):
        await admin_repo.grant_pro(session, actor_tg_id=42, target_pair_id=pair.id)


@pytest.mark.asyncio
async def test_revoke_pro(session):
    a, b, pair = await _make_pair(session, 30, 31)
    await admin_repo.grant_pro(session, actor_tg_id=42, target_pair_id=pair.id)
    await session.commit()
    updated = await admin_repo.revoke_pro(
        session, actor_tg_id=42, target_pair_id=pair.id
    )
    await session.commit()
    assert updated.tier == PairTier.FREE

    audit = await admin_repo.recent_audit(session, limit=10)
    assert len(audit) == 2
    assert audit[0].action == "revoke_pro"  # most recent first


@pytest.mark.asyncio
async def test_revoke_pro_requires_pro(session):
    a, b, pair = await _make_pair(session, 40, 41)
    with pytest.raises(AdminError, match="not Pro"):
        await admin_repo.revoke_pro(session, actor_tg_id=42, target_pair_id=pair.id)


@pytest.mark.asyncio
async def test_list_pairs_and_counts(session):
    _ = await _make_pair(session, 50, 51)
    a2, b2, p2 = await _make_pair(session, 52, 53)
    await admin_repo.grant_pro(session, actor_tg_id=42, target_pair_id=p2.id)
    await session.commit()

    pairs = await admin_repo.list_pairs(session, limit=10)
    assert len(pairs) == 2
    # Most recent first.
    assert pairs[0][0].id == p2.id
    assert pairs[0][0].tier == PairTier.PRO
    counts = await admin_repo.pair_counts(session)
    assert counts["total"] >= 2
    assert counts["pro"] >= 1
    assert counts["free"] >= 1
