
import asyncio
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_factory, get_db
from app.core.deps import (
    get_current_user,
    get_parent_student_ids,
    require_role,
    verify_student_access,
)
from app.core.exceptions import ConflictError
from app.models.grade import Student, StudentGuardian
from app.models.user import User
from app.schemas.common import PageResponse, build_page_response
from app.schemas.financial import (
    MonthlySummaryResponse,
    NextDueDateResponse,
    ReceiptResponse,
    StatementGenerateRequest,
    StatementResponse,
    StudentSummaryResponse,
)
from app.services.pdf import (
    build_grade_summary_pdf,
    build_receipt_pdf,
    build_statement_pdf,
    pdf_response,
)
from app.services.receipt import ReceiptService
from app.services.report import ReportService
from app.services.statement import StatementService
from app.services.student_summary import StudentSummaryService

router = APIRouter(prefix="/financial", tags=["Financial"])


@router.get("/receipts", response_model=PageResponse[ReceiptResponse])
async def list_receipts(
    student_id: str | None = None,
    grade_id: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List receipts — one page only (LIMIT/OFFSET at the DB level) plus
    pagination metadata so the UI never loads the full receipt history."""
    service = ReceiptService(db)
    if user.role == "parent":
        child_ids = await get_parent_student_ids(user, db)
        if not child_ids:
            return build_page_response([], 0, limit, offset)
        if student_id:
            if student_id not in child_ids:
                raise HTTPException(status_code=403, detail="Access denied")
            items = await service.list_for_student(
                student_id, limit=limit, offset=offset
            )
            total = await service.count_for_student(student_id)
            return build_page_response(items, total, limit, offset)
        items = await service.list_all(
            student_ids=child_ids, limit=limit, offset=offset
        )
        total = await service.count_all(student_ids=child_ids)
        return build_page_response(items, total, limit, offset)
    if student_id:
        items = await service.list_for_student(student_id, limit=limit, offset=offset)
        total = await service.count_for_student(student_id)
        return build_page_response(items, total, limit, offset)
    items = await service.list_all(grade_id=grade_id, limit=limit, offset=offset)
    total = await service.count_all(grade_id=grade_id)
    return build_page_response(items, total, limit, offset)


@router.get("/receipts/{receipt_number}", response_model=ReceiptResponse)
async def get_receipt(
    receipt_number: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    service = ReceiptService(db)
    receipt = await service.get_by_number(receipt_number)
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found")
    if user.role == "parent":
        await verify_student_access(receipt.student_id, user, db)
    return receipt


@router.get("/receipts/{receipt_number}/download")
async def download_receipt(
    receipt_number: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    service = ReceiptService(db)
    receipt = await service.get_by_number(receipt_number)
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found")
    if user.role == "parent":
        await verify_student_access(receipt.student_id, user, db)

    student = await db.get(Student, receipt.student_id)
    allocator = await db.get(User, receipt.allocated_by)
    student_name = (
        f"{student.first_name} {student.last_name}" if student else receipt.student_id
    )
    allocator_name = allocator.full_name if allocator else "Lambton School Finance"

    pdf = build_receipt_pdf(receipt, student_name, allocator_name)
    return pdf_response(pdf, f"receipt-{receipt.receipt_number}.pdf")


@router.post("/statements/generate", response_model=StatementResponse)
async def generate_statement(
    data: StatementGenerateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Generate a statement for one student.

    Admins/finance can generate for any student; a parent can only generate
    for their own children (verified against the parent's account)."""
    if user.role not in ("admin", "finance", "super_admin"):
        await verify_student_access(data.student_id, user, db)
    service = StatementService(db)
    return await service.generate(data.student_id, data.academic_year, data.month)


async def _generate_student_statements(
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


# Whole-school generation runs this many students concurrently. With the data
# pre-fetched, workers only insert, so concurrency is bounded by round trips.
_GENERATE_ALL_CONCURRENCY = 20


@router.post("/statements/generate-all")
async def generate_all_statements(
    academic_year: int,
    month: int,
    grade_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance")),
):
    """Generate statements accumulatively from month 1 up to the selected month.

    When grade_id is provided, only students in that grade are processed.
    Existing statements are skipped — only missing ones are created. Ledger
    breakdowns are prefetched in a few aggregate queries and workers only
    insert, keeping a whole-school run well under the serverless timeout.
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

    sem = asyncio.Semaphore(_GENERATE_ALL_CONCURRENCY)

    async def _run(sid: str):
        async with sem:
            return await _generate_student_statements(
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
        "generated": generated,
        "skipped": skipped,
        "failed": failed,
        "errors": errors[:20],
    }


@router.get("/statements/grade-summary/{grade_id}/download")
async def download_grade_summary(
    grade_id: str,
    academic_year: int,
    month: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance")),
):
    """Download a grade-level summary PDF showing all students, payments and balances."""
    from app.models.grade import Grade

    grade = await db.get(Grade, grade_id)
    grade_name = grade.name if grade else "Unknown Grade"

    service = StatementService(db)
    students = (
        await db.execute(
            select(Student)
            .where(Student.grade_id == grade_id)
            .where(Student.registration_status == "approved")
            .order_by(Student.last_name, Student.first_name)
        )
    ).scalars().all()

    student_data = []
    for s in students:
        stmt = await service.get(s.id, academic_year, month)
        if stmt:
            paid = stmt.total_payments
            bal = stmt.closing_balance
        else:
            paid = Decimal("0")
            bal = Decimal("0")
        student_data.append({
            "name": f"{s.first_name} {s.last_name}",
            "student_number": s.student_number or "",
            "total_paid": paid,
            "balance": bal,
            "status": "Paid" if bal <= Decimal("0.01") else "Outstanding",
        })

    pdf = build_grade_summary_pdf(grade_name, academic_year, month, student_data)
    return pdf_response(pdf, f"grade-summary-{grade_name.replace(' ', '-')}-{academic_year}-{month:02d}.pdf")


@router.post("/statements/regenerate")
async def regenerate_statements(
    student_id: str,
    academic_year: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance")),
):
    """Delete all existing statements for a student+year and regenerate them.

    This picks up any payments that were verified after the original
    statements were generated."""
    service = StatementService(db)
    deleted = await service.delete_for_student(student_id, academic_year)

    generated = 0
    for month in range(1, 13):
        try:
            await service.generate(student_id, academic_year, month)
            generated += 1
        except Exception:
            pass  # skip months with no schedule
    await db.commit()
    return {
        "student_id": student_id,
        "academic_year": academic_year,
        "deleted": deleted,
        "generated": generated,
    }


@router.get("/student-summary/{student_id}", response_model=StudentSummaryResponse)
async def get_student_summary(
    student_id: str,
    academic_year: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Per-month required vs paid breakdown for a student (parent portal)."""
    if user.role == "parent":
        await verify_student_access(student_id, user, db)
    service = StudentSummaryService(db)
    return await service.summarize(student_id, academic_year)


@router.get("/next-due-date/{student_id}", response_model=NextDueDateResponse)
async def get_next_due_date(
    student_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Return the next upcoming payment due date for a student.

    Computed from the Excel-aligned invoice ledger: the earliest non-void
    invoice that still has an unpaid balance (status issued/draft). If no
    invoices remain unpaid, the student is caught up.
    """
    if user.role == "parent":
        await verify_student_access(student_id, user, db)

    from datetime import UTC, datetime

    from app.models.grade import Student, StudentGuardian
    from app.models.invoice import Invoice
    from app.services.ledger import LedgerService

    student = await db.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    ledger = LedgerService(db)
    total_outstanding = await ledger.outstanding(student_id, datetime.now(UTC).year)

    # Earliest unpaid invoice (Excel-aligned), ordered by due_date
    stmt = (
        select(Invoice)
        .where(
            Invoice.student_id == student_id,
            Invoice.status.in_(["issued", "draft"]),
            Invoice.balance_due > 0,
        )
        .order_by(Invoice.due_date.asc())
        .limit(1)
    )
    result = await db.execute(stmt)
    next_invoice = result.scalar_one_or_none()

    if not next_invoice or total_outstanding <= 0:
        return NextDueDateResponse(
            student_id=student_id,
            student_name=f"{student.first_name} {student.last_name}",
            next_due_date=None,
            next_month=None,
            next_amount_due=0,
            next_description="All caught up!",
            total_outstanding=total_outstanding,
        )

    MONTHS = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
    ]
    month_name = (
        MONTHS[next_invoice.month - 1]
        if 1 <= next_invoice.month <= 12
        else f"Month {next_invoice.month}"
    )
    description = f"{month_name} {next_invoice.academic_year} invoice"

    return NextDueDateResponse(
        student_id=student_id,
        student_name=f"{student.first_name} {student.last_name}",
        next_due_date=next_invoice.due_date,
        next_month=next_invoice.month,
        next_amount_due=float(next_invoice.balance_due),
        next_description=description,
        total_outstanding=float(total_outstanding),
    )


@router.get("/statements/{student_id}", response_model=list[StatementResponse])
async def list_statements(
    student_id: str,
    academic_year: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role == "parent":
        await verify_student_access(student_id, user, db)
    service = StatementService(db)
    return await service.list_for_student(student_id, academic_year)


@router.get("/statements/{student_id}/download")
async def download_statement(
    student_id: str,
    academic_year: int,
    month: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role == "parent":
        await verify_student_access(student_id, user, db)
    service = StatementService(db)
    statement = await service.get(student_id, academic_year, month)
    if not statement:
        raise HTTPException(
            status_code=404,
            detail=f"Statement not found for {academic_year}-{month:02d}. Generate it first.",
        )

    student = await db.get(Student, student_id)
    student_name = (
        f"{student.first_name} {student.last_name}" if student else student_id
    )

    # Customer for the TO block: primary guardian where possible.
    account_name = student_name
    account_address = ""
    if student is not None:
        guardian = (
            await db.execute(
                select(StudentGuardian)
                .where(StudentGuardian.student_id == student.id)
                .order_by(
                    StudentGuardian.guardian_type != "primary",
                    StudentGuardian.created_at,
                )
                .limit(1)
            )
        ).scalar_one_or_none()
        if guardian is not None:
            account_name = guardian.full_name or student_name
            account_address = ", ".join(
                bit for bit in (guardian.physical_address, guardian.po_box) if bit
            )

    ledger = await service.ledger_for_statement(statement)
    pdf = build_statement_pdf(
        statement,
        student_name,
        ledger,
        student_number=student.student_number if student else "",
        account_name=account_name,
        account_address=account_address,
    )
    return pdf_response(
        pdf,
        f"statement-{student_id[:8]}-{academic_year}-{month:02d}.pdf",
    )


@router.get("/reports/monthly-summary", response_model=MonthlySummaryResponse)
async def monthly_summary_report(
    academic_year: int,
    month: int,
    grade_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance")),
):
    """Monthly dashboard: income received, outstanding, students owing."""
    service = ReportService(db)
    return await service.monthly_summary(academic_year, month, grade_id)


@router.get("/reports/monthly-income")
async def monthly_income_report(
    academic_year: int,
    month: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance")),
):
    service = ReportService(db)
    return await service.monthly_income(academic_year, month)


@router.get("/reports/yearly-income")
async def yearly_income_report(
    academic_year: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance")),
):
    service = ReportService(db)
    return await service.yearly_income(academic_year)


@router.get("/reports/outstanding")
async def outstanding_fees_report(
    academic_year: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance")),
):
    service = ReportService(db)
    return await service.outstanding_fees(academic_year)


@router.get("/reports/payments-received")
async def payments_received_report(
    academic_year: int,
    grade_id: str | None = None,
    payment_method: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance")),
):
    service = ReportService(db)
    return await service.payments_received(academic_year, grade_id, payment_method)


@router.get("/reports/carry-forward")
async def carry_forward_report(
    academic_year: int,
    month: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance")),
):
    service = ReportService(db)
    return await service.carry_forward(academic_year, month)


@router.get("/reports/payment-trends")
async def payment_trends_report(
    academic_year: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance")),
):
    service = ReportService(db)
    return await service.payment_trends(academic_year)


@router.get("/reports/statements")
async def statement_report(
    academic_year: int,
    status: str | None = None,
    grade_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance")),
):
    service = ReportService(db)
    return await service.statement_report(academic_year, status, grade_id)


@router.get("/reports/export-students")
async def export_students_report(
    academic_year: int,
    grade_id: str | None = None,
    month: int | None = Query(default=None, ge=1, le=12),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance")),
):
    """Admin Excel export of approved students in the school's suspension-list
    layout (Customer | Grade | Amount | Comments | Learners on suspension).

    All grades when `grade_id` is omitted, or a single grade when provided.
    `month` only controls the sheet title (e.g. 'AUGUST'); the amounts are the
    live outstanding balances for `academic_year`."""
    service = ReportService(db)
    buf = await service.students_xlsx(academic_year, grade_id, month)
    fname = f"LCS-GERMISTON-SUSPENSION-LIST-{academic_year}.xlsx"
    return Response(
        content=buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.post("/balance-engine/rollover")
async def trigger_rollover(
    academic_year: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin")),
):
    """Legacy rollover endpoint — now a no-op.

    Balances are derived from the Excel-aligned ledger (invoices minus
    verified payments), so there is nothing to roll over. Returns the
    school-wide outstanding position for the year instead.
    """
    from app.services.ledger import LedgerService

    ledger = LedgerService(db)
    rows = await ledger.students_outstanding(academic_year)
    total_outstanding = sum((r["outstanding"] for r in rows), Decimal("0"))
    students_outstanding = sum(1 for r in rows if r["outstanding"] > 0)
    return {
        "detail": "Rollover no longer applies — balances come from the Excel ledger",
        "academic_year": academic_year,
        "total_outstanding": str(total_outstanding),
        "students_outstanding": students_outstanding,
    }


@router.get("/balance-engine/total-due/{student_id}")
async def get_total_due(
    student_id: str,
    academic_year: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role == "parent":
        await verify_student_access(student_id, user, db)
    from app.services.ledger import LedgerService

    ledger = LedgerService(db)
    total = await ledger.outstanding(student_id, academic_year)
    return {
        "student_id": student_id,
        "academic_year": academic_year,
        "total_due": str(total),
    }
