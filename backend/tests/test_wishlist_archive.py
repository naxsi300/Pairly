"""Wishlist archive query-param: GET /api/wishlist?include_archived=1.

Default behavior (no param) must exclude ARCHIVED items. With include_archived
truthy, ARCHIVED items are returned alongside live ones.

ARCHIVED is terminal — no restore. This test only verifies the LIST filter, not
a write path (set_status -> archived is covered by test_wishlist_transitions).
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from pairly.api.app import create_app
from pairly.auth import AuthContext, current_auth
from pairly.db.base import get_session
from pairly.repositories import pairs, users, wishlist
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
    a = await users.get_or_create_user(session, tg_a, display_name=f"u{tg_a}")
    b = await users.get_or_create_user(session, tg_b, display_name=f"u{tg_b}")
    invite = await pairs.create_invite(session, a)
    await pairs.accept_invite(session, b, invite.token)
    await session.commit()
    return a, b


@pytest.mark.asyncio
async def test_default_excludes_archived(session):
    """No query param -> ARCHIVED items hidden (existing behavior preserved)."""
    a, _b = await _make_pair(session, 7001, 7002)
    item = await wishlist.create_item(
        session, pair_id=a.pair_id, user_id=a.id, title="Сырники"
    )
    await wishlist.set_status(
        session, pair_id=a.pair_id, user_id=a.id, item_id=item.id,
        status=__import__("pairly.db.models", fromlist=["WishlistStatus"]).WishlistStatus.ARCHIVED,
    )
    await session.commit()

    client = _client_for(a, session)
    body = client.get("/api/wishlist").json()
    assert all(i["status"] != "archived" for i in body), body
    assert all(i["id"] != item.id for i in body), body


@pytest.mark.asyncio
async def test_include_archived_returns_archived_items(session):
    """?include_archived=1 -> archived items appear in the response."""
    from pairly.db.models import WishlistStatus

    a, _b = await _make_pair(session, 7003, 7004)
    item = await wishlist.create_item(
        session, pair_id=a.pair_id, user_id=a.id, title="Кино"
    )
    # Create one OPEN item + archive the first via the status endpoint.
    await wishlist.create_item(
        session, pair_id=a.pair_id, user_id=a.id, title="Пицца"
    )
    await wishlist.set_status(
        session, pair_id=a.pair_id, user_id=a.id, item_id=item.id,
        status=WishlistStatus.ARCHIVED,
    )
    await session.commit()

    client = _client_for(a, session)
    body = client.get("/api/wishlist?include_archived=1").json()
    statuses = {i["status"] for i in body}
    assert "archived" in statuses, body
    assert any(i["status"] == "archived" and i["id"] == item.id for i in body), body


@pytest.mark.asyncio
async def test_include_archived_false_explicit_keeps_exclusion(session):
    """?include_archived=0 (explicit) still excludes archived, like the default."""
    from pairly.db.models import WishlistStatus

    a, _b = await _make_pair(session, 7005, 7006)
    item = await wishlist.create_item(
        session, pair_id=a.pair_id, user_id=a.id, title="Старое"
    )
    await wishlist.set_status(
        session, pair_id=a.pair_id, user_id=a.id, item_id=item.id,
        status=WishlistStatus.ARCHIVED,
    )
    await session.commit()

    client = _client_for(a, session)
    body = client.get("/api/wishlist?include_archived=0").json()
    assert all(i["status"] != "archived" for i in body), body