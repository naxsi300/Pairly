"""Partner-notification logic: cooldown, partner lookup, never-notify-actor, non-fatal.

The Bot.send_message is stubbed (no network). Tests assert the helper's decisions,
not real delivery.
"""

from __future__ import annotations

import uuid

import pytest
from pairly.bot import notify
from pairly.repositories import pairs, users
from sqlalchemy import select


async def _pair(session, tg_a: int, tg_b: int):
    a = await users.get_or_create_user(session, tg_a, display_name=f"u{tg_a}")
    b = await users.get_or_create_user(session, tg_b, display_name=f"u{tg_b}")
    invite = await pairs.create_invite(session, a)
    await pairs.accept_invite(session, b, invite.token)
    await session.commit()
    return a, b


@pytest.mark.asyncio
async def test_gift_received_notifies_partner_not_actor(session, monkeypatch):
    a, b = await _pair(session, 1, 2)
    sent: list[int] = []

    async def fake_send(s, *, pair_id, actor_id, text):
        # Look up the partner the same way _send does and record their tg_id.
        partner = await notify._partner(s, pair_id=pair_id, actor_id=actor_id)
        sent.append(partner.tg_id)
        return True

    monkeypatch.setattr(notify, "_send", fake_send)
    await notify.notify_gift_received(session, pair_id=a.pair_id, actor_id=a.id, gesture="Чай")
    assert sent == [2]  # notified b (partner), never a (actor)


@pytest.mark.asyncio
async def test_qotd_cooldown_suppresses_repeat(session, monkeypatch):
    a, b = await _pair(session, 3, 4)
    calls = []

    async def fake_send(s, *, pair_id, actor_id, text):
        calls.append(text)
        return True

    monkeypatch.setattr(notify, "_send", fake_send)
    # Clear cooldown state so the test is deterministic.
    notify._cooldowns.clear()

    await notify.notify_qotd_answered(session, pair_id=a.pair_id, actor_id=a.id)
    await notify.notify_qotd_answered(session, pair_id=a.pair_id, actor_id=a.id)
    assert len(calls) == 1  # second qotd answer within the 60-min cooldown suppressed


@pytest.mark.asyncio
async def test_gift_has_no_cooldown_always_sends(session, monkeypatch):
    a, b = await _pair(session, 5, 6)
    calls = []

    async def fake_send(s, *, pair_id, actor_id, text):
        calls.append(text)
        return True

    monkeypatch.setattr(notify, "_send", fake_send)
    await notify.notify_gift_received(session, pair_id=a.pair_id, actor_id=a.id, gesture="X")
    await notify.notify_gift_received(session, pair_id=a.pair_id, actor_id=a.id, gesture="Y")
    assert len(calls) == 2  # gifts always notify


@pytest.mark.asyncio
async def test_gift_accept_notifies_giver_not_receiver(session, monkeypatch):
    """On accept/decline the ACTOR is the receiver; the giver must be notified."""
    a, b = await _pair(session, 11, 12)
    notified: list[int] = []

    async def fake_send(s, *, pair_id, actor_id, text):
        partner = await notify._partner(s, pair_id=pair_id, actor_id=actor_id)
        notified.append(partner.tg_id)
        return True

    monkeypatch.setattr(notify, "_send", fake_send)
    # b (receiver) accepts -> _partner resolves to a (giver)
    await notify.notify_gift_accepted(session, pair_id=a.pair_id, actor_id=b.id, gesture="Массаж")
    assert notified == [11]  # giver a was notified, not receiver b


@pytest.mark.asyncio
async def test_qotd_mutual_sends_once(session, monkeypatch):
    a, b = await _pair(session, 13, 14)
    calls = []

    async def fake_send(s, *, pair_id, actor_id, text):
        calls.append(text)
        return True

    monkeypatch.setattr(notify, "_send", fake_send)
    notify._cooldowns.clear()
    await notify.notify_qotd_mutual(session, pair_id=a.pair_id, actor_id=a.id)
    assert len(calls) == 1
    # Meta-only: the message mentions "вопрос дня" / opening, never an answer body.
    # (Any of the 3 rotated phrases is acceptable — assert the invariant, not one variant.)
    msg = calls[0].lower()
    assert "вопрос дня" in msg or "открыв" in msg or "готовы" in msg


@pytest.mark.asyncio
async def test_send_swallows_failure(monkeypatch):
    """A delivery error must never propagate to the caller (the API/bot route)."""

    class BoomBot:
        async def send_message(self, *a, **kw):
            raise RuntimeError("network down")

    monkeypatch.setattr(notify, "_bot", BoomBot())

    async def fake_partner(s, *, pair_id, actor_id):
        class U:
            tg_id = 999

        return U()

    monkeypatch.setattr(notify, "_partner", fake_partner)
    # Should not raise.
    result = await notify._send(object(), pair_id="p", actor_id="a", text="hi")
    assert result is False


@pytest.mark.asyncio
async def test_no_partner_no_crash(session, monkeypatch):
    """A user with no partner (solo) -> _send returns False, no crash."""
    solo = await users.get_or_create_user(session, 7, display_name="solo")
    await session.commit()
    result = await notify._send(session, pair_id="nonexistent", actor_id=solo.id, text="hi")
    assert result is False


def test_no_mood_notification_by_contract():
    """docs/copy/mood-sync.md forbids mood alerts. Guard against re-introducing it."""
    assert not hasattr(notify, "notify_mood_set"), (
        "notify_mood_set must not exist — mood is ambient-only by hard contract "
        "(docs/copy/mood-sync.md: NEVER send an alert when partner's mood changes)."
    )
    assert "mood" not in notify._COOLDOLD_SEC


# --- Cluster 3: outbox + drain + notify_gift_completed -----------------------


@pytest.mark.asyncio
async def test_send_on_retry_after_enqueues_outbox(session, monkeypatch):
    """TelegramRetryAfter -> _send returns False AND writes a NotifyOutbox row
    scheduled for not_before = now + retry_after seconds."""
    from datetime import datetime

    from pairly.bot import notify
    from pairly.db.models import NotifyOutbox

    a, b = await _pair(session, 101, 102)

    class RetryBot:
        async def send_message(self, *a, **kw):
            # TelegramRetryAfter needs a TelegramMethod (not a bound method). We
            # hand it a tiny duck-typed object — only the type name is read.
            class _M:
                __name__ = "SendMessage"
            raise notify.TelegramRetryAfter(method=_M(), message="x", retry_after=2)

    monkeypatch.setattr(notify, "_bot", RetryBot())

    result = await notify._send(
        session, pair_id=a.pair_id, actor_id=a.id, text="важное"
    )
    assert result is False
    # A row was inserted, scheduled ~2s in the future.
    rows = (await session.execute(select(NotifyOutbox))).scalars().all()
    assert len(rows) == 1
    row = rows[0]
    assert row.pair_id == a.pair_id
    assert row.partner_tg_id == b.tg_id
    assert row.text == "важное"
    assert row.attempts == 0
    # not_before should be in the future, within (1s, 5s) window
    now = datetime.now(row.not_before.tzinfo)
    delta = (row.not_before - now).total_seconds()
    assert 0.5 < delta < 5.0


@pytest.mark.asyncio
async def test_send_on_server_error_enqueues_outbox(session, monkeypatch):
    """TelegramServerError -> _send returns False AND enqueues with short backoff."""
    from pairly.bot import notify
    from pairly.db.models import NotifyOutbox

    a, b = await _pair(session, 103, 104)

    class ServerBot:
        async def send_message(self, *a, **kw):
            raise notify.TelegramServerError(method=None, message="500 from tg")

    monkeypatch.setattr(notify, "_bot", ServerBot())
    result = await notify._send(
        session, pair_id=a.pair_id, actor_id=a.id, text="again"
    )
    assert result is False
    rows = (await session.execute(select(NotifyOutbox))).scalars().all()
    assert len(rows) == 1
    # backoff is small (a few seconds) — should be in the future, but < 60s
    from datetime import datetime
    now = datetime.now(rows[0].not_before.tzinfo)
    delta = (rows[0].not_before - now).total_seconds()
    assert 0 < delta < 60


@pytest.mark.asyncio
async def test_drain_outbox_delivers_due_row(session, monkeypatch, engine):
    """A due row -> drain_outbox sends it and deletes the row."""
    from datetime import UTC, datetime, timedelta

    from pairly.bot import notify
    from pairly.db.models import NotifyOutbox
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    a, b = await _pair(session, 105, 106)
    # Insert a due row.
    row = NotifyOutbox(
        id=str(uuid.uuid4()),
        pair_id=a.pair_id,
        partner_tg_id=b.tg_id,
        text="hi from outbox",
        not_before=datetime.now(UTC) - timedelta(seconds=1),
        attempts=0,
        created_at=datetime.now(UTC),
    )
    session.add(row)
    await session.commit()

    sent: list[tuple[int, str]] = []

    class FakeBot:
        async def send_message(self, tg_id, text, **kw):
            sent.append((tg_id, text))

    monkeypatch.setattr(notify, "_bot", FakeBot())

    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    await notify.drain_outbox(maker)
    assert sent == [(b.tg_id, "hi from outbox")]
    # Row should be gone after success.
    rows = (await session.execute(select(NotifyOutbox))).scalars().all()
    assert len(rows) == 0


@pytest.mark.asyncio
async def test_drain_outbox_skips_future_row(session, monkeypatch, engine):
    """not_before in the future -> not delivered, not touched."""
    from datetime import UTC, datetime, timedelta

    from pairly.bot import notify
    from pairly.db.models import NotifyOutbox
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    a, b = await _pair(session, 107, 108)
    row = NotifyOutbox(
        id=str(uuid.uuid4()),
        pair_id=a.pair_id,
        partner_tg_id=b.tg_id,
        text="future",
        not_before=datetime.now(UTC) + timedelta(seconds=60),
        attempts=0,
        created_at=datetime.now(UTC),
    )
    session.add(row)
    await session.commit()

    sent: list = []

    class FakeBot:
        async def send_message(self, *a, **kw):
            sent.append(a)

    monkeypatch.setattr(notify, "_bot", FakeBot())
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    await notify.drain_outbox(maker)
    assert sent == []
    rows = (await session.execute(select(NotifyOutbox))).scalars().all()
    assert len(rows) == 1


@pytest.mark.asyncio
async def test_drain_outbox_dead_letter_after_max_attempts(session, monkeypatch, engine):
    """5 attempts + another failure -> row is removed (dead-letter)."""
    from datetime import UTC, datetime, timedelta

    from pairly.bot import notify
    from pairly.db.models import NotifyOutbox
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    a, b = await _pair(session, 109, 110)
    row = NotifyOutbox(
        id=str(uuid.uuid4()),
        pair_id=a.pair_id,
        partner_tg_id=b.tg_id,
        text="zombie",
        not_before=datetime.now(UTC) - timedelta(seconds=1),
        attempts=5,  # already at cap; one more failure -> drop
        created_at=datetime.now(UTC),
    )
    session.add(row)
    await session.commit()

    class BombBot:
        async def send_message(self, *a, **kw):
            raise notify.TelegramServerError(method=None, message="500")

    monkeypatch.setattr(notify, "_bot", BombBot())
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    await notify.drain_outbox(maker)
    rows = (await session.execute(select(NotifyOutbox))).scalars().all()
    assert len(rows) == 0


@pytest.mark.asyncio
async def test_notify_gift_completed_calls_send(session, monkeypatch):
    """notify_gift_completed uses _send to reach the partner with a warm line."""
    from pairly.bot import notify

    a, b = await _pair(session, 111, 112)
    sent: list[dict] = []

    async def fake_send(s, *, pair_id, actor_id, text):
        sent.append({"pair_id": pair_id, "actor_id": actor_id, "text": text})
        return True

    monkeypatch.setattr(notify, "_send", fake_send)
    await notify.notify_gift_completed(
        session, pair_id=a.pair_id, actor_id=a.id, gesture="Прогулка"
    )
    assert len(sent) == 1
    assert sent[0]["actor_id"] == a.id
    assert "Прогулка" in sent[0]["text"]


# --- Cluster 4b: QOTD mutual notify cooldown + route-level first-cross ---------


@pytest.mark.asyncio
async def test_qotd_mutual_cooldown_suppresses_repeat(session, monkeypatch):
    """notify_qotd_mutual has its own cooldown key (qotd_mutual): a second call
    within the window is a no-op even if the caller invokes it directly.
    Defense-in-depth on top of the route-level first-cross guard."""
    from pairly.bot import notify

    a, b = await _pair(session, 200, 201)
    calls: list[str] = []

    async def fake_send(s, *, pair_id, actor_id, text):
        calls.append(text)
        return True

    monkeypatch.setattr(notify, "_send", fake_send)
    notify._cooldowns.clear()
    await notify.notify_qotd_mutual(session, pair_id=a.pair_id, actor_id=a.id)
    await notify.notify_qotd_mutual(session, pair_id=a.pair_id, actor_id=a.id)
    assert len(calls) == 1  # second call suppressed by cooldown


@pytest.mark.asyncio
async def test_qotd_mutual_cooldown_key_independent_from_qotd(session, monkeypatch):
    """The qotd_mutual cooldown is a separate key from qotd, so the answered
    notify and the mutual notify don't share state. A mutual doesn't reset the
    answered gate and vice-versa."""
    from pairly.bot import notify

    notify._cooldowns.clear()
    a, b = await _pair(session, 202, 203)
    calls: list[str] = []

    async def fake_send(s, *, pair_id, actor_id, text):
        calls.append(text)
        return True

    monkeypatch.setattr(notify, "_send", fake_send)
    # First an answered notify — uses "qotd" key.
    await notify.notify_qotd_answered(session, pair_id=a.pair_id, actor_id=a.id)
    # Now the mutual — uses "qotd_mutual" key, should NOT be suppressed by the
    # qotd-answered gate.
    await notify.notify_qotd_mutual(session, pair_id=a.pair_id, actor_id=a.id)
    assert len(calls) == 2
