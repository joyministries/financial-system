import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class MonthlySchedule(Base):
    __tablename__ = "monthly_schedules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    fee_structure_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("fee_structures.id"), nullable=False
    )
    month: Mapped[int] = mapped_column(nullable=False)
    academic_year: Mapped[int] = mapped_column(nullable=False)
    amount_due: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    due_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    is_paid: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )

    fee_structure: Mapped["FeeStructure"] = relationship(back_populates="monthly_schedules")
    outstanding_balances: Mapped[list["OutstandingBalance"]] = relationship(
        back_populates="monthly_schedule"
    )


class OutstandingBalance(Base):
    __tablename__ = "outstanding_balances"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    student_id: Mapped[str] = mapped_column(String(36), ForeignKey("students.id"), nullable=False)
    monthly_schedule_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("monthly_schedules.id"), nullable=False
    )
    original_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    rollover_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    amount_paid: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    balance: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    monthly_schedule: Mapped["MonthlySchedule"] = relationship(
        back_populates="outstanding_balances"
    )
    payment_allocations: Mapped[list["PaymentAllocation"]] = relationship(
        back_populates="outstanding_balance"
    )


class AdditionalCharge(Base):
    __tablename__ = "additional_charges"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    grade_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("grades.id"), nullable=True
    )
    student_id: Mapped[str] = mapped_column(String(36), ForeignKey("students.id"), nullable=False)
    charge_type: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    academic_year: Mapped[int] = mapped_column(nullable=False)
    month: Mapped[int] = mapped_column(nullable=False)
    is_paid: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )

    student: Mapped["Student"] = relationship(back_populates="additional_charges")
    payment_allocations: Mapped[list["PaymentAllocation"]] = relationship(
        back_populates="additional_charge"
    )


from app.models.grade import FeeStructure, Student  # noqa: E402, F401
from app.models.payment import PaymentAllocation  # noqa: E402, F401
