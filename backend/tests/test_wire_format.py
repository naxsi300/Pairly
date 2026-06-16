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
async def test_gifts_get_emits_partner_name_camel(session):
    a, b = await _make_pair(session, 11, 12)
    client = _client_for(a, session)
    client.post("/api/gifts", json={"gesture": "Завтрак"})
    body = client.get("/api/gifts").json()
    assert "partnerName" in body, f"camelCase partnerName missing: {list(body.keys())}"
    assert body["partnerName"] == "Bob"
    if body["items"]:
        assert "createdAt" in body["items"][0]
