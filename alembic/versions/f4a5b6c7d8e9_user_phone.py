"""user_phone

Add the user-level phone number so parents (and staff) can edit their
own contact details in their profile.

Revision ID: f4a5b6c7d8e9
Revises: f3a4b5c6d7e8
Create Date: 2026-08-11 10:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = 'f4a5b6c7d8e9'
down_revision: Union[str, None] = 'f3a4b5c6d7e8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column('phone', sa.String(length=50), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('users', 'phone')
