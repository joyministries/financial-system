"""Per-student fee override resolution helpers.

A ``StudentFeeOverride`` lets admin give a specific learner a discounted fee
without changing the grade-wide ``FeeStructure``. Overrides live on the
``fee_structure`` level (one row per student+fee+year), but the generated
``MonthlySchedule`` and ``OutstandingBalance`` rows are grade-level / shared.

This module is the single source of truth for turning a grade-level amount
into the learner-specific effective amount, so every billing consumer
(statements, invoices, summaries, registration fee, OB materialization)
applies overrides identically.
"""

from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

if TYPE_CHECKING:
    from app.models.grade import FeeStructure, StudentFeeOverride


def effective_annual(override: StudentFeeOverride, grade_annual: Decimal) -> Decimal:
    """Resolve a student's effective annual fee for one fee structure.

    - ``override`` discount_type: the override ``annual_amount`` replaces the
      grade fee entirely.
    - ``percent`` discount_type: the override ``annual_amount`` is a
      percentage discount (e.g. 10 = 10% off), applied to the grade fee.
    - No override: returns ``grade_annual`` unchanged.
    """
    grade_annual = Decimal(str(grade_annual))
    if override is None:
        return grade_annual.quantize(Decimal("0.01"))

    if override.discount_type == "percent":
        # Treat annual_amount as a percentage off the grade fee (0-100).
        rate = Decimal(str(override.annual_amount))
        discount = grade_annual * (rate / Decimal("100"))
        effective = grade_annual - discount
        if effective < 0:
            effective = Decimal("0")
        return effective.quantize(Decimal("0.01"))
    # "override": the stored amount replaces the grade amount entirely.
    return Decimal(str(override.annual_amount)).quantize(Decimal("0.01"))


def effective_monthly(
    override: StudentFeeOverride,
    grade_annual: Decimal,
    grade_monthly: Decimal | None,
) -> Decimal:
    """Resolve a student's effective monthly installment for one fee structure.

    Uses the same proportional relationship as grade-level monthly
    installments: the effective monthly is the effective annual spread over
    the grade's monthly schedule. If the grade has no monthly installment, the
    month's schedule amount is treated as a yearly lump sum in month 1.
    """
    eff_annual = effective_annual(override, grade_annual)
    if grade_monthly in (None, Decimal("0")):
        # Yearly lump-sum plan — month 1 carries the full annual amount.
        return eff_annual
    grade_monthly = Decimal(str(grade_monthly))
    if grade_annual in (None, Decimal("0")):
        return grade_monthly
    ratio = eff_annual / Decimal(str(grade_annual))
    return (grade_monthly * ratio).quantize(Decimal("0.01"))


async def get_student_overrides(
    db: AsyncSession, student_id: str, academic_year: int | None = None
) -> dict[str, StudentFeeOverride]:
    """Return active overrides for a student keyed by fee_structure_id.

    Optionally restrict to the given academic year by joining the fee
    structure. When ``academic_year`` is None all active overrides for the
    student are returned.
    """
    from app.models.grade import StudentFeeOverride

    stmt = select(StudentFeeOverride).where(
        StudentFeeOverride.student_id == student_id,
        StudentFeeOverride.is_active == True,  # noqa: E712
    )
    if academic_year is not None:
        from app.models.grade import FeeStructure

        stmt = stmt.join(
            FeeStructure, FeeStructure.id == StudentFeeOverride.fee_structure_id
        ).where(FeeStructure.academic_year == academic_year)
    result = await db.execute(stmt)
    return {o.fee_structure_id: o for o in result.scalars().all()}


async def get_student_fee_structures(
    db: AsyncSession, grade_id: str, academic_year: int
) -> list[FeeStructure]:
    """Active fee structures for a grade+year, used to resolve override lookups."""
    from app.models.grade import FeeStructure

    stmt = (
        select(FeeStructure)
        .where(
            FeeStructure.grade_id == grade_id,
            FeeStructure.academic_year == academic_year,
            FeeStructure.is_active == True,  # noqa: E712
        )
        .order_by(FeeStructure.category)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


_EFFECTIVE_AMOUNT_CASE = """
GREATEST(0,
CASE
    WHEN sfo.id IS NULL THEN ms.amount_due
    WHEN sfo.discount_type = 'percent'
        THEN ROUND(ms.amount_due * ((100 - sfo.annual_amount) / 100.0), 2)
    ELSE ROUND(
        ms.amount_due * (sfo.annual_amount / NULLIF(fs.annual_amount, 0)),
        2,
    )
END
)
"""


async def reprice_outstanding_balances(
    db: AsyncSession,
    student_id: str | None = None,
    fee_structure_id: str | None = None,
) -> int:
    """Re-price untouched OutstandingBalance rows to the effective (override-aware)
    amount, so overrides applied after balances were materialized take effect.

    Only rows with ``amount_paid = 0`` are repriced — repricing an OB that
    already has payment allocations would corrupt the allocation history, so
    those rows are intentionally left untouched.

    The CASE is self-contained (it computes the correct amount whether or not
    an override currently exists), so this converges both when an override is
    created AND when it is deleted/deactivated. Returns the number of rows
    updated.
    """
    from sqlalchemy import text

    clauses = ["ob.amount_paid = 0"]
    params: dict = {}
    if student_id:
        clauses.append("ob.student_id = :student_id")
        params["student_id"] = student_id
    if fee_structure_id:
        clauses.append("fs.id = :fee_structure_id")
        params["fee_structure_id"] = fee_structure_id
    where = " AND ".join(clauses)

    sql = text(
        f"""
        UPDATE outstanding_balances ob
        SET
            original_amount = {_EFFECTIVE_AMOUNT_CASE},
            balance = {_EFFECTIVE_AMOUNT_CASE},
            updated_at = now()
        FROM monthly_schedules ms
        JOIN fee_structures fs
          ON fs.id = ms.fee_structure_id
        LEFT JOIN student_fee_overrides sfo
          ON sfo.fee_structure_id = fs.id
         AND sfo.student_id = ob.student_id
         AND sfo.is_active = true
        WHERE ob.monthly_schedule_id = ms.id
          AND {where}
        """
    )
    result = await db.execute(sql, params)
    await db.flush()
    return result.rowcount or 0
