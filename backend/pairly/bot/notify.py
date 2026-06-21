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
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from aiogram import Bot
from aiogram.exceptions import (
    TelegramForbiddenError,
    TelegramNetworkError,
    TelegramRetryAfter,
    TelegramServerError,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from pairly.config import get_settings
from pairly.db.models import NotifyOutbox, User

log = logging.getLogger("pairly.notify")

# Per (pair_id, action) last-notify timestamp. In-memory, per-process. A pair that
# hits the API process and the bot process could in theory double-fire, but the
# cooldown only soft-gates the repeat-prone actions (qotd); gifts/wishlist always
# notify, and those are single-process anyway (gifts via API, wishlist via either).
# Good enough for MVP — a Redis gate is a later refinement.
_cooldowns: dict[tuple[str, str], float] = {}

# Soft cooldown for the high-frequency actions so we never become a nag.
# NOTE: mood is INTENTIONALLY ABSENT — docs/copy/mood-sync.md forbids any mood
# push ("NEVER send an alert when partner's mood changes. Ambient only.").
_COOLDOLD_SEC = {"qotd": 60 * 60}  # 60 min

# Server-error / network-blip backoff for the outbox. We don't know how long the
# Telegram side will be grumpy; a small constant keeps the message tryable soon
# but doesn't pound the API if it's still down.
_SERVER_BACKOFF = timedelta(seconds=10)

# Max attempts before the outbox dead-letters (deletes) the row. Permanent-
# failure rows are dropped rather than left to grow the table forever; the
# best-effort contract means a single lost notification is acceptable.
_MAX_ATTEMPTS = 5

# How many rows drain_outbox processes per pass. Keeps the per-tick cost bounded
# so a backlog can't starve the rest of the bot loop.
_DRAIN_BATCH = 50

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


async def _enqueue_outbox(
    session: AsyncSession,
    *,
    pair_id: str,
    partner_tg_id: int,
    text: str,
    not_before: datetime,
) -> None:
    """Park a failed notification for the drainer to retry.

    Best-effort: if the insert itself blows up (disk full, db locked), log and
    move on. Notifications must never break the business operation.
    """
    try:
        session.add(
            NotifyOutbox(
                pair_id=pair_id,
                partner_tg_id=partner_tg_id,
                text=text,
                not_before=not_before,
                attempts=0,
                created_at=datetime.now(UTC),
            )
        )
        # Caller is inside a larger transaction in the API process; we don't
        # commit here — they'll commit. In the bot process there's no caller
        # transaction, so we commit explicitly.
        await session.commit()
    except Exception:  # noqa: BLE001
        log.exception("failed to enqueue notify_outbox row; message dropped")


async def _send(session: AsyncSession, *, pair_id: str, actor_id: str, text: str) -> bool:
    """Deliver one message to the partner. Returns False if not delivered.

    NEVER raises: a notification failure must not abort the business operation
    that triggered it. Network blips, rate limits, blocked bots — all swallowed.

    On TelegramRetryAfter / TelegramServerError / TelegramNetworkError the
    message is parked in the notify_outbox so the periodic drainer can retry.
    Without this, a partner's first gift / love-note could vanish the moment
    Telegram rate-limits us.
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
        log.warning(
            "telegram retry-after %ss; queuing notify_outbox (partner=%s)",
            exc.retry_after, partner.tg_id,
        )
        await _enqueue_outbox(
            session,
            pair_id=pair_id,
            partner_tg_id=partner.tg_id,
            text=text,
            not_before=datetime.now(UTC) + timedelta(seconds=exc.retry_after),
        )
        return False
    except (TelegramServerError, TelegramNetworkError) as exc:
        log.warning(
            "telegram transient error %s; queuing notify_outbox (partner=%s)",
            type(exc).__name__, partner.tg_id,
        )
        await _enqueue_outbox(
            session,
            pair_id=pair_id,
            partner_tg_id=partner.tg_id,
            text=text,
            not_before=datetime.now(UTC) + _SERVER_BACKOFF,
        )
        return False
    except Exception:  # noqa: BLE001 — notify is best-effort; never break the caller
        log.exception("notification delivery failed (partner=%s); ignored", partner.tg_id)
        return False


async def drain_outbox(session_factory: Callable[[], AsyncSession]) -> None:
    """Pick due NotifyOutbox rows and try to deliver them.

    Bound: at most _DRAIN_BATCH rows per pass. On success the row is deleted;
    on TelegramRetryAfter not_before is bumped and attempts++ ; on any other
    failure attempts++; once attempts >= _MAX_ATTEMPTS the row is dead-lettered
    (deleted) so a permanently broken partner can't grow the table without
    bound. Best-effort: any exception here is logged but never raised, so the
    caller (a periodic task in the bot process) is safe to schedule on a timer.

    `session_factory` is a zero-arg callable returning a fresh AsyncSession — the
    cluster-4 wiring will pass pairly.db.base.SessionLocal.
    """
    try:
        async with session_factory() as session:
            now = datetime.now(UTC)
            rows = (
                await session.execute(
                    select(NotifyOutbox)
                    .where(NotifyOutbox.not_before <= now)
                    .where(NotifyOutbox.attempts < _MAX_ATTEMPTS)
                    .order_by(NotifyOutbox.not_before)
                    .limit(_DRAIN_BATCH)
                )
            ).scalars().all()
            for row in rows:
                try:
                    await _get_bot().send_message(row.partner_tg_id, row.text)
                    await session.delete(row)
                except TelegramForbiddenError:
                    # Partner blocked the bot; no point retrying.
                    log.info(
                        "outbox partner %s blocked the bot; dropping row",
                        row.partner_tg_id,
                    )
                    await session.delete(row)
                except TelegramRetryAfter as exc:
                    row.not_before = datetime.now(UTC) + timedelta(seconds=exc.retry_after)
                    row.attempts += 1
                    log.warning(
                        "outbox retry-after %ss for partner=%s (attempts=%d)",
                        exc.retry_after, row.partner_tg_id, row.attempts,
                    )
                except (TelegramServerError, TelegramNetworkError) as exc:
                    row.not_before = datetime.now(UTC) + _SERVER_BACKOFF
                    row.attempts += 1
                    log.warning(
                        "outbox transient error %s for partner=%s (attempts=%d)",
                        type(exc).__name__, row.partner_tg_id, row.attempts,
                    )
                except Exception:  # noqa: BLE001
                    row.attempts += 1
                    log.exception(
                        "outbox unexpected error for partner=%s (attempts=%d)",
                        row.partner_tg_id, row.attempts,
                    )
            await session.commit()
            # Dead-letter sweep: anything past _MAX_ATTEMPTS (incl. ones that
            # just crossed the threshold this pass) is dropped to bound the
            # table size.
            dead = (
                await session.execute(
                    select(NotifyOutbox).where(NotifyOutbox.attempts >= _MAX_ATTEMPTS)
                )
            ).scalars().all()
            for row in dead:
                log.warning(
                    "notify_outbox dead-letter: partner=%s attempts=%d (dropped)",
                    row.partner_tg_id, row.attempts,
                )
                await session.delete(row)
            if dead:
                await session.commit()
    except Exception:  # noqa: BLE001 — drainer must never escape
        log.exception("drain_outbox crashed; will retry next tick")


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


async def notify_gift_completed(
    session: AsyncSession, *, pair_id: str, actor_id: str, gesture: str
) -> None:
    """The gift reached the end of its lifecycle (COMPLETE) — a warm close for the
    partner. Mirrors notify_gift_redeemed's structure so every gift transition
    notifies the partner symmetrically. Always-notify (gifts are rare, the
    COMPLETE beat is a relationship-core moment — "we did this together").
    """
    actor = await session.get(User, actor_id)
    if actor is None:
        return
    name = _actor_label(actor)
    lines = [
        f"{name} завершил(а) «{gesture}» — теперь в добрых делах 🌟",
        f"«{gesture}» — закрыто вместе, спасибо {name} 💛",
    ]
    await _send(session, pair_id=pair_id, actor_id=actor_id, text=random.choice(lines))  # noqa: S311


async def notify_gift_accepted(
    session: AsyncSession, *, pair_id: str, actor_id: str, gesture: str
) -> None:
    """Receiver accepted the gift — tell the giver. actor_id is the RECEIVER,
    so _partner() resolves to the giver. Always notifies (rare, relationship-core).
    """
    actor = await session.get(User, actor_id)
    if actor is None:
        return
    name = _actor_label(actor)
    lines = [
        f"{name} принял(а) твой подарок «{gesture}» 🥰",
        f"{name} с радостью принял(а) «{gesture}» 💛",
    ]
    await _send(session, pair_id=pair_id, actor_id=actor_id, text=random.choice(lines))  # noqa: S311


async def notify_gift_declined(
    session: AsyncSession, *, pair_id: str, actor_id: str, gesture: str
) -> None:
    """Receiver declined — tell the giver, warmly (no guilt). actor_id is the RECEIVER."""
    actor = await session.get(User, actor_id)
    if actor is None:
        return
    name = _actor_label(actor)
    lines = [
        f"{name} пропустил(а) «{gesture}». Это нормально — может, в другой раз.",
        f"{name} пока не готов(а) к «{gesture}» — ничего страшного 🌱",
    ]
    await _send(session, pair_id=pair_id, actor_id=actor_id, text=random.choice(lines))  # noqa: S311


async def notify_qotd_mutual(session: AsyncSession, *, pair_id: str, actor_id: str) -> None:
    """Both answered today's question — the mutual reveal beat. Meta-only: never the
    answer body (the deep-link opens the Mini App where the gated reveal happens).
    """
    lines = [
        "Вы оба ответили на вопрос дня — откройте, чтобы увидеть 💬",
        "Ваши ответы готовы друг для друга ✨ открывайте",
        "Получилось у обоих — загляните в вопрос дня 💛",
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


async def notify_wishlist_pending(
    session: AsyncSession, *, pair_id: str, actor_id: str, title: str, item_id: str
) -> None:
    """Two-tap consent: partner must approve a forwarded item before it's open.

    Sends an inline approve keyboard. Best-effort + silent on failure.
    """
    from pairly.bot.keyboards import wishlist_approve_kb

    partner = await _partner(session, pair_id=pair_id, actor_id=actor_id)
    if partner is None:
        return
    actor = await session.get(User, actor_id)
    name = _actor_label(actor) if actor else "Партнёр"
    text = f"{name} переслал(а) в общий список: «{title}» 📌\nПодтвердите, чтобы добавить:"
    try:
        await _get_bot().send_message(
            partner.tg_id, text, reply_markup=wishlist_approve_kb(item_id)
        )
    except Exception:  # noqa: BLE001 — best-effort
        log.exception("notify_wishlist_pending failed; ignored")


async def notify_love_note(
    session: AsyncSession, *, pair_id: str, actor_id: str, body: str
) -> None:
    """Deliver a love note to the partner — the note body IS the message.

    Delivery is immediate (the optional HH:MM deliver_at is a future scheduled-
    delivery hint; there's no cron yet, so we deliver now rather than dropping
    it). Best-effort + silent on failure, like every notify.
    """
    actor = await session.get(User, actor_id)
    name = _actor_label(actor) if actor else "Партнёр"
    text = f"💌 {name} оставил(а) вам записку:\n\n{body}"
    await _send(session, pair_id=pair_id, actor_id=actor_id, text=text)


# NOTE: there is NO notify_mood_set. Mood is ambient-only by hard contract —
# docs/copy/mood-sync.md: "NEVER send an alert when partner's mood changes."
# A mood push manufactures "why didn't they tell me they were down" pressure.


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
