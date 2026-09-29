from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError
from app.core.money import to_decimal
from app.models.financial import Statement
from app.models.invoice import Invoice
from app.models.payment import Payment
from app.models.schedule import AdditionalCharge
from app.services.charge import ChargeService
from app.services.ledger import LedgerService

D0 = Decimal("0")

MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]

_ROW_DATE_FMT = "%d %b %Y"

# Sort keys so transactions landing on the same day keep a stable, sensible
# order: fees, then charges, then money received.
_ORDER_FEE, _ORDER_CHARGE, _ORDER_PAYMENT = 0, 1, 2


def _as_utc(value: datetime) -> datetime:
    """Treat naive datetimes coming back from the DB as UTC."""
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def _row_month(row: dict) -> int | None:
    """Calendar month a rendered row belongs to, or None for the bookends."""
    raw = row.get("date")
    if not raw:
        return None
    try:
        return datetime.strptime(raw, _ROW_DATE_FMT).month
    except ValueError:
        return None


def build_statement_ledger(
    *,
    academic_year: int,
    annual_fee: Decimal,
    annual_fee_date: datetime | None,
    opening_balance: Decimal,
    charges: list[AdditionalCharge],
    payments: list[Payment],
) -> list[dict]:
    """Build the canonical bank-style ledger for a statement period.

    The school raises a SINGLE fee per school year, so the ledger carries
    exactly one fee debit — the live total of the year's non-void invoices,
    dated the day the earliest invoice was actually issued.  It never emits the
    per-month "Fees for MM/YYYY" lines the old snapshot-based builder produced,
    which is what printed phantom fees after an invoice was voided.

    Every line is dated with its own transaction date and the rows are sorted
    oldest-first, so the running balance is simply the sum of the rows shown and
    the footer can be derived from them.
    """
    entries: list[tuple[datetime, int, int, dict]] = []
    seq = 0

    if annual_fee > 0:
        issued = annual_fee_date or datetime(academic_year, 1, 1, tzinfo=UTC)
        entries.append((
            _as_utc(issued), _ORDER_FEE, seq,
            {
                "date": issued.strftime(_ROW_DATE_FMT),
                "reference": None,
                "description": f"Annual school fees {academic_year}",
                "debit": annual_fee,
                "credit": None,
            },
        ))
        seq += 1

    for c in charges:
        if c.created_at is None:
            continue
        desc = c.description or "Additional charge"
        if c.charge_type:
            desc = f"{desc} ({c.charge_type})"
        entries.append((
            _as_utc(c.created_at), _ORDER_CHARGE, seq,
            {
                "date": c.created_at.strftime(_ROW_DATE_FMT),
                "reference": None,
                "description": desc,
                "debit": c.amount,
                "credit": None,
            },
        ))
        seq += 1

    for p in payments:
        if p.payment_date is None:
            continue
        ref = (p.reference_number or "").strip()
        if ref.upper().startswith("CRN"):
            # Credit note rows on the Xero report are credit transactions
            # with their CRN reference — not payments.
            description = f"Credit note — {ref}"
        elif not ref:
            # Refless January Brought-Forward credit (parent overpaid in a
            # prior year) carried into this year as an opening credit.
            description = "Balance brought forward"
        else:
            description = f"Payment — {p.payment_method}"
        entries.append((
            _as_utc(p.payment_date), _ORDER_PAYMENT, seq,
            {
                "date": p.payment_date.strftime(_ROW_DATE_FMT),
                "reference": ref or None,
                "description": description,
                "debit": None,
                "credit": p.amount,
            },
        ))
        seq += 1

    entries.sort(key=lambda e: (e[0], e[1], e[2]))

    opening = to_decimal(opening_balance)
    first_date = entries[0][3]["date"] if entries else ""
    rows: list[dict] = [
        {
            "date": first_date,
            "reference": None,
            "description": "Balance brought forward",
            "debit": None,
            "credit": None,
            "balance": opening,
            "bold": True,
        }
    ]

    balance = opening
    for _when, _order, _seq, entry in entries:
        balance += to_decimal(entry["debit"] or 0) - to_decimal(entry["credit"] or 0)
        entry["balance"] = balance
        rows.append(entry)

    rows.append(
        {
            "date": entries[-1][3]["date"] if entries else "",
            "reference": None,
            "description": "Balance carried forward",
            "debit": None,
            "credit": None,
            "balance": balance,
            "bold": True,
        }
    )
    return rows


def derive_ledger_footer(rows: list[dict], month: int | None = None) -> dict:
    """Derive the statement totals from the rows that are actually displayed.

    Outstanding is the carried-forward balance on the last row, paid-to-date is
    every credit the ledger shows, and the amount due for the month is that
    month's debits net of its credits — floored at zero, so an overpayment in a
    month can never print as a negative charge.
    """
    def total(key: str, subset: list[dict]) -> Decimal:
        return sum((to_decimal(r.get(key) or 0) for r in subset), D0)

    detail = [r for r in rows if not r.get("bold")]
    period = [r for r in detail if _row_month(r) == month] if month else detail

    return {
        "amount_due": max(total("debit", period) - total("credit", period), D0),
        "amount_paid": total("credit", detail),
        "amount_year_due": to_decimal(rows[-1].get("balance")) if rows else D0,
    }


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
        return await self.generate_from_breakdown(
            student_id, academic_year, month, breakdown
        )

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

    async def list_existing(
        self, academic_year: int, up_to_month: int, student_ids: list[str]
    ) -> set[tuple[str, int]]:
        """Return {(student_id, month)} pairs that already have statements."""
        if not student_ids:
            return set()
        stmt = (
            select(Statement.student_id, Statement.month)
            .where(
                Statement.academic_year == academic_year,
                Statement.month <= up_to_month,
                Statement.student_id.in_(student_ids),
            )
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
        pay_stmt = (
            select(Payment.student_id, Payment.payment_date, Payment.amount)
            .where(
                Payment.status == "verified",
                Payment.payment_date >= start,
                Payment.payment_date < end,
            )
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
                rows.append({
                    "month": m,
                    "required": req,
                    "paid": paid,
                    "outstanding": running,
                })
            out[sid] = rows
        return out

    async def bulk_charges(
        self, academic_year: int, student_ids: list[str]
    ) -> dict[str, list[AdditionalCharge]]:
        """Load all additional charges for the student set in one query."""
        stmt = select(AdditionalCharge).where(
            AdditionalCharge.academic_year == academic_year
        )
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

    async def ledger_for_window(
        self, student_id: str, academic_year: int, start_month: int, end_month: int
    ) -> list[dict]:
        """Build the canonical ledger for the months *start_month*..*end_month*.

        Everything is derived from live invoices and verified payments rather
        than from the stored monthly snapshots, so voiding an invoice can never
        leave a phantom fee behind on a statement that was generated earlier.
        """
        annual_fee, annual_fee_date = await self.ledger.annual_fee(
            student_id, academic_year
        )
        charges = [
            c
            for c in await self.charge_service.list_for_student(student_id, academic_year)
            if c.created_at is not None
        ]
        payments = await self._verified_payments_for_year(student_id, academic_year)

        def in_window(value: datetime) -> bool:
            return start_month <= _as_utc(value).month <= end_month

        # Anything raised before the window has already been paid for or
        # written off, so it belongs in the opening balance, not in the rows.
        opening = D0
        if annual_fee > 0 and annual_fee_date is not None:
            if _as_utc(annual_fee_date).month < start_month:
                opening += annual_fee
        for c in charges:
            if _as_utc(c.created_at).month < start_month:
                opening += c.amount
        for p in payments:
            if p.payment_date is not None and _as_utc(p.payment_date).month < start_month:
                opening -= p.amount

        # The annual fee only appears as a line when it was raised inside the
        # window; otherwise it is already carried in the opening balance.
        fee = (
            annual_fee
            if annual_fee > 0 and annual_fee_date is not None and in_window(annual_fee_date)
            else D0
        )

        return build_statement_ledger(
            academic_year=academic_year,
            annual_fee=fee,
            annual_fee_date=annual_fee_date,
            opening_balance=opening,
            charges=[c for c in charges if in_window(c.created_at)],
            payments=[
                p for p in payments if p.payment_date is not None and in_window(p.payment_date)
            ],
        )

    async def combined_ledger(self, statements: list[Statement]) -> list[dict]:
        """Build a single combined ledger spanning multiple monthly statements.

        The opening row and the closing row bookend a continuous stream of
        transactions — no duplicate interior opening/closing rows.
        """
        if not statements:
            return []
        return await self.ledger_for_window(
            statements[0].student_id,
            statements[0].academic_year,
            statements[0].month,
            statements[-1].month,
        )

    async def ledger_for_statement(self, statement: Statement) -> list[dict]:
        """Build the bank-style ledger rows for a single generated statement."""
        return await self.ledger_for_window(
            statement.student_id,
            statement.academic_year,
            statement.month,
            statement.month,
        )

    async def delete_for_student(self, student_id: str, academic_year: int) -> int:
        """Delete all statements for a student+year. Returns count deleted."""
        stmts = await self.list_for_student(student_id, academic_year)
        count = len(stmts)
        for s in stmts:
            await self.db.delete(s)
        await self.db.flush()
        return count

    async def _verified_payments_for_year(
        self, student_id: str, academic_year: int
    ) -> list[Payment]:
        start = datetime(academic_year, 1, 1, tzinfo=UTC)
        end = datetime(academic_year + 1, 1, 1, tzinfo=UTC)
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

