"""data deletion requests

Adds the ``data_deletion_requests`` table so parents can exercise their
data-erasure right under POPIA. Requests are submitted via a public,
rate-limited endpoint and processed by an admin. Approving a request
deactivates the account and anonymises PII rather than hard-deleting the
row, because payments/invoices/statements are statutory records that must
be retained.

Revision ID: e7f8a9b0c1d2
Revises: a7c9d1e3f5b7
Create Date: 2026-09-08
"""
import sqlalchemy as sa
from alembic import op

revision: str = "e7f8a9b0c1d2"
down_revision: str | None = "a7c9d1e3f5b7"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "data_deletion_requests",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("decided_by", sa.String(length=36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
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
    op.create_index("ix_data_deletion_requests_user_id", "data_deletion_requests", ["user_id"])
    op.create_index("ix_data_deletion_requests_email", "data_deletion_requests", ["email"])
    op.create_index("ix_data_deletion_requests_status", "data_deletion_requests", ["status"])


def downgrade() -> None:
    op.drop_index("ix_data_deletion_requests_status", table_name="data_deletion_requests")
    op.drop_index("ix_data_deletion_requests_email", table_name="data_deletion_requests")
    op.drop_index("ix_data_deletion_requests_user_id", table_name="data_deletion_requests")
    op.drop_table("data_deletion_requests")