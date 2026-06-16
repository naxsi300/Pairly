"""Question of the Day repository — pair-scoped, with the HARD reveal-gate invariant.

INVARIANT: a partner may read the other's answer ONLY after posting their own.
This is enforced in `partner_answer()`: it returns the partner's answer only if the
caller has already answered the same (pair, question, day). Otherwise None.
Never raise here for the gate — return None so the caller shows "waiting for you".
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pairly.db.models import QOTDAnswer, QOTDQuestion
from pairly.repositories.base import _require_membership

ANSWER_MAX_CHARS = 280


class AnswerTooLongError(Exception):
    pass


async def todays_question(session: AsyncSession) -> QOTDQuestion | None:
    """Pick an active question. Simple rotation: the least-recently-asked active one.

    For MVP this is a deterministic pick; a real "don't repeat in 6 months" tracker is
    a v1.1 refinement (the bank is ~1 month of daily questions).
    """
    result = await session.execute(
        select(QOTDQuestion)
        .where(QOTDQuestion.is_active.is_(True))
        .order_by(QOTDQuestion.id)
    )
    questions = result.scalars().all()
    if not questions:
        return None
    # Deterministic rotation by day-of-year so all pairs see the same question on a given day.
    day_index = datetime.now(UTC).timetuple().tm_yday
    return questions[day_index % len(questions)]


async def post_answer(
    session: AsyncSession,
    *,
    pair_id: str,
    user_id: str,
    question_id: str,
    body: str,
) -> QOTDAnswer:
    """Post the caller's own answer for today. Replaces if same-day re-answered."""
    await _require_membership(session, pair_id, user_id)
    body = body.strip()
    if not body:
        raise ValueError("empty answer")
    if len(body) > ANSWER_MAX_CHARS:
        raise AnswerTooLongError(len(body))

    today = datetime.now(UTC)
    existing = await session.scalar(
        select(QOTDAnswer).where(
            QOTDAnswer.pair_id == pair_id,
            QOTDAnswer.user_id == user_id,
            QOTDAnswer.question_id == question_id,
        )
    )
    if existing is not None:
        existing.body = body
        existing.answer_date = today
        await session.flush()
        return existing

    answer = QOTDAnswer(
        pair_id=pair_id,
        user_id=user_id,
        question_id=question_id,
        body=body,
        answer_date=today,
    )
    session.add(answer)
    await session.flush()
    return answer


async def my_answer(
    session: AsyncSession, *, pair_id: str, user_id: str, question_id: str
) -> QOTDAnswer | None:
    await _require_membership(session, pair_id, user_id)
    return await session.scalar(
        select(QOTDAnswer).where(
            QOTDAnswer.pair_id == pair_id,
            QOTDAnswer.user_id == user_id,
            QOTDAnswer.question_id == question_id,
        )
    )


async def partner_answer(
    session: AsyncSession, *, pair_id: str, user_id: str, question_id: str
) -> QOTDAnswer | None:
    """HARD REVEAL-GATE: return the partner's answer ONLY if the caller has answered.

    Returns None if (a) the caller hasn't answered, or (b) the partner hasn't answered.
    The caller cannot distinguish these two cases from the return value alone — by design,
    so the UI always shows "answer first to reveal" until the caller posts their own.
    """
    await _require_membership(session, pair_id, user_id)
    mine = await my_answer(session, pair_id=pair_id, user_id=user_id, question_id=question_id)
    if mine is None:
        return None  # caller hasn't answered -> gate closed.

    from pairly.repositories.base import pair_members

    members = await pair_members(session, pair_id)
    partner_ids = [m.id for m in members if m.id != user_id]
    if not partner_ids:
        return None  # solo (shouldn't happen for a pair, but be safe).

    partner_id = partner_ids[0]
    return await session.scalar(
        select(QOTDAnswer).where(
            QOTDAnswer.pair_id == pair_id,
            QOTDAnswer.user_id == partner_id,
            QOTDAnswer.question_id == question_id,
        )
    )
