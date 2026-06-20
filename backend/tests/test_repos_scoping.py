"""Pair-scoping enforcement across the new repositories (bucket/countdown/mood/gifts).

Same invariant as test_pair_scoping: an outsider not in a pair cannot read/write.
"""

from __future__ import annotations

import pytest
from pairly.db.models import GiftStatus
from pairly.repositories import bucket, countdowns, gifts, mood, pairs, users
from pairly.repositories.base import PairAccessError


async def _pair(session, tg_a: int, tg_b: int):
    a = await users.get_or_create_user(session, tg_a, display_name=f"u{tg_a}")
    b = await users.get_or_create_user(session, tg_b, display_name=f"u{tg_b}")
    invite = await pairs.create_invite(session, a)
    pair = await pairs.accept_invite(session, b, invite.token)
    await session.commit()
    return a, b, pair


@pytest.mark.asyncio
async def test_outsider_blocked_everywhere(session):
    a, b, pair = await _pair(session, 1, 2)
    outsider = await users.get_or_create_user(session, 99, display_name="out")
    await session.commit()

    with pytest.raises(PairAccessError):
        await bucket.create_item(session, pair_id=pair.id, user_id=outsider.id, title="x")
    with pytest.raises(PairAccessError):
        await bucket.list_items(session, pair_id=pair.id, user_id=outsider.id)
    with pytest.raises(PairAccessError):
        await countdowns.list_items(session, pair_id=pair.id, user_id=outsider.id)
    with pytest.raises(PairAccessError):
        await mood.set_mood(session, pair_id=pair.id, user_id=outsider.id, mood="ровно")
    with pytest.raises(PairAccessError):
        await gifts.create_gift(session, pair_id=pair.id, giver_id=outsider.id, gesture="x")
    with pytest.raises(PairAccessError):
        await mood.current_moods(session, pair_id=pair.id, user_id=outsider.id)


@pytest.mark.asyncio
async def test_members_can_use_features(session):
    a, b, pair = await _pair(session, 3, 4)

    # Bucket.
    await bucket.create_item(session, pair_id=pair.id, user_id=a.id, title="увидеть северное сияние")
    assert len(await bucket.list_items(session, pair_id=pair.id, user_id=b.id)) == 1

    # Mood: both set, latest-only.
    await mood.set_mood(session, pair_id=pair.id, user_id=a.id, mood="сияю")
    await mood.set_mood(session, pair_id=pair.id, user_id=b.id, mood="ровно")
    moods = await mood.current_moods(session, pair_id=pair.id, user_id=a.id)
    assert moods[a.id].mood == "сияю"
    assert moods[b.id].mood == "ровно"

    # Gifts: a sends to b, full ledger visible to both.
    gift = await gifts.create_gift(
        session, pair_id=pair.id, giver_id=a.id, gesture="Завтрак в постель"
    )
    assert gift.receiver_id == b.id
    assert gift.status == GiftStatus.RECEIVED
    ledger_a = await gifts.list_gifts(session, pair_id=pair.id, user_id=a.id)
    ledger_b = await gifts.list_gifts(session, pair_id=pair.id, user_id=b.id)
    assert len(ledger_a) == 1 and len(ledger_b) == 1


@pytest.mark.asyncio
async def test_gift_must_be_claimed_before_redeemed(session):
    a, b, pair = await _pair(session, 5, 6)
    gift = await gifts.create_gift(session, pair_id=pair.id, giver_id=a.id, gesture="Массаж")

    from pairly.repositories.gifts import GiftStateError

    # Can't redeem a fresh (received, unclaimed) gift.
    with pytest.raises(GiftStateError):
        await gifts.transition(
            session, pair_id=pair.id, user_id=a.id, gift_id=gift.id, to=GiftStatus.REDEEMED
        )

    # Claim first, then redeem.
    await gifts.transition(
        session, pair_id=pair.id, user_id=b.id, gift_id=gift.id, to=GiftStatus.CLAIMED
    )
    await gifts.transition(
        session, pair_id=pair.id, user_id=a.id, gift_id=gift.id, to=GiftStatus.REDEEMED
    )
    await gifts.transition(
        session, pair_id=pair.id, user_id=b.id, gift_id=gift.id, to=GiftStatus.COMPLETE
    )


@pytest.mark.asyncio
async def test_invalid_mood_rejected(session):
    a, b, pair = await _pair(session, 7, 8)
    with pytest.raises(mood.InvalidMoodError):
        await mood.set_mood(session, pair_id=pair.id, user_id=a.id, mood="счастлив")  # not one of the 8
