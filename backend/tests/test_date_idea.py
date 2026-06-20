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

    idea = await pick_date_idea(session, pair_id=pair.id, category=None, user_id=a.id)
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

    idea = await pick_date_idea(session, pair_id=pair.id, category="eat", user_id=a.id)
    assert idea.title == "Пицца"
    assert idea.category == "eat"


@pytest.mark.asyncio
async def test_date_idea_fallback_to_canned_when_empty(session):
    """No open items at all → canned idea, source="default"."""
    from pairly.use_cases.date_idea import pick_date_idea

    a, _b, pair = await _pair(session)
    await session.commit()

    idea = await pick_date_idea(session, pair_id=pair.id, category=None, user_id=a.id)
    assert idea.source == "default"
    assert idea.title  # non-empty canned string


@pytest.mark.asyncio
async def test_smart_mode_uses_ai_when_configured(session, monkeypatch):
    """smart mode routes through the OmniRoute client when it returns a pick."""
    from pairly import ai
    from pairly.use_cases.date_idea import pick_date_idea

    async def fake_chat_json(*, system, user):
        assert "списка желаний" in user  # smart prompt references the wishlist
        return {"title": "Та самая пицца на Маросейке", "category": "eat", "reason": "Давно хотели"}

    monkeypatch.setattr(ai, "chat_json", fake_chat_json)
    a, _b, pair = await _pair(session)
    await wishlist.create_item(
        session, pair_id=pair.id, user_id=a.id, title="Пицца на Маросейке", category="eat"
    )
    await session.commit()

    idea = await pick_date_idea(session, pair_id=pair.id, category=None, user_id=a.id, mode="smart")
    assert idea.title == "Та самая пицца на Маросейке"
    assert idea.source == "wishlist"
    assert idea.reason == "Давно хотели"


@pytest.mark.asyncio
async def test_smart_mode_falls_back_when_ai_not_configured(session, monkeypatch):
    """If OmniRoute raises (not configured), smart degrades to a random wishlist pick."""
    from pairly import ai
    from pairly.use_cases.date_idea import pick_date_idea

    async def boom(*, system, user):
        raise ai.AIError("not configured")

    monkeypatch.setattr(ai, "chat_json", boom)
    a, _b, pair = await _pair(session)
    await wishlist.create_item(
        session, pair_id=pair.id, user_id=a.id, title="Прогулка по набережной", category="do"
    )
    await session.commit()

    idea = await pick_date_idea(session, pair_id=pair.id, category=None, user_id=a.id, mode="smart")
    assert idea.title == "Прогулка по набережной"  # fell back to random
    assert idea.source == "wishlist"


@pytest.mark.asyncio
async def test_pick_date_idea_accepts_timezone(session, monkeypatch):
    """Cluster 10: pick_date_idea now takes a timezone kwarg and routes it into the AI prompt.

    Random mode ignores TZ, but the kwarg must be accepted without raising —
    the API layer (cluster 10) forwards auth.user.timezone into every call.
    """
    from pairly.use_cases.date_idea import pick_date_idea

    a, _b, pair = await _pair(session)
    await wishlist.create_item(
        session, pair_id=pair.id, user_id=a.id, title="Пицца", category="eat"
    )
    await session.commit()

    # Random mode: timezone is accepted but unused (no AI prompt).
    idea = await pick_date_idea(
        session, pair_id=pair.id, category=None, user_id=a.id, timezone="Asia/Tokyo"
    )
    assert idea.title == "Пицца"

    # Smart mode: timezone is forwarded into the AI user message (time-of-day label).
    captured: dict[str, str] = {}

    async def fake_chat_json(*, system, user):
        captured["system"] = system
        captured["user"] = user
        return {"title": "Суши", "category": "eat", "reason": "Вечер"}

    from pairly import ai
    monkeypatch.setattr(ai, "chat_json", fake_chat_json)
    await pick_date_idea(
        session,
        pair_id=pair.id,
        category=None,
        user_id=a.id,
        mode="smart",
        timezone="Asia/Tokyo",
    )
    # The timezone changes the time-of-day label (morning/day/evening/night) but the
    # IANA name itself isn't echoed in the prompt — what matters is that the call
    # accepts and uses the kwarg without raising. We assert a non-empty user msg
    # was constructed (the smart prompt that references the wishlist).
    assert "списка желаний" in captured["user"]
