from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.grade import Student
from app.schemas.financial import MonthSummary, StudentSummaryResponse
from app.services.ledger import LedgerService


class StudentSummaryService:
    """Per-student, per-month financial summary for the parent portal.

    Source of truth is the Excel-aligned ledger (LedgerService): invoices the
    student owes minus verified payments. The per-month breakdown is the
    running ledger: month's invoices as amount_required, month's payments as
    amount_paid, and a running outstanding that ends at the year's true balance.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.ledger = LedgerService(db)

    async def summarize(
        self, student_id: str, academic_year: int
    ) -> StudentSummaryResponse:
        student = await self.db.get(Student, student_id)

        months_data = await self.ledger.monthly_breakdown(student_id, academic_year)
        months: list[MonthSummary] = []
        for md in months_data:
            req, paid, out = md["required"], md["paid"], md["outstanding"]
            if out <= 0 and req > 0 and paid >= req:
                status = "paid"
            elif out > 0 and paid > 0:
                status = "partial"
            elif out > 0:
                status = "pending"
            else:
                status = "none"
            months.append(
                MonthSummary(
                    month=md["month"],
                    amount_required=req,
                    amount_paid=paid,
                    outstanding=out,
                    status=status,
                )
            )

        total_required = sum((m.amount_required for m in months), Decimal("0"))
        total_paid = sum((m.amount_paid for m in months), Decimal("0"))
        # Year-end running balance — the single figure Excel shows for the
        # year (may be negative when the parent is in credit).
        total_outstanding = months[-1].outstanding if months else Decimal("0")

        return StudentSummaryResponse(
            student_id=student_id,
            academic_year=academic_year,
            total_required=total_required,
            total_paid=total_paid,
            total_outstanding=total_outstanding,
            months=months,
        )