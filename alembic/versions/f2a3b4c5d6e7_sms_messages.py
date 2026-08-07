"""sms_messages

Add the SMS send log table.

Revision ID: f2a3b4c5d6e7
Revises: a1b2c3d4e5f6
Create Date: 2026-08-06 09:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = 'f2a3b4c5d6e7'
down_revision: str | None = 'a1b2c3d4e5f6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'sms_messages',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('student_id', sa.String(length=36), nullable=True),
        sa.Column('to_phone', sa.String(length=20), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('template', sa.String(length=50), server_default='manual', nullable=False),
        sa.Column('status', sa.String(length=20), server_default='queued', nullable=False),
        sa.Column('provider', sa.String(length=50), server_default='smsportal', nullable=False),
        sa.Column('provider_message_id', sa.String(length=100), nullable=True),
        sa.Column('provider_status', sa.String(length=100), nullable=True),
        sa.Column('cost', sa.Numeric(12, 2), nullable=True),
        sa.Column('error', sa.Text(), nullable=True),
        sa.Column('created_by', sa.String(length=36), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['student_id'], ['students.id']),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
    )
    op.create_index('ix_sms_messages_student_id', 'sms_messages', ['student_id'])
    op.create_index('ix_sms_messages_status', 'sms_messages', ['status'])
    op.create_index('ix_sms_messages_created_at', 'sms_messages', ['created_at'])


def downgrade() -> None:
    op.drop_index('ix_sms_messages_created_at', table_name='sms_messages')
    op.drop_index('ix_sms_messages_status', table_name='sms_messages')
    op.drop_index('ix_sms_messages_student_id', table_name='sms_messages')
    op.drop_table('sms_messages')
