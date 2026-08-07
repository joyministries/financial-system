from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.grade import Grade, Student
from app.models.payment import Payment
from app.models.schedule import MonthlySchedule, OutstandingBalance
from app.services.schedule import ScheduleService


class ReportService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def monthly_income(self, academic_year: int, month: int) -> dict:
        start, end = self._month_range(academic_year, month)

        stmt = select(func.sum(Payment.amount)).where(
            Payment.status == "verified",
            Payment.payment_date >= start,
            Payment.payment_date < end,
        )
        result = await self.db.execute(stmt)
        total = result.scalar() or Decimal("0")

        stmt_count = select(func.count(Payment.id)).where(
            Payment.status == "verified",
            Payment.payment_date >= start,
            Payment.payment_date < end,
        )
        count_result = await self.db.execute(stmt_count)
        count = count_result.scalar() or 0

        return {
            "period": f"{academic_year}-{month:02d}",
            "total_income": str(total),
            "payment_count": count,
        }

    async def monthly_summary(
        self,
        academic_year: int,
        month: int,
        grade_id: str | None = None,
    ) -> dict:
        """Monthly admin dashboard view.

        Combines income actually received in the month with the outstanding
        position up to (and including) that month, so admins can see, for a
        single month: how much was collected, how much is still owed, and
        which students owe. Optionally scoped to a single grade.
        """
        start, end = self._month_range(academic_year, month)

        # Ensure every active student has ledger rows (outstanding balances)
        # before aggregating, so the outstanding view is not silently empty.
        await ScheduleService(self.db).materialize_for_all(academic_year, grade_id)

        # Income received during the month
        income_stmt = select(func.sum(Payment.amount)).where(
            Payment.status == "verified",
            Payment.payment_date >= start,
            Payment.payment_date < end,
        )
        count_stmt = select(func.count(Payment.id)).where(
            Payment.status == "verified",
            Payment.payment_date >= start,
            Payment.payment_date < end,
        )
        if grade_id:
            income_stmt = income_stmt.join(
                Student, Student.id == Payment.student_id
            ).where(Student.grade_id == grade_id)
            count_stmt = count_stmt.join(
                Student, Student.id == Payment.student_id
            ).where(Student.grade_id == grade_id)
        total_income = (await self.db.execute(income_stmt)).scalar() or Decimal("0")
        payment_count = (await self.db.execute(count_stmt)).scalar() or 0

        # Outstanding position: balances for schedules up to the month
        out_stmt = (
            select(
                Student.id,
                Student.student_number,
                Student.first_name,
                Student.last_name,
                Grade.name.label("grade_name"),
                func.sum(OutstandingBalance.balance).label("total_outstanding"),
            )
            .join(Grade, Grade.id == Student.grade_id)
            .join(OutstandingBalance, OutstandingBalance.student_id == Student.id)
            .join(MonthlySchedule, MonthlySchedule.id == OutstandingBalance.monthly_schedule_id)
            .where(
                MonthlySchedule.academic_year == academic_year,
                MonthlySchedule.month <= month,
                OutstandingBalance.status != "paid",
            )
            .group_by(
                Student.id,
                Student.student_number,
                Student.first_name,
                Student.last_name,
                Grade.name,
            )
        )
        if grade_id:
            out_stmt = out_stmt.where(Student.grade_id == grade_id)
        out_result = await self.db.execute(out_stmt)
        rows = [
            r
            for r in out_result.all()
            if (Decimal(str(r.total_outstanding)) > 0)
        ]
        rows.sort(key=lambda r: Decimal(str(r.total_outstanding)), reverse=True)

        return {
            "academic_year": academic_year,
            "month": month,
            "total_income": str(total_income),
            "payment_count": payment_count,
            "outstanding_total": str(
                sum((Decimal(str(r.total_outstanding)) for r in rows), Decimal("0"))
            ),
            "students_owing": len(rows),
            "students_owing_list": [
                {
                    "student_id": r.id,
                    "student_number": r.student_number,
                    "name": f"{r.first_name} {r.last_name}",
                    "grade": r.grade_name,
                    "balance": str(r.total_outstanding),
                }
                for r in rows
            ],
        }

    async def yearly_income(self, academic_year: int) -> dict:
        start = datetime(academic_year, 1, 1, tzinfo=UTC)
        end = datetime(academic_year + 1, 1, 1, tzinfo=UTC)

        stmt = select(Payment).where(
            Payment.status == "verified",
            Payment.payment_date >= start,
            Payment.payment_date < end,
        )
        result = await self.db.execute(stmt)
        payments = result.scalars().all()

        monthly_breakdown: dict[int, Decimal] = {}
        monthly_counts: dict[int, int] = {}
        for p in payments:
            m = p.payment_date.month
            monthly_breakdown[m] = monthly_breakdown.get(m, Decimal("0")) + p.amount
            monthly_counts[m] = monthly_counts.get(m, 0) + 1

        monthly_data = [
            {
                "period": f"{academic_year}-{m:02d}",
                "total_income": str(monthly_breakdown.get(m, Decimal("0"))),
                "payment_count": monthly_counts.get(m, 0),
            }
            for m in range(1, 13)
        ]

        total = sum(Decimal(d["total_income"]) for d in monthly_data)
        return {
            "academic_year": academic_year,
            "total_income": str(total),
            "monthly_breakdown": monthly_data,
        }

    async def outstanding_fees(self, academic_year: int) -> dict:
        stmt = (
            select(
                Student.id,
                Student.student_number,
                Student.first_name,
                Student.last_name,
                func.sum(OutstandingBalance.balance).label("total_outstanding"),
            )
            .join(OutstandingBalance, OutstandingBalance.student_id == Student.id)
            .join(MonthlySchedule, MonthlySchedule.id == OutstandingBalance.monthly_schedule_id)
            .where(
                MonthlySchedule.academic_year == academic_year,
                OutstandingBalance.status != "paid",
            )
            .group_by(Student.id, Student.student_number, Student.first_name, Student.last_name)
        )
        result = await self.db.execute(stmt)
        rows = result.all()

        return {
            "academic_year": academic_year,
            "students_with_outstanding": len(rows),
            "students": [
                {
                    "student_id": r.id,
                    "student_number": r.student_number,
                    "name": f"{r.first_name} {r.last_name}",
                    "outstanding": str(r.total_outstanding),
                }
                for r in rows
            ],
        }

    async def payments_received(
        self,
        academic_year: int,
        grade_id: str | None = None,
        payment_method: str | None = None,
    ) -> dict:
        start = datetime(academic_year, 1, 1, tzinfo=UTC)
        end = datetime(academic_year + 1, 1, 1, tzinfo=UTC)

        stmt = select(Payment).where(
            Payment.status == "verified",
            Payment.payment_date >= start,
            Payment.payment_date < end,
        )
        if payment_method:
            stmt = stmt.where(Payment.payment_method == payment_method)

        result = await self.db.execute(stmt)
        payments = result.scalars().all()

        # Filter by grade in-memory since payment doesn't directly reference grade
        if grade_id:
            student_stmt = select(Student.id).where(Student.grade_id == grade_id)
            student_result = await self.db.execute(student_stmt)
            student_ids = set(student_result.scalars().all())
            payments = [p for p in payments if p.student_id in student_ids]

        total = sum((p.amount for p in payments), Decimal("0"))
        by_method: dict[str, str] = {}
        for p in payments:
            current = Decimal(by_method.get(p.payment_method, "0"))
            by_method[p.payment_method] = str(current + p.amount)

        return {
            "academic_year": academic_year,
            "total_received": str(total),
            "payment_count": len(payments),
            "by_method": by_method,
        }

    async def payment_trends(self, academic_year: int) -> dict:
        start = datetime(academic_year, 1, 1, tzinfo=UTC)
        end = datetime(academic_year + 1, 1, 1, tzinfo=UTC)

        stmt = select(Payment).where(
            Payment.status == "verified",
            Payment.payment_date >= start,
            Payment.payment_date < end,
        )
        result = await self.db.execute(stmt)
        payments = result.scalars().all()

        monthly_totals: dict[int, Decimal] = {}
        for p in payments:
            m = p.payment_date.month
            monthly_totals[m] = monthly_totals.get(m, Decimal("0")) + p.amount

        return {
            "academic_year": academic_year,
            "trends": [
                {"month": m, "total": str(monthly_totals.get(m, Decimal("0")))}
                for m in range(1, 13)
            ],
        }

    async def statement_report(
        self, academic_year: int, status_filter: str | None = None
    ) -> dict:
        """School-wide statement summary — every approved student with their
        outstanding balance for the academic year (balance 0 when no fee rows
        exist yet), so admin can see the whole school, not just one child."""
        stmt = (
            select(
                Student.id,
                Student.student_number,
                Student.first_name,
                Student.last_name,
                Grade.name.label("grade"),
                func.coalesce(
                    func.sum(OutstandingBalance.balance), Decimal("0")
                ).label("total_balance"),
            )
            .outerjoin(
                OutstandingBalance,
                OutstandingBalance.student_id == Student.id,
            )
            .outerjoin(
                MonthlySchedule,
                and_(
                    MonthlySchedule.id == OutstandingBalance.monthly_schedule_id,
                    MonthlySchedule.academic_year == academic_year,
                ),
            )
            .outerjoin(Grade, Grade.id == Student.grade_id)
            .where(Student.registration_status == "approved")
            .group_by(
                Student.id,
                Student.student_number,
                Student.first_name,
                Student.last_name,
                Grade.name,
            )
            .order_by(Grade.name, Student.first_name, Student.last_name)
        )
        result = await self.db.execute(stmt)
        rows = result.all()

        students = []
        total_outstanding = Decimal("0")
        for r in rows:
            balance = Decimal(str(r.total_balance))
            student_status = "paid" if balance <= 0 else "overdue"
            if student_status == "overdue":
                total_outstanding += balance

            if status_filter and student_status != status_filter:
                continue

            students.append({
                "student_id": r.id,
                "student_number": r.student_number,
                "name": f"{r.first_name} {r.last_name}",
                "grade": r.grade or "",
                "balance": str(balance),
                "status": student_status,
            })

        return {
            "academic_year": academic_year,
            "total_students": len(students),
            "total_outstanding": str(total_outstanding),
            "students": students,
        }

    async def carry_forward(self, academic_year: int, month: int) -> dict:
        """Dashboard carry-forward section.

        - not_paid: active students with NO verified payment in the selected
          month (they have not paid for that month yet)
        - outstanding: students with a positive OutstandingBalance in the
          academic year up to (and including) the selected month
        """
        start, end = self._month_range(academic_year, month)

        paid_stmt = select(Payment.student_id).where(
            Payment.status == "verified",
            Payment.payment_date >= start,
            Payment.payment_date < end,
        )
        paid_result = await self.db.execute(paid_stmt)
        paid_ids = set(paid_result.scalars().all())

        stmt = (
            select(Student, Grade.name)
            .join(Grade, Grade.id == Student.grade_id)
            .where(Student.is_active == True)  # noqa: E712
            .order_by(Student.last_name)
        )
        result = await self.db.execute(stmt)
        rows = result.all()

        not_paid = [
            {
                "student_id": s.id,
                "student_number": s.student_number,
                "name": f"{s.first_name} {s.last_name}",
                "grade": grade_name,
            }
            for s, grade_name in rows
            if s.id not in paid_ids
        ]

        outstanding_stmt = (
            select(
                Student.id,
                Student.student_number,
                Student.first_name,
                Student.last_name,
                Grade.name.label("grade_name"),
                func.sum(OutstandingBalance.balance).label("total_outstanding"),
            )
            .join(Grade, Grade.id == Student.grade_id)
            .join(OutstandingBalance, OutstandingBalance.student_id == Student.id)
            .join(MonthlySchedule, MonthlySchedule.id == OutstandingBalance.monthly_schedule_id)
            .where(
                MonthlySchedule.academic_year == academic_year,
                MonthlySchedule.month <= month,
                OutstandingBalance.status != "paid",
            )
            .group_by(
                Student.id,
                Student.student_number,
                Student.first_name,
                Student.last_name,
                Grade.name,
            )
        )
        outstanding_result = await self.db.execute(outstanding_stmt)
        outstanding_rows = outstanding_result.all()

        outstanding = [
            {
                "student_id": r.id,
                "student_number": r.student_number,
                "name": f"{r.first_name} {r.last_name}",
                "grade": r.grade_name,
                "balance": str(r.total_outstanding),
            }
            for r in outstanding_rows
            if Decimal(str(r.total_outstanding)) > 0
        ]
        outstanding.sort(key=lambda r: Decimal(r["balance"]), reverse=True)

        return {
            "academic_year": academic_year,
            "month": month,
            "not_paid_count": len(not_paid),
            "not_paid": not_paid,
            "outstanding_count": len(outstanding),
            "outstanding": outstanding,
        }

    def _month_range(self, year: int, month: int) -> tuple[datetime, datetime]:
        """Return [start, end) boundaries for a given month."""
        start = datetime(year, month, 1, tzinfo=UTC)
        if month == 12:
            end = datetime(year + 1, 1, 1, tzinfo=UTC)
        else:
            end = datetime(year, month + 1, 1, tzinfo=UTC)
        return start, end
