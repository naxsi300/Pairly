"""QOTD 30-day rotation: day-scope all four answer queries.

ROOT CAUSE: todays_question() rotates by day-of-year % len(questions). The bank
is exactly 30 questions long, so a question_id recurs every 30 days. Without a
UTC-day window on the four answer queries, a 30-day-old answer row is returned
as "today's" answer — which (a) reveals the partner's 30-day-old body through
the reveal gate, and (b) causes post_answer to mutate a historic row instead of
creating a new one.

These tests pin the FORWARD-ONLY fix: a 31-day-old row must be invisible to
all four queries, and a same-day re-answer must UPDATE in place, but a
next-day re-answer must INSERT a new row (preserving history, never
overwriting).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from pairly.db.models import QOTDAnswer
from pairly.repositories import pairs, qotd, users
from sqlalchemy import select


async def _pair(session, tg_a: int, tg_b: int):
    a = await users.get_or_create_user(session, tg_a, display_name=f"u{tg_a}")
    b = await users.get_or_create_user(session, tg_b, display_name=f"u{tg_b}")
    invite = await pairs.create_invite(session, a)
    await pairs.accept_invite(session, b, invite.token)
    await session.commit()
    return a, b


async def _seed_old_answer(
    session, *, pair_id: str, user_id: str, question_id: str, body: str, days_ago: int
) -> QOTDAnswer:
    """Insert a QOTDAnswer directly with answer_date N days ago (bypasses day-window)."""
    when = datetime.now(UTC) - timedelta(days=days_ago)
    row = QOTDAnswer(
        pair_id=pair_id,
        user_id=user_id,
        question_id=question_id,
        body=body,
        answer_date=when,
    )
    session.add(row)
    await session.commit()
    return row


@pytest.mark.asyncio
async def test_my_answer_ignores_rows_outside_today(session):
    """A 31-day-old answer for user A on question Q must NOT surface as my_answer()."""
    a, _ = await _pair(session, 100, 200)
    question = await qotd.todays_question(session)
    assert question is not None

    await _seed_old_answer(
        session, pair_id=a.pair_id, user_id=a.id, question_id=question.id,
        body="thirty-one-day-old answer", days_ago=31,
    )

    mine = await qotd.my_answer(
        session, pair_id=a.pair_id, user_id=a.id, question_id=question.id
    )
    assert mine is None, "my_answer() leaked a 31-day-old row as 'today'"


@pytest.mark.asyncio
async def test_partner_answer_gate_stays_closed_on_recurrence(session):
    """RECURRENCE LEAK: when Q recurs after 30 days, A's old answer must NOT be readable by B
    through the reveal gate (even after B posts today's answer)."""
    a, b = await _pair(session, 101, 201)
    question = await qotd.todays_question(session)
    assert question is not None

    # A's old answer to the same question_id from 31 days ago.
    await _seed_old_answer(
        session, pair_id=a.pair_id, user_id=a.id, question_id=question.id,
        body="A's 31-day-old secret", days_ago=31,
    )

    # B has NOT answered today and partner_answer must be None (gate closed).
    partner_view = await qotd.partner_answer(
        session, pair_id=b.pair_id, user_id=b.id, question_id=question.id
    )
    assert partner_view is None

    # B posts their answer TODAY. The reveal-gate logic then queries for the partner's
    # answer — but only within the UTC-day window, so the 31-day-old A row must be
    # invisible and the result must remain None.
    await qotd.post_answer(
        session, pair_id=b.pair_id, user_id=b.id, question_id=question.id, body="B today"
    )
    await session.commit()

    partner_view = await qotd.partner_answer(
        session, pair_id=b.pair_id, user_id=b.id, question_id=question.id
    )
    assert partner_view is None, (
        "Reveal-gate LEAKED A's 31-day-old body through partner_answer()"
    )


@pytest.mark.asyncio
async def test_partner_has_answered_false_on_recurrence(session):
    """partner_has_answered must report False for a 31-day-old partner row."""
    a, b = await _pair(session, 102, 202)
    question = await qotd.todays_question(session)
    assert question is not None

    await _seed_old_answer(
        session, pair_id=a.pair_id, user_id=a.id, question_id=question.id,
        body="A's old answer", days_ago=31,
    )

    answered = await qotd.partner_has_answered(
        session, pair_id=b.pair_id, user_id=b.id, question_id=question.id
    )
    assert answered is False, "partner_has_answered() returned True for a 31-day-old row"


@pytest.mark.asyncio
async def test_post_answer_on_new_day_inserts_preserves_history(session):
    """post_answer on a 'new' UTC day for a recurring question must INSERT a new row,
    NOT mutate the historic 31-day-old row. History is forward-only."""
    a, _ = await _pair(session, 103, 203)
    question = await qotd.todays_question(session)
    assert question is not None

    historic = await _seed_old_answer(
        session, pair_id=a.pair_id, user_id=a.id, question_id=question.id,
        body="historic body", days_ago=31,
    )

    # A posts today's answer for the same recurring question.
    new = await qotd.post_answer(
        session, pair_id=a.pair_id, user_id=a.id, question_id=question.id,
        body="today's body",
    )
    await session.commit()

    # The historic row must be UNCHANGED (body, answer_date untouched).
    await session.refresh(historic)
    assert historic.body == "historic body"
    # SQLite round-trips tz-aware datetimes as naive UTC; normalize either way.
    ad = historic.answer_date
    if ad.tzinfo is None:
        ad = ad.replace(tzinfo=UTC)
    assert (datetime.now(UTC) - ad).days >= 30

    # There must be exactly TWO rows for (pair, user, question) — one historic, one today.
    rows = (
        await session.execute(
            select(QOTDAnswer).where(
                QOTDAnswer.pair_id == a.pair_id,
                QOTDAnswer.user_id == a.id,
                QOTDAnswer.question_id == question.id,
            )
        )
    ).scalars().all()
    assert len(rows) == 2, f"expected 2 rows (historic + today), got {len(rows)}"
    bodies = {r.body for r in rows}
    assert bodies == {"historic body", "today's body"}

    # The new row returned by post_answer must be the today's one, not the historic one.
    assert new.id != historic.id
    assert new.body == "today's body"


@pytest.mark.asyncio
async def test_post_answer_same_day_still_replaces(session):
    """Same-day re-answer remains a UPDATES-in-place replace (preserves the existing
    same-day contract). Backstop: the new day-window filter must not break this."""
    a, _ = await _pair(session, 104, 204)
    question = await qotd.todays_question(session)
    assert question is not None

    first = await qotd.post_answer(
        session, pair_id=a.pair_id, user_id=a.id, question_id=question.id, body="first"
    )
    await session.commit()
    second = await qotd.post_answer(
        session, pair_id=a.pair_id, user_id=a.id, question_id=question.id, body="second"
    )
    await session.commit()

    assert first.id == second.id
    rows = (
        await session.execute(
            select(QOTDAnswer).where(
                QOTDAnswer.pair_id == a.pair_id,
                QOTDAnswer.user_id == a.id,
                QOTDAnswer.question_id == question.id,
            )
        )
    ).scalars().all()
    assert len(rows) == 1
    assert rows[0].body == "second"
