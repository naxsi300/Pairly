"""Mood repository — pair-scoped, latest-only (privacy-by-design).

No history graph, no streak, no score. A mood fades to "no mood set" after 24h — that
fade is computed at read time (a stale row isn't returned as "current").
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pairly.db.models import MoodEntry
from pairly.repositories.base import _require_membership

# Exactly 5 moods (Russian labels). See docs/copy/mood-sync.md.
VALID_MOODS = {"сияю", "хорошо", "ровно", "так себе", "паршиво"}
_MOOD_TTL = timedelta(hours=24)


class InvalidMoodError(Exception):
    """Raised when a mood value isn't one of the 5 fixed labels."""


def _is_stale(set_at: datetime) -> bool:
    now = datetime.now(UTC)
    at = set_at if set_at.tzinfo else set_at.replace(tzinfo=UTC)
    return now - at > _MOOD_TTL


async def set_mood(
    session: AsyncSession,
    *,
    pair_id: str,
    user_id: str,
    mood: str,
    note: str | None = None,
) -> MoodEntry:
    """Set the caller's current mood. Overwrites any previous mood by the same user."""
    await _require_membership(session, pair_id, user_id)
    if mood not in VALID_MOODS:
        raise InvalidMoodError(mood)
    if note is not None:
        note = note.strip()[:60] or None

    # Latest-only: replace any existing row for this user in the pair.
    existing = await session.scalar(
        select(MoodEntry).where(
            MoodEntry.pair_id == pair_id, MoodEntry.user_id == user_id
        )
    )
    if existing is not None:
        existing.mood = mood
        existing.note = note
        existing.set_at = datetime.now(UTC)
        await session.flush()
        return existing

    entry = MoodEntry(pair_id=pair_id, user_id=user_id, mood=mood, note=note)
    session.add(entry)
    await session.flush()
    return entry


async def clear_mood(
    session: AsyncSession, *, pair_id: str, user_id: str
) -> None:
    await _require_membership(session, pair_id, user_id)
    existing = await session.scalar(
        select(MoodEntry).where(
            MoodEntry.pair_id == pair_id, MoodEntry.user_id == user_id
        )
    )
    if existing is not None:
        await session.delete(existing)
        await session.flush()


async def current_moods(
    session: AsyncSession, *, pair_id: str, user_id: str
) -> dict[str, MoodEntry | None]:
    """Both partners' current moods (latest-only, 24h-faded = None).

    Keyed by user_id. The caller sees their own + partner's latest non-stale mood.
    """
    await _require_membership(session, pair_id, user_id)
    from pairly.repositories.base import pair_members

    members = await pair_members(session, pair_id)
    result = {m.id: None for m in members}
    rows = await session.scalars(
        select(MoodEntry).where(MoodEntry.pair_id == pair_id)
    )
    for entry in rows:
        if entry.user_id in result and not _is_stale(entry.set_at):
            result[entry.user_id] = entry
    return result
