"""invoices

Add the billing invoice table for monthly student invoices.

Revision ID: a1b2c3d4e5f6
Revises: f1a2b3c4d5e6
Create Date: 2026-08-05 18:30:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'f1a2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'invoices',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('invoice_number', sa.String(length=50), nullable=False),
        sa.Column('student_id', sa.String(length=36), nullable=False),
        sa.Column('academic_year', sa.Integer(), nullable=False),
        sa.Column('month', sa.Integer(), nullable=False),
        sa.Column('issue_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('due_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('subtotal', sa.Numeric(12, 2), nullable=False),
        sa.Column('amount_paid', sa.Numeric(12, 2), server_default='0', nullable=False),
        sa.Column('balance_due', sa.Numeric(12, 2), nullable=False),
        sa.Column('status', sa.String(length=20), server_default='issued', nullable=False),
        sa.Column('items', sa.JSON(), nullable=True),
        sa.Column('created_by', sa.String(length=36), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.ForeignKeyConstraint(['student_id'], ['students.id']),
        sa.UniqueConstraint('invoice_number'),
    )
    op.create_index('ix_invoices_invoice_number', 'invoices', ['invoice_number'])
    op.create_index('ix_invoices_student_id', 'invoices', ['student_id'])


def downgrade() -> None:
    op.drop_index('ix_invoices_student_id', table_name='invoices')
    op.drop_index('ix_invoices_invoice_number', table_name='invoices')
    op.drop_table('invoices')
