import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BusinessRuleError, ConflictError, NotFoundError
from app.core.money import to_decimal
from app.models.grade import FeeStructure, Student
from app.models.invoice import Invoice
from app.models.payment import Payment
from app.models.schedule import MonthlySchedule, OutstandingBalance
from app.services.charge import ChargeService
from app.services.schedule import ScheduleService


class InvoiceService:
    """Generate and manage monthly student invoices.

    An invoice is a billing snapshot for one student for one month: opening
    balance carried forward, fee installments and additional charges due, and
    payments already received. Line items are stored as immutable JSON.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.charge_service = ChargeService(db)
        self.schedule_service = ScheduleService(db)

    async def generate(
        self, student_id: str, academic_year: int, month: int, created_by: str
    ) -> Invoice:
        student = await self.db.get(Student, student_id)
        if not student:
            raise NotFoundError("Student", student_id)

        existing = await self.get_for_period(student_id, academic_year, month)
        if existing:
            raise ConflictError(
                f"Invoice already exists for student {student_id}, "
                f"{academic_year}-{month:02d} ({existing.invoice_number})"
            )

        # Materialize missing outstanding balances first so the opening
        # balance and invoice snapshot reflect the true ledger.
        await self.schedule_service.get_outstanding_for_student(student_id, academic_year)

        opening = await self._opening_balance(student_id, academic_year, month)
        fee_items = await self._fee_items(student_id, academic_year, month)
        charge_items = await self._charge_items(student_id, academic_year, month)

        items = [
            {
                "type": "opening",
                "description": "Opening balance (carried forward)",
                "amount": str(opening),
            }
        ]
        items += fee_items
        items += charge_items

        subtotal = opening + sum(
            (Decimal(item["amount"]) for item in items if item["type"] != "opening"), Decimal("0")
        )
        amount_paid = await self._payments_in_month(student_id, academic_year, month)
        balance_due = max(Decimal("0"), subtotal - amount_paid)

        invoice = Invoice(
            invoice_number=f"INV-{academic_year}-{month:02d}-{uuid.uuid4().hex[:4].upper()}",
            student_id=student_id,
            academic_year=academic_year,
            month=month,
            issue_date=datetime.now(UTC),
            due_date=self._due_date_for(academic_year, month),
            subtotal=subtotal,
            amount_paid=amount_paid,
            balance_due=balance_due,
            status="paid" if balance_due <= 0 else "issued",
            items=items,
            created_by=created_by,
        )
        self.db.add(invoice)
        await self.db.flush()
        return invoice

    async def get(self, invoice_id: str) -> Invoice | None:
        return await self.db.get(Invoice, invoice_id)

    async def get_for_period(
        self, student_id: str, academic_year: int, month: int
    ) -> Invoice | None:
        stmt = select(Invoice).where(
            Invoice.student_id == student_id,
            Invoice.academic_year == academic_year,
            Invoice.month == month,
            Invoice.status != "void",
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_invoices(
        self,
        student_ids: list[str] | None = None,
        academic_year: int | None = None,
        month: int | None = None,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Invoice]:
        stmt = select(Invoice)

        if student_ids is not None:
            if not student_ids:
                return []
            stmt = stmt.where(Invoice.student_id.in_(student_ids))
        if academic_year:
            stmt = stmt.where(Invoice.academic_year == academic_year)
        if month:
            stmt = stmt.where(Invoice.month == month)
        if status:
            stmt = stmt.where(Invoice.status == status)

        stmt = stmt.order_by(Invoice.created_at.desc()).limit(limit).offset(offset)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def update_status(self, invoice_id: str, status: str, user_id: str) -> Invoice:
        invoice = await self.get(invoice_id)
        if not invoice:
            raise NotFoundError("Invoice", invoice_id)
        if invoice.status in ("void",):
            raise BusinessRuleError("Cannot change status of a void invoice")
        if status == "paid":
            invoice.status = "paid"
            invoice.balance_due = Decimal("0")
        elif status == "void":
            invoice.status = "void"
        await self.db.flush()
        return invoice

    # ── Internals ───────────────────────────────────────────

    async def _opening_balance(
        self, student_id: str, academic_year: int, month: int
    ) -> Decimal:
        """Outstanding balance carried into the month (previous schedules)."""
        if month == 1:
            return Decimal("0")
        stmt = (
            select(OutstandingBalance)
            .join(MonthlySchedule, MonthlySchedule.id == OutstandingBalance.monthly_schedule_id)
            .where(
                OutstandingBalance.student_id == student_id,
                OutstandingBalance.status != "paid",
                MonthlySchedule.academic_year == academic_year,
                MonthlySchedule.month < month,
            )
        )
        result = await self.db.execute(stmt)
        balances = result.scalars().all()
        return sum((to_decimal(b.balance) for b in balances), Decimal("0"))

    async def _fee_items(
        self, student_id: str, academic_year: int, month: int
    ) -> list[dict]:
        student = await self.db.get(Student, student_id)
        if not student:
            return []

        stmt = (
            select(FeeStructure, MonthlySchedule)
            .join(MonthlySchedule, MonthlySchedule.fee_structure_id == FeeStructure.id)
            .where(
                FeeStructure.grade_id == student.grade_id,
                FeeStructure.academic_year == academic_year,
                MonthlySchedule.month == month,
            )
            .order_by(FeeStructure.category)
        )
        result = await self.db.execute(stmt)
        rows = result.all()

        by_category: dict[str, Decimal] = {}
        for fee, schedule in rows:
            by_category[fee.category] = to_decimal(
                by_category.get(fee.category, Decimal("0")) + schedule.amount_due
            )
        return [
            {
                "type": "fee",
                "description": f"{category} — monthly installment",
                "amount": str(amount),
            }
            for category, amount in sorted(by_category.items())
        ]

    async def _charge_items(
        self, student_id: str, academic_year: int, month: int
    ) -> list[dict]:
        charges = await self.charge_service.list_for_student(student_id, academic_year)
        month_charges = [c for c in charges if c.month == month]
        return [
            {
                "type": "charge",
                "description": (
                    f"{c.charge_type}: {c.description}" if c.description else c.charge_type
                ),
                "amount": str(c.amount),
            }
            for c in month_charges
        ]

    async def _payments_in_month(
        self, student_id: str, academic_year: int, month: int
    ) -> Decimal:
        if month == 12:
            start = datetime(academic_year, month, 1, tzinfo=UTC)
            end = datetime(academic_year + 1, 1, 1, tzinfo=UTC)
        else:
            start = datetime(academic_year, month, 1, tzinfo=UTC)
            end = datetime(academic_year, month + 1, 1, tzinfo=UTC)

        stmt = select(Payment).where(
            Payment.student_id == student_id,
            Payment.status == "verified",
            Payment.payment_date >= start,
            Payment.payment_date < end,
        )
        result = await self.db.execute(stmt)
        payments = result.scalars().all()
        return sum((to_decimal(p.amount) for p in payments), Decimal("0"))

    def _due_date_for(self, academic_year: int, month: int) -> datetime:
        if month == 12:
            return datetime(academic_year + 1, 1, 1, tzinfo=UTC)
        return datetime(academic_year, month + 1, 1, tzinfo=UTC)
