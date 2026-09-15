"""LedgerService — the single source of truth for everything the app displays.

The school's accounting ledger (Customer_Statements.xlsx) is the authority:
  - an INVOICE line  = money the student owes   -> stored in invoices (non-void)
  - a PAYMENT line   = money the student paid   -> stored in payments (verified)

For every student the displayed numbers are therefore:
  total_required   = SUM(invoice.subtotal)        # Excel debit total
  total_paid       = SUM(payment.amount)          # Excel credit total
  total_outstanding= total_required - total_paid  # Excel amount_due_2026

Nothing here reads MonthlySchedule / OutstandingBalance — those tables are the
app's internal installment engine and are NOT what the school's spreadsheet
shows. This service exists so every API/report path shows exactly the Excel
ledger, to the cent.
"""

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.grade import Grade, Student
from app.models.invoice import Invoice
from app.models.payment import Payment

D0 = Decimal("0")


class LedgerService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ------------------------------------------------------------------ #
    #  Per-student totals                                                 #
    # ------------------------------------------------------------------ #
    async def required(self, student_id: str, academic_year: int) -> Decimal:
        stmt = select(func.coalesce(func.sum(Invoice.subtotal), 0)).where(
            Invoice.student_id == student_id,
            Invoice.status != "void",
            Invoice.academic_year == academic_year,
        )
        return (await self.db.execute(stmt)).scalar() or D0

    async def required_month(self, student_id: str, academic_year: int, month: int) -> Decimal:
        stmt = select(func.coalesce(func.sum(Invoice.subtotal), 0)).where(
            Invoice.student_id == student_id,
            Invoice.status != "void",
            Invoice.academic_year == academic_year,
            Invoice.month == month,
        )
        return (await self.db.execute(stmt)).scalar() or D0

    async def paid(self, student_id: str, academic_year: int) -> Decimal:
        start = datetime(academic_year, 1, 1, tzinfo=UTC)
        end = datetime(academic_year + 1, 1, 1, tzinfo=UTC)
        stmt = select(func.coalesce(func.sum(Payment.amount), 0)).where(
            Payment.student_id == student_id,
            Payment.status == "verified",
            Payment.payment_date >= start,
            Payment.payment_date < end,
        )
        return (await self.db.execute(stmt)).scalar() or D0

    async def outstanding(self, student_id: str, academic_year: int) -> Decimal:
        req = await self.required(student_id, academic_year)
        paid = await self.paid(student_id, academic_year)
        return req - paid

    async def totals(self, student_id: str, academic_year: int) -> dict:
        req = await self.required(student_id, academic_year)
        paid = await self.paid(student_id, academic_year)
        return {
            "required": req,
            "paid": paid,
            "outstanding": req - paid,
        }

    # ------------------------------------------------------------------ #
    #  Per-month breakdown (running ledger: required in, paid out)         #
    # ------------------------------------------------------------------ #
    async def monthly_breakdown(self, student_id: str, academic_year: int) -> list[dict]:
        """Return month 1..12: amount_required (invoices dated that month),
        amount_paid (payments in that month), and a running outstanding that
        ends at the year's true balance."""
        required_by_month: dict[int, Decimal] = {}
        stmt = select(Invoice.month, func.sum(Invoice.subtotal)).where(
            Invoice.student_id == student_id,
            Invoice.status != "void",
            Invoice.academic_year == academic_year,
        ).group_by(Invoice.month)
        for m, amt in (await self.db.execute(stmt)).all():
            required_by_month[m] = amt

        paid_by_month: dict[int, Decimal] = {}
        start = datetime(academic_year, 1, 1, tzinfo=UTC)
        end = datetime(academic_year + 1, 1, 1, tzinfo=UTC)
        pstmt = select(Payment).where(
            Payment.student_id == student_id,
            Payment.status == "verified",
            Payment.payment_date >= start,
            Payment.payment_date < end,
        )
        for p in (await self.db.execute(pstmt)).scalars().all():
            m = p.payment_date.month
            paid_by_month[m] = paid_by_month.get(m, D0) + p.amount

        running = D0
        rows = []
        for m in range(1, 13):
            req = required_by_month.get(m, D0)
            paid = paid_by_month.get(m, D0)
            running += req - paid
            rows.append({"month": m, "required": req, "paid": paid, "outstanding": running})
        return rows

    # ------------------------------------------------------------------ #
    #  Aggregates for reports (admin dashboard, suspension list, etc.)     #
    # ------------------------------------------------------------------ #
    async def students_outstanding(
        self,
        academic_year: int,
        grade_id: str | None = None,
        up_to_month: int | None = None,
    ) -> list[dict]:
        """Per-student (required, paid, outstanding) for approved students.

        If up_to_month is given, only invoices with month <= up_to_month count
        toward required, and only payments before the following month count
        toward paid — the "outstanding position up to and including month".
        """
        start = datetime(academic_year, 1, 1, tzinfo=UTC)
        if up_to_month is None:
            end = datetime(academic_year + 1, 1, 1, tzinfo=UTC)
        elif up_to_month == 12:
            end = datetime(academic_year + 1, 1, 1, tzinfo=UTC)
        else:
            end = datetime(academic_year, up_to_month + 1, 1, tzinfo=UTC)

        # required per student (invoices, optionally up to month)
        inv_stmt = (
            select(
                Student.id,
                Student.student_number,
                Student.first_name,
                Student.last_name,
                Grade.name.label("grade_name"),
                func.coalesce(func.sum(Invoice.subtotal), 0).label("required"),
            )
            .join(Grade, Grade.id == Student.grade_id)
            .outerjoin(
                Invoice,
                and_(
                    Invoice.student_id == Student.id,
                    Invoice.status != "void",
                    Invoice.academic_year == academic_year,
                ),
            )
            .where(Student.is_active == True)  # noqa: E712
        )
        if up_to_month is not None:
            inv_stmt = inv_stmt.where(
                or_expr(Invoice.month <= up_to_month, Invoice.id.is_(None))
            )
        if grade_id:
            inv_stmt = inv_stmt.where(Student.grade_id == grade_id)
        inv_stmt = inv_stmt.group_by(
            Student.id, Student.student_number, Student.first_name,
            Student.last_name, Grade.name,
        )
        inv_rows = (await self.db.execute(inv_stmt)).all()

        # paid per student (verified payments in range)
        pay_stmt = (
            select(
                Student.id,
                func.coalesce(func.sum(Payment.amount), 0).label("paid"),
            )
            .join(Payment, and_(
                Payment.student_id == Student.id,
                Payment.status == "verified",
                Payment.payment_date >= start,
                Payment.payment_date < end,
            ))
            .where(Student.is_active == True)  # noqa: E712
        )
        if grade_id:
            pay_stmt = pay_stmt.where(Student.grade_id == grade_id)
        pay_stmt = pay_stmt.group_by(Student.id)
        pay_rows = dict((await self.db.execute(pay_stmt)).all())

        out = []
        for r in inv_rows:
            required = Decimal(str(r.required))
            paid = pay_rows.get(r.id, D0)
            out.append({
                "student_id": r.id,
                "student_number": r.student_number,
                "name": f"{r.first_name} {r.last_name}",
                "grade": r.grade_name,
                "required": required,
                "paid": paid,
                "outstanding": required - paid,
            })
        return out


def or_expr(a, b):
    """Small helper so the module does not need sqlalchemy's or_ import at top."""
    from sqlalchemy import or_

    return or_(a, b)