"""Love-notes repository — pair-scoped warm notes with delivery + read receipts.

Membership-enforced. A note is created by one partner; the recipient reads it.
No geo, no spam — delivery is Telegram-native (bot) at an optional HH:MM hint.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pairly.bot.text import truncate_graphemes
from pairly.db.models import LoveNote
from pairly.repositories.base import _require_membership

_MAX_BODY = 1000
_MAX_DELIVER_LEN = 5  # "HH:MM"


async def create_note(
    session: AsyncSession,
    *,
    pair_id: str,
    user_id: str,
    body: str,
    deliver_at: str | None = None,
) -> LoveNote:
    """Create a love note. ``deliver_at`` is an optional 'HH:MM' hint."""
    await _require_membership(session, pair_id, user_id)
    clean = truncate_graphemes(body.strip(), _MAX_BODY)
    da = None
    if deliver_at:
        da = deliver_at.strip()[:_MAX_DELIVER_LEN] or None
    note = LoveNote(
        pair_id=pair_id,
        created_by=user_id,
        body=clean,
        deliver_at=da,
    )
    session.add(note)
    await session.flush()
    return note


async def list_notes(
    session: AsyncSession, *, pair_id: str, user_id: str
) -> list[LoveNote]:
    """List a pair's notes, membership-enforced. Newest first."""
    await _require_membership(session, pair_id, user_id)
    stmt = select(LoveNote).where(LoveNote.pair_id == pair_id)
    stmt = stmt.order_by(LoveNote.created_at.desc())
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def mark_read(
    session: AsyncSession, *, pair_id: str, user_id: str, note_id: str
) -> LoveNote:
    """Mark a note as read by the recipient. Raises LookupError if absent."""
    await _require_membership(session, pair_id, user_id)
    note = await session.get(LoveNote, note_id)
    if note is None or note.pair_id != pair_id:
        raise LookupError(note_id)
    if note.created_by != user_id:
        note.read_by_recipient = True
    await session.flush()
    return note


__all__ = ["LoveNote", "create_note", "list_notes", "mark_read"]
