"""Partner notifications — the bot pokes the OTHER member when someone acts.

Design (see docs/copy + open-decisions.md): warm, varied, non-spammy.
  - gift received/claimed/redeemed  -> ALWAYS notify (rare, relationship-core)
  - wishlist item added             -> ALWAYS notify (the shared list grew)
  - mood set / qotd answered        -> COOLDOWN-gated (these repeat; no nag)
  - never notify the actor about their own action
  - silent if the partner blocked the bot (TelegramForbidden) — their choice
  - never leak more than necessary (QOTD body stays behind the reveal gate)

This runs in BOTH the bot process (forward->wishlist) and the API process
(gifts/mood/qotd). The Bot is stateless to create, so each process builds one
lazily from settings.bot_token. Avoids an inter-process queue for MVP.
"""

from __future__ import annotations

import logging
import random
import time

from aiogram import Bot
from aiogram.exceptions import TelegramForbiddenError, TelegramRetryAfter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pairly.config import get_settings
from pairly.db.models import User

log = logging.getLogger("pairly.notify")

# Per (pair_id, action) last-notify timestamp. In-memory, per-process. A pair that
# hits the API process and the bot process could in theory double-fire, but the
# cooldown only soft-gates the repeat-prone actions (mood/qotd); gifts/wishlist
# always notify, and those are single-process anyway (gifts via API, wishlist via
# either). Good enough for MVP — a Redis gate is a later refinement.
_cooldowns: dict[tuple[str, str], float] = {}

# Soft cooldown for the high-frequency actions so we never become a nag.
_COOLDOLD_SEC = {"mood": 30 * 60, "qotd": 60 * 60}  # 30 min / 60 min

_bot: Bot | None = None


def _get_bot() -> Bot:
    global _bot
    if _bot is None:
        _bot = Bot(token=get_settings().bot_token)
    return _bot


async def _partner(session: AsyncSession, *, pair_id: str, actor_id: str) -> User | None:
    """The OTHER member of the pair (the one to notify), or None."""
    result = await session.execute(select(User).where(User.pair_id == pair_id))
    for u in result.scalars():
        if u.id != actor_id:
            return u
    return None


def _actor_label(actor: User) -> str:
    """How we name the actor in copy: display name > @handle > "Партнёр"."""
    if actor.display_name:
        return actor.display_name
    if actor.tg_username:
        return f"@{actor.tg_username}"
    return "Партнёр"


def _past_cooldown(pair_id: str, action: str) -> bool:
    cd = _COOLDOLD_SEC.get(action)
    if cd is None:
        return True  # no cooldown configured -> always notify
    key = (pair_id, action)
    now = time.monotonic()
    last = _cooldowns.get(key)
    if last is not None and now - last < cd:
        return False
    _cooldowns[key] = now
    return True


async def _send(session: AsyncSession, *, pair_id: str, actor_id: str, text: str) -> bool:
    """Deliver one message to the partner. Returns False if not delivered.

    NEVER raises: a notification failure must not abort the business operation
    that triggered it. Network blips, rate limits, blocked bots — all swallowed.
    """
    partner = await _partner(session, pair_id=pair_id, actor_id=actor_id)
    if partner is None:
        return False  # no partner (solo) — nothing to do
    try:
        await _get_bot().send_message(partner.tg_id, text)
        return True
    except TelegramForbiddenError:
        log.info("partner %s blocked the bot; skipping notification", partner.tg_id)
        return False
    except TelegramRetryAfter as exc:
        # Telegram rate-limit: respect the pause, drop this one (don't block the request).
        log.warning("telegram retry-after %ss; dropping notification", exc.retry_after)
        return False
    except Exception:  # noqa: BLE001 — notify is best-effort; never break the caller
        log.exception("notification delivery failed (partner=%s); ignored", partner.tg_id)
        return False


# --- Public action helpers ----------------------------------------------------
# Each picks a varied warm line. Variety keeps it from feeling automated.


async def notify_gift_received(
    session: AsyncSession, *, pair_id: str, actor_id: str, gesture: str
) -> None:
    """Partner got a new gift/action from the actor. Always notifies."""
    actor = await session.get(User, actor_id)
    if actor is None:
        return
    name = _actor_label(actor)
    lines = [
        f"{name} дарит тебе «{gesture}» 💝",
        f"Кое-что приятное от {name}: «{gesture}» 🎁",
        f"{name} добавил(а) действие для тебя: «{gesture}» ✨",
    ]
    # random.choice is fine here — this is not crypto, and not in the workflow sandbox.
    await _send(
        session,
        pair_id=pair_id,
        actor_id=actor_id,
        text=random.choice(lines),  # noqa: S311
    )


async def notify_gift_redeemed(
    session: AsyncSession, *, pair_id: str, actor_id: str, gesture: str
) -> None:
    """The gift was marked done/redeemed — let the receiver know it happened."""
    actor = await session.get(User, actor_id)
    if actor is None:
        return
    name = _actor_label(actor)
    lines = [
        f"{name} отметил(а) «{gesture}» как состоявшееся ✅",
        f"«{gesture}» — теперь в истории, спасибо {name} 🌿",
    ]
    await _send(session, pair_id=pair_id, actor_id=actor_id, text=random.choice(lines))  # noqa: S311


async def notify_wishlist_added(
    session: AsyncSession, *, pair_id: str, actor_id: str, title: str
) -> None:
    """A new item landed in the shared wishlist. Always notifies."""
    actor = await session.get(User, actor_id)
    if actor is None:
        return
    name = _actor_label(actor)
    lines = [
        f"{name} добавил(а) в общий список: «{title}» 📌",
        f"Новое в вишлисте от {name}: «{title}»",
    ]
    await _send(session, pair_id=pair_id, actor_id=actor_id, text=random.choice(lines))  # noqa: S311


async def notify_mood_set(
    session: AsyncSession, *, pair_id: str, actor_id: str, mood: str
) -> None:
    """Partner updated their mood. Cooldown-gated (mood changes often)."""
    if not _past_cooldown(pair_id, "mood"):
        return
    actor = await session.get(User, actor_id)
    if actor is None:
        return
    name = _actor_label(actor)
    lines = [
        f"{name} поделился(ась) настроением: {mood} 🌤",
        f"У {name} сейчас: {mood}",
    ]
    await _send(session, pair_id=pair_id, actor_id=actor_id, text=random.choice(lines))  # noqa: S311


async def notify_qotd_answered(
    session: AsyncSession, *, pair_id: str, actor_id: str
) -> None:
    """Partner answered today's question. Cooldown-gated. Never sends the body."""
    if not _past_cooldown(pair_id, "qotd"):
        return
    actor = await session.get(User, actor_id)
    if actor is None:
        return
    name = _actor_label(actor)
    lines = [
        f"{name} ответил(а) на вопрос дня — открой, чтобы увидеть 💬",
        f"Свежий ответ от {name} на вопрос дня ✍️",
    ]
    await _send(session, pair_id=pair_id, actor_id=actor_id, text=random.choice(lines))  # noqa: S311
