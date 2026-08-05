"""parent_registration_v2

Expanded parent registration batch:
- student_guardians: first_name, last_name, physical_address, po_box
- student_documents table (birth certificate, transcripts, etc.)

Revision ID: d6e7f8a9b0c1
Revises: c4d5e6f7a8b9
Create Date: 2026-08-05 14:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd6e7f8a9b0c1'
down_revision: Union[str, None] = 'c4d5e6f7a8b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Guardian contact details: split names + physical address / PO box.
    op.add_column('student_guardians', sa.Column('first_name', sa.String(length=100), nullable=True))
    op.add_column('student_guardians', sa.Column('last_name', sa.String(length=100), nullable=True))
    op.add_column('student_guardians', sa.Column('physical_address', sa.String(length=255), nullable=True))
    op.add_column('student_guardians', sa.Column('po_box', sa.String(length=100), nullable=True))

    # Uploaded application documents (birth certificate, transcripts, etc.).
    op.create_table(
        'student_documents',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('student_id', sa.String(length=36), nullable=False),
        sa.Column('document_type', sa.String(length=50), nullable=False),
        sa.Column('original_filename', sa.String(length=255), nullable=False),
        sa.Column('stored_filename', sa.String(length=255), nullable=False),
        sa.Column('content_type', sa.String(length=100), nullable=True),
        sa.Column('file_size', sa.Integer(), nullable=False),
        sa.Column('uploaded_by', sa.String(length=36), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['student_id'], ['students.id'], ),
        sa.ForeignKeyConstraint(['uploaded_by'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_student_documents_student_id', 'student_documents', ['student_id'])


def downgrade() -> None:
    op.drop_index('ix_student_documents_student_id', table_name='student_documents')
    op.drop_table('student_documents')

    op.drop_column('student_guardians', 'po_box')
    op.drop_column('student_guardians', 'physical_address')
    op.drop_column('student_guardians', 'last_name')
    op.drop_column('student_guardians', 'first_name')
