"""API schema smoke test: Pydantic models accept both camelCase and snake_case.

This is a unit test on the schemas themselves (no DB, no FastAPI). It pins the
client/server contract so future renames break loudly.

The full route-level test runs in e2e/bot/test_pair_flow_e2e.py against the
repository layer (which the API just thinly wraps).
"""

from __future__ import annotations

from datetime import datetime

import pytest
from pairly.api.schemas import (
    BucketCreate,
    CountdownCreate,
    MoodSet,
    QOTDAnswerIn,
    WishlistCreate,
)


def test_wishlist_create_accepts_camel_case():
    m = WishlistCreate.model_validate({"title": "Кафе", "address": "Ленина 1", "category": "eat"})
    assert m.title == "Кафе"
    assert m.address == "Ленина 1"


def test_wishlist_create_accepts_snake_case():
    m = WishlistCreate.model_validate({"title": "Test", "notes": "x", "event_date": "2026-08-15"})
    assert m.title == "Test"
    assert m.notes == "x"


def test_countdown_create_accepts_camel_case():
    m = CountdownCreate.model_validate(
        {"label": "Годовщина", "targetDate": "2026-08-15T10:00:00Z", "emoji": "💛"}
    )
    assert m.label == "Годовщина"
    assert isinstance(m.target_date, datetime)


def test_countdown_create_accepts_snake_case():
    m = CountdownCreate.model_validate(
        {"label": "Test", "target_date": "2026-08-15T10:00:00Z"}
    )
    assert m.label == "Test"


def test_qotd_answer_in_accepts_answer_only():
    m = QOTDAnswerIn.model_validate({"answer": "Люблю"})
    assert m.answer == "Люблю"
    assert m.body is None


def test_qotd_answer_in_accepts_body_only():
    m = QOTDAnswerIn.model_validate({"body": "Люблю", "question_id": "q1"})
    assert m.body == "Люблю"
    assert m.question_id == "q1"


def test_mood_set_strips_whitespace():
    m = MoodSet.model_validate({"mood": "  хорошо  ", "note": "  "})
    assert m.mood == "хорошо"
    assert m.note is None  # empty after strip


def test_bucket_create_required_title():
    with pytest.raises(Exception):
        BucketCreate.model_validate({})


def test_wishlist_status_pattern_rejects_unknown():
    from pairly.api.schemas import WishlistStatusUpdate

    with pytest.raises(Exception):
        WishlistStatusUpdate.model_validate({"status": "what"})


# --- Bounded-field max_length enforcement (Cluster 7) ---
#
# The DB columns are bounded (WishlistItem.address String(512), category String(32),
# BucketItem.category String(32), MoodEntry.note String(60), QOTDAnswer.body
# ANSWER_MAX_CHARS=280). Without a matching Pydantic max_length, a too-long value
# passes validation and crashes the DB with an opaque 500 — we want a clean 422.


def test_wishlist_create_rejects_oversized_address():
    """address is String(512) — over-length must fail Pydantic validation, not DB."""
    too_long = "a" * 513
    with pytest.raises(Exception):
        WishlistCreate.model_validate({"title": "Кафе", "address": too_long})


def test_wishlist_create_accepts_address_at_limit():
    """address exactly at the DB column width must be accepted."""
    at_limit = "a" * 512
    m = WishlistCreate.model_validate({"title": "Кафе", "address": at_limit})
    assert m.address == at_limit


def test_wishlist_create_rejects_oversized_category():
    """category is String(32) — over-length must fail Pydantic validation, not DB."""
    too_long = "c" * 33
    with pytest.raises(Exception):
        WishlistCreate.model_validate({"title": "Кафе", "category": too_long})


def test_bucket_create_rejects_oversized_category():
    """BucketItem.category is String(32) — over-length must fail Pydantic validation."""
    too_long = "c" * 33
    with pytest.raises(Exception):
        BucketCreate.model_validate({"title": "Полёт", "category": too_long})


def test_mood_set_rejects_oversized_note():
    """MoodEntry.note is String(60) — over-length must fail Pydantic validation."""
    too_long = "n" * 61
    with pytest.raises(Exception):
        MoodSet.model_validate({"mood": "хорошо", "note": too_long})


def test_qotd_answer_in_rejects_oversized_answer():
    """QOTDAnswerIn.answer must cap at ANSWER_MAX_CHARS=280 — clean 422, not DB 500."""
    too_long = "a" * 281
    with pytest.raises(Exception):
        QOTDAnswerIn.model_validate({"answer": too_long})


def test_qotd_answer_in_rejects_oversized_body():
    """QOTDAnswerIn.body must cap at ANSWER_MAX_CHARS=280 — clean 422, not DB 500."""
    too_long = "a" * 281
    with pytest.raises(Exception):
        QOTDAnswerIn.model_validate({"body": too_long})


def test_qotd_answer_in_accepts_answer_at_limit():
    """280-char answer must be accepted (boundary)."""
    at_limit = "a" * 280
    m = QOTDAnswerIn.model_validate({"answer": at_limit})
    assert m.answer == at_limit


# --- Cluster 10: api/app.py integration ---
#
# Pin the bug fixes the cluster makes:
#   (a) gift_transition commits the gift_completed milestone
#   (b) pair/stats + mood + gift_transition responses DO include newMilestones
#       (response_model used to strip it)
#   (c) /api/mark-done and /api/wishlist/{id}/status on illegal transitions → 409
#   (e) POST /api/wishlist + /api/mark-done set mine=True for the author
#
# These are route-level tests (FastAPI TestClient). We inline the auth/session
# overrides here so the test stays self-contained — same pattern as
# test_wire_format.py.


def _client_for(user, session):
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


async def _make_pair(session, tg_a: int, tg_b: int):
    from pairly.repositories import pairs, users

    a = await users.get_or_create_user(session, tg_a, display_name="Alice")
    b = await users.get_or_create_user(session, tg_b, display_name="Bob")
    invite = await pairs.create_invite(session, a)
    await pairs.accept_invite(session, b, invite.token)
    await session.commit()
    return a, b


@pytest.mark.asyncio
async def test_post_mood_includes_new_milestones_key_when_milestone_fires(session, monkeypatch):
    """Fix (b): POST /api/mood response must expose newMilestones (camelCase).

    Threshold is MOOD_MUTUAL_THRESHOLDS = (7,). We monkeypatch the mutual-day
    counter to return 7 so the next POST /api/mood crosses it (the SQLite CAST
    AS DATE path is a separate concern outside this cluster's scope).
    """
    from pairly.repositories import mood as mood_repo

    a, b = await _make_pair(session, 100, 101)

    async def fake_count_mutual_mood_days(_session, *, pair_id):
        return 7

    monkeypatch.setattr(mood_repo, "count_mutual_mood_days", fake_count_mutual_mood_days)

    client = _client_for(a, session)
    resp = client.post("/api/mood", json={"mood": "сияю", "note": None})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    # Without the fix, response_model=MoodEntryOut would silently strip this.
    assert "newMilestones" in body, f"newMilestones missing: {list(body.keys())}"
    assert any(m["kind"] == "mood_mutual_count" and m["value"] == 7 for m in body["newMilestones"])


@pytest.mark.asyncio
async def test_pair_stats_includes_new_milestones_key_on_together_days(session):
    """Fix (b): GET /api/pair/stats response must expose newMilestones.

    Seed a pair whose created_at is 30 days ago — the 30-day threshold is the
    smallest of TOGETHER_DAYS_THRESHOLDS, so it always fires on the first fetch.
    """
    from datetime import UTC, datetime, timedelta

    from pairly.db.models import Pair

    a, b = await _make_pair(session, 102, 103)
    # Backdate the pair by 30+ days so the 30-day threshold trips.
    pair_obj = await session.get(Pair, a.pair_id)
    pair_obj.created_at = datetime.now(UTC) - timedelta(days=31)
    await session.commit()

    client = _client_for(a, session)
    body = client.get("/api/pair/stats").json()
    assert "newMilestones" in body, f"newMilestones missing: {list(body.keys())}"
    assert any(
        m["kind"] == "together_days" and m["value"] == 30 for m in body["newMilestones"]
    )


@pytest.mark.asyncio
async def test_mark_done_returns_409_on_pending_item(session):
    """Fix (c): /api/mark-done on a PENDING item must return 409 (not 500).

    PENDING can only leave via approve_item (two-tap). Skipping the partner's
    consent by trying to mark-done directly is the regression the fix closes.
    """
    from pairly.db.models import WishlistItem, WishlistStatus
    from pairly.repositories import wishlist as wl_repo

    a, b = await _make_pair(session, 110, 111)
    # Create an item and force its status to PENDING (as if a bot-forwarded it).
    item = await wl_repo.create_item(
        session, pair_id=a.pair_id, user_id=a.id, title="Кафе"
    )
    item.status = WishlistStatus.PENDING
    await session.flush()
    await session.commit()
    # Sanity: the row is in PENDING.
    assert item.status == WishlistStatus.PENDING

    client = _client_for(a, session)
    resp = client.post("/api/mark-done", json={"item_id": item.id})
    assert resp.status_code == 409, f"expected 409, got {resp.status_code} body={resp.text}"
    assert "illegal" in resp.text or "PENDING" in resp.text


@pytest.mark.asyncio
async def test_wishlist_status_returns_409_on_illegal_transition(session):
    """Fix (c): /api/wishlist/{id}/status on an illegal transition → 409.

    DONE -> OPEN is not in ALLOWED; the previous code raised WishlistStateError
    without catching, leaking as 500. The fix maps it to 409.
    """
    from pairly.db.models import WishlistStatus
    from pairly.repositories import wishlist as wl_repo

    a, b = await _make_pair(session, 112, 113)
    item = await wl_repo.create_item(
        session, pair_id=a.pair_id, user_id=a.id, title="Пицца"
    )
    item.status = WishlistStatus.DONE
    await session.flush()
    await session.commit()

    client = _client_for(a, session)
    resp = client.post(
        f"/api/wishlist/{item.id}/status", json={"status": "open"}
    )
    assert resp.status_code == 409, f"expected 409, got {resp.status_code} body={resp.text}"


@pytest.mark.asyncio
async def test_post_wishlist_sets_mine_true_for_author(session):
    """Fix (e): POST /api/wishlist must mark the author's item with mine=True."""
    a, b = await _make_pair(session, 120, 121)
    client = _client_for(a, session)
    resp = client.post("/api/wishlist", json={"title": "Суши"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body.get("mine") is True, f"expected mine=True, got body={body}"


@pytest.mark.asyncio
async def test_mark_done_sets_mine_true_for_author(session):
    """Fix (e): /api/mark-done must mark the author's item with mine=True."""
    from pairly.repositories import wishlist as wl_repo

    a, b = await _make_pair(session, 122, 123)
    item = await wl_repo.create_item(
        session, pair_id=a.pair_id, user_id=a.id, title="Пицца"
    )
    await session.commit()

    client = _client_for(a, session)
    resp = client.post("/api/mark-done", json={"item_id": item.id})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body.get("mine") is True, f"expected mine=True, got body={body}"


@pytest.mark.asyncio
async def test_gift_completed_milestone_persists(session):
    """Fix (a): transitioning a gift to COMPLETE must persist the gift_completed milestone.

    We seed 14 already-COMPLETE gifts so the 15th transition (crossing the
    GIFT_COMPLETED_THRESHOLDS = (5, 15) ceiling of 15) fires the milestone.
    Pre-fix: the milestone row was flushed but never committed, so a follow-up
    query couldn't see it.
    """
    from pairly.db.models import GiftItem, GiftStatus, PairMilestone
    from pairly.repositories import gifts as gifts_repo
    from sqlalchemy import select

    a, b = await _make_pair(session, 130, 131)

    # Seed 14 gifts already in COMPLETE — `count_completed` reads from the table.
    for i in range(14):
        g = GiftItem(
            pair_id=a.pair_id,
            giver_id=a.id,
            receiver_id=b.id,
            gesture=f"seed-{i}",
            status=GiftStatus.COMPLETE,
        )
        session.add(g)
    await session.commit()
    assert await gifts_repo.count_completed(session, pair_id=a.pair_id) == 14

    # Drive a NEW gift through the lifecycle.
    gift = await gifts_repo.create_gift(
        session, pair_id=a.pair_id, giver_id=a.id, gesture="Завтрак"
    )
    await gifts_repo.transition(
        session, pair_id=a.pair_id, user_id=b.id, gift_id=gift.id,
        to=GiftStatus.CLAIMED,
    )
    await gifts_repo.transition(
        session, pair_id=a.pair_id, user_id=a.id, gift_id=gift.id,
        to=GiftStatus.REDEEMED,
    )
    await session.commit()

    # Final transition via the API route. The check_gift_completed call inside
    # gift_transition flushes a new milestone row; the fix commits it.
    client = _client_for(a, session)
    resp = client.post(
        f"/api/gifts/{gift.id}/transition", json={"status": "complete"}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    # newMilestones must be present (response_model was removed; the dict is
    # returned as-is).
    assert "newMilestones" in body, f"newMilestones missing: {list(body.keys())}"
    assert any(
        m["kind"] == "gift_completed_count" and m["value"] == 15
        for m in body["newMilestones"]
    )
    # The milestone row must actually be persisted — before the fix it was
    # flushed inside the route but never committed, so this query returned [].
    rows = (
        await session.execute(
            select(PairMilestone).where(
                PairMilestone.pair_id == a.pair_id,
                PairMilestone.kind == "gift_completed_count",
                PairMilestone.value == 15,
            )
        )
    ).scalars().all()
    assert rows, "gift_completed=15 milestone not committed"
