"""wishlist telegram_file_id (forwarding-fix)

Revision ID: 0004_wishlist_photo
Revises: 0003_pair_milestones
Create Date: 2026-06-19

Adds a nullable telegram_file_id column to wishlist_items so a forwarded post's
photo can be re-resolved on demand. No on-disk photo storage — the file_id is
the only thing persisted.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0004_wishlist_photo"
down_revision = "0003_pair_milestones"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "wishlist_items",
        sa.Column("telegram_file_id", sa.String(length=128), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("wishlist_items", "telegram_file_id")
