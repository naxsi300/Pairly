"""QOTD reveal-gate — THE load-bearing privacy test for the daily question.

A partner's answer must NEVER be readable before the caller posts their own.
partner_answer() returns None both when the caller hasn't answered AND when the partner
hasn't — indistinguishable by design.
"""

from __future__ import annotations

import pytest
from pairly.repositories import pairs, qotd, users
from pairly.repositories.qotd import AnswerTooLongError


async def _pair(session, tg_a: int, tg_b: int):
    a = await users.get_or_create_user(session, tg_a, display_name=f"u{tg_a}")
    b = await users.get_or_create_user(session, tg_b, display_name=f"u{tg_b}")
    invite = await pairs.create_invite(session, a)
    await pairs.accept_invite(session, b, invite.token)
    await session.commit()
    return a, b


@pytest.mark.asyncio
async def test_partner_answer_hidden_until_i_answer(session):
    """HARD GATE: B can't read A's answer until B posts their own."""
    a, b = await _pair(session, 1, 2)
    question = await qotd.todays_question(session)
    assert question is not None

    # A answers first.
    await qotd.post_answer(
        session, pair_id=a.pair_id, user_id=a.id, question_id=question.id, body="A's secret"
    )
    await session.commit()

    # B has NOT answered -> partner_answer (A's) MUST be None, even though A answered.
    a_view_for_b = await qotd.partner_answer(
        session, pair_id=b.pair_id, user_id=b.id, question_id=question.id
    )
    assert a_view_for_b is None

    # B answers now.
    await qotd.post_answer(
        session, pair_id=b.pair_id, user_id=b.id, question_id=question.id, body="B's answer"
    )
    await session.commit()

    # NOW B can read A's answer.
    a_view_for_b = await qotd.partner_answer(
        session, pair_id=b.pair_id, user_id=b.id, question_id=question.id
    )
    assert a_view_for_b is not None
    assert a_view_for_b.body == "A's secret"


@pytest.mark.asyncio
async def test_answer_too_long_rejected(session):
    a, _ = await _pair(session, 3, 4)
    question = await qotd.todays_question(session)
    with pytest.raises(AnswerTooLongError):
        await qotd.post_answer(
            session, pair_id=a.pair_id, user_id=a.id, question_id=question.id,
            body="x" * (qotd.ANSWER_MAX_CHARS + 1),
        )


@pytest.mark.asyncio
async def test_reanswering_same_day_replaces(session):
    a, _ = await _pair(session, 5, 6)
    question = await qotd.todays_question(session)
    await qotd.post_answer(
        session, pair_id=a.pair_id, user_id=a.id, question_id=question.id, body="first"
    )
    await qotd.post_answer(
        session, pair_id=a.pair_id, user_id=a.id, question_id=question.id, body="second"
    )
    await session.commit()
    mine = await qotd.my_answer(
        session, pair_id=a.pair_id, user_id=a.id, question_id=question.id
    )
    assert mine.body == "second"
