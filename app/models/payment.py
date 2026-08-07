import secrets
import string
import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

_PAY_CODE_ALPHABET = string.ascii_letters + string.digits


def new_pay_code(length: int = 10) -> str:
    """Short, unguessable code used in SMS pay-by-links.

    SMS messages are truncated around 160 characters; the 36-character UUID
    plus a long domain plus the reminder template text was being cut mid-way,
    breaking the link. A 10-character code keeps the URL well under the limit.
    """
    return "".join(secrets.choice(_PAY_CODE_ALPHABET) for _ in range(length))


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    student_id: Mapped[str] = mapped_column(String(36), ForeignKey("students.id"), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    payment_method: Mapped[str] = mapped_column(String(50), nullable=False)
    payment_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    reference_number: Mapped[str | None] = mapped_column(String(100))
    pay_code: Mapped[str | None] = mapped_column(
        String(12), unique=True, index=True, default=new_pay_code
    )
    proof_of_payment_url: Mapped[str | None] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(20), default="pending")
    allocated_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"))
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    student: Mapped["Student"] = relationship(back_populates="payments")
    allocator: Mapped["User | None"] = relationship()
    allocations: Mapped[list["PaymentAllocation"]] = relationship(back_populates="payment")
    receipt: Mapped["Receipt | None"] = relationship(back_populates="payment")


class PaymentAllocation(Base):
    __tablename__ = "payment_allocations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    payment_id: Mapped[str] = mapped_column(String(36), ForeignKey("payments.id"), nullable=False)
    outstanding_balance_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("outstanding_balances.id")
    )
    additional_charge_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("additional_charges.id")
    )
    amount_allocated: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )

    payment: Mapped["Payment"] = relationship(back_populates="allocations")
    outstanding_balance: Mapped["OutstandingBalance | None"] = relationship(
        back_populates="payment_allocations"
    )
    additional_charge: Mapped["AdditionalCharge | None"] = relationship(
        back_populates="payment_allocations"
    )


class PaymentReversal(Base):
    __tablename__ = "payment_reversals"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    payment_id: Mapped[str] = mapped_column(String(36), ForeignKey("payments.id"), nullable=False)
    reversed_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )

    payment: Mapped["Payment"] = relationship()
    user: Mapped["User"] = relationship()


from app.models.financial import Receipt  # noqa: E402, F401
from app.models.grade import Student  # noqa: E402, F401
from app.models.schedule import AdditionalCharge, OutstandingBalance  # noqa: E402, F401
from app.models.user import User  # noqa: E402, F401
