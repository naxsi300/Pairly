"""wishlist two-tap: add PENDING status (partner consent before open)

Revision ID: 0007_wishlist_pending
Revises: 0006_love_notes
Create Date: 2026-06-20

Adds a PENDING value to the wishlist status domain so a forwarded item lands
awaiting partner consent before becoming OPEN (privacy-by-design + dedupe).

On SQLite the status column is a plain VARCHAR, so no schema change is needed
there — the new string value is valid. On Postgres the `wishliststatus` enum
type must be extended; this migration does that dialect-gated.
"""

from __future__ import annotations

from alembic import op

revision = "0007_wishlist_pending"
down_revision = "0006_love_notes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    # ALTER TYPE ... ADD VALUE cannot run inside a transaction block on Postgres
    # (SQLSTATE 25001 — ALTER TYPE ... ADD cannot run inside a transaction block).
    # Wrap the statement in `autocommit_block()` so the migration commits the
    # surrounding tx, drops to AUTOCOMMIT isolation, runs the ALTER, and lets the
    # migration continue. On SQLite the column is a plain VARCHAR so we no-op
    # (SQLite has no ALTER TYPE syntax and no enum type to extend).
    if bind.dialect.name == "postgresql":
        with op.get_context().autocommit_block():
            op.execute("ALTER TYPE wishliststatus ADD VALUE IF NOT EXISTS 'PENDING'")


def downgrade() -> None:
    # Postgres cannot remove a value from an enum type; downgrade is a no-op.
    # (SQLite needs nothing either.)
    pass
