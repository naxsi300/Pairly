"""Pick a date idea from the pair's open wishlist (the date-wheel backend).

Pure selection logic. Falls back to a canned idea when the wishlist is empty so
the wheel always has an answer. No geo (user-rejected) — only wishlist + mood.
"""

from __future__ import annotations

import secrets
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pairly.db.models import WishlistItem, WishlistStatus


@dataclass(slots=True, frozen=True)
class DateIdea:
    source: str  # "wishlist" | "default"
    title: str
    category: str | None


# Canned ideas (no-DB fallback). Warm, couple-appropriate, no geo.
_DEFAULT_IDEAS: tuple[tuple[str, str], ...] = (
    ("Устроить домашний киновечер с попкорном", "do"),
    ("Сварить вместе что-то новое из того, что давно хотели", "eat"),
    ("Прогуляться без маршрута и зайти в первую уютную кофейню", "do"),
    ("Сыграть в настолку, которую давно не доставали", "do"),
    ("Встретить закат на любимом месте", "do"),
)


async def _open_items(
    session: AsyncSession, pair_id: str, category: str | None
) -> list[WishlistItem]:
    stmt = select(WishlistItem).where(
        WishlistItem.pair_id == pair_id,
        WishlistItem.status == WishlistStatus.OPEN,
    )
    if category and category != "none":
        stmt = stmt.where(WishlistItem.category == category)
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def pick_date_idea(
    session: AsyncSession, *, pair_id: str, category: str | None
) -> DateIdea:
    """Return a single date idea. Prefers an open wishlist item; falls back canned."""
    items = await _open_items(session, pair_id, category)
    if items:
        chosen = secrets.choice(items)
        return DateIdea(source="wishlist", title=chosen.title, category=chosen.category)
    title, cat = _DEFAULT_IDEAS[secrets.randbelow(len(_DEFAULT_IDEAS))]
    return DateIdea(source="default", title=title, category=cat)
