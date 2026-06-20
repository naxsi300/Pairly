"""Gifts repository: actor-role guard on transition().

Bug: transition() previously enforced membership + legal source/target edges but never
checked who the caller was. The giver could CLAIM their own gift (and self-complete),
inflating count_completed. Contract:

- CLAIMED / DECLINED require the RECEIVER (gift.receiver_id == user_id).
- REDEEMED requires the GIVER (gift.giver_id == user_id).
- COMPLETE is allowed from either partner (no role restriction).
"""

from __future__ import annotations

import pytest
from pairly.db.models import GiftStatus
from pairly.repositories import gifts, pairs, users
from pairly.repositories.gifts import GiftStateError


async def _pair(session, tg_a: int, tg_b: int):
    a = await users.get_or_create_user(session, tg_a, display_name=f"u{tg_a}")
    b = await users.get_or_create_user(session, tg_b, display_name=f"u{tg_b}")
    invite = await pairs.create_invite(session, a)
    pair = await pairs.accept_invite(session, b, invite.token)
    await session.commit()
    return a, b, pair


@pytest.mark.asyncio
async def test_giver_cannot_claim_their_own_gift(session):
    a, b, pair = await _pair(session, 101, 102)
    gift = await gifts.create_gift(
        session, pair_id=pair.id, giver_id=a.id, gesture="Завтрак в постель"
    )
    # The giver (A) tries to claim their own gift — must be blocked.
    with pytest.raises(GiftStateError):
        await gifts.transition(
            session,
            pair_id=pair.id,
            user_id=a.id,
            gift_id=gift.id,
            to=GiftStatus.CLAIMED,
        )


@pytest.mark.asyncio
async def test_receiver_cannot_redeem_their_own_gift(session):
    a, b, pair = await _pair(session, 103, 104)
    gift = await gifts.create_gift(
        session, pair_id=pair.id, giver_id=a.id, gesture="Массаж"
    )
    # Receiver (B) claims it (legal) — but then the receiver must NOT be allowed to
    # mark it redeemed. Only the giver may.
    await gifts.transition(
        session,
        pair_id=pair.id,
        user_id=b.id,
        gift_id=gift.id,
        to=GiftStatus.CLAIMED,
    )
    with pytest.raises(GiftStateError):
        await gifts.transition(
            session,
            pair_id=pair.id,
            user_id=b.id,
            gift_id=gift.id,
            to=GiftStatus.REDEEMED,
        )


@pytest.mark.asyncio
async def test_giver_cannot_decline_their_own_gift(session):
    a, b, pair = await _pair(session, 105, 106)
    gift = await gifts.create_gift(
        session, pair_id=pair.id, giver_id=a.id, gesture="Прогулка"
    )
    # Only the receiver may decline.
    with pytest.raises(GiftStateError):
        await gifts.transition(
            session,
            pair_id=pair.id,
            user_id=a.id,
            gift_id=gift.id,
            to=GiftStatus.DECLINED,
        )


@pytest.mark.asyncio
async def test_happy_path_receiver_claim_giver_redeem_either_complete(session):
    a, b, pair = await _pair(session, 107, 108)
    gift = await gifts.create_gift(
        session, pair_id=pair.id, giver_id=a.id, gesture="Кино вдвоём"
    )

    # Receiver (B) claims.
    g = await gifts.transition(
        session,
        pair_id=pair.id,
        user_id=b.id,
        gift_id=gift.id,
        to=GiftStatus.CLAIMED,
    )
    assert g.status == GiftStatus.CLAIMED

    # Giver (A) redeems.
    g = await gifts.transition(
        session,
        pair_id=pair.id,
        user_id=a.id,
        gift_id=gift.id,
        to=GiftStatus.REDEEMED,
    )
    assert g.status == GiftStatus.REDEEMED

    # Either partner can complete — no role restriction here.
    g = await gifts.transition(
        session,
        pair_id=pair.id,
        user_id=a.id,
        gift_id=gift.id,
        to=GiftStatus.COMPLETE,
    )
    assert g.status == GiftStatus.COMPLETE

    # And from the other side too.
    gift2 = await gifts.create_gift(
        session, pair_id=pair.id, giver_id=a.id, gesture="Ужин"
    )
    await gifts.transition(
        session, pair_id=pair.id, user_id=b.id, gift_id=gift2.id, to=GiftStatus.CLAIMED
    )
    await gifts.transition(
        session, pair_id=pair.id, user_id=a.id, gift_id=gift2.id, to=GiftStatus.REDEEMED
    )
    g2 = await gifts.transition(
        session, pair_id=pair.id, user_id=b.id, gift_id=gift2.id, to=GiftStatus.COMPLETE
    )
    assert g2.status == GiftStatus.COMPLETE