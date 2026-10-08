import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Receipt(Base):
    __tablename__ = "receipts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    receipt_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    payment_id: Mapped[str] = mapped_column(String(36), ForeignKey("payments.id"), nullable=False)
    student_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("students.id"), nullable=False, index=True
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    payment_method: Mapped[str] = mapped_column(String(50), nullable=False)
    allocated_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), index=True
    )

    payment: Mapped["Payment"] = relationship(back_populates="receipt")
    student: Mapped["Student"] = relationship(back_populates="receipts")
    allocator: Mapped["User"] = relationship()


class Statement(Base):
    __tablename__ = "statements"
    #: One row per student/year/month. Without this, concurrent generate()
    #: calls all pass the app-level "already exists" check and each insert
    #: their own row, and the statement PDF then repeats that month's fee
    #: line and every receipt once per duplicate.
    __table_args__ = (
        UniqueConstraint(
            "student_id", "academic_year", "month",
            name="uq_statements_student_year_month",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    student_id: Mapped[str] = mapped_column(String(36), ForeignKey("students.id"), nullable=False)
    academic_year: Mapped[int] = mapped_column(nullable=False)
    month: Mapped[int] = mapped_column(nullable=False)
    opening_balance: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    total_fees: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    total_installments: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    total_additional_charges: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    total_payments: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    closing_balance: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    current_amount_due: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    #: Year-level carry-in from the previous academic year, denormalised from
    #: ``Invoice.brought_forward`` at generation time so the statement summary
    #: can be built synchronously. Same value on every month of the year.
    #: Not part of "Amount Due for Month", which is fee + closing.
    brought_forward: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    due_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )

    student: Mapped["Student"] = relationship()


from app.models.grade import Student  # noqa: E402, F401
from app.models.payment import Payment  # noqa: E402, F401
from app.models.user import User  # noqa: E402, F401
