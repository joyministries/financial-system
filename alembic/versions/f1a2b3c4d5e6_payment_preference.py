"""payment_preference

Add the student-level payment preference chosen by the parent:
monthly (per-month installments) or cumulative (full-year lump sum).

Revision ID: f1a2b3c4d5e6
Revises: e8f9a0b1c2d3
Create Date: 2026-08-05 17:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f1a2b3c4d5e6'
down_revision: Union[str, None] = 'e8f9a0b1c2d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'students',
        sa.Column(
            'payment_preference',
            sa.String(length=20),
            nullable=False,
            server_default='monthly',
        ),
    )


def downgrade() -> None:
    op.drop_column('students', 'payment_preference')
