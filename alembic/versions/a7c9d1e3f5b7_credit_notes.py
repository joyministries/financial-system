"""credit notes

Revision ID: a7c9d1e3f5b7
Revises: f6a7b8c9d0e1
Create Date: 2026-09-01

Adds the ``credit_notes`` table for the Credit Note module.
"""
import sqlalchemy as sa
from alembic import op

revision: str = "a7c9d1e3f5b7"
down_revision: str | None = "f6a7b8c9d0e1"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "credit_notes",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("credit_number", sa.String(length=50), nullable=False),
        sa.Column("student_id", sa.String(length=36), sa.ForeignKey("students.id"), nullable=False),
        sa.Column("credit_type", sa.String(length=50), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("remaining_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("issued_by", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("voided_by", sa.String(length=36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("void_reason", sa.Text(), nullable=True),
        sa.Column("voided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_credit_notes_credit_number", "credit_notes", ["credit_number"], unique=True)
    op.create_index("ix_credit_notes_student_id", "credit_notes", ["student_id"])
    op.create_index("ix_credit_notes_status", "credit_notes", ["status"])
    op.create_index("ix_credit_notes_created_at", "credit_notes", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_credit_notes_created_at", table_name="credit_notes")
    op.drop_index("ix_credit_notes_status", table_name="credit_notes")
    op.drop_index("ix_credit_notes_student_id", table_name="credit_notes")
    op.drop_index("ix_credit_notes_credit_number", table_name="credit_notes")
    op.drop_table("credit_notes")