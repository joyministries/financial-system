from datetime import UTC, datetime
from decimal import Decimal
from io import BytesIO

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.financial import Statement
from app.models.grade import Grade, Student
from app.models.payment import Payment
from app.services.ledger import LedgerService
from app.services.monthly_fee import load_monthly_fee_lookup
from app.services.statement import amount_due_for_month

D0 = Decimal("0")


class ReportService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.ledger = LedgerService(db)

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

        Income actually received in the month combined with the Excel-ledger
        outstanding position up to (and including) that month — how much was
        collected, how much is still owed, and which students owe.
        """
        start, end = self._month_range(academic_year, month)

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

        # Outstanding position from the Excel-aligned ledger
        rows = await self.ledger.students_outstanding(
            academic_year, grade_id=grade_id, up_to_month=month
        )
        owing = [r for r in rows if r["outstanding"] > 0]
        owing.sort(key=lambda r: r["outstanding"], reverse=True)

        return {
            "academic_year": academic_year,
            "month": month,
            "total_income": str(total_income),
            "payment_count": payment_count,
            "outstanding_total": str(
                sum((r["outstanding"] for r in owing), Decimal("0"))
            ),
            "students_owing": len(owing),
            "students_owing_list": [
                {
                    "student_id": r["student_id"],
                    "student_number": r["student_number"],
                    "name": r["name"],
                    "grade": r["grade"],
                    "balance": str(r["outstanding"]),
                }
                for r in owing
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
        rows = await self.ledger.students_outstanding(academic_year)
        owing = [r for r in rows if r["outstanding"] > 0]
        return {
            "academic_year": academic_year,
            "students_with_outstanding": len(owing),
            "students": [
                {
                    "student_id": r["student_id"],
                    "student_number": r["student_number"],
                    "name": r["name"],
                    "outstanding": str(r["outstanding"]),
                }
                for r in owing
            ],
        }

    async def outstanding_by_month(
        self,
        academic_year: int,
        up_to_month: int,
        grade_id: str | None = None,
    ) -> dict:
        """Outstanding position as at EACH month (cumulative progression).

        Returns one entry per month from January up to *up_to_month* showing
        the total still owed and how many students owe, as at that month —
        the same Excel-ledger position the monthly summary uses.
        """
        months = []
        for m in range(1, up_to_month + 1):
            rows = await self.ledger.students_outstanding(
                academic_year, grade_id=grade_id, up_to_month=m
            )
            owing = [r for r in rows if r["outstanding"] > 0]
            months.append({
                "month": m,
                "period": f"{academic_year}-{m:02d}",
                "outstanding_total": str(
                    sum((r["outstanding"] for r in owing), Decimal("0"))
                ),
                "students_owing": len(owing),
            })
        return {
            "academic_year": academic_year,
            "up_to_month": up_to_month,
            "months": months,
        }

    async def outstanding_matrix(
        self,
        academic_year: int,
        month_only: bool = False,
        grade_id: str | None = None,
        up_to_month: int = 12,
    ) -> dict:
        """Per-student outstanding for EVERY month, for the Excel export.

        The export needs a student-by-month matrix rather than one cumulative
        figure for the whole year. Each month is produced by the exact query
        the on-screen report already uses for the selected mode, so the
        exported numbers cannot drift from what the user sees on screen:

        - ``month_only`` False reuses :meth:`LedgerService.students_outstanding`
          capped at each month, i.e. the running balance at that month's end
          (the "Outstanding with carry-over" view).
        - ``month_only`` True reuses :meth:`_monthly_statement_rows`, i.e. the
          ARREARS as at that month — what has fallen due this year and is still
          unpaid, less the prior-year carry-in (the "This month only" view,
          matching each student's ``Amount Due for Month`` line).

        Students are unioned across all months in first-seen order, so someone
        owing only in January still gets a row for the whole year; months in
        which they have no rows come back as "0" rather than a missing key.
        """
        if up_to_month < 1 or up_to_month > 12:
            up_to_month = 12

        per_month: list[list[dict]] = []
        for m in range(1, up_to_month + 1):
            if month_only:
                rows = await self._monthly_statement_rows(academic_year, m, grade_id)
            else:
                rows = await self.ledger.students_outstanding(
                    academic_year, grade_id=grade_id, up_to_month=m
                )
            per_month.append(rows)

        order: list[str] = []
        meta: dict[str, dict] = {}
        for rows in per_month:
            for r in rows:
                sid = r["student_id"]
                if sid not in meta:
                    order.append(sid)
                    meta[sid] = {
                        "student_id": sid,
                        "student_number": r["student_number"] or "",
                        "name": r["name"],
                        "grade": r["grade"] or "",
                    }

        balances: dict[str, dict[str, str]] = {sid: {} for sid in order}
        totals: dict[str, str] = {}
        for index, rows in enumerate(per_month, start=1):
            by_student = {r["student_id"]: Decimal(str(r["outstanding"])) for r in rows}
            column = Decimal("0")
            for sid in order:
                amount = by_student.get(sid, Decimal("0"))
                balances[sid][str(index)] = str(amount)
                column += amount
            totals[str(index)] = str(column)

        students = [{**meta[sid], "balances": balances[sid]} for sid in order]

        return {
            "academic_year": academic_year,
            "month_only": month_only,
            "months": [
                {
                    "month": m,
                    "label": datetime(2000, m, 1).strftime("%B"),
                }
                for m in range(1, up_to_month + 1)
            ],
            "students": students,
            "totals": totals,
        }

    async def payments_received(
        self,
        academic_year: int,
        grade_id: str | None = None,
        payment_method: str | None = None,
        month: int | None = None,
    ) -> dict:
        """Payments received, optionally scoped to a single month.

        When *month* is given every figure (totals, breakdown, by-method) is
        restricted to that month; otherwise the whole academic year is used.
        """
        if month is not None:
            start, end = self._month_range(academic_year, month)
        else:
            start = datetime(academic_year, 1, 1, tzinfo=UTC)
            end = datetime(academic_year + 1, 1, 1, tzinfo=UTC)

        stmt = select(Payment).where(
            Payment.status == "verified",
            Payment.payment_date >= start,
            Payment.payment_date < end,
        )
        if grade_id:
            stmt = stmt.join(
                Student, Student.id == Payment.student_id
            ).where(Student.grade_id == grade_id)
        if payment_method:
            stmt = stmt.where(Payment.payment_method == payment_method)
        result = await self.db.execute(stmt)
        payments = result.scalars().all()

        monthly_breakdown: dict[int, Decimal] = {}
        monthly_counts: dict[int, int] = {}
        by_method: dict[str, Decimal] = {}
        for p in payments:
            m = p.payment_date.month
            monthly_breakdown[m] = monthly_breakdown.get(m, Decimal("0")) + p.amount
            monthly_counts[m] = monthly_counts.get(m, 0) + 1
            method = p.payment_method or "unknown"
            by_method[method] = by_method.get(method, Decimal("0")) + p.amount

        return {
            "academic_year": academic_year,
            "month": month,
            "total_payments": str(sum(monthly_breakdown.values(), Decimal("0"))),
            "total_received": str(sum(monthly_breakdown.values(), Decimal("0"))),
            "payment_count": sum(monthly_counts.values()),
            "monthly_breakdown": [
                {
                    "period": f"{academic_year}-{m:02d}",
                    "total": str(monthly_breakdown.get(m, Decimal("0"))),
                    "count": monthly_counts.get(m, 0),
                }
                for m in (sorted(monthly_breakdown) if month is not None else range(1, 13))
            ],
            "by_method": {k: str(v) for k, v in sorted(by_method.items())},
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

        monthly_data = {}
        for p in payments:
            m = p.payment_date.month
            entry = monthly_data.setdefault(m, {"total": Decimal("0"), "count": 0})
            entry["total"] += p.amount
            entry["count"] += 1

        return {
            "academic_year": academic_year,
            "months": [
                {
                    "month": m,
                    "total": str(monthly_data.get(m, {"total": Decimal("0")})["total"]),
                    "count": monthly_data.get(m, {"count": 0})["count"],
                }
                for m in range(1, 13)
            ],
        }

    async def statement_report(
        self,
        academic_year: int,
        status_filter: str | None = None,
        grade_id: str | None = None,
        month: int | None = None,
        month_only: bool = False,
    ) -> dict:
        """School-wide statement summary — every approved student with their
        outstanding balance for a selected month, in one of two modes:

        * **With carry-over** (default) — the Excel-aligned running balance:
          everything invoiced up to ``month`` less everything paid up to
          ``month`` (``LedgerService.students_outstanding``).
        * **This month only** (``month_only``) — the ARREARS as at ``month``:
          what has fallen due this year and is still unpaid, excluding the
          prior year's carry-in. Computed from each student's generated
          ``Statement`` with the same formula as their ``Amount Due for
          Month`` line, so the report agrees with the document the parent
          receives to the cent.
        """
        if month_only and month is not None:
            rows = await self._monthly_statement_rows(academic_year, month, grade_id)
        else:
            rows = await self.ledger.students_outstanding(
                academic_year, grade_id=grade_id, up_to_month=month
            )

        students = []
        total_outstanding = Decimal("0")
        for r in rows:
            balance = r["outstanding"]
            student_status = "paid" if balance <= 0 else "overdue"
            if student_status == "overdue":
                total_outstanding += balance

            if status_filter and student_status != status_filter:
                continue

            students.append({
                "student_id": r["student_id"],
                "student_number": r["student_number"],
                "name": r["name"],
                "grade": r["grade"] or "",
                "balance": str(balance),
                "status": student_status,
            })

        return {
            "academic_year": academic_year,
            "month": month,
            "month_only": month_only,
            "total_students": len(students),
            "total_outstanding": str(total_outstanding),
            "students": students,
        }

    async def _monthly_statement_rows(
        self, academic_year: int, month: int, grade_id: str | None = None
    ) -> list[dict]:
        """Approved students with their ARREARS as at ``month``.

        Backs the "This month only" mode of the school statement summary and
        the matching Excel column.

        It used to read ``invoices(month == m) + charges(month == m) less the
        receipts recorded in calendar month m``. Students are billed in
        January — one annual invoice, or a split January pair — so months 2-12
        carry no invoice at all and the expression collapsed to ``0 less that
        month's payments``: in October 194 of 198 students reported R 0.00 and
        the whole-school total was R 0, while February-September printed
        negatives such as -1,940.

        It now reports what the statement itself reports — what has actually
        fallen due this year and is still unpaid, excluding the prior year's
        carry-in::

            arrears = closing_balance - monthly_fee x (12 - month) - brought_forward

        Sourced from the generated ``Statement`` rows so the whole-school
        figure agrees with the document the parent receives, to the cent. The
        latest statement at or before ``month`` is used and *its* month decides
        which instalments are still ahead, so report and PDF cannot drift. A
        student with no statement yet reports 0.
        """
        stu_q = (
            select(Student, Grade.name.label("grade_name"))
            .join(Grade, Grade.id == Student.grade_id)
            .where(Student.registration_status == "approved")
            .order_by(Student.last_name, Student.first_name)
        )
        if grade_id:
            stu_q = stu_q.where(Student.grade_id == grade_id)
        student_rows = list((await self.db.execute(stu_q)).all())
        students = [r[0] for r in student_rows]

        # Latest statement at or before the requested month. Rows arrive
        # month-ascending, so the last one seen per student wins.
        stmt_q = (
            select(
                Statement.student_id,
                Statement.month,
                Statement.current_amount_due,
                Statement.total_payments,
            )
            .where(
                Statement.academic_year == academic_year,
                Statement.month <= month,
            )
            .order_by(Statement.month)
        )
        latest: dict[str, object] = {}
        for row in (await self.db.execute(stmt_q)).all():
            latest[row.student_id] = row

        fee_by_student = await load_monthly_fee_lookup(self.db, students, academic_year)

        rows: list[dict] = []
        for student, grade_name in student_rows:
            entry = latest.get(student.id)
            if entry is None:
                paid = D0
                outstanding = D0
            else:
                paid = entry.total_payments or D0
                # Same formula the statement PDF prints, so the whole-school
                # figure and the document the parent receives cannot drift.
                outstanding = amount_due_for_month(
                    entry.current_amount_due,
                    fee_by_student.get(student.id, D0),
                )
            rows.append({
                "student_id": student.id,
                "student_number": student.student_number,
                "name": f"{student.first_name} {student.last_name}",
                "grade": grade_name or "",
                # required/paid keep the row shape shared with
                # LedgerService.students_outstanding: outstanding = required - paid.
                "required": outstanding + paid,
                "paid": paid,
                "outstanding": outstanding,
            })
        return rows

    async def students_xlsx(
        self,
        academic_year: int,
        grade_id: str | None = None,
        month: int | None = None,
    ) -> BytesIO:
        """Admin Excel export in the school's suspension-list layout.

        Produces an .xlsx workbook with the same shape as the office's
        "LCS GERMISTON <MONTH> SUSPENSION LIST" spreadsheet (yellow bold
        headers: Customer | Grade | Amount | Comments | Learners on
        suspension). Every approved student is included once, optionally
        scoped to a single grade.

        When `month` is given the Amount column is the outstanding balance
        FOR that month (invoices with month <= month minus verified payments
        received up to the end of that month) from the Excel-aligned ledger —
        the same position the month's statement shows. When `month` is omitted
        the Amount is the full-year outstanding. Either way a SUM footer row
        is appended.

        Grade cells mirror the office convention: 'RR' / 'R' or 1-9.
        """
        rows = await self.ledger.students_outstanding(
            academic_year, grade_id=grade_id, up_to_month=month
        )

        def _grade_display(name: str) -> str:
            if name == "GRADE R":
                return "R"
            if name == "GRADE RR":
                return "RR"
            return name.replace("GRADE ", "", 1)

        sheet_label = (
            datetime(academic_year, month, 1).strftime("%B").upper()
            if month else "STUDENTS"
        )
        headers = ["Customer", "Grade", "Amount", "Comments", "Learners on suspension"]

        surfacing_rows = [
            [
                f"({r['student_number']}) {r['name']}".strip(),
                _grade_display(r["grade"]),
                float(r["outstanding"]),
                None,
                None,
            ]
            for r in rows
        ]

        # Imported lazily so the REST API continues to boot even if the
        # spreadsheet library is missing/mis-installed in the serverless runtime.
        # If it is unavailable, fall back to the stdlib writer so the export
        # endpoint keeps working regardless of what the runtime bundled.
        try:
            from openpyxl import Workbook
            from openpyxl.styles import Alignment, Font, PatternFill
        except ImportError:
            from app.services.xlsx_writer import build_suspension_list_xlsx

            sum_total = sum(row[2] for row in surfacing_rows)
            return build_suspension_list_xlsx(
                sheet_label=sheet_label,
                headers=headers,
                data_rows=surfacing_rows,
                column_widths=(
                    ("A", 56.89), ("B", 28.66), ("C", 21.66),
                    ("D", 14.33), ("E", 24.11),
                ),
                sum_footer=bool(surfacing_rows),
                sum_total=sum_total,
            )

        wb = Workbook()
        ws = wb.active
        ws.title = sheet_label

        header_fill = PatternFill("solid", fgColor="FFFF00")
        header_font = Font(bold=True)
        ws.append(headers)
        for cell in ws[1]:
            cell.fill = header_fill
            cell.font = header_font
        ws["A1"].alignment = Alignment(horizontal="left")
        ws["B1"].alignment = Alignment(horizontal="center")
        ws["C1"].alignment = Alignment(horizontal="center")
        ws["E1"].alignment = Alignment(horizontal="center")

        for row_values in surfacing_rows:
            ws.append(row_values)

        if len(rows) > 0:
            ws.append([None, "OUTSTANDING BALANCE", f"=SUM(C2:C{len(rows) + 1})", None, None])

        for col_letter, width in (
            ("A", 56.89), ("B", 28.66), ("C", 21.66),
            ("D", 14.33), ("E", 24.11),
        ):
            ws.column_dimensions[col_letter].width = width

        buf = BytesIO()
        wb.save(buf)
        buf.seek(0)
        return buf

    async def carry_forward(self, academic_year: int, month: int) -> dict:
        """Dashboard carry-forward section.

        - not_paid: active students with NO verified payment in the selected
          month (they have not paid for that month yet)
        - outstanding: students with a positive ledger balance in the academic
          year up to (and including) the selected month
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

        ledger_rows = await self.ledger.students_outstanding(
            academic_year, up_to_month=month
        )
        outstanding = [
            {
                "student_id": r["student_id"],
                "student_number": r["student_number"],
                "name": r["name"],
                "grade": r["grade"],
                "balance": str(r["outstanding"]),
            }
            for r in ledger_rows
            if r["outstanding"] > 0
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
        start = datetime(year, month, 1, tzinfo=UTC)
        if month == 12:
            end = datetime(year + 1, 1, 1, tzinfo=UTC)
        else:
            end = datetime(year, month + 1, 1, tzinfo=UTC)
        return start, end
