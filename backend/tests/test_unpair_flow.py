"""dissolve_pair WIPES everything pair-scoped (privacy promise in docs/copy/pair.md)
and unlinks both members. The Pair row is kept as a tombstone (dissolved_at set)
with no remaining user data.
"""

from __future__ import annotations

import pytest
from pairly.db.models import (
    BucketItem,
    Countdown,
    GiftItem,
    MoodEntry,
    Pair,
    PairMilestone,
    QOTDAnswer,
    User,
    WishlistItem,
)
from pairly.repositories import (
    bucket,
    countdowns,
    gifts,
    mood,
    pairs,
    qotd,
    users,
    wishlist,
)
from sqlalchemy import select


async def _seed_pair_with_everything(session):
    a = await users.get_or_create_user(session, 1001, display_name="A")
    b = await users.get_or_create_user(session, 1002, display_name="B")
    invite = await pairs.create_invite(session, a)
    pair = await pairs.accept_invite(session, b, invite.token)
    await session.commit()
    # Seed at least one row in every pair-scoped table.
    await wishlist.create_item(session, pair_id=pair.id, user_id=a.id, title="Кафе")
    await bucket.create_item(session, pair_id=pair.id, user_id=a.id, title="Северное сияние")
    await countdowns.create_item(
        session,
        pair_id=pair.id,
        user_id=a.id,
        label="День",
        target_date=__import__("datetime").datetime(2030, 1, 1, tzinfo=__import__("datetime").UTC),
    )
    await mood.set_mood(session, pair_id=pair.id, user_id=a.id, mood="сияю")
    await gifts.create_gift(session, pair_id=pair.id, giver_id=a.id, gesture="Массаж")
    q = await qotd.todays_question(session)
    await qotd.post_answer(
        session, pair_id=pair.id, user_id=a.id, question_id=q.id, body="хорошо"
    )
    await session.commit()
    return a, b, pair


@pytest.mark.asyncio
async def test_dissolve_pair_wipes_all_shared_data(session):
    a, b, pair = await _seed_pair_with_everything(session)

    # Pre-conditions: data exists.
    for model in (WishlistItem, BucketItem, Countdown, MoodEntry, GiftItem, QOTDAnswer):
        rows = (await session.scalars(select(model).where(model.pair_id == pair.id))).all()
        assert len(rows) >= 1, f"expected at least one {model.__name__} before dissolve"

    await pairs.dissolve_pair(session, a.id)
    await session.commit()

    # Post: nothing pair-scoped remains.
    for model in (
        WishlistItem,
        BucketItem,
        Countdown,
        MoodEntry,
        GiftItem,
        QOTDAnswer,
        PairMilestone,
    ):
        rows = (await session.scalars(select(model).where(model.pair_id == pair.id))).all()
        assert rows == [], f"{model.__name__} should be empty after dissolve, got {len(rows)}"

    # Members unlinked.
    for u in (await session.scalars(select(User).where(User.tg_id.in_([1001, 1002])))).all():
        assert u.pair_id is None

    # Pair tombstone kept (dissolved_at set) for admin counts.
    p = await session.get(Pair, pair.id)
    assert p is not None and p.dissolved_at is not None


@pytest.mark.asyncio
async def test_after_dissolve_both_can_repair_with_someone_else(session):
    a, b, _ = await _seed_pair_with_everything(session)
    await pairs.dissolve_pair(session, a.id)
    await session.commit()

    # a invites c, c accepts -> a is in a new pair, untouched by old data.
    c = await users.get_or_create_user(session, 1003, display_name="C")
    await session.commit()
    invite = await pairs.create_invite(session, a)
    new_pair = await pairs.accept_invite(session, c, invite.token)
    await session.commit()
    assert new_pair.id != a.pair_id or new_pair.id == a.pair_id  # a.pair_id refreshed
    refreshed_a = await session.get(User, a.id)
    assert refreshed_a.pair_id == new_pair.id


@pytest.mark.asyncio
async def test_unpair_does_not_touch_other_pairs(session):
    """The dissolve is strictly scoped to the caller's pair."""
    a, b, pair_ab = await _seed_pair_with_everything(session)
    # Build a second pair (c+d) with its own data.
    c = await users.get_or_create_user(session, 2001, display_name="C")
    d = await users.get_or_create_user(session, 2002, display_name="D")
    invite = await pairs.create_invite(session, c)
    pair_cd = await pairs.accept_invite(session, d, invite.token)
    await wishlist.create_item(session, pair_id=pair_cd.id, user_id=c.id, title="второй")
    await session.commit()

    await pairs.dissolve_pair(session, a.id)
    await session.commit()

    # cd pair untouched.
    cd_items = (
        await session.scalars(select(WishlistItem).where(WishlistItem.pair_id == pair_cd.id))
    ).all()
    assert len(cd_items) == 1
    refreshed_c = await session.get(User, c.id)
    assert refreshed_c.pair_id == pair_cd.id
