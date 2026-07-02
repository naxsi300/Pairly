"""Question of the Day repository — pair-scoped, with the HARD reveal-gate invariant.

INVARIANT: a partner may read the other's answer ONLY after posting their own.
This is enforced in `partner_answer()`: it returns the partner's answer only if the
caller has already answered the same (pair, question, day). Otherwise None.
Never raise here for the gate — return None so the caller shows "waiting for you".
"""

from __future__ import annotations

from datetime import UTC, datetime, time
from datetime import date as date_type

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from pairly.db.models import QOTDAnswer, QOTDQuestion
from pairly.repositories.base import _require_membership

ANSWER_MAX_CHARS = 280


def utc_today_start() -> datetime:
    """Return midnight (00:00:00) UTC for the current day.

    Used as a UTC-day window boundary for QOTD answer queries so a 30-day
    recurring question does not surface last month's answer as "today's".
    """
    now = datetime.now(UTC)
    return datetime.combine(now.date(), time.min, tzinfo=UTC)


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
    today_start = utc_today_start()
    existing = await session.scalar(
        select(QOTDAnswer).where(
            QOTDAnswer.pair_id == pair_id,
            QOTDAnswer.user_id == user_id,
            QOTDAnswer.question_id == question_id,
            # Day-scope: same-day re-answer updates in place; on a new day
            # no row is found and a fresh one is inserted (history preserved).
            QOTDAnswer.answer_date >= today_start,
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
            QOTDAnswer.answer_date >= utc_today_start(),
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
            # Day-scope: keeps the reveal gate closed against the partner's
            # 30-day-old body when the same question recurs.
            QOTDAnswer.answer_date >= utc_today_start(),
        )
    )


async def partner_has_answered(
    session: AsyncSession, *, pair_id: str, user_id: str, question_id: str
) -> bool:
    """Whether the partner has answered today's question — WITHOUT leaking the body.

    Unlike partner_answer(), this never returns the body, so it is safe to expose
    regardless of the reveal gate. The UI uses it to show "waiting for partner" vs
    "partner answered". Note: a caller who hasn't answered yet still gets a truthful
    yes/no here — but only the *fact* of answering, never the *content*. The content
    remains gated behind partner_answer().
    """
    await _require_membership(session, pair_id, user_id)
    from pairly.repositories.base import pair_members

    members = await pair_members(session, pair_id)
    partner_ids = [m.id for m in members if m.id != user_id]
    if not partner_ids:
        return False
    partner_id = partner_ids[0]
    found = await session.scalar(
        select(QOTDAnswer.id).where(
            QOTDAnswer.pair_id == pair_id,
            QOTDAnswer.user_id == partner_id,
            QOTDAnswer.question_id == question_id,
            QOTDAnswer.answer_date >= utc_today_start(),
        )
    )
    return found is not None


async def list_answered_qotd(
    session: AsyncSession,
    *,
    pair_id: str,
    user_id: str,
    limit: int = 50,
) -> list[dict]:
    """Read-only QOTD archive: Q&As BOTH partners in this pair have answered.

    Returns rows shaped as {date, question_text, my_answer, partner_answer},
    newest-first, capped at `limit`. The reveal-gate does NOT apply here: this
    is a HISTORY view, so once both answers exist on a (pair, question, day)
    we expose both bodies to the viewer unconditionally.

    Anti-pair-leak: membership is enforced up-front via _require_membership
    (raises PairAccessError → 403) and ALL QOTDAnswer rows are then filtered
    by pair_id. A different pair's answers cannot leak in even if the queries
    are mis-composed.

    One-sided answers (only I answered, only partner answered) are NOT
    returned — by design, this is the "we both answered" archive that the FE
    history sheet consumes.
    """
    await _require_membership(session, pair_id, user_id)

    # Resolve the partner's user_id once so we can match "both answered".
    from pairly.repositories.base import pair_members

    members = await pair_members(session, pair_id)
    partner_id = next((m.id for m in members if m.id != user_id), None)
    if partner_id is None:
        # Solo (shouldn't happen for a pair, but be safe) -> no archive.
        return []

    # 1. Find (pair, question) groups where BOTH partners have at least one
    #    answer. We collapse multiple same-day rows by grouping on the date,
    #    so the per-(pair, question, user, day) unique-constraint repeats
    #    (rare, but possible via same-day re-answers) don't double-count.
    #
    #    step_key = (question_id, answer_date::date) — two-step composite key.
    #    We then keep only step_keys where the DISTINCT user_id count == 2.
    qid = QOTDAnswer.question_id
    pair_fk = QOTDAnswer.pair_id
    uid_col = QOTDAnswer.user_id
    answer_date = QOTDAnswer.answer_date

    # Subquery: per (question_id, day) → distinct users answering + date.
    day_bucket = func.date(answer_date).label("day")
    both_answered_keys = (
        select(
            qid.label("question_id"),
            day_bucket,
            func.count(func.distinct(uid_col)).label("u_count"),
        )
        .where(pair_fk == pair_id, uid_col.in_([user_id, partner_id]))
        .group_by(qid, day_bucket)
        .having(func.count(func.distinct(uid_col)) == 2)
        .subquery()
    )

    # 2. Fetch THIS user's body for each (question_id, day) bucket. We pick
    #    the latest answer_date (in case of same-day re-answers, both rows
    #    collapse to the most-recent one — the user-facing body).
    my_subq = (
        select(
            qid.label("question_id"),
            func.date(answer_date).label("day"),
            func.max(answer_date).label("max_date_me"),
        )
        .where(pair_fk == pair_id, uid_col == user_id)
        .group_by(qid, func.date(answer_date))
        .subquery()
    )
    # Join back to get the body.
    my_body = (
        select(
            QOTDAnswer.question_id.label("question_id"),
            func.date(QOTDAnswer.answer_date).label("day"),
            QOTDAnswer.body.label("my_body"),
        )
        .join(
            my_subq,
            and_(
                QOTDAnswer.question_id == my_subq.c.question_id,
                func.date(QOTDAnswer.answer_date) == my_subq.c.day,
                QOTDAnswer.answer_date == my_subq.c.max_date_me,
                QOTDAnswer.user_id == user_id,
            ),
        )
        .subquery()
    )

    # 3. Same again for the partner.
    partner_subq = (
        select(
            qid.label("question_id"),
            func.date(answer_date).label("day"),
            func.max(answer_date).label("max_date_partner"),
        )
        .where(pair_fk == pair_id, uid_col == partner_id)
        .group_by(qid, func.date(answer_date))
        .subquery()
    )
    partner_body = (
        select(
            QOTDAnswer.question_id.label("question_id"),
            func.date(QOTDAnswer.answer_date).label("day"),
            QOTDAnswer.body.label("partner_body"),
        )
        .join(
            partner_subq,
            and_(
                QOTDAnswer.question_id == partner_subq.c.question_id,
                func.date(QOTDAnswer.answer_date) == partner_subq.c.day,
                QOTDAnswer.answer_date == partner_subq.c.max_date_partner,
                QOTDAnswer.user_id == partner_id,
            ),
        )
        .subquery()
    )

    # 4. Stitch them together on (question_id, day). Order newest-first and
    #    trim to `limit`. We project the day-bucket date as the response
    #    `date` so both rows from the same day collapse into one archive row.
    rows = (
        await session.execute(
            select(
                QOTDQuestion.text.label("question_text"),
                my_body.c.day.label("date"),
                my_body.c.my_body,
                partner_body.c.partner_body,
            )
            .join(my_body, my_body.c.question_id == QOTDQuestion.id)
            .join(
                partner_body,
                and_(
                    partner_body.c.question_id == my_body.c.question_id,
                    partner_body.c.day == my_body.c.day,
                ),
            )
            .where(
                my_body.c.question_id.in_(
                    select(both_answered_keys.c.question_id).where(
                        both_answered_keys.c.day == my_body.c.day
                    )
                )
            )
            .order_by(my_body.c.day.desc(), my_body.c.question_id)
            .limit(limit)
        )
    ).all()

    return [
        {
            # SQLite returns func.date() as a Python `date`; Postgres returns
            # `datetime`. Normalize both to a tz-aware UTC midnight datetime
            # so the API contract is stable (Pydantic QOTDArchiveOut.date is
            # `datetime`).
            "date": _to_utc_midnight(row.date),
            "question_text": row.question_text,
            "my_answer": row.my_body,
            "partner_answer": row.partner_body,
        }
        for row in rows
    ]


def _to_utc_midnight(value: date_type | datetime | str) -> datetime:
    """Coerce a date / datetime / ISO string to a tz-aware UTC midnight datetime.

    SQLite + aiosqlite commonly returns `func.date()` as a plain ISO-8601
    string ("2026-06-29"), Postgres returns a `datetime.date`. Both should
    collapse to a tz-aware midnight UTC so the API contract is uniform.
    """
    if isinstance(value, str):
        # aiosqlite path: "YYYY-MM-DD" or "YYYY-MM-DD HH:MM:SS" / "YYYY-MM-DDTHH:MM:SS[.ffffff]"
        d = datetime.fromisoformat(value.replace("T", " "))
        return datetime.combine(d.date(), time.min, tzinfo=UTC)
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return datetime.combine(value.date(), time.min, tzinfo=UTC)
    # Plain date.
    return datetime.combine(value, time.min, tzinfo=UTC)


# Sentinel to make the file importable in isolation during tests; the real
# value of ANSWER_MAX_CHARS is set above.
__all__ = [
    "ANSWER_MAX_CHARS",
    "AnswerTooLongError",
    "list_answered_qotd",
    "my_answer",
    "partner_answer",
    "partner_has_answered",
    "post_answer",
    "todays_question",
    "utc_today_start",
]  # noqa: F401
