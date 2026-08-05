
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import (
    get_current_user,
    get_parent_student_ids,
    require_role,
    verify_student_access,
)
from app.models.user import User
from app.schemas.financial import (
    ReceiptResponse,
    StatementGenerateRequest,
    StatementResponse,
    StudentSummaryResponse,
)
from app.services.balance import BalanceEngine
from app.services.receipt import ReceiptService
from app.services.report import ReportService
from app.services.statement import StatementService
from app.services.student_summary import StudentSummaryService

router = APIRouter(prefix="/financial", tags=["Financial"])


@router.get("/receipts", response_model=list[ReceiptResponse])
async def list_receipts(
    student_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    service = ReceiptService(db)
    if user.role == "parent":
        child_ids = await get_parent_student_ids(user, db)
        if not child_ids:
            return []
        if student_id:
            if student_id not in child_ids:
                raise HTTPException(status_code=403, detail="Access denied")
            return await service.list_for_student(student_id)
        return await service.list_all(student_ids=child_ids)
    if student_id:
        return await service.list_for_student(student_id)
    return await service.list_all()


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


@router.post("/statements/generate", response_model=StatementResponse)
async def generate_statement(
    data: StatementGenerateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance")),
):
    service = StatementService(db)
    return await service.generate(data.student_id, data.academic_year, data.month)


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
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance")),
):
    service = ReportService(db)
    return await service.statement_report(academic_year, status)


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
