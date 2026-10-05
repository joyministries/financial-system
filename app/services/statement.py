import asyncio
import logging
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_factory
from app.core.exceptions import ConflictError
from app.core.money import to_decimal
from app.models.financial import Statement
from app.models.grade import Student
from app.models.invoice import Invoice
from app.models.payment import Payment
from app.models.schedule import AdditionalCharge
from app.services.charge import ChargeService
from app.services.ledger import LedgerService
from app.services.monthly_fee import monthly_fee_for_student

logger = logging.getLogger(__name__)

D0 = Decimal("0")

MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
]


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
                f"Statement already exists for student {student_id}, {academic_year}-{month:02d}"
            )

        breakdown = await self.ledger.monthly_breakdown(student_id, academic_year)
        return await self.generate_from_breakdown(student_id, academic_year, month, breakdown)

    async def generate_from_breakdown(
        self,
        student_id: str,
        academic_year: int,
        month: int,
        breakdown: list[dict],
        charges: list | None = None,
    ) -> Statement:
        """Create a statement row from an already-computed yearly breakdown.

        Shared by the single-student path and the bulk generator so bulk runs
        compute the expensive ledger breakdown once per student instead of
        once per month. Does NOT check for an existing statement.
        """
        month_row = next((r for r in breakdown if r["month"] == month), None)
        prev_row = next((r for r in breakdown if r["month"] == month - 1), None)

        opening = prev_row["outstanding"] if prev_row else D0
        installment = month_row["required"] if month_row else D0

        if charges is None:
            charges = await self.charge_service.list_for_student(student_id, academic_year)
        total_additional = sum((c.amount for c in charges if c.month == month), D0)

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

    async def list_existing(
        self, academic_year: int, up_to_month: int, student_ids: list[str]
    ) -> set[tuple[str, int]]:
        """Return {(student_id, month)} pairs that already have statements."""
        if not student_ids:
            return set()
        stmt = select(Statement.student_id, Statement.month).where(
            Statement.academic_year == academic_year,
            Statement.month <= up_to_month,
            Statement.student_id.in_(student_ids),
        )
        rows = (await self.db.execute(stmt)).all()
        return {(r[0], r[1]) for r in rows}

    async def bulk_breakdowns(
        self, academic_year: int, student_ids: list[str]
    ) -> dict[str, list[dict]]:
        """Yearly ledger breakdown for many students in ~2 aggregate queries.

        Same shape as LedgerService.monthly_breakdown (month 1..12 with
        required/paid/outstanding) but computed for the whole student set at
        once so bulk generation is not bound by per-student round trips.
        """
        req_by: dict[str, dict[int, Decimal]] = {}
        stmt = (
            select(Invoice.student_id, Invoice.month, func.sum(Invoice.subtotal))
            .where(
                Invoice.status != "void",
                Invoice.academic_year == academic_year,
            )
            .group_by(Invoice.student_id, Invoice.month)
        )
        if student_ids:
            stmt = stmt.where(Invoice.student_id.in_(student_ids))
        for sid, m, amt in (await self.db.execute(stmt)).all():
            req_by.setdefault(sid, {})[m] = amt

        start = datetime(academic_year, 1, 1, tzinfo=UTC)
        end = datetime(academic_year + 1, 1, 1, tzinfo=UTC)
        pay_stmt = select(Payment.student_id, Payment.payment_date, Payment.amount).where(
            Payment.status == "verified",
            Payment.payment_date >= start,
            Payment.payment_date < end,
        )
        if student_ids:
            pay_stmt = pay_stmt.where(Payment.student_id.in_(student_ids))
        paid_by: dict[str, dict[int, Decimal]] = {}
        for sid, pdate, amt in (await self.db.execute(pay_stmt)).all():
            paid_by.setdefault(sid, {}).setdefault(pdate.month, D0)
            paid_by[sid][pdate.month] += amt

        out: dict[str, list[dict]] = {}
        for sid in student_ids:
            req_m = req_by.get(sid, {})
            paid_m = paid_by.get(sid, {})
            running = D0
            rows = []
            for m in range(1, 13):
                req = req_m.get(m, D0)
                paid = paid_m.get(m, D0)
                running += req - paid
                rows.append(
                    {
                        "month": m,
                        "required": req,
                        "paid": paid,
                        "outstanding": running,
                    }
                )
            out[sid] = rows
        return out

    async def bulk_charges(
        self, academic_year: int, student_ids: list[str]
    ) -> dict[str, list[AdditionalCharge]]:
        """Load all additional charges for the student set in one query."""
        stmt = select(AdditionalCharge).where(AdditionalCharge.academic_year == academic_year)
        if student_ids:
            stmt = stmt.where(AdditionalCharge.student_id.in_(student_ids))
        out: dict[str, list[AdditionalCharge]] = {}
        for c in (await self.db.execute(stmt)).scalars().all():
            out.setdefault(c.student_id, []).append(c)
        return out

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

    async def get_range_statements(
        self, student_id: str, academic_year: int, end_month: int, months: int = 1
    ) -> list[Statement]:
        """Return the *months* most recent statements up to *end_month* (inclusive).

        Statements are ordered chronologically (earliest → latest).  Missing
        months are silently skipped — the list may be shorter than *months*.
        """
        start_month = max(1, end_month - months + 1)
        all_stmts = await self.list_for_student(student_id, academic_year)
        return [s for s in all_stmts if start_month <= s.month <= end_month]

    async def combined_ledger(
        self,
        statements: list[Statement],
        grade_monthly_fee: Decimal | None = None,
    ) -> list[dict]:
        """Build a single combined ledger spanning multiple monthly statements.

        The opening row of the first month and the closing row of the last
        month bookend a continuous stream of transactions — no duplicate
        interior opening/closing rows.

        ``grade_monthly_fee`` is resolved once here rather than per month so a
        year-to-date statement costs one lookup instead of one per month.
        """
        if not statements:
            return []
        if grade_monthly_fee is None:
            first = statements[0]
            grade_monthly_fee = await monthly_fee_for_student(
                self.db, first.student_id, first.academic_year
            )
        ledgers = [await self.ledger_for_statement(s, grade_monthly_fee) for s in statements]
        if len(ledgers) == 1:
            return ledgers[0]

        # First month: opening + all rows except closing.
        combined: list[dict] = list(ledgers[0][:-1])
        # Middle months: only the transaction rows (skip opening and closing).
        for ledger in ledgers[1:-1]:
            combined.extend(ledger[1:-1])
        # Last month: skip opening (equals previous closing), include transactions + closing.
        combined.extend(ledgers[-1][1:])
        return combined

    async def footer_for_statements(
        self,
        statements: list[Statement],
        include_brought_forward_in_arrears: bool = False,
    ) -> dict[str, Decimal]:
        """Footer totals for a year-to-date statement (computed, nothing stored)."""
        if not statements:
            return {}
        last = statements[-1]
        fee = await monthly_fee_for_student(self.db, last.student_id, last.academic_year)
        rows = await self.combined_ledger(statements, fee)

        prior = await self.ledger.monthly_breakdown(last.student_id, last.academic_year - 1)
        brought_forward = max(D0, prior[-1]["outstanding"]) if prior else D0

        return statement_footer(
            total_billed=to_decimal(last.total_fees),
            total_paid=total_paid_from_ledger(rows),
            monthly_fee=fee,
            months_due=last.month,
            brought_forward=brought_forward,
            include_brought_forward_in_arrears=include_brought_forward_in_arrears,
        )

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

    async def ledger_for_statement(
        self,
        statement: Statement,
        grade_monthly_fee: Decimal | None = None,
    ) -> list[dict]:
        """Build the bank-style ledger rows for a generated statement.

        Mirrors the frontend ledger: opening balance -> fees billed this month
        (debit) -> additional charges (debit) -> verified payments (credit) ->
        closing balance, with a running balance column.

        Months with no invoice of their own (billed by January's annual
        invoice) fall back to ``grade_monthly_fee`` for the fee row without
        moving the balance — see :func:`fee_installment_for_statement`. Pass
        ``None`` to resolve it; pass ``Decimal("0")`` to assert there is none.
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

        if grade_monthly_fee is None:
            grade_monthly_fee = await monthly_fee_for_student(
                self.db, statement.student_id, statement.academic_year
            )
        fee_debit, moves_balance = fee_installment_for_statement(
            to_decimal(statement.total_installments),
            grade_monthly_fee,
        )
        # Months Feb..Dec carry no invoice of their own (the year was billed in
        # January), so their fallback instalment must NOT be printed as a debit:
        # it would make the visible rows disagree with the printed balance.
        if fee_debit > 0 and moves_balance:
            balance += fee_debit
            rows.append(
                {
                    "date": due_str,
                    "reference": None,
                    "description": (f"Fees for {statement.month:02d}/{statement.academic_year}"),
                    "debit": fee_debit,
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
            ref = (p.reference_number or "").strip()
            if ref.upper().startswith("CRN"):
                # Credit note rows on the Xero report are credit transactions
                # with their CRN reference — not payments.
                description = f"Credit note — {ref}"
                is_payment = False
            elif not ref:
                # Refless January Brought-Forward credit (parent overpaid in a
                # prior year) carried into this year as an opening credit.
                description = "Balance brought forward"
                is_payment = False
            else:
                description = f"Payment — {p.payment_method}"
                is_payment = True
            rows.append(
                {
                    "date": p.payment_date.strftime("%d %b %Y") if p.payment_date else due_str,
                    "reference": ref,
                    "description": description,
                    "debit": None,
                    "credit": p.amount,
                    "balance": balance,
                    # Marks a genuine receipt so the paid total can be summed by
                    # row type instead of by reference format — receipts are
                    # legitimately referenced "FNB", "REC 42", "ABSA", etc.
                    "is_payment": is_payment,
                }
            )

        if abs(balance - to_decimal(statement.closing_balance)) > Decimal("0.01"):
            logger.warning(
                "Statement ledger mismatch student=%s %s-%02d: rows=%s stored closing=%s",
                statement.student_id,
                statement.academic_year,
                statement.month,
                balance,
                statement.closing_balance,
            )
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


def fee_installment_for_statement(
    total_installments: Decimal, grade_monthly_fee: Decimal
) -> tuple[Decimal, bool]:
    """Resolve the debit to print on a statement's ``Fees for MM/YYYY`` row.

    Returns ``(amount, moves_balance)``.

    * Invoice-derived instalments are real charges already recorded on the
      ledger, so they are added to the running balance (January's annual
      invoice bills the whole year in one line).
    * Months February..December have no invoice at all — the year was billed
      in January — so ``total_installments`` is ``0``. For those months the
      grade's *monthly* tuition instalment is printed so the parent can see
      what falls due, but it must **not** move the balance: the money is
      already in the January line, and adding it again would double-bill the
      rest of the year.

    Amount ``0`` means no fee row is rendered for the month.
    """
    billed = to_decimal(total_installments)
    if billed > D0:
        return billed, True
    fee = to_decimal(grade_monthly_fee)
    if fee > D0:
        return fee, False
    return D0, False


def total_paid_from_ledger(rows: list[dict]) -> Decimal:
    """Sum receipt credits for the statement footer "Amount Paid to date".

    Counts rows the ledger builders flagged ``is_payment``. Brought-forward
    credits and credit notes share the credit column but must not inflate the
    paid total. Crucially this keys off row type, not the reference prefix:
    receipts are legitimately referenced "FNB", "REC 42", "ABSA" and others, so
    a prefix match on "RCP" silently under-reported paid amounts.
    """
    return sum(
        (
            to_decimal(row["credit"])
            for row in rows
            if row.get("is_payment") and row.get("credit") is not None
        ),
        Decimal("0"),
    )


def statement_footer(
    *,
    total_billed: Decimal,
    total_paid: Decimal,
    monthly_fee: Decimal,
    months_due: int,
    brought_forward: Decimal = D0,
    include_brought_forward_in_arrears: bool = False,
    months_in_year: int = 12,
) -> dict[str, Decimal]:
    """Footer figures matching the school's printed statement.

    * amount_due_for_year -> "Amount Due for <year>"  = billed - paid
    * amount_paid         -> "Amount Paid to date"
    * balance             -> the overdue (arrears) figure: what should have been
      paid by now = outstanding for the year minus instalments not yet due.

    Example (Grade 2, 31 Oct 2026): billed 25,320, paid 16,920, fee 1,940,
    10 months due, brought forward 1,940:
        amount_due_for_year = 8,400
        not yet due (Nov, Dec) = 3,880
        balance = 8,400 - 3,880 - 1,940 = 2,580
    """
    billed = to_decimal(total_billed)
    paid = to_decimal(total_paid)
    fee = to_decimal(monthly_fee)
    bf = to_decimal(brought_forward)

    amount_due_for_year = billed - paid
    not_yet_due = fee * max(0, months_in_year - months_due)
    arrears = amount_due_for_year - not_yet_due
    if not include_brought_forward_in_arrears:
        arrears -= bf
    arrears = max(D0, arrears)

    return {
        "amount_due_for_year": to_decimal(amount_due_for_year),
        "amount_paid": to_decimal(paid),
        "not_yet_due": to_decimal(not_yet_due),
        "brought_forward": to_decimal(bf),
        "balance": to_decimal(arrears),
    }


# Whole-school generation runs this many students concurrently. With the data
# pre-fetched, workers only insert, so concurrency is bounded by round trips.
GENERATE_ALL_CONCURRENCY = 20


async def generate_student_statements(
    student_id: str,
    academic_year: int,
    up_to_month: int,
    existing: set[tuple[str, int]],
    breakdown: list[dict],
    charges: list,
) -> tuple[int, int, int, list[str]]:
    """Insert every missing statement for one student from pre-fetched data.

    The expensive ledger breakdown was already computed once for the whole
    school, so this worker only performs INSERTs. Each worker owns its own
    session and commits its own writes.
    Returns (generated, skipped, failed, errors).
    """
    async with async_session_factory() as db:
        service = StatementService(db)
        generated = skipped = failed = 0
        errors: list[str] = []
        for m in range(1, up_to_month + 1):
            if (student_id, m) in existing:
                skipped += 1
                continue
            try:
                await service.generate_from_breakdown(
                    student_id, academic_year, m, breakdown, charges=charges
                )
                generated += 1
            except IntegrityError:
                await db.rollback()
                skipped += 1
            except ConflictError:
                skipped += 1
            except Exception as exc:  # noqa: BLE001 - one student must not abort the run
                failed += 1
                errors.append(f"{student_id} m{m}: {exc}")
        await db.commit()
        return generated, skipped, failed, errors


async def bulk_generate_statements(
    db: AsyncSession,
    academic_year: int,
    month: int,
    grade_id: str | None = None,
) -> dict:
    """Generate statements accumulatively from month 1 up to the given month.

    When ``grade_id`` is provided, only students in that grade are processed.
    Existing statements are skipped — only missing ones are created. Ledger
    breakdowns are prefetched in a few aggregate queries and workers only
    insert, keeping a whole-school run well under the serverless timeout.

    Shared by ``POST /financial/statements/generate-all`` and the scheduled
    auto-generation beat task so a manual run and a scheduled run behave
    identically.
    """
    service = StatementService(db)
    stmt = select(Student).where(Student.registration_status == "approved")
    if grade_id:
        stmt = stmt.where(Student.grade_id == grade_id)
    students = (await db.execute(stmt)).scalars().all()
    student_ids = [s.id for s in students]

    existing = await service.list_existing(academic_year, month, student_ids)
    breakdowns = await service.bulk_breakdowns(academic_year, student_ids)
    charges = await service.bulk_charges(academic_year, student_ids)

    sem = asyncio.Semaphore(GENERATE_ALL_CONCURRENCY)

    async def _run(sid: str):
        async with sem:
            return await generate_student_statements(
                sid,
                academic_year,
                month,
                existing,
                breakdowns.get(sid, []),
                charges.get(sid, []),
            )

    results = await asyncio.gather(*(_run(sid) for sid in student_ids))

    generated = sum(r[0] for r in results)
    skipped = sum(r[1] for r in results)
    failed = sum(r[2] for r in results)
    errors: list[str] = []
    for r in results:
        errors.extend(r[3])
    return {
        "academic_year": academic_year,
        "up_to_month": month,
        "grade_id": grade_id,
        "generated": generated,
        "skipped": skipped,
        "failed": failed,
        "errors": errors[:20],
    }
