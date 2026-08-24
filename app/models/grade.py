import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Grade(Base):
    __tablename__ = "grades"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    fee_structures: Mapped[list["FeeStructure"]] = relationship(back_populates="grade")
    students: Mapped[list["Student"]] = relationship(back_populates="grade")


class FeeStructure(Base):
    __tablename__ = "fee_structures"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    grade_id: Mapped[str] = mapped_column(String(36), ForeignKey("grades.id"), nullable=False)
    academic_year: Mapped[int] = mapped_column(nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    annual_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    monthly_installment: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 2), nullable=True
    )
    payment_plan: Mapped[str] = mapped_column(String(20), nullable=False, default="monthly")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    grade: Mapped["Grade"] = relationship(back_populates="fee_structures")
    monthly_schedules: Mapped[list["MonthlySchedule"]] = relationship(
        back_populates="fee_structure"
    )


class Student(Base):
    __tablename__ = "students"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    student_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(
        String(100), nullable=False, index=True
    )
    grade_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("grades.id"), nullable=False, index=True
    )
    parent_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True, index=True
    )
    enrollment_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # pending = registered by a parent, awaiting admin approval
    registration_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="approved", index=True
    )  # pending | approved | rejected
    # How the parent prefers to pay for this child's fees:
    # monthly = per-month installments, cumulative = full-year lump sum.
    payment_preference: Mapped[str] = mapped_column(
        String(20), nullable=False, default="monthly"
    )  # monthly | cumulative
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    grade: Mapped["Grade"] = relationship(back_populates="students", lazy="selectin")
    parent: Mapped["User | None"] = relationship(lazy="selectin")
    guardians: Mapped[list["StudentGuardian"]] = relationship(
        back_populates="student", cascade="all, delete-orphan", lazy="selectin"
    )
    documents: Mapped[list["StudentDocument"]] = relationship(
        back_populates="student", cascade="all, delete-orphan", lazy="selectin"
    )
    enrollments: Mapped[list["Enrollment"]] = relationship(back_populates="student")
    payments: Mapped[list["Payment"]] = relationship(back_populates="student")
    additional_charges: Mapped[list["AdditionalCharge"]] = relationship(back_populates="student")
    receipts: Mapped[list["Receipt"]] = relationship(back_populates="student")


class StudentGuardian(Base):
    """Parent/guardian contact record linked to a student.

    One student has one primary guardian (compulsory) and optionally a
    secondary guardian (one-to-many: guardian records -> student).
    """

    __tablename__ = "student_guardians"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    student_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("students.id"), nullable=False, index=True
    )
    guardian_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="primary"
    )  # father | mother (legacy: primary | secondary)
    first_name: Mapped[str | None] = mapped_column(String(100))
    last_name: Mapped[str | None] = mapped_column(String(100))
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    guardian_id: Mapped[str | None] = mapped_column(String(100))
    phone: Mapped[str | None] = mapped_column(String(50))
    email: Mapped[str | None] = mapped_column(String(255))
    physical_address: Mapped[str | None] = mapped_column(String(255))
    po_box: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )

    student: Mapped["Student"] = relationship(back_populates="guardians")


class Enrollment(Base):
    __tablename__ = "enrollments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    student_id: Mapped[str] = mapped_column(String(36), ForeignKey("students.id"), nullable=False)
    academic_year: Mapped[int] = mapped_column(nullable=False)
    grade_id: Mapped[str] = mapped_column(String(36), ForeignKey("grades.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )

    student: Mapped["Student"] = relationship(back_populates="enrollments")


class StudentFeeOverride(Base):
    """Per-student fee override — allows the admin to give a discount to
    a specific learner without changing the grade-wide fee.

    When an override exists for a student+grade+year+category, its
    ``annual_amount`` replaces the grade-level ``FeeStructure.annual_amount``
    for schedule generation and invoice display.

    ``discount_type``:
      - ``override``: the ``annual_amount`` on this row replaces the grade fee entirely.
      - ``percent``:   the ``annual_amount`` is treated as a percentage discount
                        (e.g. 10 means 10% off the grade fee).
    """

    __tablename__ = "student_fee_overrides"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    student_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("students.id"), nullable=False, index=True
    )
    fee_structure_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("fee_structures.id"), nullable=False, index=True
    )
    annual_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    discount_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="override"
    )  # override | percent
    reason: Mapped[str | None] = mapped_column(String(255))
    created_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    student: Mapped["Student"] = relationship()
    fee_structure: Mapped["FeeStructure"] = relationship()


from app.models.document import StudentDocument  # noqa: E402, F401
from app.models.financial import Receipt  # noqa: E402, F401
from app.models.payment import Payment  # noqa: E402, F401
from app.models.schedule import AdditionalCharge, MonthlySchedule  # noqa: E402, F401
from app.models.user import User  # noqa: E402, F401
