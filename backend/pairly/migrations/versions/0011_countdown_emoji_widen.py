"""countdown emoji column: widen to 32

Revision ID: 0011_countdown_emoji_widen
Revises: 0009_qotd_day_scope
Create Date: 2026-06-20

The Countdown.emoji column was String(16). The Mini App now allows up to 4
grapheme clusters — a ZWJ-family emoji (👨‍👩‍👧‍👦) is one cluster but 11 code
points, so 4 of them can exceed 16 code points. Widen to String(32).

Forward-only: existing rows fit trivially (current caps are smaller than 32
either way). batch_alter_table keeps SQLite happy (SQLite ALTER TABLE can't
change column types in place; the batch mode copies into a temp table).
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0011_countdown_emoji_widen"
down_revision = "0009_qotd_day_scope"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("countdowns") as batch_op:
        batch_op.alter_column(
            "emoji",
            existing_type=sa.String(length=16),
            type_=sa.String(length=32),
            existing_nullable=True,
        )


def downgrade() -> None:
    # Best-effort: any row whose emoji > 16 chars will be truncated by SQLite
    # during the table-copy in batch_alter_table. The Mini App caps at 4
    # grapheme clusters, so the only risk is historical data written before
    # this fix — accept the truncation rather than block downgrade.
    with op.batch_alter_table("countdowns") as batch_op:
        batch_op.alter_column(
            "emoji",
            existing_type=sa.String(length=32),
            type_=sa.String(length=16),
            existing_nullable=True,
        )