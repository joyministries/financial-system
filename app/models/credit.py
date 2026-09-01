import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class CreditNote(Base):
    """A positive credit applied to a student's fee account.

    Credit notes represent money the school owes a student/family (e.g. a
    book-sale credit, an overpayment, or an approved refund). Issuing a credit
    note against a student reduces the amount they owe.

    Status lifecycle:
      - ``issued``    : created, fully available to offset fees
      - ``applied``   : its full amount has been offset against charges/balance
      - ``partial``   : part of it has been applied
      - ``voided``    : cancelled, may no longer be applied
    """

    __tablename__ = "credit_notes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    credit_number: Mapped[str] = mapped_column(
        String(50), unique=True, nullable=False, index=True
    )
    student_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("students.id"), nullable=False, index=True
    )
    credit_type: Mapped[str] = mapped_column(String(50), nullable=False, default="adjustment")
    description: Mapped[str] = mapped_column(Text, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="issued", index=True)
    remaining_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    issued_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    voided_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    void_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    student: Mapped["Student"] = relationship()  # noqa: F821
    issuer: Mapped["User"] = relationship(foreign_keys=[issued_by])  # noqa: F821
    voided_by_user: Mapped["User | None"] = relationship(foreign_keys=[voided_by])  # noqa: F821


from app.models.grade import Student  # noqa: E402, F401
from app.models.user import User  # noqa: E402, F401