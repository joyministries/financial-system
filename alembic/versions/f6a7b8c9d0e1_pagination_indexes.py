"""pagination indexes

Add indexes on the columns paginated list endpoints sort and filter by.
Without these, every page fetch degrades to a full table scan and gets
slower as the tables grow regardless of how correct the LIMIT/OFFSET
logic is. These match the sort keys (last_name, payment_date,
created_at) and filter keys (registration_status, status) used by the
service layer list_* / count_* queries, plus un-indexed FKs.

Revision ID: f6a7b8c9d0e1
Revises: f5a6b7c8d9e0
Create Date: 2026-08-12 15:00:00.000000
"""
from collections.abc import Sequence

from alembic import op

revision: str = 'f6a7b8c9d0e1'
down_revision: str | None = 'f5a6b7c8d9e0'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # students — sorted by last_name, filtered by registration_status,
    # grade, parent
    op.create_index('ix_students_last_name', 'students', ['last_name'], unique=False)
    op.create_index(
        'ix_students_registration_status', 'students', ['registration_status'], unique=False
    )
    op.create_index('ix_students_grade_id', 'students', ['grade_id'], unique=False)
    op.create_index('ix_students_parent_id', 'students', ['parent_id'], unique=False)
    op.create_index('ix_students_created_at', 'students', ['created_at'], unique=False)

    # payments — sorted by payment_date, filtered by student_id / status
    op.create_index('ix_payments_student_id', 'payments', ['student_id'], unique=False)
    op.create_index('ix_payments_payment_date', 'payments', ['payment_date'], unique=False)
    op.create_index('ix_payments_status', 'payments', ['status'], unique=False)

    # receipts — sorted by created_at, filtered by student_id
    op.create_index('ix_receipts_student_id', 'receipts', ['student_id'], unique=False)
    op.create_index('ix_receipts_created_at', 'receipts', ['created_at'], unique=False)

    # invoices — filtered by student_id already indexed; sort by created_at
    op.create_index('ix_invoices_created_at', 'invoices', ['created_at'], unique=False)

    # sms_messages — sorted by created_at, filtered by student_id / status
    op.create_index('ix_sms_messages_student_id', 'sms_messages', ['student_id'], unique=False)
    op.create_index('ix_sms_messages_created_at', 'sms_messages', ['created_at'], unique=False)
    op.create_index('ix_sms_messages_status', 'sms_messages', ['status'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_sms_messages_status', table_name='sms_messages')
    op.drop_index('ix_sms_messages_created_at', table_name='sms_messages')
    op.drop_index('ix_sms_messages_student_id', table_name='sms_messages')
    op.drop_index('ix_invoices_created_at', table_name='invoices')
    op.drop_index('ix_receipts_created_at', table_name='receipts')
    op.drop_index('ix_receipts_student_id', table_name='receipts')
    op.drop_index('ix_payments_status', table_name='payments')
    op.drop_index('ix_payments_payment_date', table_name='payments')
    op.drop_index('ix_payments_student_id', table_name='payments')
    op.drop_index('ix_students_created_at', table_name='students')
    op.drop_index('ix_students_parent_id', table_name='students')
    op.drop_index('ix_students_grade_id', table_name='students')
    op.drop_index('ix_students_registration_status', table_name='students')
    op.drop_index('ix_students_last_name', table_name='students')