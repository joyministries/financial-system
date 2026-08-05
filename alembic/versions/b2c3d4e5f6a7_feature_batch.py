"""feature_batch

P3: grade-level additional charges (grade_id on additional_charges)
P5: optional monthly installment + payment_plan on fee_structures
P7: two guardians per student (student_guardians table, parent_id nullable)

Revision ID: b2c3d4e5f6a7
Revises: df17d017ea2a
Create Date: 2026-08-04 10:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'df17d017ea2a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ### P7: student_guardians table ###
    op.create_table('student_guardians',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('student_id', sa.String(length=36), nullable=False),
        sa.Column('guardian_type', sa.String(length=20), nullable=False),
        sa.Column('full_name', sa.String(length=255), nullable=False),
        sa.Column('guardian_id', sa.String(length=100), nullable=True),
        sa.Column('phone', sa.String(length=50), nullable=True),
        sa.Column('email', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['student_id'], ['students.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_student_guardians_student_id', 'student_guardians', ['student_id'])

    # P7: parents become optional on students (guardian records are primary source)
    op.alter_column('students', 'parent_id',
                    existing_type=sa.String(length=36),
                    nullable=True)

    # ### P5: fee_structures payment plan ###
    op.add_column('fee_structures',
                  sa.Column('payment_plan', sa.String(length=20),
                            server_default='monthly', nullable=False))
    op.alter_column('fee_structures', 'monthly_installment',
                    existing_type=sa.Numeric(precision=12, scale=2),
                    nullable=True)

    # ### P3: grade-level additional charges ###
    op.add_column('additional_charges',
                  sa.Column('grade_id', sa.String(length=36), nullable=True))
    op.create_foreign_key('fk_additional_charges_grade_id', 'additional_charges',
                          'grades', ['grade_id'], ['id'])


def downgrade() -> None:
    op.drop_constraint('fk_additional_charges_grade_id', 'additional_charges', type_='foreignkey')
    op.drop_column('additional_charges', 'grade_id')

    op.alter_column('fee_structures', 'monthly_installment',
                    existing_type=sa.Numeric(precision=12, scale=2),
                    nullable=False)
    op.drop_column('fee_structures', 'payment_plan')

    op.alter_column('students', 'parent_id',
                    existing_type=sa.String(length=36),
                    nullable=False)

    op.drop_index('ix_student_guardians_student_id', table_name='student_guardians')
    op.drop_table('student_guardians')
