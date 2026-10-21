"""collapse_sms_template_variants

Revert `sms_templates` to the single curated template per message slot: a
`key` primary key with one row per code path. The variant round-trip proved
too much for the admin workflow, so the card goes back to one editable text
per slot (the pre-variant behaviour).

If variant rows exist (b7c8d9e0f1a2 applied), the in-use variant's body
becomes the slot's curated row. MySQL/Postgres safe; keyed on slot name.

Revision ID: c8d9e0f1a2b3
Revises: b7c8d9e0f1a2
Create Date: 2026-10-21 09:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = 'c8d9e0f1a2b3'
down_revision: str | None = 'b7c8d9e0f1a2'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Keyed table in, variant table out — the in-use variant wins per slot."""
    bind = op.get_bind()
    variants = bind.execute(
        sa.text(
            "SELECT id, slot, name, body, is_active, updated_by, created_at, updated_at"
            " FROM sms_templates ORDER BY slot, is_active DESC, updated_at DESC"
        )
    ).mappings().all()

    op.create_table(
        'sms_templates_keyed',
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
        # Variants arrive slot-ascending with the in-use one first
        # (is_active DESC, updated_at DESC) — the first variant of each slot
        # becomes that slot's curated template.
        if row["slot"] in seen:
            continue
        seen.add(row["slot"])
        bind.execute(
            sa.text(
                "INSERT INTO sms_templates_keyed"
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
    op.rename_table('sms_templates_keyed', 'sms_templates')


def downgrade() -> None:
    """Back to the variant layout: each keyed row becomes an active variant."""
    bind = op.get_bind()
    from uuid import uuid4

    rows = bind.execute(
        sa.text(
            "SELECT key, name, body, is_active, updated_by, created_at, updated_at"
            " FROM sms_templates ORDER BY key"
        )
    ).mappings().all()

    op.create_table(
        'sms_templates_variant',
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
                "INSERT INTO sms_templates_variant"
                " (id, slot, name, body, is_active, updated_by, created_at, updated_at)"
                " VALUES (:id, :slot, :name, :body, :is_active, :updated_by,"
                " :created_at, :updated_at)"
            ),
            {
                **row,
                "id": str(uuid4()),
                "slot": row["key"],
                "is_active": True,
            },
        )

    op.drop_table('sms_templates')
    op.rename_table('sms_templates_variant', 'sms_templates')
    op.create_index('ix_sms_templates_slot', 'sms_templates', ['slot'])
