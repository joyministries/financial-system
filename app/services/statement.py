from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError
from app.core.money import to_decimal
from app.models.financial import Statement
from app.models.payment import Payment
from app.services.charge import ChargeService
from app.services.ledger import LedgerService

D0 = Decimal("0")


class StatementService:
    """Monthly statement snapshots derived from the Excel-aligned ledger.

    Everything shown here comes from LedgerService (invoices minus verified
    payments) — never from MonthlySchedule / OutstandingBalance.

    Because the school's INV lines are annual invoices dated January (with a
    small number of pro-rated invoices in later months), a monthly statement
    reads like a running ledger: the fees billed *in that month* are the
    installment debit, verified payments in that month are the credit, and
    the closing balance is the running outstanding at the end of the month.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.charge_service = ChargeService(db)
        self.ledger = LedgerService(db)

    async def generate(self, student_id: str, academic_year: int, month: int) -> Statement:
        # Idempotency: return existing statement if already generated
        existing = await self.get(student_id, academic_year, month)
        if existing:
            raise ConflictError(
                f"Statement already exists for student {student_id}, "
                f"{academic_year}-{month:02d}"
            )

        breakdown = await self.ledger.monthly_breakdown(student_id, academic_year)
        month_row = next((r for r in breakdown if r["month"] == month), None)
        prev_row = next((r for r in breakdown if r["month"] == month - 1), None)

        opening = prev_row["outstanding"] if prev_row else D0
        installment = month_row["required"] if month_row else D0

        charges = await self.charge_service.list_for_student(student_id, academic_year)
        total_additional = sum(
            (c.amount for c in charges if c.month == month), D0
        )

        total_payments = month_row["paid"] if month_row else D0

        closing = to_decimal(opening + installment + total_additional - total_payments)

        total_fees = sum((r["required"] for r in breakdown), D0)

        statement = Statement(
            student_id=student_id,
            academic_year=academic_year,
            month=month,
            opening_balance=opening,
            total_fees=total_fees,
            total_installments=installment,
            total_additional_charges=total_additional,
            total_payments=total_payments,
            closing_balance=closing,
            current_amount_due=closing,
            due_date=self._due_date_for(academic_year, month),
        )
        self.db.add(statement)
        await self.db.flush()
        return statement

    async def get(self, student_id: str, academic_year: int, month: int) -> Statement | None:
        stmt = select(Statement).where(
            Statement.student_id == student_id,
            Statement.academic_year == academic_year,
            Statement.month == month,
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_for_student(self, student_id: str, academic_year: int) -> list[Statement]:
        stmt = (
            select(Statement)
            .where(
                Statement.student_id == student_id,
                Statement.academic_year == academic_year,
            )
            .order_by(Statement.month)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def delete_for_student(self, student_id: str, academic_year: int) -> int:
        """Delete all statements for a student+year. Returns count deleted."""
        stmts = await self.list_for_student(student_id, academic_year)
        count = len(stmts)
        for s in stmts:
            await self.db.delete(s)
        await self.db.flush()
        return count

    async def _verified_payments_for_month(
        self, student_id: str, academic_year: int, month: int
    ) -> list[Payment]:
        start = datetime(academic_year, month, 1, tzinfo=UTC)
        if month == 12:
            end = datetime(academic_year + 1, 1, 1, tzinfo=UTC)
        else:
            end = datetime(academic_year, month + 1, 1, tzinfo=UTC)

        stmt = select(Payment).where(
            Payment.student_id == student_id,
            Payment.status == "verified",
            Payment.payment_date >= start,
            Payment.payment_date < end,
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    def _due_date_for(self, academic_year: int, month: int) -> datetime:
        if month == 12:
            return datetime(academic_year + 1, 1, 1, tzinfo=UTC)
        return datetime(academic_year, month + 1, 1, tzinfo=UTC)

    async def ledger_for_statement(self, statement: Statement) -> list[dict]:
        """Build the bank-style ledger rows for a generated statement.

        Mirrors the frontend ledger: opening balance -> fees billed this month
        (debit) -> additional charges (debit) -> verified payments (credit) ->
        closing balance, with a running balance column.
        """
        charges = await self.charge_service.list_for_student(
            statement.student_id, statement.academic_year
        )
        charges = [c for c in charges if c.month == statement.month]
        payments = await self._verified_payments_for_month(
            statement.student_id, statement.academic_year, statement.month
        )

        due_date = self._due_date_for(statement.academic_year, statement.month)
        due_str = due_date.strftime("%d %b %Y")

        rows: list[dict] = []
        balance = to_decimal(statement.opening_balance)

        rows.append(
            {
                "date": due_str,
                "reference": None,
                "description": "Balance brought forward",
                "debit": None,
                "credit": None,
                "balance": balance,
                "bold": True,
            }
        )

        if statement.total_installments > 0:
            balance += statement.total_installments
            rows.append(
                {
                    "date": due_str,
                    "reference": None,
                    "description": (
                        f"Fees for {statement.month:02d}/{statement.academic_year}"
                    ),
                    "debit": statement.total_installments,
                    "credit": None,
                    "balance": balance,
                }
            )

        for c in charges:
            balance += c.amount
            desc = c.description
            if c.charge_type:
                desc = f"{desc} ({c.charge_type})"
            rows.append(
                {
                    "date": c.created_at.strftime("%d %b %Y") if c.created_at else due_str,
                    "reference": None,
                    "description": desc,
                    "debit": c.amount,
                    "credit": None,
                    "balance": balance,
                }
            )

        for p in payments:
            balance -= p.amount
            rows.append(
                {
                    "date": p.payment_date.strftime("%d %b %Y") if p.payment_date else due_str,
                    "reference": p.reference_number or "",
                    "description": f"Payment — {p.payment_method}",
                    "debit": None,
                    "credit": p.amount,
                    "balance": balance,
                }
            )

        if abs(balance - to_decimal(statement.closing_balance)) > Decimal("0.01"):
            balance = to_decimal(statement.closing_balance)

        rows.append(
            {
                "date": due_str,
                "reference": None,
                "description": "Balance carried forward",
                "debit": None,
                "credit": None,
                "balance": balance,
                "bold": True,
            }
        )
        return rows