"""sms_templates

Add the editable SMS message templates table (curated by admins).

Revision ID: f3a4b5c6d7e8
Revises: a1f2b3c4d5e7
Create Date: 2026-08-10 10:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = 'f3a4b5c6d7e8'
down_revision: str | None = 'b4c5d6e7f8a9'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

DEFAULTS = [
    ("payment_receipt", "Payment received",
     "Lambton Christian School: Dear {parent}, we have received your payment of "
     "R{amount} for {student}. Receipt {receipt}. Thank you."),
    ("balance_reminder", "Balance reminder",
     "Lambton Christian School: {student}'s outstanding balance is R{balance} "
     "as of {month}/{year}. Please settle the balance to keep the account "
     "in good standing. Contact the office with any queries."),
    ("payment_link", "Payment link",
     "Lambton Christian School: Dear {parent}, please pay R{amount} for "
     "{student}'s school fees: {link}"),
    ("test", "Test message",
     "Lambton Christian School: This is a test SMS. If you received this, SMS is working."),
]


def upgrade() -> None:
    op.create_table(
        'sms_templates',
        sa.Column('key', sa.String(length=50), primary_key=True),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column('updated_by', sa.String(length=36), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['updated_by'], ['users.id']),
    )
    bind = op.get_bind()
    for key, name, body in DEFAULTS:
        bind.execute(
            sa.text(
                "INSERT INTO sms_templates (key, name, body, is_active, created_at, updated_at)"
                " VALUES (:key, :name, :body, true, now(), now())"
            ),
            {"key": key, "name": name, "body": body},
        )


def downgrade() -> None:
    op.drop_table('sms_templates')
