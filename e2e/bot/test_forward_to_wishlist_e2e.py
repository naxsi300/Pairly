"""Bot e2e: forward a post -> parse -> create -> list round-trip, in-process.

Covers docs/flows/wishlist.mmd:
    ForwardReceived -> UnpairedGate -> DedupeCheck -> LimitCheck -> Parse -> ItemCreated

Simulates what the bot handler does when a user forwards a message: run the parser
(pairly.bot.parse.parse_forwarded_text) over the forwarded text, then create a
pair-scoped WishlistItem via the repository, then list it back. No real Telegram.
"""

from __future__ import annotations

import pytest
from pairly.bot.parse import parse_forwarded_text
from pairly.repositories import pairs, users, wishlist
from pairly.repositories.base import NotPairedError
from pairly.repositories.wishlist import WishlistLimitError


async def _make_paired_users(session):
    """Two users linked into a fresh FREE pair (the precondition for wishlist writes)."""
    a = await users.get_or_create_user(session, 1, display_name="A")
    b = await users.get_or_create_user(session, 2, display_name="B")
    await session.commit()
    invite = await pairs.create_invite(session, a)
    await session.commit()
    await pairs.accept_invite(session, b, invite.token)
    await session.commit()
    await session.refresh(a)
    await session.refresh(b)
    return a, b


FORWARDED_POST = """Лекция и концерт во дворе
ул. Покровка 27, метро Китай-город
12 июля в 19:00
Джаз под открытым небом, вход свободный."""


@pytest.mark.asyncio
async def test_forward_parse_create_list_round_trip(session):
    """A forwarded post is parsed into title/address/category/date and stored pair-scoped."""
    a, b = await _make_paired_users(session)

    # 1. Parse (best-effort, never raises).
    parsed = parse_forwarded_text(FORWARDED_POST)
    assert parsed.title == "Лекция и концерт во дворе"
    # Category keyword "концерт" -> "do".
    assert parsed.category == "do"
    # Address heuristic catches "ул. Покровка 27".
    assert parsed.address and "Покровка" in parsed.address
    # Date hint "12 июля" and time hint "19:00".
    assert parsed.date_hint and "12 июля" in parsed.date_hint
    assert parsed.time_hint == "19:00"

    # 2. Create the item (creator = a). Pair-scoped; both members can see it.
    item = await wishlist.create_item(
        session,
        pair_id=a.pair_id,
        user_id=a.id,
        title=parsed.title,
        address=parsed.address,
        category=parsed.category,
    )
    await session.commit()

    # 3. Both partners list the SAME item (pair-scoping).
    listed_for_a = await wishlist.list_items(session, pair_id=a.pair_id, user_id=a.id)
    listed_for_b = await wishlist.list_items(session, pair_id=b.pair_id, user_id=b.id)
    assert [i.id for i in listed_for_a] == [i.id for i in listed_for_b]
    assert listed_for_a[0].id == item.id
    assert listed_for_a[0].title == parsed.title
    assert listed_for_a[0].category == "do"


@pytest.mark.asyncio
async def test_unpaired_forward_is_gated_not_stored(session):
    """UnpairedGate: an unpaired user cannot create a wishlist item (nothing stored)."""
    solo = await users.get_or_create_user(session, 99, display_name="solo")
    await session.commit()
    assert solo.pair_id is None

    parsed = parse_forwarded_text(FORWARDED_POST)
    # The repo layer enforces the gate via _require_membership -> NotPairedError.
    # We pass a bogus pair_id to mirror the precondition: a user with no pair has none.
    with pytest.raises(NotPairedError):
        # Resolve the user's pair first (the handler does this before create).
        from pairly.repositories.base import get_user_pair

        await get_user_pair(session, solo.id)

    # And direct create against a non-member pair is refused at the repo boundary.
    from pairly.repositories.base import PairAccessError

    with pytest.raises(PairAccessError):
        await wishlist.create_item(
            session,
            pair_id="pair-does-not-exist",
            user_id=solo.id,
            title=parsed.title,
        )


@pytest.mark.asyncio
async def test_forward_dedupe_same_message_returns_existing(session):
    """DedupeCheck: forwarding the same source message twice yields ONE item."""
    a, _ = await _make_paired_users(session)
    msg_id = 4242

    first = await wishlist.create_item(
        session,
        pair_id=a.pair_id,
        user_id=a.id,
        title="Повторный пост",
        source_message_id=msg_id,
    )
    await session.commit()

    second = await wishlist.create_item(
        session,
        pair_id=a.pair_id,
        user_id=a.id,
        title="Повторный пост",
        source_message_id=msg_id,
    )
    await session.commit()

    assert first.id == second.id  # dedupe returns the existing item
    items = await wishlist.list_items(session, pair_id=a.pair_id, user_id=a.id)
    assert len(items) == 1


@pytest.mark.asyncio
async def test_forward_limit_hit_raises_warm_error(session):
    """LimitCheck: at the free cap (3 here), the next forward raises WishlistLimitError.

    Copy is surfaced warmly in the UI; here we assert the repo raises the typed error
    so the handler/API can show the warm banner (see miniapp/src/screens/Wishlist.tsx).
    """
    a, _ = await _make_paired_users(session)
    # Cap is 3 (PAIRLY_FREE_WISHLIST_LIMIT=3 in this suite's conftest).
    for i in range(3):
        await wishlist.create_item(
            session,
            pair_id=a.pair_id,
            user_id=a.id,
            title=f"item {i}",
        )
    await session.commit()

    with pytest.raises(WishlistLimitError):
        await wishlist.create_item(
            session,
            pair_id=a.pair_id,
            user_id=a.id,
            title="over the cap",
        )
