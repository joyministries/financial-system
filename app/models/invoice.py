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
    #: Portion of this invoice's subtotal that is prior-year balance brought
    #: forward into the new academic year. Stored rather than derived: a
    #: carry-in invoice and an unlabelled once-off charge are identical in
    #: shape (both a January invoice with no line items), so amount alone
    #: cannot tell them apart — 1364's genuine R1,500 carry-in is
    #: byte-for-byte the same as 2082's R1,500 charge. The statement footer
    #: sums this column to know how much of the balance to exclude from
    #: "Amount Due for Month".
    brought_forward: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), index=True
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
