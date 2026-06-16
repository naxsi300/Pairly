"""Repository layer — the security boundary.

INVARIANT (CLAUDE.md "Pair-scoping rule"): every user-data row carries pair_id, and
access is allowed only when the requester's user_id is a member of that pair. This is
enforced HERE, in the repository layer — never at the caller. A handler/service cannot
read or write another pair's data no matter what id it passes.

Usage: every feature repo takes `(session, pair_id, user_id)` on each call. The base
repo resolves membership once via `_require_membership` and refuses otherwise.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pairly.db.models import Pair, User


class PairAccessError(Exception):
    """Raised when a user attempts to access a pair they are not a member of."""


class NotPairedError(Exception):
    """Raised when an operation requires a pair but the user has none."""


async def get_user_pair(session: AsyncSession, user_id: str) -> Pair:
    """Return the user's active pair or raise NotPairedError.

    Use this at the top of any feature entry to gate unpaired users
    ("сначала объединитесь в пару").
    """
    user = await session.get(User, user_id)
    if user is None or user.pair_id is None:
        raise NotPairedError(user_id)
    pair = await session.get(Pair, user.pair_id)
    if pair is None or pair.dissolved_at is not None:
        raise NotPairedError(user_id)
    return pair


async def _require_membership(session: AsyncSession, pair_id: str, user_id: str) -> Pair:
    """Core guard. Returns the pair if user_id is a member; raises PairAccessError otherwise.

    This is the single chokepoint all feature repos call before any read/write.
    """
    user = await session.get(User, user_id)
    if user is None or user.pair_id != pair_id:
        raise PairAccessError(f"user {user_id} is not a member of pair {pair_id}")
    pair = await session.get(Pair, pair_id)
    if pair is None or pair.dissolved_at is not None:
        raise PairAccessError(f"pair {pair_id} does not exist or is dissolved")
    return pair


async def resolve_user_by_tg(session: AsyncSession, tg_id: int) -> User | None:
    """Look up a user by Telegram id (None if not seen yet)."""
    result = await session.execute(select(User).where(User.tg_id == tg_id))
    return result.scalar_one_or_none()


async def pair_members(session: AsyncSession, pair_id: str) -> list[User]:
    """All members of a pair (used for notifications / "both see it" semantics)."""
    result = await session.execute(select(User).where(User.pair_id == pair_id))
    return list(result.scalars().all())
