"""wishlist source_url (deep link to the original forwarded post)

Revision ID: 0008_wishlist_source_url
Revises: 0007_wishlist_pending
Create Date: 2026-06-20

Adds a nullable source_url column to wishlist_items so the Mini App can open the
original Telegram post when the user taps an item. Idempotent: tolerates the
column already existing.
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

revision = "0008_wishlist_source_url"
down_revision = "0007_wishlist_pending"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    cols = {c["name"] for c in inspect(bind).get_columns("wishlist_items")}
    if "source_url" not in cols:
        op.add_column(
            "wishlist_items",
            sa.Column("source_url", sa.String(length=512), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    cols = {c["name"] for c in inspect(bind).get_columns("wishlist_items")}
    if "source_url" in cols:
        op.drop_column("wishlist_items", "source_url")
