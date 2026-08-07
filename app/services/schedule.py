from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError
from app.models.schedule import MonthlySchedule, OutstandingBalance

if TYPE_CHECKING:
    from app.models.grade import FeeStructure


class ScheduleService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def generate_monthly_schedule(self, fee_structure: FeeStructure) -> list[MonthlySchedule]:
        # Idempotent regeneration: clear any existing schedules for this fee
        # structure first so re-running "Generate schedule" never duplicates.
        # Refuse to regenerate once balances (payments) reference the schedule —
        # that would destroy payment allocation history.
        stmt = select(MonthlySchedule).where(MonthlySchedule.fee_structure_id == fee_structure.id)
        result = await self.db.execute(stmt)
        existing = list(result.scalars().all())
        if existing:
            schedule_ids = [s.id for s in existing]
            ref_stmt = (
                select(OutstandingBalance.id)
                .where(OutstandingBalance.monthly_schedule_id.in_(schedule_ids))
                .limit(1)
            )
            if (await self.db.execute(ref_stmt)).scalar_one_or_none():
                raise ConflictError(
                    "Cannot regenerate: payments/balances exist for this schedule. "
                    "Delete the fee structure or clear balances first."
                )
            for s in existing:
                await self.db.delete(s)
            await self.db.flush()

        schedules = []
        if fee_structure.payment_plan == "yearly":
            # Yearly payers get one lump-sum schedule (month 1 = full annual amount).
            schedule = MonthlySchedule(
                fee_structure_id=fee_structure.id,
                month=1,
                academic_year=fee_structure.academic_year,
                amount_due=fee_structure.annual_amount,
                due_date=self._due_date_for(fee_structure.academic_year, 1),
            )
            self.db.add(schedule)
            schedules.append(schedule)
        else:
            installment = fee_structure.monthly_installment or Decimal("0")
            for month in range(1, 13):
                schedule = MonthlySchedule(
                    fee_structure_id=fee_structure.id,
                    month=month,
                    academic_year=fee_structure.academic_year,
                    amount_due=installment,
                    due_date=self._due_date_for(fee_structure.academic_year, month),
                )
                self.db.add(schedule)
                schedules.append(schedule)
        await self.db.flush()
        return schedules

    async def get_schedules_for_student(
        self, student_id: str, academic_year: int
    ) -> list[MonthlySchedule]:
        from app.models.grade import FeeStructure, Student

        grade_subq = select(Student.grade_id).where(Student.id == student_id).scalar_subquery()

        stmt = (
            select(MonthlySchedule)
            .join(FeeStructure, FeeStructure.id == MonthlySchedule.fee_structure_id)
            .where(
                FeeStructure.grade_id == grade_subq,
                MonthlySchedule.academic_year == academic_year,
            )
            .order_by(MonthlySchedule.month)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def create_outstanding_balance(
        self, student_id: str, monthly_schedule_id: str, amount: Decimal
    ) -> OutstandingBalance:
        balance = OutstandingBalance(
            student_id=student_id,
            monthly_schedule_id=monthly_schedule_id,
            original_amount=amount,
            balance=amount,
            status="pending",
        )
        self.db.add(balance)
        await self.db.flush()
        return balance

    async def get_outstanding_for_student(
        self, student_id: str, academic_year: int
    ) -> list[OutstandingBalance]:
        await self._materialize_student(student_id, academic_year)
        stmt = (
            select(OutstandingBalance)
            .join(MonthlySchedule, MonthlySchedule.id == OutstandingBalance.monthly_schedule_id)
            .where(
                OutstandingBalance.student_id == student_id,
                MonthlySchedule.academic_year == academic_year,
            )
            .order_by(MonthlySchedule.month)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def materialize_for_all(self, academic_year: int, grade_id: str | None = None) -> None:
        """Ensure every active student has outstanding balances for their schedules.

        Idempotent: only missing balance rows are created, so re-running this
        never duplicates or overwrites payment allocations.
        """
        from app.models.grade import Student

        stmt = select(Student.id).where(Student.is_active == True)  # noqa: E712
        if grade_id:
            stmt = stmt.where(Student.grade_id == grade_id)
        result = await self.db.execute(stmt)
        for (student_id,) in result.all():
            await self._materialize_student(student_id, academic_year)

    async def _materialize_student(self, student_id: str, academic_year: int) -> None:
        """Create OutstandingBalance rows for schedules that lack them.

        Outstanding balances are the ledger rows payments allocate against.
        If a grade's fee schedule was generated before a student was enrolled
        (or the rows were never seeded), they are created here on demand with
        the schedule's amount due and a pending status.
        """
        schedules = await self.get_schedules_for_student(student_id, academic_year)
        if not schedules:
            return

        schedule_ids = [s.id for s in schedules]
        stmt = select(OutstandingBalance.monthly_schedule_id).where(
            OutstandingBalance.student_id == student_id,
            OutstandingBalance.monthly_schedule_id.in_(schedule_ids),
        )
        result = await self.db.execute(stmt)
        existing_ids = set(result.scalars().all())

        created = False
        for schedule in schedules:
            if schedule.id not in existing_ids:
                self.db.add(
                    OutstandingBalance(
                        student_id=student_id,
                        monthly_schedule_id=schedule.id,
                        original_amount=schedule.amount_due,
                        balance=schedule.amount_due,
                        status="pending",
                    )
                )
                created = True
        if created:
            await self.db.flush()

    async def get_all_pending(self, academic_year: int) -> list[OutstandingBalance]:
        stmt = (
            select(OutstandingBalance)
            .join(MonthlySchedule, MonthlySchedule.id == OutstandingBalance.monthly_schedule_id)
            .where(
                MonthlySchedule.academic_year == academic_year,
                OutstandingBalance.status != "paid",
            )
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    def _due_date_for(self, academic_year: int, month: int) -> datetime:
        """Due on the 1st of the following month."""
        if month == 12:
            return datetime(academic_year + 1, 1, 1, tzinfo=UTC)
        return datetime(academic_year, month + 1, 1, tzinfo=UTC)
