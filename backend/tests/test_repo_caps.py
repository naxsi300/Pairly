"""Free-tier cap enforcement for bucket (5) and countdowns (10) repos.

The conftest fixture leaves bucket/countdown caps at production defaults
(5/10). The fix locks the parent Pair row before re-counting so concurrent
creates cannot both bypass the cap.
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from pairly.config import get_settings
from pairly.db.models import PairTier
from pairly.repositories import bucket, countdowns, pairs, users
from pairly.repositories.bucket import BucketLimitError
from pairly.repositories.countdowns import CountdownLimitError


async def _pair(session, tg_a: int, tg_b: int, *, pro: bool = False):
    a = await users.get_or_create_user(session, tg_a, display_name=f"u{tg_a}")
    b = await users.get_or_create_user(session, tg_b, display_name=f"u{tg_b}")
    invite = await pairs.create_invite(session, a)
    pair = await pairs.accept_invite(session, b, invite.token)
    if pro:
        pair.tier = PairTier.PRO
    await session.commit()
    return a, b, pair


def _future(idx: int) -> datetime:
    return datetime(2030, 1, 1, tzinfo=timezone.utc).replace(day=1 + (idx % 28))


@pytest.mark.asyncio
async def test_free_pair_hits_bucket_limit_at_cap(session):
    a, _b, pair = await _pair(session, 101, 102)
    cap = get_settings().free_bucket_limit
    for i in range(cap):
        await bucket.create_item(session, pair_id=pair.id, user_id=a.id, title=f"item {i}")
    await session.commit()

    with pytest.raises(BucketLimitError):
        await bucket.create_item(session, pair_id=pair.id, user_id=a.id, title="one too many")


@pytest.mark.asyncio
async def test_pro_pair_bucket_unlimited(session):
    a, _b, pair = await _pair(session, 103, 104, pro=True)
    cap = get_settings().free_bucket_limit
    for i in range(cap + 3):
        await bucket.create_item(session, pair_id=pair.id, user_id=a.id, title=f"item {i}")
    await session.commit()
    items = await bucket.list_items(session, pair_id=pair.id, user_id=a.id)
    assert len(items) == cap + 3


@pytest.mark.asyncio
async def test_free_pair_hits_countdown_limit_at_cap(session):
    a, _b, pair = await _pair(session, 201, 202)
    cap = get_settings().free_countdown_limit
    for i in range(cap):
        await countdowns.create_item(
            session,
            pair_id=pair.id,
            user_id=a.id,
            label=f"event {i}",
            target_date=_future(i),
        )
    await session.commit()

    with pytest.raises(CountdownLimitError):
        await countdowns.create_item(
            session,
            pair_id=pair.id,
            user_id=a.id,
            label="one too many",
            target_date=_future(99),
        )


@pytest.mark.asyncio
async def test_pro_pair_countdown_unlimited(session):
    a, _b, pair = await _pair(session, 203, 204, pro=True)
    cap = get_settings().free_countdown_limit
    for i in range(cap + 3):
        await countdowns.create_item(
            session,
            pair_id=pair.id,
            user_id=a.id,
            label=f"event {i}",
            target_date=_future(i),
        )
    await session.commit()
    items = await countdowns.list_items(session, pair_id=pair.id, user_id=a.id)
    assert len(items) == cap + 3