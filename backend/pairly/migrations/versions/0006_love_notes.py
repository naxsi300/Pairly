"""love_notes (scheduled warm notes via bot)

Revision ID: 0006_love_notes
Revises: 0005_drop_photo_path
Create Date: 2026-06-19

A pair-scoped table of warm notes one partner leaves for the other, delivered
Telegram-natively (no geo). body + an optional HH:MM deliver_at hint +
delivered/read receipts. All nullable-friendly defaults so existing pairs are
unaffected.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0006_love_notes"
down_revision = "0005_drop_photo_path"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "love_notes",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "pair_id",
            sa.String(length=36),
            sa.ForeignKey("pairs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_by",
            sa.String(length=36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("body", sa.String(length=1000), nullable=False),
        sa.Column("deliver_at", sa.String(length=5), nullable=True),
        sa.Column("delivered", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("read_by_recipient", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_love_notes_pair_id", "love_notes", ["pair_id"])


def downgrade() -> None:
    op.drop_index("ix_love_notes_pair_id", table_name="love_notes")
    op.drop_table("love_notes")
