"""Pair + invite-token repository.

`/pair` flow:
  1. An unpaired user runs `/pair` -> create_invite() returns a one-use token.
  2. They share the deep link to their partner.
  3. Partner runs `/pair <token>` -> accept_invite() links both into a new Pair.

Pair creation is NEVER paywalled (CLAUDE.md). Both users default to a FREE pair.
"""

from __future__ import annotations

import secrets
from datetime import UTC

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pairly.config import get_settings
from pairly.db.models import Pair, PairInvite, PairTier, User
from pairly.repositories.base import get_user_pair


class InviteError(Exception):
    """Raised on an invalid/expired/already-used invite."""


async def _generate_token() -> str:
    return secrets.token_urlsafe(get_settings().invite_token_bytes)


async def create_invite(session: AsyncSession, creator: User) -> PairInvite:
    """Create a fresh one-use invite token for an unpaired user.

    The creator must not already be in a pair.
    """
    if creator.pair_id is not None:
        raise InviteError("Вы уже в паре.")
    invite = PairInvite(token=await _generate_token(), created_by=creator.id)
    session.add(invite)
    await session.flush()
    return invite


async def accept_invite(session: AsyncSession, accepter: User, token: str) -> Pair:
    """Consume a token and link accepter + creator into a new pair.

    Rules:
    - token must exist, be unconsumed.
    - accepter must not already be paired.
    - accepter must not be the creator (no self-pairing).
    - creator must still be unpaired when consumed.
    """
    if accepter.pair_id is not None:
        raise InviteError("Вы уже в паре.")

    invite = await session.scalar(select(PairInvite).where(PairInvite.token == token))
    if invite is None:
        raise InviteError("Приглашение не найдено.")
    if invite.consumed_by is not None or invite.consumed_at is not None:
        raise InviteError("Это приглашение уже использовано.")

    creator = await session.get(User, invite.created_by)
    if creator is None:
        raise InviteError("Автор приглашения не найден.")
    if creator.id == accepter.id:
        raise InviteError("Нельзя объединиться с самим собой.")
    if creator.pair_id is not None:
        raise InviteError("Автор приглашения уже в паре.")

    pair = Pair(tier=PairTier.FREE)
    session.add(pair)
    await session.flush()

    creator.pair_id = pair.id
    accepter.pair_id = pair.id
    invite.consumed_by = accepter.id
    invite.consumed_at = invite.consumed_at  # set below via flush + utcnow default

    # Mark consumed explicitly (default only fires on insert).
    from datetime import datetime

    invite.consumed_at = datetime.now(UTC)

    await session.flush()
    return pair


async def dissolve_pair(session: AsyncSession, user_id: str) -> None:
    """Hard-dissolve the caller's pair: both members unlinked, pair marked dissolved.

    Per user-stories: deletes are hard-deletes / no soft-delete retention at the app level.
    Cascade on the Pair FK wipes pair-scoped data; we keep the pair row as dissolved for audit.
    """
    pair = await get_user_pair(session, user_id)
    members = await session.scalars(select(User).where(User.pair_id == pair.id))
    for m in members:
        m.pair_id = None
    from datetime import datetime

    pair.dissolved_at = datetime.now(UTC)
    await session.flush()
