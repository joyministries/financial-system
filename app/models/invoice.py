import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import JSON, DateTime, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Invoice(Base):
    """Billing invoice for a student for a single billing month.

    Line items are stored as an immutable JSON snapshot at generation time
    (list of {"type": ..., "description": ..., "amount": ...}) so the invoice
    does not change if fees/charges are later edited.
    """

    __tablename__ = "invoices"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    invoice_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    student_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("students.id"), nullable=False, index=True
    )
    academic_year: Mapped[int] = mapped_column(nullable=False)
    month: Mapped[int] = mapped_column(nullable=False)
    issue_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    due_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    amount_paid: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    balance_due: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="issued")
    # status values: draft | issued | paid | void
    items: Mapped[list] = mapped_column(JSON, default=list)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    student: Mapped["Student"] = relationship()
    creator: Mapped["User"] = relationship()


from app.models.grade import Student  # noqa: E402, F401
from app.models.user import User  # noqa: E402, F401
