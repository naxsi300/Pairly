"""QOTD answered-Q&A archive: read-only list of past Q&As BOTH partners answered.

The repository layer returns rows shaped as {date, question_text, my_answer,
partner_answer} — the exact envelope the FE history sheet consumes. Tests cover:
  - membership gate (other pair's rows invisible)
  - both-answered rows surface; one-sided rows do NOT
  - order is newest-first
  - limit trims the tail (so the FE can show "first 50")
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from pairly.api.app import create_app
from pairly.auth import AuthContext, current_auth
from pairly.db.base import get_session
from pairly.db.models import QOTDAnswer
from pairly.repositories import pairs, qotd, users
from sqlalchemy.ext.asyncio import AsyncSession


# --- helpers -----------------------------------------------------------------


async def _pair(session, tg_a: int, tg_b: int):
    a = await users.get_or_create_user(session, tg_a, display_name=f"u{tg_a}")
    b = await users.get_or_create_user(session, tg_b, display_name=f"u{tg_b}")
    invite = await pairs.create_invite(session, a)
    await pairs.accept_invite(session, b, invite.token)
    await session.commit()
    return a, b


async def _seed_past_answers(
    session,
    *,
    pair_id: str,
    user_id: str,
    question_id: str,
    bodies: list[str],
    days_ago_list: list[int],
) -> list[QOTDAnswer]:
    """Insert a QOTDAnswer per body at N days ago. Mirrors test_qotd_rotation."""
    out: list[QOTDAnswer] = []
    for body, days in zip(bodies, days_ago_list):
        row = QOTDAnswer(
            pair_id=pair_id,
            user_id=user_id,
            question_id=question_id,
            body=body,
            answer_date=datetime.now(UTC) - timedelta(days=days),
        )
        session.add(row)
        out.append(row)
    await session.commit()
    return out


# --- repo fn tests -----------------------------------------------------------


@pytest.mark.asyncio
async def test_list_answered_returns_only_both_answered_questions(session):
    """One-sided (caller only OR partner only) questions MUST NOT surface."""
    from pairly.db.models import QOTDQuestion

    a, b = await _pair(session, 1001, 1002)
    question = await qotd.todays_question(session)
    assert question is not None

    # BOTH answered (this surfaces).
    await _seed_past_answers(
        session,
        pair_id=a.pair_id,
        user_id=a.id,
        question_id=question.id,
        bodies=["A shared"],
        days_ago_list=[2],
    )
    await _seed_past_answers(
        session,
        pair_id=a.pair_id,
        user_id=b.id,
        question_id=question.id,
        bodies=["B shared"],
        days_ago_list=[2],
    )

    # ALSO seed a one-sided (A-only) answer for a DIFFERENT question — must
    # NOT surface. Same-day, same caller, no partner reply.
    one_sided_q = QOTDQuestion(text="Только A ответил", category="мечты", is_active=True)
    session.add(one_sided_q)
    await session.commit()
    await _seed_past_answers(
        session,
        pair_id=a.pair_id,
        user_id=a.id,
        question_id=one_sided_q.id,
        bodies=["A only"],
        days_ago_list=[2],
    )

    rows = await qotd.list_answered_qotd(
        session, pair_id=a.pair_id, user_id=a.id, limit=50
    )
    # Only the BOTH-answered row must appear (one-sided "A only" is filtered out).
    assert len(rows) == 1, rows
    r = rows[0]
    assert r["question_text"] == question.text
    # A is the viewer here -> my=A's body, partner=B's body.
    assert r["my_answer"] == "A shared"
    assert r["partner_answer"] == "B shared"
    assert isinstance(r["date"], datetime)


@pytest.mark.asyncio
async def test_list_answered_orders_newest_first(session):
    """Multiple both-answered questions: newest first (descending answer_date)."""
    a, b = await _pair(session, 1003, 1004)
    question = await qotd.todays_question(session)
    assert question is not None

    # First a 5-days-ago pair, then a 1-day-ago pair.
    for days_ago_a, days_ago_b, body_a, body_b in [
        (5, 5, "old A", "old B"),
        (1, 1, "new A", "new B"),
    ]:
        await _seed_past_answers(
            session,
            pair_id=a.pair_id,
            user_id=a.id,
            question_id=question.id,
            bodies=[body_a],
            days_ago_list=[days_ago_a],
        )
        await _seed_past_answers(
            session,
            pair_id=a.pair_id,
            user_id=b.id,
            question_id=question.id,
            bodies=[body_b],
            days_ago_list=[days_ago_b],
        )

    rows = await qotd.list_answered_qotd(
        session, pair_id=a.pair_id, user_id=a.id, limit=50
    )
    assert len(rows) == 2, rows
    # Newest first -> the 1-day-ago row is rows[0].
    assert rows[0]["my_answer"] == "new A"
    assert rows[0]["partner_answer"] == "new B"
    assert rows[1]["my_answer"] == "old A"
    assert rows[1]["partner_answer"] == "old B"


@pytest.mark.asyncio
async def test_list_answered_respects_limit(session):
    """limit trims the tail — newest-first still applies."""
    a, b = await _pair(session, 1005, 1006)
    question = await qotd.todays_question(session)
    assert question is not None

    # 5 both-answered entries spanning distinct days.
    bodies = [f"A d{d}" for d in range(5)]
    bodies_b = [f"B d{d}" for d in range(5)]
    for body, body_b, d in zip(bodies, bodies_b, range(5)):
        await _seed_past_answers(
            session,
            pair_id=a.pair_id,
            user_id=a.id,
            question_id=question.id,
            bodies=[body],
            days_ago_list=[d],
        )
        await _seed_past_answers(
            session,
            pair_id=a.pair_id,
            user_id=b.id,
            question_id=question.id,
            bodies=[body_b],
            days_ago_list=[d],
        )

    rows = await qotd.list_answered_qotd(
        session, pair_id=a.pair_id, user_id=a.id, limit=3
    )
    assert len(rows) == 3, rows
    # d=0 is "today" relative to days_ago=0, but we also want at least the
    # 1-day and 2-day entries. Newest-first -> d=0, d=1, d=2.
    assert rows[0]["my_answer"] == "A d0"
    assert rows[1]["my_answer"] == "A d1"
    assert rows[2]["my_answer"] == "A d2"


@pytest.mark.asyncio
async def test_list_answered_other_pair_invisible(session):
    """A user's call must never surface rows from a different pair (membership gate)."""
    a, _b = await _pair(session, 1007, 1008)
    other_a, _other_b = await _pair(session, 1009, 1010)
    question = await qotd.todays_question(session)
    assert question is not None

    # Seed rows for the OTHER pair (both answered).
    await _seed_past_answers(
        session,
        pair_id=other_a.pair_id,
        user_id=other_a.id,
        question_id=question.id,
        bodies=["their A"],
        days_ago_list=[1],
    )

    # The first user's perspective: the OTHER pair's row MUST NOT appear.
    rows = await qotd.list_answered_qotd(
        session, pair_id=a.pair_id, user_id=a.id, limit=50
    )
    assert rows == [], rows


# --- endpoint tests ---------------------------------------------------------


def _client_for(user, session: AsyncSession) -> TestClient:
    """Inline FastAPI TestClient with auth/session overrides (mirrors wishlist archive test)."""
    app = create_app()

    async def _auth():
        return AuthContext(user=user, raw_user={}, dev_mode=True)

    async def _sess():
        yield session

    app.dependency_overrides[current_auth] = _auth
    app.dependency_overrides[get_session] = _sess
    return TestClient(app)


@pytest.mark.asyncio
async def test_qotd_archive_endpoint_returns_paired_rows_camelcased(session):
    """The endpoint emits camelCase rows matching QOTDArchiveOut."""
    a, b = await _pair(session, 1011, 1012)
    question = await qotd.todays_question(session)
    assert question is not None

    await _seed_past_answers(
        session,
        pair_id=a.pair_id,
        user_id=a.id,
        question_id=question.id,
        bodies=["A shared"],
        days_ago_list=[2],
    )
    await _seed_past_answers(
        session,
        pair_id=a.pair_id,
        user_id=b.id,
        question_id=question.id,
        bodies=["B shared"],
        days_ago_list=[2],
    )

    client = _client_for(a, session)
    body = client.get("/api/qotd/archive").json()
    assert isinstance(body, list)
    assert len(body) == 1
    row = body[0]
    # camelCase keys — QOTDArchiveOut emits questionText/date/myAnswer/partnerAnswer.
    assert "questionText" in row
    assert "myAnswer" in row
    assert "partnerAnswer" in row
    assert "date" in row
    assert row["questionText"] == question.text
    assert row["myAnswer"] == "A shared"
    assert row["partnerAnswer"] == "B shared"


@pytest.mark.asyncio
async def test_qotd_archive_endpoint_412_for_unpaired(session):
    """An unpaired user hitting /api/qotd/archive gets 412 (pair up first)."""
    # Create only one user, no pair — they're unpaired.
    from pairly.repositories import users as users_repo

    solo = await users_repo.get_or_create_user(session, 50001, display_name="solo")
    await session.commit()

    client = _client_for(solo, session)
    resp = client.get("/api/qotd/archive")
    assert resp.status_code == 412, resp.text
