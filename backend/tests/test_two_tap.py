"""Two-tap wishlist consent: pending → open on partner approval."""

from __future__ import annotations

import pytest
from pairly.db.models import WishlistStatus
from pairly.repositories import pairs, users, wishlist


async def _pair(session):
    a = await users.get_or_create_user(session, 9001, display_name="a")
    b = await users.get_or_create_user(session, 9002, display_name="b")
    invite = await pairs.create_invite(session, a)
    pair = await pairs.accept_invite(session, b, invite.token)
    await session.commit()
    return a, b, pair


@pytest.mark.asyncio
async def test_forward_creates_pending(session):
    a, _b, pair = await _pair(session)
    item = await wishlist.create_item(
        session, pair_id=pair.id, user_id=a.id, title="Пицца", status=WishlistStatus.PENDING
    )
    await session.commit()
    assert item.status == WishlistStatus.PENDING


@pytest.mark.asyncio
async def test_partner_approval_opens_item(session):
    a, b, pair = await _pair(session)
    item = await wishlist.create_item(
        session, pair_id=pair.id, user_id=a.id, title="Пицца", status=WishlistStatus.PENDING
    )
    await session.commit()
    approved = await wishlist.approve_item(
        session, pair_id=pair.id, user_id=b.id, item_id=item.id
    )
    await session.commit()
    assert approved.status == WishlistStatus.OPEN


@pytest.mark.asyncio
async def test_approve_is_idempotent(session):
    a, b, pair = await _pair(session)
    item = await wishlist.create_item(
        session, pair_id=pair.id, user_id=a.id, title="Пицца", status=WishlistStatus.PENDING
    )
    await session.commit()
    await wishlist.approve_item(session, pair_id=pair.id, user_id=b.id, item_id=item.id)
    again = await wishlist.approve_item(session, pair_id=pair.id, user_id=b.id, item_id=item.id)
    await session.commit()
    assert again.status == WishlistStatus.OPEN  # stays open, no error


@pytest.mark.asyncio
async def test_author_self_approve_is_noop(session):
    """Author approving their own PENDING item is a no-op — stays PENDING.

    Without this guard, the author could bypass the two-tap partner-consent
    requirement: forward a post → it's PENDING → call approve_item yourself →
    it goes OPEN with no partner ack.
    """
    a, _b, pair = await _pair(session)
    item = await wishlist.create_item(
        session, pair_id=pair.id, user_id=a.id, title="Пицца", status=WishlistStatus.PENDING
    )
    await session.commit()
    # The author tries to approve their own pending item — must stay PENDING.
    result = await wishlist.approve_item(
        session, pair_id=pair.id, user_id=a.id, item_id=item.id
    )
    await session.commit()
    assert result.status == WishlistStatus.PENDING


# --- Cluster 4a: forwarder must be told when the partner approves ------------


@pytest.mark.asyncio
async def test_notify_wishlist_approved_calls_send_once(session, monkeypatch):
    """notify_wishlist_approved reaches the forwarder (item.created_by) via _send.

    The forwarder is the actor who forwarded the post (item.created_by). The
    approver is the OTHER partner. The notify helper should send EXACTLY ONE
    _send call targeted at the forwarder.
    """
    from pairly.bot import notify

    a, b, pair = await _pair(session)
    item = await wishlist.create_item(
        session, pair_id=pair.id, user_id=a.id, title="Пицца", status=WishlistStatus.PENDING
    )
    await session.commit()

    sent: list[dict] = []

    async def fake_send(s, *, pair_id, actor_id, text):
        sent.append({"pair_id": pair_id, "actor_id": actor_id, "text": text})
        return True

    monkeypatch.setattr(notify, "_send", fake_send)
    # Approver is b (the partner); forwarder is a (item.created_by). To reach
    # the forwarder we pass actor_id=approver_id so _partner() resolves to a.
    await notify.notify_wishlist_approved(
        session, pair_id=pair.id, item=item, approver_id=b.id
    )
    assert len(sent) == 1
    # The text should mention the gesture / approval warm beat (not the body).
    assert "Пицца" in sent[0]["text"]


@pytest.mark.asyncio
async def test_notify_wishlist_approved_skips_self_approve(session, monkeypatch):
    """If the approver IS the forwarder (self-approve), _send is never called.

    Wave-1 made approve_item() an idempotent no-op for the author, so the
    notifier must mirror that: never notify yourself about your own approval.
    """
    from pairly.bot import notify

    a, _b, pair = await _pair(session)
    item = await wishlist.create_item(
        session, pair_id=pair.id, user_id=a.id, title="Пицца", status=WishlistStatus.PENDING
    )
    await session.commit()

    sent: list[dict] = []

    async def fake_send(s, *, pair_id, actor_id, text):
        sent.append({"x": 1})
        return True

    monkeypatch.setattr(notify, "_send", fake_send)
    # Approver == forwarder (a). notify must skip.
    await notify.notify_wishlist_approved(
        session, pair_id=pair.id, item=item, approver_id=a.id
    )
    assert sent == []


@pytest.mark.asyncio
async def test_notify_wishlist_approved_skips_when_already_open(session, monkeypatch):
    """If the item was already OPEN before the call (re-tap by the approver),
    notify must be skipped — the partner already saw the warm beat.

    The caller is responsible for capturing the pre-call status (since the
    transition may already have flushed) and stamping it as `was_open_before`
    on the item. The notifier reads that attribute.
    """
    from pairly.bot import notify

    a, b, pair = await _pair(session)
    # Pre-create as OPEN — simulates the re-tap case after a previous approve.
    item = await wishlist.create_item(
        session, pair_id=pair.id, user_id=a.id, title="Пицца", status=WishlistStatus.OPEN
    )
    item.was_open_before = True  # caller-captured pre-call status
    await session.commit()

    sent: list[dict] = []

    async def fake_send(s, *, pair_id, actor_id, text):
        sent.append({"x": 1})
        return True

    monkeypatch.setattr(notify, "_send", fake_send)
    # Even though approver != forwarder, was_open_before=True -> skip.
    await notify.notify_wishlist_approved(
        session, pair_id=pair.id, item=item, approver_id=b.id
    )
    assert sent == []


# --- Cluster 4a: route-level — the API /api/wishlist/{id}/approve notifies ----


def _client_for(user, session):
    """Inline FastAPI TestClient with auth/session overrides (mirror test_wire_format)."""
    from fastapi.testclient import TestClient
    from pairly.api.app import create_app
    from pairly.auth import AuthContext, current_auth
    from pairly.db.base import get_session

    app = create_app()

    async def _auth():
        return AuthContext(user=user, raw_user={}, dev_mode=True)

    async def _sess():
        yield session

    app.dependency_overrides[current_auth] = _auth
    app.dependency_overrides[get_session] = _sess
    return TestClient(app)


@pytest.mark.asyncio
async def test_api_approve_notifies_forwarder_exactly_once(session, monkeypatch):
    """Real partner-approve through /api/wishlist/{id}/approve -> forwarder gets ONE notify."""
    from pairly.bot import notify

    a, b, pair = await _pair(session)
    item = await wishlist.create_item(
        session, pair_id=pair.id, user_id=a.id, title="Пицца", status=WishlistStatus.PENDING
    )
    await session.commit()

    sent: list[dict] = []

    async def fake_send(s, *, pair_id, actor_id, text):
        sent.append({"actor_id": actor_id, "text": text})
        return True

    monkeypatch.setattr(notify, "_send", fake_send)

    # The approver (b) hits the route; the forwarder (a) should be notified.
    client = _client_for(b, session)
    resp = client.post(f"/api/wishlist/{item.id}/approve")
    assert resp.status_code == 200, resp.text
    # Exactly one notify fired, targeted at the forwarder (a), not b.
    assert len(sent) == 1, f"expected 1 notify, got {len(sent)}: {sent}"
    # actor_id is the approver (b); _partner() inside _send resolves to a.
    # The text mentions the item and is a warm "approved" beat.
    assert "Пицца" in sent[0]["text"]


@pytest.mark.asyncio
async def test_api_approve_retap_does_not_re_notify(session, monkeypatch):
    """Re-approving an already-OPEN item is a no-op for notifications (idempotent)."""
    from pairly.bot import notify

    a, b, pair = await _pair(session)
    item = await wishlist.create_item(
        session, pair_id=pair.id, user_id=a.id, title="Пицца", status=WishlistStatus.OPEN
    )
    await session.commit()

    sent: list[dict] = []

    async def fake_send(s, *, pair_id, actor_id, text):
        sent.append({"x": 1})
        return True

    monkeypatch.setattr(notify, "_send", fake_send)

    client = _client_for(b, session)
    resp = client.post(f"/api/wishlist/{item.id}/approve")
    assert resp.status_code == 200, resp.text
    assert sent == []  # already OPEN -> no notify
