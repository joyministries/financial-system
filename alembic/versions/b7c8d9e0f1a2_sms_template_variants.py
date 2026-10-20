"""sms_template_variants

Multiple saved variants per SMS message slot. `sms_templates` moves from a
`key` primary key (one row per code path) to an `id` primary key with a `slot`
column, letting admins save several variants of the same message and choose
which one is in use (`is_active`, one per slot).

Existing rows keep their body and remain the in-use template for their slot,
so curated text is not lost in the migration.

Revision ID: b7c8d9e0f1a2
Revises: d4e5f6a7b8c9
Create Date: 2026-10-20 09:00:00.000000
"""
from collections.abc import Sequence
from uuid import uuid4

import sqlalchemy as sa

from alembic import op

revision: str = 'b7c8d9e0f1a2'
down_revision: str | None = 'd4e5f6a7b8c9'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    rows = bind.execute(
        sa.text(
            "SELECT key, name, body, is_active, updated_by, created_at, updated_at"
            " FROM sms_templates ORDER BY key"
        )
    ).mappings().all()

    op.create_table(
        'sms_templates_new',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('slot', sa.String(length=50), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column('updated_by', sa.String(length=36), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['updated_by'], ['users.id']),
    )

    for row in rows:
        bind.execute(
            sa.text(
                "INSERT INTO sms_templates_new"
                " (id, slot, name, body, is_active, updated_by, created_at, updated_at)"
                " VALUES (:id, :slot, :name, :body, :is_active, :updated_by,"
                " :created_at, :updated_at)"
            ),
            {
                **row,
                "id": str(uuid4()),
                "slot": row["key"],
                # A carried-over row stays the template in use for its slot.
                "is_active": bool(row["is_active"]),
            },
        )

    op.drop_table('sms_templates')
    op.rename_table('sms_templates_new', 'sms_templates')
    op.create_index('ix_sms_templates_slot', 'sms_templates', ['slot'])


def downgrade() -> None:
    """Collapse variants back to one row per slot: the in-use variant wins."""
    bind = op.get_bind()
    variants = bind.execute(
        sa.text(
            "SELECT id, slot, name, body, is_active, updated_by, created_at, updated_at"
            " FROM sms_templates ORDER BY slot, is_active DESC, updated_at DESC"
        )
    ).mappings().all()

    op.create_table(
        'sms_templates_old',
        sa.Column('key', sa.String(length=50), primary_key=True),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column('updated_by', sa.String(length=36), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['updated_by'], ['users.id']),
    )

    seen: set[str] = set()
    for row in variants:
        # First variant per slot is the active one (ordered is_active DESC,
        # updated_at DESC) — later variants of the slot are dropped.
        if row["slot"] in seen:
            continue
        seen.add(row["slot"])
        bind.execute(
            sa.text(
                "INSERT INTO sms_templates_old"
                " (key, name, body, is_active, updated_by, created_at, updated_at)"
                " VALUES (:key, :name, :body, :is_active, :updated_by,"
                " :created_at, :updated_at)"
            ),
            {
                **row,
                "key": row["slot"],
                "is_active": True,
            },
        )

    op.drop_table('sms_templates')
    op.rename_table('sms_templates_old', 'sms_templates')
