"""Love-notes repository: create/list/mark-read, membership-scoped."""

from __future__ import annotations

import pytest
from pairly.repositories import love_notes, pairs, users


async def _pair(session):
    a = await users.get_or_create_user(session, 8001, display_name="a")
    b = await users.get_or_create_user(session, 8002, display_name="b")
    invite = await pairs.create_invite(session, a)
    pair = await pairs.accept_invite(session, b, invite.token)
    await session.commit()
    return a, b, pair


@pytest.mark.asyncio
async def test_create_and_list_note(session):
    a, _b, pair = await _pair(session)
    note = await love_notes.create_note(
        session, pair_id=pair.id, user_id=a.id, body="Доброе утро, любимый 🌅", deliver_at="09:00"
    )
    await session.commit()
    listed = await love_notes.list_notes(session, pair_id=pair.id, user_id=a.id)
    assert len(listed) == 1
    assert listed[0].id == note.id
    assert listed[0].body == "Доброе утро, любимый 🌅"
    assert listed[0].deliver_at == "09:00"
    assert listed[0].delivered is False


@pytest.mark.asyncio
async def test_recipient_marks_read(session):
    a, b, pair = await _pair(session)
    note = await love_notes.create_note(
        session, pair_id=pair.id, user_id=a.id, body="спасибо за вечер"
    )
    await session.commit()
    marked = await love_notes.mark_read(
        session, pair_id=pair.id, user_id=b.id, note_id=note.id
    )
    await session.commit()
    assert marked.read_by_recipient is True


@pytest.mark.asyncio
async def test_body_is_truncated(session):
    a, _b, pair = await _pair(session)
    long = "х" * 2000
    note = await love_notes.create_note(
        session, pair_id=pair.id, user_id=a.id, body=long
    )
    await session.commit()
    assert len(note.body) == 1000
