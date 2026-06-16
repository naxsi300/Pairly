"""pair milestones (soft, one-shot, no streaks)

Revision ID: 0003_pair_milestones
Revises: 0002_admin_audit
Create Date: 2026-06-16
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0003_pair_milestones"
down_revision = "0002_admin_audit"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "pair_milestones",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "pair_id",
            sa.String(length=36),
            sa.ForeignKey("pairs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("value", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_pair_milestones_pair_id", "pair_milestones", ["pair_id"])
    op.create_index("ix_pair_milestones_kind", "pair_milestones", ["kind"])


def downgrade() -> None:
    op.drop_table("pair_milestones")
