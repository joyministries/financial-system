import time
import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import func, select
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

        stmt = (
            stmt.order_by(Invoice.created_at.desc(), Invoice.id.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def count_invoices(
        self,
        student_ids: list[str] | None = None,
        academic_year: int | None = None,
        month: int | None = None,
        status: str | None = None,
    ) -> int:
        """count(*) mirroring list_invoices filters (for pagination metadata)."""
        stmt = select(func.count()).select_from(Invoice)

        if student_ids is not None:
            if not student_ids:
                return 0
            stmt = stmt.where(Invoice.student_id.in_(student_ids))
        if academic_year:
            stmt = stmt.where(Invoice.academic_year == academic_year)
        if month:
            stmt = stmt.where(Invoice.month == month)
        if status:
            stmt = stmt.where(Invoice.status == status)

        return int((await self.db.execute(stmt)).scalar_one())

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

    async def generate_all(
        self,
        academic_year: int,
        month: int,
        created_by: str,
        grade_id: str | None = None,
        notify_parents: bool = True,
        commit_every: int = 100,
        time_budget: float = 45.0,
    ) -> dict:
        """Generate invoices for every approved student (optionally one grade).

        Existing invoices are skipped (never duplicated). When `notify_parents`
        is set, each newly created invoice triggers an SMS to the student's
        billing parent.

        Progress is committed in batches of `commit_every` so a long whole-school
        run survives serverless timeouts: already-committed students are skipped
        if the run is interrupted and re-invoked.

        The loop also self-limits to `time_budget` seconds of wall-clock time.
        When the budget is exhausted the current batch is committed and the
        result reports ``complete=False`` so the caller can immediately re-invoke
        to resume. Returns
        {"generated", "skipped", "failed", "errors", "complete"}.
        """
        from app.services.sms import SmsService

        def _students_stmt():
            stmt = select(Student).where(Student.registration_status == "approved")
            if grade_id:
                stmt = stmt.where(Student.grade_id == grade_id)
            return stmt

        students = (await self.db.execute(_students_stmt())).scalars().all()

        generated = 0
        skipped = 0
        failed = 0
        errors: list[str] = []
        sms_service = SmsService(self.db)
        failed_ids: set[str] = set()
        start = time.monotonic()

        index = 0
        while index < len(students):
            if index > 0 and time.monotonic() - start > time_budget:
                break
            student = students[index]
            try:
                if await self.get_for_period(student.id, academic_year, month):
                    skipped += 1
                    index += 1
                    continue
                invoice = await self.generate(student.id, academic_year, month, created_by)
                generated += 1
                index += 1
                if notify_parents:
                    try:
                        await sms_service.send_invoice_ready(
                            student,
                            invoice.balance_due,
                            invoice.month,
                            invoice.academic_year,
                            created_by=created_by,
                        )
                    except Exception as exc:  # noqa: BLE001 - SMS must not fail the run
                        errors.append(f"SMS {student.id}: {exc}")
            except Exception as exc:  # noqa: BLE001 - one student must not abort the run
                failed += 1
                failed_ids.add(student.id)
                errors.append(f"{student.id}: {exc}")
                # The failed flush left the session in a pending-rollback state
                # AND rollback expires every loaded instance. Reload the list
                # so remaining students process safely; already-committed or
                # already-existing invoices are skipped via get_for_period, and
                # permanently-failing students are excluded, so restarting from
                # the top never loops forever or duplicates work.
                await self.db.rollback()
                students = (
                    await self.db.execute(
                        _students_stmt().where(Student.id.notin_(failed_ids))
                    )
                ).scalars().all()
                index = 0
                start = time.monotonic()

            if commit_every and generated % commit_every == 0:
                await self.db.commit()

        await self.db.commit()
        return {
            "academic_year": academic_year,
            "month": month,
            "grade_id": grade_id,
            "generated": generated,
            "skipped": skipped,
            "failed": failed,
            "errors": errors[:20],
            "complete": index >= len(students),
        }


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
