import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class DataDeletionRequest(Base):
    """A parent's request to have their portal account data deleted.

    Approved requests do NOT hard-delete the user row: financial records
    (payments, invoices, receipts, statements, charges) are statutory records
    that must be retained for audit/tax purposes. Instead the account is
    deactivated and its PII is anonymised in place (email, name, phone,
    push token), which satisfies data-subject erasure while keeping the
    ledger intact.

    Staff (admin/finance/super_admin) accounts are managed by the super admin
    through /api/v1/users — this flow is for parent data subjects only.
    """

    __tablename__ = "data_deletion_requests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False, index=True
    )
    # Email captured at request time so the public form can locate the account.
    # The request row itself never stores a raw password or secret — only the
    # contact email that identifies the account being erased.
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    reason: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending", index=True
    )
    decided_by: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True
    )
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )