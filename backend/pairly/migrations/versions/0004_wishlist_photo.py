"""wishlist photo + telegram_file_id (forwarding-fix)

Revision ID: 0004_wishlist_photo
Revises: 0003_pair_milestones
Create Date: 2026-06-19

Adds two nullable columns to wishlist_items so a forwarded post's photo can be
captured and re-rendered in the Mini App:
  - telegram_file_id: the source photo's file_id (for re-fetch if needed)
  - photo_path: public web URL path to the stored image (/media/wishlist/<hash>.jpg)

Both nullable so existing rows and the free-tier/Pro path are unaffected.
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
    op.add_column(
        "wishlist_items",
        sa.Column("photo_path", sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("wishlist_items", "photo_path")
    op.drop_column("wishlist_items", "telegram_file_id")
