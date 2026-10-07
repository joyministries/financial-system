"""unique statement per student year month

Guarantees one statement row per (student, academic year, month).

Before this, only an app-level check-then-insert in
``StatementService.generate()`` guarded against duplicates, so concurrent
generate() calls could each insert their own row. The statement PDF builds
one ledger per ROW, which then repeated that month's fee line and every
receipt — a student with 4 copies printed each receipt 4x and reported a 4x
"Amount Paid to date".

Existing duplicate rows were removed before this migration was applied.

Revision ID: d4e5f6a7b8c9
Revises: c9d0e1f2a3b4
Create Date: 2026-10-07 19:28:58.255922
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, None] = 'c9d0e1f2a3b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_unique_constraint(
        'uq_statements_student_year_month',
        'statements',
        ['student_id', 'academic_year', 'month'],
    )


def downgrade() -> None:
    op.drop_constraint(
        'uq_statements_student_year_month',
        'statements',
        type_='unique',
    )

