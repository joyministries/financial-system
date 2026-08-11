
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import (
    get_current_user,
    get_parent_student_ids,
    require_role,
    verify_student_access,
)
from app.models.grade import Student
from app.models.user import User
from app.schemas.common import PageResponse, build_page_response
from app.schemas.financial import (
    MonthlySummaryResponse,
    ReceiptResponse,
    StatementGenerateRequest,
    StatementResponse,
    StudentSummaryResponse,
)
from app.services.balance import BalanceEngine
from app.services.pdf import build_receipt_pdf, build_statement_pdf, pdf_response
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


@router.post("/statements/generate-all")
async def generate_all_statements(
    academic_year: int,
    month: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance")),
):
    """Generate a statement for the selected month for EVERY approved student
    (whole-school run). Existing statements are kept — only missing ones are
    created."""
    service = StatementService(db)
    students = await db.execute(
        select(Student).where(Student.registration_status == "approved")
    )
    generated = 0
    skipped = 0
    failed = 0
    errors: list[str] = []
    for student in students.scalars().all():
        try:
            if await service.get(student.id, academic_year, month):
                skipped += 1
                continue
            await service.generate(student.id, academic_year, month)
            generated += 1
        except Exception as exc:  # noqa: BLE001 - one student must not abort the run
            failed += 1
            errors.append(f"{student.id}: {exc}")
    await db.commit()
    return {
        "academic_year": academic_year,
        "month": month,
        "generated": generated,
        "skipped": skipped,
        "failed": failed,
        "errors": errors[:20],
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

    ledger = await service.ledger_for_statement(statement)
    pdf = build_statement_pdf(
        statement,
        student_name,
        ledger,
        student_number=student.student_number if student else "",
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


@router.post("/balance-engine/rollover")
async def trigger_rollover(
    academic_year: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin")),
):
    engine = BalanceEngine(db)
    await engine.process_rollover(academic_year)
    return {"detail": "Rollover processed"}


@router.get("/balance-engine/total-due/{student_id}")
async def get_total_due(
    student_id: str,
    academic_year: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role == "parent":
        await verify_student_access(student_id, user, db)
    engine = BalanceEngine(db)
    total = await engine.calculate_total_due(student_id, academic_year)
    return {
        "student_id": student_id,
        "academic_year": academic_year,
        "total_due": str(total),
    }
