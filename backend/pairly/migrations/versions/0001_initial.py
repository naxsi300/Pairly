"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-06-15

All user-data tables carry pair_id FK. The pair-scoping invariant
(access only when user_id ∈ pair.members) is enforced in the repository layer, not here.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- Core identity ---
    op.create_table(
        "pairs",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("tier", sa.Enum("FREE", "PRO", name="pairtier"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("dissolved_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_pairs_tier", "pairs", ["tier"])

    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("tg_id", sa.BigInteger(), nullable=False),
        sa.Column("tg_username", sa.String(length=64), nullable=True),
        sa.Column("display_name", sa.String(length=128), nullable=True),
        sa.Column("timezone", sa.String(length=64), nullable=True),
        sa.Column(
            "pair_id",
            sa.String(length=36),
            sa.ForeignKey("pairs.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_users_tg_id", "users", ["tg_id"], unique=True)
    op.create_index("ix_users_pair_id", "users", ["pair_id"])

    op.create_table(
        "pair_invites",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("token", sa.String(length=64), nullable=False),
        sa.Column(
            "created_by",
            sa.String(length=36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "consumed_by",
            sa.String(length=36),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("token", name="uq_pair_invites_token"),
    )
    op.create_index("ix_pair_invites_token", "pair_invites", ["token"], unique=True)

    # --- Pair-scoped user data ---
    op.create_table(
        "wishlist_items",
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
        sa.Column("title", sa.String(length=256), nullable=False),
        sa.Column("address", sa.String(length=512), nullable=True),
        sa.Column("event_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("category", sa.String(length=32), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.Enum("OPEN", "PLANNED", "DONE", "ARCHIVED", name="wishliststatus"),
            nullable=False,
        ),
        sa.Column("source_message_hash", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_wishlist_items_pair_id", "wishlist_items", ["pair_id"])
    op.create_index("ix_wishlist_items_status", "wishlist_items", ["status"])
    op.create_index("ix_wishlist_items_source_message_hash", "wishlist_items", ["source_message_hash"])

    op.create_table(
        "gift_items",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "pair_id",
            sa.String(length=36),
            sa.ForeignKey("pairs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "giver_id",
            sa.String(length=36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "receiver_id",
            sa.String(length=36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("gesture", sa.String(length=256), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "RECEIVED", "CLAIMED", "DECLINED", "REDEEMED", "COMPLETE", "ARCHIVED",
                name="giftstatus",
            ),
            nullable=False,
        ),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_gift_items_pair_id", "gift_items", ["pair_id"])
    op.create_index("ix_gift_items_status", "gift_items", ["status"])

    op.create_table(
        "qotd_questions",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("text", sa.String(length=512), nullable=False),
        sa.Column("category", sa.String(length=32), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
    )
    op.create_index("ix_qotd_questions_category", "qotd_questions", ["category"])
    op.create_index("ix_qotd_questions_is_active", "qotd_questions", ["is_active"])

    op.create_table(
        "qotd_answers",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "pair_id",
            sa.String(length=36),
            sa.ForeignKey("pairs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "question_id",
            sa.String(length=36),
            sa.ForeignKey("qotd_questions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.String(length=36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("answer_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("body", sa.String(length=300), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("pair_id", "question_id", "answer_date", name="uq_qotd_pair_q_day"),
    )
    op.create_index("ix_qotd_answers_pair_id", "qotd_answers", ["pair_id"])

    op.create_table(
        "countdowns",
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
        sa.Column("label", sa.String(length=128), nullable=False),
        sa.Column("emoji", sa.String(length=16), nullable=True),
        sa.Column("target_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("recurrence", sa.String(length=16), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_countdowns_pair_id", "countdowns", ["pair_id"])

    op.create_table(
        "mood_entries",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "pair_id",
            sa.String(length=36),
            sa.ForeignKey("pairs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.String(length=36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("mood", sa.String(length=32), nullable=False),
        sa.Column("note", sa.String(length=60), nullable=True),
        sa.Column("set_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_mood_entries_pair_id", "mood_entries", ["pair_id"])
    op.create_index("ix_mood_entries_set_at", "mood_entries", ["set_at"])

    op.create_table(
        "bucket_items",
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
        sa.Column("title", sa.String(length=256), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("category", sa.String(length=32), nullable=True),
        sa.Column(
            "status",
            sa.Enum("DREAMING", "PLANNING", "DONE", name="bucketstatus"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_bucket_items_pair_id", "bucket_items", ["pair_id"])
    op.create_index("ix_bucket_items_status", "bucket_items", ["status"])


def downgrade() -> None:
    for table in (
        "bucket_items",
        "mood_entries",
        "countdowns",
        "qotd_answers",
        "qotd_questions",
        "gift_items",
        "wishlist_items",
        "pair_invites",
        "users",
        "pairs",
    ):
        op.drop_table(table)

    for enum_name in ("bucketstatus", "mood_entries", "giftstatus", "wishliststatus", "pairtier"):
        sa.Enum(name=enum_name).drop(op.get_bind(), checkfirst=True)
