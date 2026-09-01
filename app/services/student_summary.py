from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.grade import FeeStructure, Student
from app.models.schedule import AdditionalCharge, MonthlySchedule, OutstandingBalance
from app.schemas.financial import MonthSummary, StudentSummaryResponse


class StudentSummaryService:
    """Per-student, per-month financial summary for the parent portal.

    For each month of the academic year this reports:
      - amount_required: fee schedules + additional charges due in that month
      - amount_paid:      allocations against that month + paid charges
      - outstanding:      remaining balance + unpaid charges
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def summarize(
        self, student_id: str, academic_year: int
    ) -> StudentSummaryResponse:
        from app.services.fee_override import (
            effective_monthly,
            get_student_fee_structures,
            get_student_overrides,
        )

        student = await self.db.get(Student, student_id)
        grade_id = student.grade_id if student else None

        # Fee schedules for the student's grade (all fee structures, one per month)
        schedules: list[MonthlySchedule] = []
        # Per-student effective monthly installment keyed by fee_structure_id
        eff_by_fsid: dict[str, Decimal] = {}
        if grade_id:
            stmt = (
                select(MonthlySchedule)
                .join(FeeStructure, FeeStructure.id == MonthlySchedule.fee_structure_id)
                .where(
                    FeeStructure.grade_id == grade_id,
                    MonthlySchedule.academic_year == academic_year,
                )
            )
            result = await self.db.execute(stmt)
            schedules = list(result.scalars().all())

            fee_structures = await get_student_fee_structures(self.db, grade_id, academic_year)
            if fee_structures:
                overrides = await get_student_overrides(self.db, student_id, academic_year)
                for fs in fee_structures:
                    eff_by_fsid[fs.id] = effective_monthly(
                        overrides.get(fs.id), fs.annual_amount, fs.monthly_installment
                    )

        # Outstanding balances (one per schedule per student) — carries amounts paid
        balances: list[OutstandingBalance] = []
        if schedules:
            schedule_ids = [s.id for s in schedules]
            stmt = (
                select(OutstandingBalance)
                .where(
                    OutstandingBalance.student_id == student_id,
                    OutstandingBalance.monthly_schedule_id.in_(schedule_ids),
                )
            )
            result = await self.db.execute(stmt)
            balances = list(result.scalars().all())

        # Additional charges for the student/year
        stmt = (
            select(AdditionalCharge)
            .where(
                AdditionalCharge.student_id == student_id,
                AdditionalCharge.academic_year == academic_year,
            )
        )
        result = await self.db.execute(stmt)
        charges = list(result.scalars().all())

        balance_by_schedule: dict[str, OutstandingBalance] = {
            b.monthly_schedule_id: b for b in balances
        }

        months: list[MonthSummary] = []
        for month in range(1, 13):
            required = Decimal("0")
            paid = Decimal("0")
            outstanding = Decimal("0")

            month_schedules = [s for s in schedules if s.month == month]
            for s in month_schedules:
                eff = eff_by_fsid.get(s.fee_structure_id, s.amount_due)
                required += eff
                b = balance_by_schedule.get(s.id)
                if b:
                    paid += b.amount_paid
                    outstanding += b.balance
                else:
                    # No balance record yet — nothing has been paid, so the full
                    # effective scheduled amount is still outstanding.
                    outstanding += eff

            month_charges = [c for c in charges if c.month == month]
            for c in month_charges:
                required += c.amount
                if c.is_paid:
                    paid += c.amount
                else:
                    outstanding += c.amount

            if outstanding <= 0 and required > 0 and paid >= required:
                status = "paid"
            elif outstanding > 0 and paid > 0:
                status = "partial"
            elif outstanding > 0:
                status = "pending"
            else:
                status = "none"

            months.append(
                MonthSummary(
                    month=month,
                    amount_required=required,
                    amount_paid=paid,
                    outstanding=outstanding,
                    status=status,
                )
            )

        total_required = sum((m.amount_required for m in months), Decimal("0"))
        total_paid = sum((m.amount_paid for m in months), Decimal("0"))
        total_outstanding = sum((m.outstanding for m in months), Decimal("0"))

        return StudentSummaryResponse(
            student_id=student_id,
            academic_year=academic_year,
            total_required=total_required,
            total_paid=total_paid,
            total_outstanding=total_outstanding,
            months=months,
        )
