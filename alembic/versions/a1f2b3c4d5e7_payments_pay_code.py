"""payments_pay_code

Add a short, unguessable pay_code to payments so SMS pay-by-links are short
enough to survive the 160-character SMS limit. The full UUID is 36 chars and
combined with the ngrok domain and the reminder template text it was being
truncated mid-way, breaking the link.

Revision ID: a1f2b3c4d5e7
Revises: f2a3b4c5d6e7
Create Date: 2026-08-07 09:00:00.000000
"""
from collections.abc import Sequence
import secrets
import string

import sqlalchemy as sa

from alembic import op

revision: str = 'a1f2b3c4d5e7'
down_revision: str | None = 'f2a3b4c5d6e7'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_PAY_CODE_ALPHABET = string.ascii_letters + string.digits  # 62 chars
_PAY_CODE_LEN = 10  # 62^10 ≈ 8.4e17 — collision-safe for this volume


def _new_pay_code() -> str:
    return "".join(secrets.choice(_PAY_CODE_ALPHABET) for _ in range(_PAY_CODE_LEN))


def upgrade() -> None:
    op.add_column(
        "payments",
        sa.Column("pay_code", sa.String(length=12), nullable=True),
    )
    # Backfill existing rows (unique codes generated row-by-row).
    conn = op.get_bind()
    rows = conn.execute(
        sa.text("SELECT id FROM payments WHERE pay_code IS NULL OR pay_code = ''")
    ).fetchall()
    seen: set[str] = set()
    for (row_id,) in rows:
        code = _new_pay_code()
        while code in seen:
            code = _new_pay_code()
        seen.add(code)
        conn.execute(
            sa.text("UPDATE payments SET pay_code = :code WHERE id = :id"),
            {"code": code, "id": row_id},
        )
    op.create_unique_constraint("uq_payments_pay_code", "payments", ["pay_code"])
    op.create_index("ix_payments_pay_code", "payments", ["pay_code"])


def downgrade() -> None:
    op.drop_index("ix_payments_pay_code", table_name="payments")
    op.drop_constraint("uq_payments_pay_code", "payments", type_="unique")
    op.drop_column("payments", "pay_code")
