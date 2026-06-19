"""Date-idea picker: spins the open wishlist for a "what do we do" suggestion."""

from __future__ import annotations

import pytest

from pairly.repositories import pairs, users, wishlist


async def _pair(session):
    a = await users.get_or_create_user(session, 7001, display_name="a")
    b = await users.get_or_create_user(session, 7002, display_name="b")
    invite = await pairs.create_invite(session, a)
    pair = await pairs.accept_invite(session, b, invite.token)
    await session.commit()
    return a, b, pair


@pytest.mark.asyncio
async def test_date_idea_picks_an_open_wishlist_item(session):
    """Spinning with open items returns one of them."""
    from pairly.use_cases.date_idea import pick_date_idea

    a, _b, pair = await _pair(session)
    await wishlist.create_item(
        session, pair_id=pair.id, user_id=a.id, title="Пицца на Маросейке", category="eat"
    )
    await wishlist.create_item(
        session, pair_id=pair.id, user_id=a.id, title="Прогулка по набережной", category="do"
    )
    await session.commit()

    idea = await pick_date_idea(session, pair_id=pair.id, category=None)
    assert idea.title in {"Пицца на Маросейке", "Прогулка по набережной"}
    assert idea.source == "wishlist"


@pytest.mark.asyncio
async def test_date_idea_filters_by_category(session):
    from pairly.use_cases.date_idea import pick_date_idea

    a, _b, pair = await _pair(session)
    await wishlist.create_item(
        session, pair_id=pair.id, user_id=a.id, title="Пицца", category="eat"
    )
    await wishlist.create_item(
        session, pair_id=pair.id, user_id=a.id, title="Кино", category="watch"
    )
    await session.commit()

    idea = await pick_date_idea(session, pair_id=pair.id, category="eat")
    assert idea.title == "Пицца"
    assert idea.category == "eat"


@pytest.mark.asyncio
async def test_date_idea_fallback_to_canned_when_empty(session):
    """No open items at all → canned idea, source="default"."""
    from pairly.use_cases.date_idea import pick_date_idea

    a, _b, pair = await _pair(session)
    await session.commit()

    idea = await pick_date_idea(session, pair_id=pair.id, category=None)
    assert idea.source == "default"
    assert idea.title  # non-empty canned string
