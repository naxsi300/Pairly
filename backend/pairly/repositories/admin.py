"""Admin repository — privileged operations.

Callers MUST be gated by the bot's admin check (PAIRLY_ADMIN_TG_IDS) before calling
these functions. The repo itself does not re-check; the audit log is the record.

Public surface:
  - resolve_pair_by_tg_id(session, tg_id) -> (User, Pair) | None
  - grant_pro(session, *, actor_tg_id, target_pair_id, note?) -> Pair
  - revoke_pro(session, *, actor_tg_id, target_pair_id, note?) -> Pair
  - list_pairs(session, *, limit, offset) -> list[(pair, [members])]
  - recent_audit(session, *, limit) -> list[AdminAuditLog]
"""

from __future__ import annotations

import json
from datetime import UTC, datetime

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from pairly.db.models import AdminAuditLog, Pair, PairTier, User


class AdminError(Exception):
    """Raised on illegal admin operations."""


async def resolve_pair_by_tg_id(
    session: AsyncSession, tg_id: int
) -> tuple[User, Pair] | None:
    """Find a User by Telegram id; return (user, pair) if they have a pair, else None."""
    user = await session.scalar(select(User).where(User.tg_id == tg_id))
    if user is None or user.pair_id is None:
        return None
    pair = await session.get(Pair, user.pair_id)
    if pair is None or pair.dissolved_at is not None:
        return None
    return user, pair


async def _audit(
    session: AsyncSession,
    *,
    actor_tg_id: int,
    action: str,
    pair: Pair,
    detail: dict,
) -> None:
    entry = AdminAuditLog(
        actor_tg_id=actor_tg_id,
        action=action,
        target_pair_id=pair.id,
        detail=json.dumps(detail, ensure_ascii=False),
    )
    session.add(entry)


async def grant_pro(
    session: AsyncSession,
    *,
    actor_tg_id: int,
    target_pair_id: str,
    note: str | None = None,
) -> Pair:
    pair = await session.get(Pair, target_pair_id)
    if pair is None or pair.dissolved_at is not None:
        raise AdminError(f"pair {target_pair_id} not found or dissolved")
    previous = pair.tier
    if previous == PairTier.PRO:
        raise AdminError("pair is already Pro")
    pair.tier = PairTier.PRO
    await _audit(
        session,
        actor_tg_id=actor_tg_id,
        action="grant_pro",
        pair=pair,
        detail={"from": previous.value, "note": note, "at": datetime.now(UTC).isoformat()},
    )
    await session.flush()
    return pair


async def revoke_pro(
    session: AsyncSession,
    *,
    actor_tg_id: int,
    target_pair_id: str,
    note: str | None = None,
) -> Pair:
    pair = await session.get(Pair, target_pair_id)
    if pair is None or pair.dissolved_at is not None:
        raise AdminError(f"pair {target_pair_id} not found or dissolved")
    previous = pair.tier
    if previous != PairTier.PRO:
        raise AdminError("pair is not Pro")
    pair.tier = PairTier.FREE
    await _audit(
        session,
        actor_tg_id=actor_tg_id,
        action="revoke_pro",
        pair=pair,
        detail={"from": previous.value, "note": note, "at": datetime.now(UTC).isoformat()},
    )
    await session.flush()
    return pair


async def list_pairs(
    session: AsyncSession, *, limit: int = 20, offset: int = 0
) -> list[tuple[Pair, list[User]]]:
    """Most recent first, paired with their members."""
    pairs_q = await session.execute(
        select(Pair).order_by(desc(Pair.created_at)).offset(offset).limit(limit)
    )
    pairs = list(pairs_q.scalars().all())
    if not pairs:
        return []
    members_by_pair: dict[str, list[User]] = {p.id: [] for p in pairs}
    members_q = await session.execute(
        select(User).where(User.pair_id.in_([p.id for p in pairs]))
    )
    for u in members_q.scalars():
        if u.pair_id in members_by_pair:
            members_by_pair[u.pair_id].append(u)
    return [(p, members_by_pair[p.id]) for p in pairs]


async def recent_audit(session: AsyncSession, *, limit: int = 20) -> list[AdminAuditLog]:
    result = await session.execute(
        select(AdminAuditLog).order_by(desc(AdminAuditLog.created_at)).limit(limit)
    )
    return list(result.scalars().all())


async def pair_counts(session: AsyncSession) -> dict[str, int]:
    """Counts of pairs by tier and dissolved state. For the admin dashboard."""
    out: dict[str, int] = {"total": 0, "pro": 0, "free": 0, "dissolved": 0}
    rows = await session.execute(
        select(Pair.tier, Pair.dissolved_at, func.count(Pair.id)).group_by(
            Pair.tier, Pair.dissolved_at
        )
    )
    for tier, dissolved, count in rows:
        out["total"] += count
        if dissolved is not None:
            out["dissolved"] += count
        elif tier == PairTier.PRO:
            out["pro"] += count
        else:
            out["free"] += count
    return out
