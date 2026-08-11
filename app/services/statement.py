from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError
from app.core.money import to_decimal
from app.models.financial import Statement
from app.models.grade import FeeStructure, Student
from app.models.payment import Payment
from app.models.schedule import MonthlySchedule
from app.services.charge import ChargeService


class StatementService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.charge_service = ChargeService(db)

    async def generate(self, student_id: str, academic_year: int, month: int) -> Statement:
        # Idempotency: return existing statement if already generated
        existing = await self.get(student_id, academic_year, month)
        if existing:
            raise ConflictError(
                f"Statement already exists for student {student_id}, "
                f"{academic_year}-{month:02d}"
            )

        total_fees = await self._total_annual_fees(student_id, academic_year)
        installment = await self._installment_for_month(student_id, academic_year, month)

        charges = await self.charge_service.list_for_student(student_id, academic_year)
        total_additional = sum(
            (c.amount for c in charges if c.month == month), Decimal("0")
        )

        payments = await self._verified_payments_for_month(student_id, academic_year, month)
        total_payments = sum((p.amount for p in payments), Decimal("0"))

        opening = await self._opening_balance(student_id, academic_year, month)
        closing = to_decimal(opening + installment + total_additional - total_payments)

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
            current_amount_due=max(Decimal("0"), closing),
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

    async def _total_annual_fees(self, student_id: str, academic_year: int) -> Decimal:
        student = await self.db.get(Student, student_id)
        if not student:
            return Decimal("0")

        stmt = select(FeeStructure).where(
            FeeStructure.grade_id == student.grade_id,
            FeeStructure.academic_year == academic_year,
            FeeStructure.is_active == True,  # noqa: E712
        )
        result = await self.db.execute(stmt)
        fees = result.scalars().all()
        return sum((f.annual_amount for f in fees), Decimal("0"))

    async def _installment_for_month(
        self, student_id: str, academic_year: int, month: int
    ) -> Decimal:
        student = await self.db.get(Student, student_id)
        if not student:
            return Decimal("0")

        stmt = (
            select(MonthlySchedule)
            .join(FeeStructure, FeeStructure.id == MonthlySchedule.fee_structure_id)
            .where(
                FeeStructure.grade_id == student.grade_id,
                FeeStructure.academic_year == academic_year,
                MonthlySchedule.month == month,
            )
        )
        result = await self.db.execute(stmt)
        schedules = result.scalars().all()
        return sum((s.amount_due for s in schedules), Decimal("0"))

    async def _opening_balance(
        self, student_id: str, academic_year: int, month: int
    ) -> Decimal:
        if month == 1:
            return Decimal("0")

        prev = await self.get(student_id, academic_year, month - 1)
        return to_decimal(prev.closing_balance) if prev else Decimal("0")

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

        Mirrors the frontend ledger: opening balance -> monthly installment
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
                    "description": (
                        f"Monthly installment — {statement.month:02d}/{statement.academic_year}"
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
                    "description": desc,
                    "debit": c.amount,
                    "credit": None,
                    "balance": balance,
                }
            )

        for p in payments:
            balance -= p.amount
            ref = f" ({p.reference_number})" if p.reference_number else ""
            rows.append(
                {
                    "date": p.payment_date.strftime("%d %b %Y") if p.payment_date else due_str,
                    "description": f"Payment — {p.payment_method}{ref}",
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
                "description": "Balance carried forward",
                "debit": None,
                "credit": None,
                "balance": balance,
                "bold": True,
            }
        )
        return rows
