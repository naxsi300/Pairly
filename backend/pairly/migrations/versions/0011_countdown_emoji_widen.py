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
    # Narrowing VARCHAR(32) -> VARCHAR(16). On Postgres the ALTER COLUMN
    # against a populated table that contains rows > 16 code points would
    # raise "value too long for type varchar(16)" and leave alembic_version
    # pointing at a half-applied revision, blocking every subsequent
    # migration. Express the narrowing as a substring() expression in the
    # USING clause so Postgres can rewrite the column in one statement.
    # NOTE: substring() is code-point-blind — Postgres has no built-in
    # grapheme-cluster function. The remaining 16 code points can still
    # split a ZWJ family emoji (👨‍👩‍👧‍👦 = 11 code points), so this
    # downgrade is best-effort. The Mini App caps input at 4 grapheme
    # clusters, so historical rows are the only risk and truncation is
    # acceptable.
    with op.batch_alter_table("countdowns") as batch_op:
        batch_op.alter_column(
            "emoji",
            existing_type=sa.String(length=32),
            type_=sa.String(length=16),
            existing_nullable=True,
            postgresql_using="substring(emoji FROM 1 FOR 16)",
        )