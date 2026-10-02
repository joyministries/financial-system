"""Grade-based monthly tuition instalment resolution for statements.

Why this exists
---------------
A school year in this system is billed with a **single annual invoice dated
January**: the tuition ``FeeStructure`` runs ``payment_plan == "yearly"``, so
``ScheduleService`` writes one ``MonthlySchedule`` row (month 1 = the whole
year). Consequences:

* only January has an invoice, so ``Statement.total_installments`` is ``0``
  for February..December;
* the statement ledger therefore prints no ``Fees for MM/YYYY`` row for those
  months, and ``Amount Due for Month`` renders ``R 0.00`` for a parent who
  actually owes an instalment.

This module resolves the *monthly* tuition instalment for a student's grade so
those months can show what is really due that month.

**The row is display-only.** The January invoice already carries the year's
fees, so the instalment must never be added to the statement balance — doing so
would double-bill every month from February onward.

Sources, in order:

1. the grade's active ``Tuition`` ``FeeStructure`` for the academic year,
   with any per-student ``StudentFeeOverride`` applied proportionally;
2. :data:`GRADE_MONTHLY_FEES` — the agreed tariff, used only when no fee
   structure row exists (so statements stay correct on a fresh database);
3. ``Decimal("0")`` — no fee row is rendered.
"""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.money import calculate_monthly_installment, to_decimal
from app.models.grade import FeeStructure, Grade, Student, StudentFeeOverride
from app.services.fee_override import effective_monthly

D0 = Decimal("0")

TUITION_CATEGORY = "Tuition"

#: Agreed monthly tuition tariff (annual / 12) used when a grade has no
#: ``FeeStructure`` row. Keys are upper-cased grade names.
GRADE_MONTHLY_FEES: dict[str, Decimal] = {
    "GRADE RR": Decimal("1700"),
    "GRADE R": Decimal("1700"),
    "GRADE 1": Decimal("1940"),
    "GRADE 2": Decimal("1940"),
    "GRADE 3": Decimal("1940"),
    "GRADE 4": Decimal("2250"),
    "GRADE 5": Decimal("2250"),
    "GRADE 6": Decimal("2250"),
    "GRADE 7": Decimal("2380"),
    "GRADE 8": Decimal("2980"),
    "GRADE 9": Decimal("3230"),
}


def monthly_from_structure(fee: FeeStructure) -> Decimal:
    """Monthly tuition instalment for a grade's fee structure.

    Yearly-plan structures store no ``monthly_installment``, so spread the
    annual amount over the twelve instalments the school collects.
    """
    stored = fee.monthly_installment
    if stored is not None and to_decimal(stored) > D0:
        return to_decimal(stored)
    if to_decimal(fee.annual_amount) <= D0:
        return D0
    return calculate_monthly_installment(to_decimal(fee.annual_amount))


async def load_monthly_fee_lookup(
    db: AsyncSession,
    students: list[Student],
    academic_year: int,
) -> dict[str, Decimal]:
    """Map ``student_id`` -> monthly tuition instalment.

    One round-trip for fee structures and one for overrides, so a whole-school
    statement bundle resolves fees for every student in two extra queries
    instead of two per student.
    """
    if not students:
        return {}

    grade_ids = {s.grade_id for s in students if s.grade_id}
    student_ids = [s.id for s in students]

    fee_rows = []
    if grade_ids:
        fee_rows = list(
            (
                await db.execute(
                    select(FeeStructure)
                    .where(
                        FeeStructure.academic_year == academic_year,
                        FeeStructure.grade_id.in_(grade_ids),
                        FeeStructure.is_active == True,  # noqa: E712
                    )
                    .order_by(FeeStructure.created_at.desc())
                )
            )
            .scalars()
            .all()
        )
    # Newest row wins; prefer the Tuition category when several exist.
    tuition_by_grade: dict[str, FeeStructure] = {}
    for fee in fee_rows:
        current = tuition_by_grade.get(fee.grade_id)
        is_tuition = fee.category == TUITION_CATEGORY
        if current is None or is_tuition and current.category != TUITION_CATEGORY:
            tuition_by_grade[fee.grade_id] = fee

    grade_names = {g.id: (g.name or "").strip().upper() for g in await _load_grades(db, grade_ids)}
    overrides = await _load_overrides(db, student_ids)

    lookup: dict[str, Decimal] = {}
    for student in students:
        fee = tuition_by_grade.get(student.grade_id)
        if fee is not None:
            grade_monthly = monthly_from_structure(fee)
            override = overrides.get((student.id, fee.id))
            lookup[student.id] = to_decimal(
                effective_monthly(override, fee.annual_amount, grade_monthly)
            )
            continue
        lookup[student.id] = GRADE_MONTHLY_FEES.get(
            grade_names.get(student.grade_id, ""), D0
        )
    return lookup


async def monthly_fee_for_student(
    db: AsyncSession, student_id: str, academic_year: int
) -> Decimal:
    """Monthly tuition instalment for one student (``0`` when unknown)."""
    student = await db.get(Student, student_id)
    if student is None:
        return D0
    return (await load_monthly_fee_lookup(db, [student], academic_year)).get(
        student_id, D0
    )


async def _load_grades(db: AsyncSession, grade_ids: set[str]) -> list[Grade]:
    if not grade_ids:
        return []
    return list(
        (await db.execute(select(Grade).where(Grade.id.in_(grade_ids))))
        .scalars()
        .all()
    )


async def _load_overrides(
    db: AsyncSession, student_ids: list[str]
) -> dict[tuple[str, str], StudentFeeOverride]:
    if not student_ids:
        return {}
    rows = (
        (
            await db.execute(
                select(StudentFeeOverride).where(
                    StudentFeeOverride.student_id.in_(student_ids),
                    StudentFeeOverride.is_active == True,  # noqa: E712
                )
            )
        )
        .scalars()
        .all()
    )
    return {(o.student_id, o.fee_structure_id): o for o in rows}
