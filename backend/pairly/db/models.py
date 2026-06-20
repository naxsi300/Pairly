"""SQLAlchemy models.

INVARIANT: every user-data row carries `pair_id`. Access is allowed only when the
requester's user_id is a member of that pair. Enforced in pairly/repositories/base.py —
no caller-side exceptions. See CLAUDE.md "Pair-scoping rule".
"""

from __future__ import annotations

import enum
import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    Enum,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from pairly.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(UTC)


# --- ID helpers ---------------------------------------------------------------
# Internal PKs are UUIDs (stored as string for SQLite/Postgres portability).
# Telegram user ids are BigInt (they exceed 32-bit int).


def _uuid_str() -> str:
    return str(uuid.uuid4())


# --- Enums --------------------------------------------------------------------


class PairTier(enum.StrEnum):
    """Subscription tier on the Pair. Either partner Pro -> pair inherits Pro."""

    FREE = "free"
    PRO = "pro"


class WishlistStatus(enum.StrEnum):
    PENDING = "pending"  # awaiting partner consent (two-tap) before becoming open
    OPEN = "open"
    PLANNED = "planned"
    DONE = "done"
    ARCHIVED = "archived"


class GiftStatus(enum.StrEnum):
    RECEIVED = "received"
    CLAIMED = "claimed"
    DECLINED = "declined"
    REDEEMED = "redeemed"
    COMPLETE = "complete"
    ARCHIVED = "archived"


class BucketStatus(enum.StrEnum):
    DREAMING = "dreaming"
    PLANNING = "planning"
    DONE = "done"


# --- Core identity ------------------------------------------------------------


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    # Telegram user id — BigInt, unique.
    tg_id: Mapped[int] = mapped_column(BigInteger, unique=True, index=True)
    tg_username: Mapped[str | None] = mapped_column(String(64), nullable=True)
    display_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # Soft timezone hint for per-user scheduling (QOTD at 12:00 local). Olson name.
    timezone: Mapped[str | None] = mapped_column(String(64), nullable=True)

    pair_id: Mapped[str | None] = mapped_column(
        ForeignKey("pairs.id", ondelete="SET NULL"), nullable=True, index=True
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    pair: Mapped[Pair | None] = relationship(back_populates="members")


class Pair(Base):
    __tablename__ = "pairs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    tier: Mapped[PairTier] = mapped_column(Enum(PairTier), default=PairTier.FREE, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    dissolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    members: Mapped[list[User]] = relationship(back_populates="pair")

    def is_pro(self) -> bool:
        return self.tier == PairTier.PRO


class PairInvite(Base):
    """One-use token linking two users into a pair via `/pair`."""

    __tablename__ = "pair_invites"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    consumed_by: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (UniqueConstraint("token", name="uq_pair_invites_token"),)


# --- Pair-scoped user data ----------------------------------------------------
# Every table below has pair_id FK + the membership invariant enforced at the repo layer.


class WishlistItem(Base):
    __tablename__ = "wishlist_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    pair_id: Mapped[str] = mapped_column(ForeignKey("pairs.id", ondelete="CASCADE"), index=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(256))
    address: Mapped[str | None] = mapped_column(String(512), nullable=True)
    event_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    category: Mapped[str | None] = mapped_column(String(32), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[WishlistStatus] = mapped_column(
        Enum(WishlistStatus), default=WishlistStatus.OPEN, index=True
    )
    # Dedupe key from forwarded message_id (nullable; null when not from a forward).
    source_message_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    # Forwarded-media capture (forwarding-fix): the Telegram file_id of the source
    # photo. We store ONLY the file_id and resolve it to a temp URL on demand —
    # no on-disk photo storage (no volume, no cleanup, survives container recreate).
    telegram_file_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class GiftItem(Base):
    __tablename__ = "gift_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    pair_id: Mapped[str] = mapped_column(ForeignKey("pairs.id", ondelete="CASCADE"), index=True)
    giver_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    receiver_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    gesture: Mapped[str] = mapped_column(String(256))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[GiftStatus] = mapped_column(
        Enum(GiftStatus), default=GiftStatus.RECEIVED, index=True
    )
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class QOTDQuestion(Base):
    __tablename__ = "qotd_questions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    text: Mapped[str] = mapped_column(String(512))
    category: Mapped[str] = mapped_column(String(32), index=True)  # мечты/благодарность/...
    is_active: Mapped[bool] = mapped_column(default=True, index=True)


class QOTDAnswer(Base):
    __tablename__ = "qotd_answers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    pair_id: Mapped[str] = mapped_column(ForeignKey("pairs.id", ondelete="CASCADE"), index=True)
    question_id: Mapped[str] = mapped_column(ForeignKey("qotd_questions.id", ondelete="CASCADE"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    # Per pair + per question + per day, one answer each.
    answer_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    body: Mapped[str] = mapped_column(String(300))  # ~280 char cap + slack
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    __table_args__ = (
        UniqueConstraint("pair_id", "question_id", "answer_date", name="uq_qotd_pair_q_day"),
    )


class Countdown(Base):
    __tablename__ = "countdowns"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    pair_id: Mapped[str] = mapped_column(ForeignKey("pairs.id", ondelete="CASCADE"), index=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    label: Mapped[str] = mapped_column(String(128))
    emoji: Mapped[str | None] = mapped_column(String(16), nullable=True)
    target_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # Recurrence rule: 'annual' | 'monthly' | None. Day-after passing -> roll to next.
    recurrence: Mapped[str | None] = mapped_column(String(16), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class MoodEntry(Base):
    """Latest-only mood. No history graph, no streak, no score (privacy-by-design)."""

    __tablename__ = "mood_entries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    pair_id: Mapped[str] = mapped_column(ForeignKey("pairs.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    # One of: сияю / хорошо / ровно / так себе / паршиво
    mood: Mapped[str] = mapped_column(String(32))
    note: Mapped[str | None] = mapped_column(String(60), nullable=True)
    set_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, index=True)


class BucketItem(Base):
    __tablename__ = "bucket_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    pair_id: Mapped[str] = mapped_column(ForeignKey("pairs.id", ondelete="CASCADE"), index=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(256))
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str | None] = mapped_column(String(32), nullable=True)
    status: Mapped[BucketStatus] = mapped_column(
        Enum(BucketStatus), default=BucketStatus.DREAMING, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AdminAuditLog(Base):
    """Append-only log of admin actions (grant/revoke Pro). Never updated or deleted by app code.

    `actor_tg_id` is the Telegram user id of the admin (not the internal User row -
    admins may not themselves be Pairly users). Keeps the log independent of User
    for forensic clarity.
    """

    __tablename__ = "admin_audit_log"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    actor_tg_id: Mapped[int] = mapped_column(BigInteger, index=True)
    action: Mapped[str] = mapped_column(String(32), index=True)
    target_pair_id: Mapped[str | None] = mapped_column(
        ForeignKey("pairs.id", ondelete="SET NULL"), nullable=True, index=True
    )
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, index=True)


class PairMilestone(Base):
    """Soft milestone reached by a pair — never a counter, never a streak.

    A milestone is just a fact "this pair reached the threshold once". The Mini App
    shows a celebratory toast on the first time it observes each (kind, value) pair
    for this pair; further reaches of the same milestone are silent.

    Anti-pressure: we do NOT count over time, do NOT show a progress bar, and do NOT
    notify a partner — that would manufacture guilt for the slower one.
    """

    __tablename__ = "pair_milestones"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    pair_id: Mapped[str] = mapped_column(ForeignKey("pairs.id", ondelete="CASCADE"), index=True)
    # e.g. "wishlist_count", "qotd_count", "gift_count"
    kind: Mapped[str] = mapped_column(String(32), index=True)
    # The threshold value that was crossed (e.g. 5, 10, 3).
    value: Mapped[int] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class LoveNote(Base):
    """A warm note one partner leaves for the other.

    Scheduled delivery via the bot (Telegram-native) — no geo, no push spam.
    The sender writes it; the recipient sees it in the Mini App inbox and via a
    bot message at the chosen time. Read-receipt is tracked so missed deliveries
    don't vanish.
    """

    __tablename__ = "love_notes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    pair_id: Mapped[str] = mapped_column(ForeignKey("pairs.id", ondelete="CASCADE"), index=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    body: Mapped[str] = mapped_column(String(1000))
    # HH:MM local-time hint when to deliver (null = delivered immediately).
    deliver_at: Mapped[str | None] = mapped_column(String(5), nullable=True)
    delivered: Mapped[bool] = mapped_column(default=False)
    read_by_recipient: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


# Expose the aggregate count helper column type for migrations parity.
__all__ = [
    "AdminAuditLog",
    "Base",
    "LoveNote",
    "PairMilestone",
    "BucketItem",
    "BucketStatus",
    "Countdown",
    "GiftItem",
    "GiftStatus",
    "MoodEntry",
    "Pair",
    "PairInvite",
    "PairTier",
    "QOTDAnswer",
    "QOTDQuestion",
    "User",
    "WishlistItem",
    "WishlistStatus",
]
