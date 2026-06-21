"""Pick a date idea from the pair's open wishlist (the date-wheel backend).

Pure selection logic. Falls back to a canned idea when the wishlist is empty so
the wheel always has an answer. No geo (user-rejected) — only wishlist + mood.
"""

from __future__ import annotations

import logging
import secrets
from dataclasses import dataclass
from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pairly.db.models import WishlistItem, WishlistStatus

logger = logging.getLogger(__name__)


@dataclass(slots=True, frozen=True)
class DateIdea:
    source: str  # "wishlist" | "default"
    title: str
    category: str | None
    reason: str  # warm "why this for you" line, shown under the result


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


# Canonical category → Russian label (genitive/description for prompt + reasons).
# Covers the new date-oriented set AND the legacy do/buy codes.
_CATEGORY_LABELS: dict[str, str] = {
    "eat": "еды",
    "walk": "прогулки",
    "active": "активного отдыха",
    "watch": "кино или театра",
    "culture": "культуры (выставка, музей)",
    "relax": "расслабления (спа, массаж)",
    "stay": "уютного дома",
    "trip": "поездки",
    "do": "активности",
    "buy": "покупок",
}
_VALID_CATEGORIES: set[str] = set(_CATEGORY_LABELS)


def _category_label(category: str | None) -> str:
    return _CATEGORY_LABELS.get(category or "", "совместных идей")


def _resolve_tz(timezone: str | None) -> ZoneInfo:
    """Parse a caller-provided IANA name; fall back to UTC on bad input.

    We never want a bad timezone string to crash the wheel — the time-of-day
    label is a soft prompt hint, not a hard contract.
    """
    if not timezone:
        return ZoneInfo("UTC")
    try:
        return ZoneInfo(timezone)
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


async def pick_date_idea(
    session: AsyncSession,
    *,
    pair_id: str,
    category: str | None,
    user_id: str,
    mode: str = "random",
    timezone: str | None = None,
) -> DateIdea:
    """Return a single date idea.

    mode:
      - "random": a uniformly-random open wishlist item (canned fallback if empty).
      - "smart": an OmniRoute pick FROM the wishlist, weighted by the pair's context
        (moods, time of day). Pro-only at the API layer; falls back to random if
        OmniRoute isn't configured or the wishlist is empty.
      - "lucky": an OmniRoute pick of ANY idea (not limited to the wishlist).
        Pro-only; falls back to a canned idea if OmniRoute isn't configured.

    ``timezone`` is an IANA name (e.g. ``"Asia/Tokyo"``); the smart-mode prompt
    uses it to label the time-of-day correctly. Unknown / missing values fall
    back to UTC. Random mode ignores it (no time-of-day hint in that prompt).

    No geolocation/weather (real-time geo is a hard non-goal) — only wishlist +
    moods + broad time context.
    """
    if mode in ("smart", "lucky"):
        try:
            return await _ai_pick(
                session,
                pair_id=pair_id,
                mode=mode,
                user_id=user_id,
                category=category,
                timezone=timezone,
            )
        except Exception as exc:
            # AI not configured / errored → degrade gracefully to the random path.
            # Logged (mode + exception) so operators can spot upstream flakiness.
            logger.warning("date_idea %s mode: AI unavailable, falling back (%s)", mode, exc)
    items = await _open_items(session, pair_id, category)
    if items:
        chosen = secrets.choice(items)
        reason = "Это из вашего wishlist — давно хотели, пора воплотить ✨"
        return DateIdea(source="wishlist", title=chosen.title, category=chosen.category, reason=reason)
    title, cat = _DEFAULT_IDEAS[secrets.randbelow(len(_DEFAULT_IDEAS))]
    label = _category_label(cat)
    reason = f"В вишлисте пока пусто в категории «{label}» — вот тёплая идея на сейчас 💛"
    return DateIdea(source="default", title=title, category=cat, reason=reason)


_SYSTEM_PROMPT = (
    "Ты — тёплый помощник для пары, предлагаешь идеи для свиданий. "
    "ОТВЕЧАЙ ИСКЛЮЧИТЕЛЬНО НА РУССКОМ ЯЗЫКЕ — никакого английского. "
    "Формат ответа — ТОЛЬКО валидный JSON без markdown и без обёртки: "
    '{"title": строка, "category": "eat"|"walk"|"active"|"watch"|"culture"|"relax"|"stay"|"trip"|null, "reason": строка}. '
    "title — короткое название свидания по-русски (до 60 символов). "
    "category — код категории свидания. "
    "reason — одно тёплое предложение по-русски, почему это отлично подойдёт паре сейчас. "
    "ЕСЛИ В ЗАДАНИИ УКАЗАНА КАТЕГОРИЯ — свидание ОБЯЗАТЕЛЬНО должно быть в ней, "
    "и верни именно этот код в поле category."
)


async def _build_context(
    session: AsyncSession,
    *,
    pair_id: str,
    user_id: str,
    include_wishlist: bool = True,
    timezone: str | None = None,
) -> str:
    """Wishlist (optional) + current moods + time-of-day, as a prompt block.

    ``timezone`` is an IANA name; the time-of-day label uses the caller's local
    clock so a Tokyo user doesn't see «утро» when it's «вечер» for them.
    """
    from pairly.repositories import mood as mood_repo

    lines: list[str] = []
    if include_wishlist:
        items = await _open_items(session, pair_id, None)
        if items:
            lines.append("Их список желаний (вишлист):")
            for it in items[:30]:
                cat = f" [{it.category}]" if it.category else ""
                lines.append(f"- {it.title}{cat}")
        else:
            lines.append("Вишлист пока пуст.")
    try:
        moods = await mood_repo.current_moods(session, pair_id=pair_id, user_id=user_id)
        parts = []
        for _uid, entry in moods.items():
            if entry and not mood_repo._is_stale(entry.set_at):
                parts.append(f"{entry.mood}" + (f" ({entry.note})" if entry.note else ""))
        if parts:
            lines.append("Текущие настроения пары: " + ", ".join(parts) + ".")
    except Exception:
        pass
    tz = _resolve_tz(timezone)
    hour = datetime.now(tz).hour
    tod = "утро" if 5 <= hour < 12 else "день" if 12 <= hour < 18 else "вечер" if 18 <= hour < 23 else "ночь"
    lines.append(f"Сейчас {tod}.")
    return "\n".join(lines)


async def _ai_pick(
    session: AsyncSession,
    *,
    pair_id: str,
    mode: str,
    user_id: str,
    category: str | None,
    timezone: str | None = None,
) -> DateIdea:
    from pairly.ai import AIError, chat_json

    # Category constraint FIRST and emphatic so it isn't drowned out by context.
    cat_hint = (
        f"ВАЖНО: пара хочет свидание именно в категории «{_category_label(category)}» "
        f"(код: {category}). Предложи именно такое и верни код {category} в category.\n\n"
        if category
        else ""
    )

    if mode == "smart":
        # Prefer wishlist items of the chosen category; fall back to all if none.
        items = await _open_items(session, pair_id, category)
        if not items and category:
            items = await _open_items(session, pair_id, None)
        if not items:
            raise AIError("empty wishlist for smart pick")
        context = await _build_context(
            session,
            pair_id=pair_id,
            user_id=user_id,
            include_wishlist=True,
            timezone=timezone,
        )
        user_msg = (
            "Выбери ОДНО свидание ИХ ЖЕ списка желаний (можно переформулировать "
            "красивее, но суть — из вишлиста) и объясни, почему оно подходит сейчас.\n\n"
            + cat_hint
            + context
        )
        source = "wishlist"
    else:  # lucky — do NOT bias with the wishlist; it's "any idea".
        context = await _build_context(
            session,
            pair_id=pair_id,
            user_id=user_id,
            include_wishlist=False,
            timezone=timezone,
        )
        user_msg = (
            "Предложи ОДНО новое свидание для этой пары — не из их списка, а свежую идею. "
            "Объясни, почему.\n\n"
            + cat_hint
            + context
        )
        source = "ai"

    obj = await chat_json(system=_SYSTEM_PROMPT, user=user_msg)
    title = str(obj.get("title") or "").strip()[:120]
    if not title:
        raise AIError("empty title in AI response")
    cat = obj.get("category")
    if cat not in _VALID_CATEGORIES:
        cat = category if category in _VALID_CATEGORIES else None
    reason = str(obj.get("reason") or "").strip()[:300]
    return DateIdea(source=source, title=title, category=cat, reason=reason)
