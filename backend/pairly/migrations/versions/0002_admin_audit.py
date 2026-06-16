"""admin audit log

Revision ID: 0002_admin_audit
Revises: 0001_initial
Create Date: 2026-06-15
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0002_admin_audit"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "admin_audit_log",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("actor_tg_id", sa.BigInteger(), nullable=False),
        sa.Column("action", sa.String(length=32), nullable=False),
        sa.Column(
            "target_pair_id",
            sa.String(length=36),
            sa.ForeignKey("pairs.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("detail", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_admin_audit_log_actor_tg_id", "admin_audit_log", ["actor_tg_id"])
    op.create_index("ix_admin_audit_log_action", "admin_audit_log", ["action"])
    op.create_index("ix_admin_audit_log_target_pair_id", "admin_audit_log", ["target_pair_id"])
    op.create_index("ix_admin_audit_log_created_at", "admin_audit_log", ["created_at"])


def downgrade() -> None:
    op.drop_table("admin_audit_log")
