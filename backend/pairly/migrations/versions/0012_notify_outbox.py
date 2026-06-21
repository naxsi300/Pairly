"""notify_outbox (bounded retry queue for partner notifications)

Revision ID: 0012_notify_outbox
Revises: 0011_countdown_emoji_widen
Create Date: 2026-06-21

Best-effort Telegram delivery can hit TelegramRetryAfter (rate limit) or
TelegramServerError / TelegramNetworkError (Telegram blip). Today those are
swallowed by notify._send, so a partner's always-notify gift/love-note/wishlist
message can vanish without trace.

This adds a tiny outbox: on those three exceptions notify._send parks the
message in notify_outbox with a not_before, and a periodic drain_outbox task
retries delivery, deleting on success, backing off on RetryAfter, or dead-
lettering after 5 attempts. Notifications stay best-effort and never block
the caller; the outbox just gives the message a second/third/Nth chance.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0012_notify_outbox"
down_revision = "0011_countdown_emoji_widen"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "notify_outbox",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "pair_id",
            sa.String(length=36),
            sa.ForeignKey("pairs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("partner_tg_id", sa.BigInteger(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("not_before", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_notify_outbox_pair_id", "notify_outbox", ["pair_id"])
    # Index on not_before so the drainer's "due rows" scan is bounded.
    op.create_index("ix_notify_outbox_not_before", "notify_outbox", ["not_before"])


def downgrade() -> None:
    op.drop_index("ix_notify_outbox_not_before", table_name="notify_outbox")
    op.drop_index("ix_notify_outbox_pair_id", table_name="notify_outbox")
    op.drop_table("notify_outbox")