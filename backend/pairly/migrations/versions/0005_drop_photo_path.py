"""drop wishlist photo_path (file_id-only capture)

Revision ID: 0005_drop_photo_path
Revises: 0004_wishlist_photo
Create Date: 2026-06-19

The earlier forwarding-fix shipped with on-disk photo storage (a photo_path
column + a StaticFiles mount). We switched to file_id-only capture: photos are
resolved to Telegram temp URLs on demand, no disk. This drops the now-unused
photo_path column.

Idempotent guard: the prod DB already has photo_path from the first deploy, so
this drops it. A fresh DB never created it (0004 was rewritten to add only
telegram_file_id), so we tolerate the column being absent.
"""

from __future__ import annotations

from sqlalchemy import inspect

from alembic import op

revision = "0005_drop_photo_path"
down_revision = "0004_wishlist_photo"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    cols = {c["name"] for c in inspect(bind).get_columns("wishlist_items")}
    if "photo_path" in cols:
        op.drop_column("wishlist_items", "photo_path")


def downgrade() -> None:
    # photo_path is gone for good (feature removed); downgrade is a no-op.
    pass
