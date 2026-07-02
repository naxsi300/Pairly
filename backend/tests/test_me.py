"""GET/PATCH /api/me — caller's profile + pair info, edit display_name.

Wire-format check: every key MUST be camelCase (displayName, tgUsername,
pairCreatedAt, partnerDisplayName) — matches the Mini App Settings screen.

PATCH validation rules:
  * empty / whitespace-only displayName -> 400
  * over-length (>128 graphemes) -> truncated, not rejected
  * valid name -> updated + visible in the next GET
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
    """Inline FastAPI TestClient with auth/session overrides (mirrors test_wire_format)."""
    app = create_app()

    async def _auth():
        return AuthContext(user=user, raw_user={}, dev_mode=True)

    async def _sess():
        yield session

    app.dependency_overrides[current_auth] = _auth
    app.dependency_overrides[get_session] = _sess
    return TestClient(app)


async def _make_pair(session: AsyncSession, tg_a: int, tg_b: int):
    a = await users.get_or_create_user(session, tg_a, display_name="Alice", tg_username="alice_tg")
    b = await users.get_or_create_user(session, tg_b, display_name="Bob", tg_username="bob_tg")
    invite = await pairs.create_invite(session, a)
    await pairs.accept_invite(session, b, invite.token)
    await session.commit()
    return a, b


@pytest.mark.asyncio
async def test_me_get_returns_caller_profile(session):
    a, b = await _make_pair(session, 1001, 1002)
    client = _client_for(a, session)
    body = client.get("/api/me").json()
    # Top-level keys must be camelCase.
    assert set(body.keys()) >= {
        "id",
        "displayName",
        "tgUsername",
        "pairCreatedAt",
        "partnerDisplayName",
    }, f"missing keys: {set(body.keys())}"
    assert "display_name" not in body
    assert "tg_username" not in body
    assert "pair_created_at" not in body
    assert "partner_display_name" not in body
    # Display name + tg username come from auth.user.
    assert body["displayName"] == "Alice"
    assert body["tgUsername"] == "alice_tg"
    # Partner is Bob.
    assert body["partnerDisplayName"] == "Bob"
    # pairCreatedAt should be ISO-8601 (Pydantic default for datetime).
    assert isinstance(body["pairCreatedAt"], str)
    assert "T" in body["pairCreatedAt"]


@pytest.mark.asyncio
async def test_me_get_returns_partner_username_fallback(session):
    """If partner has no display_name but has tg_username, fall back to @handle."""
    a = await users.get_or_create_user(session, 2001, display_name="Alice")
    b = await users.get_or_create_user(session, 2002, display_name=None, tg_username="bob_handle")
    invite = await pairs.create_invite(session, a)
    await pairs.accept_invite(session, b, invite.token)
    await session.commit()

    client = _client_for(a, session)
    body = client.get("/api/me").json()
    assert body["partnerDisplayName"] == "@bob_handle"


@pytest.mark.asyncio
async def test_me_get_unpaired_returns_null_pair_fields(session):
    """An unpaired caller gets null pair/partner fields (no 412)."""
    a = await users.get_or_create_user(session, 3001, display_name="Solo")
    await session.commit()

    client = _client_for(a, session)
    body = client.get("/api/me").json()
    assert body["id"] == a.id
    assert body["displayName"] == "Solo"
    assert body["pairCreatedAt"] is None
    assert body["partnerDisplayName"] is None


@pytest.mark.asyncio
async def test_me_patch_updates_display_name(session):
    a, b = await _make_pair(session, 4001, 4002)
    client = _client_for(a, session)

    patch = client.patch("/api/me", json={"displayName": "Alicia"})
    assert patch.status_code == 200, patch.text
    body = patch.json()
    assert body["displayName"] == "Alicia"
    assert body["partnerDisplayName"] == "Bob"  # partner unchanged

    # Subsequent GET reflects the update.
    got = client.get("/api/me").json()
    assert got["displayName"] == "Alicia"


@pytest.mark.asyncio
async def test_me_patch_empty_string_rejected(session):
    """An empty (after trim) displayName is rejected with 400."""
    a, _ = await _make_pair(session, 5001, 5002)
    client = _client_for(a, session)

    bad = client.patch("/api/me", json={"displayName": "   "})
    assert bad.status_code == 400, bad.text
    # Original name untouched.
    assert client.get("/api/me").json()["displayName"] == "Alice"


@pytest.mark.asyncio
async def test_me_patch_overlength_truncates(session):
    """A displayName >128 graphemes is truncated, not rejected."""
    a, _ = await _make_pair(session, 6001, 6002)
    client = _client_for(a, session)

    long_name = "А" * 200  # 200 cyrillic graphemes, well over 128
    patch = client.patch("/api/me", json={"displayName": long_name})
    assert patch.status_code == 200, patch.text
    body = patch.json()
    # Must be at most 128 graphemes (we don't pin the exact count — the
    # implementation may choose any cap <= 128, but the DB column is 128).
    from pairly.bot.text import _cluster_boundaries

    n_graphemes = len(_cluster_boundaries(body["displayName"])) - 1
    assert n_graphemes <= 128, f"expected <=128 graphemes, got {n_graphemes}"
    # And the row was actually persisted (next GET sees the truncated value).
    got = client.get("/api/me").json()
    assert got["displayName"] == body["displayName"]