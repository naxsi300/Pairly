"""qotd answer unique constraint: include user_id (day scope)

Revision ID: 0009_qotd_day_scope
Revises: 0008_wishlist_source_url
Create Date: 2026-06-20

The previous UniqueConstraint(pair_id, question_id, answer_date) was missing
user_id. With the day-scope fix on the four answer queries, a same-day re-answer
UPDATEs in place but a new-day answer INSERTs — so two partners sharing the
same (pair, question, day) would collide. Adding user_id closes that.

Forward-only: no row deletion or backfill. Existing rows satisfy the new
constraint trivially (user_id was always populated).
"""

from __future__ import annotations

from alembic import op

revision = "0009_qotd_day_scope"
down_revision = "0008_wishlist_source_url"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("qotd_answers") as batch_op:
        batch_op.drop_constraint("uq_qotd_pair_q_day", type_="unique")
        batch_op.create_unique_constraint(
            "uq_qotd_answer_pair_user_q_day",
            ["pair_id", "user_id", "question_id", "answer_date"],
        )


def downgrade() -> None:
    with op.batch_alter_table("qotd_answers") as batch_op:
        batch_op.drop_constraint("uq_qotd_answer_pair_user_q_day", type_="unique")
        batch_op.create_unique_constraint(
            "uq_qotd_pair_q_day",
            ["pair_id", "question_id", "answer_date"],
        )