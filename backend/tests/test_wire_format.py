"""Wire-format contract test: API responses MUST be camelCase + match the client shape.

Guards the regression that broke mood/qotd/gifts/countdowns in the real backend: the
mock used one shape, the server another. If a client screen reads `data.self`,
`data.myAnswer`, `c.targetDate`, `g.createdAt` — the server must emit exactly those keys.

We override BOTH current_auth and get_session so the TestClient shares the test's
in-memory session (otherwise the route opens its own connection to :memory: and sees
nothing).
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from pairly.api.app import create_app
from pairly.auth import AuthContext, current_auth
from pairly.db.base import get_session
from pairly.repositories import pairs, users
from sqlalchemy.ext.asyncio import AsyncSession


def _client_for(user, session: AsyncSession) -> TestClient:
    app = create_app()

    async def _auth():
        return AuthContext(user=user, raw_user={}, dev_mode=True)

    async def _sess():
        # Route handlers close() the session on exit; we must not close the shared
        # fixture session. Yield a fresh bound session from the SAME engine instead.
        yield session

    app.dependency_overrides[current_auth] = _auth
    app.dependency_overrides[get_session] = _sess
    return TestClient(app)


async def _make_pair(session: AsyncSession, tg_a: int, tg_b: int):
    a = await users.get_or_create_user(session, tg_a, display_name="Alice")
    b = await users.get_or_create_user(session, tg_b, display_name="Bob")
    invite = await pairs.create_invite(session, a)
    await pairs.accept_invite(session, b, invite.token)
    await session.commit()
    return a, b


@pytest.mark.asyncio
async def test_mood_get_emits_client_shape(session):
    a, b = await _make_pair(session, 1, 2)
    client = _client_for(a, session)
    body = client.get("/api/mood").json()
    # Client MoodResponse: { self, partner, partnerName } — NOT mine/partner_name.
    assert "self" in body, f"expected 'self' key, got {list(body.keys())}"
    assert "partner" in body
    assert "partnerName" in body, f"camelCase partnerName missing: {list(body.keys())}"
    assert "mine" not in body
    assert "partner_name" not in body


@pytest.mark.asyncio
async def test_mood_post_then_get_shows_self(session):
    a, b = await _make_pair(session, 3, 4)
    client = _client_for(a, session)
    post = client.post("/api/mood", json={"mood": "сияю", "note": None})
    assert post.status_code == 200, post.text
    entry = post.json()
    assert "setAt" in entry, f"camelCase setAt missing: {list(entry.keys())}"

    got = client.get("/api/mood").json()
    assert got["self"]["mood"] == "сияю"
    assert "setAt" in got["self"]


@pytest.mark.asyncio
async def test_qotd_get_emits_client_shape(session):
    a, b = await _make_pair(session, 5, 6)
    client = _client_for(a, session)
    body = client.get("/api/qotd").json()
    # Client QOTDState: { question, myAnswer, partnerAnswered, partnerAnswer, partnerName }
    for key in ("question", "myAnswer", "partnerAnswered", "partnerAnswer", "partnerName"):
        assert key in body, f"missing {key}: {list(body.keys())}"
    assert "mine" not in body and "partner_name" not in body


@pytest.mark.asyncio
async def test_qotd_answer_unlocks_and_returns_client_shape(session):
    a, b = await _make_pair(session, 7, 8)
    ca = _client_for(a, session)
    resp = ca.post("/api/qotd/answer", json={"answer": "потому что люблю"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    # The post-answer shape must spread into the client QOTDState.
    assert body["myAnswer"] == "потому что люблю"
    assert "partnerAnswered" in body
    assert "partnerAnswer" in body


@pytest.mark.asyncio
async def test_countdowns_get_emits_target_date_camel(session):
    a, b = await _make_pair(session, 9, 10)
    client = _client_for(a, session)
    create = client.post(
        "/api/countdowns",
        json={"label": "Годовщина", "targetDate": "2026-08-15T10:00:00Z"},
    )
    assert create.status_code == 200, create.text
    got = client.get("/api/countdowns").json()
    assert got, "expected at least one countdown"
    assert "targetDate" in got[0], f"camelCase targetDate missing: {list(got[0].keys())}"


@pytest.mark.asyncio
async def test_countdowns_patch_updates_sent_fields_and_keeps_the_rest(session):
    a, b = await _make_pair(session, 13, 14)
    client = _client_for(a, session)
    created = client.post(
        "/api/countdowns",
        json={"label": "Отпуск", "targetDate": "2026-08-15T10:00:00Z", "emoji": "🏝"},
    ).json()
    cid = created["id"]

    # Patch only label + recurrence; emoji and targetDate must be untouched.
    patched = client.patch(
        f"/api/countdowns/{cid}",
        json={"label": "Большой отпуск", "recurrence": "annual"},
    )
    assert patched.status_code == 200, patched.text
    body = patched.json()
    assert body["label"] == "Большой отпуск"
    assert body["recurrence"] == "annual"
    assert body["emoji"] == "🏝"                          # untouched
    assert body["targetDate"].startswith("2026-08-15")   # untouched

    # An explicit null clears recurrence → one-shot.
    cleared = client.patch(f"/api/countdowns/{cid}", json={"recurrence": None}).json()
    assert cleared["recurrence"] is None

    # Unknown id → 404.
    miss = client.patch("/api/countdowns/does-not-exist", json={"label": "x"})
    assert miss.status_code == 404


@pytest.mark.asyncio
async def test_gifts_get_emits_partner_name_camel(session):
    a, b = await _make_pair(session, 11, 12)
    client = _client_for(a, session)
    client.post("/api/gifts", json={"gesture": "Завтрак"})
    body = client.get("/api/gifts").json()
    assert "partnerName" in body, f"camelCase partnerName missing: {list(body.keys())}"
    assert body["partnerName"] == "Bob"
    if body["items"]:
        assert "createdAt" in body["items"][0]


@pytest.mark.asyncio
async def test_admin_status_and_toggle_pro(session, monkeypatch):
    import pairly.config as cfg

    a, b = await _make_pair(session, 15, 16)
    # Make user `a` (tg 15) an admin — patched BEFORE _client_for → create_app.
    monkeypatch.setattr(cfg, "admin_tg_id_set", lambda: {15})
    client = _client_for(a, session)

    status = client.get("/api/admin/status")
    assert status.status_code == 200, status.text
    assert status.json()["tgId"] == 15
    assert status.json()["isPro"] is False

    # Toggle Pro on, then off; pair/stats mirrors isPro.
    assert client.post("/api/admin/toggle-pro").json()["isPro"] is True
    assert client.get("/api/pair/stats").json()["isPro"] is True
    assert client.post("/api/admin/toggle-pro").json()["isPro"] is False

    # A non-admin gets 404 (endpoint is invisible to regular users).
    monkeypatch.setattr(cfg, "admin_tg_id_set", lambda: set())
    client_b = _client_for(b, session)
    assert client_b.get("/api/admin/status").status_code == 404
    assert client_b.post("/api/admin/toggle-pro").status_code == 404


@pytest.mark.asyncio
async def test_admin_dashboard_manages_other_pairs(session, monkeypatch):
    import pairly.config as cfg

    a, _b = await _make_pair(session, 17, 18)
    c, d = await _make_pair(session, 19, 20)  # a second, "other" pair
    monkeypatch.setattr(cfg, "admin_tg_id_set", lambda: {17})  # `a` is the admin
    client = _client_for(a, session)

    # Stats.
    stats = client.get("/api/admin/stats")
    assert stats.status_code == 200
    assert stats.json()["total"] >= 2

    # List pairs.
    pairs = client.get("/api/admin/pairs?limit=10").json()["items"]
    assert len(pairs) >= 2
    assert {p["pairId"] for p in pairs} >= {a.pair_id, c.pair_id} if hasattr(a, "pair_id") else True

    # Lookup the other pair by a member's tg id.
    lookup = client.get("/api/admin/lookup?tg=20")
    assert lookup.status_code == 200
    assert lookup.json()["pairId"] == c.pair_id
    assert lookup.json()["isPro"] is False

    # Grant Pro on the OTHER pair (not the admin's own).
    grant = client.post(f"/api/admin/pairs/{c.pair_id}/pro")
    assert grant.status_code == 200
    assert grant.json()["isPro"] is True

    # Audit log records the grant.
    audit = client.get("/api/admin/audit?limit=5").json()["items"]
    assert any(row["action"] == "grant_pro" and row["targetPairId"] == c.pair_id for row in audit)

    # Revoke Pro on the other pair.
    revoke = client.delete(f"/api/admin/pairs/{c.pair_id}/pro")
    assert revoke.status_code == 200
    assert revoke.json()["isPro"] is False

    # Non-admin → 404 on every dashboard endpoint.
    monkeypatch.setattr(cfg, "admin_tg_id_set", lambda: set())
    client_d = _client_for(d, session)
    assert client_d.get("/api/admin/pairs").status_code == 404
    assert client_d.post(f"/api/admin/pairs/{c.pair_id}/pro").status_code == 404
