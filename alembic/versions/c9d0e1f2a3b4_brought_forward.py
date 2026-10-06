"""brought_forward

Separate what is overdue *this year* from what was carried into it.

``invoices.brought_forward`` is the source of truth: how much of that
invoice's subtotal is prior-year balance. It survives statement regeneration
because invoices are never rebuilt. It has to be stored rather than derived
from line items — a carry-in invoice and an unlabelled once-off charge are
identical in shape (a January invoice with no ``items``), so amount alone
cannot tell them apart: 1364's genuine R1,500 carry-in is byte-for-byte the
same as 2082's R1,500 charge.

``statements.brought_forward`` is the same figure denormalised onto every
month of the year, so the statement summary can be built synchronously.
``Amount Due for Month`` = closing - (fee x months not yet due) - this.

Revision ID: c9d0e1f2a3b4
Revises: e7f8a9b0c1d2
Create Date: 2026-10-06 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = 'c9d0e1f2a3b4'
down_revision: Union[str, None] = 'e7f8a9b0c1d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'invoices',
        sa.Column(
            'brought_forward', sa.Numeric(12, 2), nullable=False,
            server_default='0',
        ),
    )
    op.add_column(
        'statements',
        sa.Column(
            'brought_forward', sa.Numeric(12, 2), nullable=False,
            server_default='0',
        ),
    )


def downgrade() -> None:
    op.drop_column('statements', 'brought_forward')
    op.drop_column('invoices', 'brought_forward')
