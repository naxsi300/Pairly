"""Partner-notification logic: cooldown, partner lookup, never-notify-actor, non-fatal.

The Bot.send_message is stubbed (no network). Tests assert the helper's decisions,
not real delivery.
"""

from __future__ import annotations

import pytest
from pairly.bot import notify
from pairly.repositories import pairs, users


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
