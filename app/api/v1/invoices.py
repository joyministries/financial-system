from fastapi import APIRouter, Depends, HTTPException, Query
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
from app.schemas.invoice import (
    InvoiceGenerateRequest,
    InvoiceResponse,
    InvoiceStatusUpdate,
)
from app.services.invoice import InvoiceService
from app.services.pdf import build_invoice_pdf, pdf_response

router = APIRouter(prefix="/invoices", tags=["Invoices"])


@router.post("/generate", response_model=InvoiceResponse)
async def generate_invoice(
    data: InvoiceGenerateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance")),
):
    service = InvoiceService(db)
    return await service.generate(data.student_id, data.academic_year, data.month, user.id)


@router.post("/generate-all")
async def generate_all_invoices(
    academic_year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    grade_id: str | None = Query(default=None),
    notify_parents: bool = Query(default=True),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance")),
):
    """Generate invoices for every approved student (or one grade).

    Existing invoices are skipped. Each newly created invoice triggers an SMS
    to the billing parent unless `notify_parents=false`.

    The run self-limits to fit the serverless timeout and commits progress in
    batches. When the response has ``complete=false`` the caller should re-invoke
    the same endpoint (same params) to resume; already-generated invoices are
    skipped, so re-invocation never duplicates work.
    """
    service = InvoiceService(db)
    result = await service.generate_all(
        academic_year, month, user.id, grade_id=grade_id, notify_parents=notify_parents
    )
    await db.commit()

    # Notify the office when a bulk run finishes (a time-budgeted run reports
    # complete=false and must be re-invoked; only announce the finished run).
    if result.get("complete"):
        from app.services.notification import NotificationService

        created = result.get("created", 0)
        skipped = result.get("skipped_existing", 0)
        failed = result.get("failed", 0)
        await NotificationService(db).notify_staff(
            title="Invoice generation complete",
            message=(
                f"Bulk invoices for {academic_year}-{month:02d}"
                f"{(' (grade ' + grade_id[:8] + ')') if grade_id else ''}: "
                f"{created} created, {skipped} already existed"
                f"{', ' + str(failed) + ' failed' if failed else ''}."
            ),
            category="system",
        )
        await db.commit()
    return result


@router.get("/", response_model=PageResponse[InvoiceResponse])
async def list_invoices(
    student_id: str | None = None,
    academic_year: int | None = None,
    month: int | None = None,
    status: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List invoices — one page only (LIMIT/OFFSET at the DB level) plus
    pagination metadata so the UI renders controls without a count call."""
    service = InvoiceService(db)
    filters = {
        "academic_year": academic_year,
        "month": month,
        "status": status,
        "limit": limit,
        "offset": offset,
    }
    count_filters = {
        "academic_year": academic_year,
        "month": month,
        "status": status,
    }
    if user.role == "parent":
        child_ids = await get_parent_student_ids(user, db)
        if not child_ids:
            return build_page_response([], 0, limit, offset)
        if student_id:
            if student_id not in child_ids:
                raise HTTPException(status_code=403, detail="Access denied")
            items = await service.list_invoices(student_ids=[student_id], **filters)
            total = await service.count_invoices(
                student_ids=[student_id], **count_filters
            )
            return build_page_response(items, total, limit, offset)
        items = await service.list_invoices(student_ids=child_ids, **filters)
        total = await service.count_invoices(student_ids=child_ids, **count_filters)
        return build_page_response(items, total, limit, offset)
    if student_id:
        items = await service.list_invoices(student_ids=[student_id], **filters)
        total = await service.count_invoices(student_ids=[student_id], **count_filters)
        return build_page_response(items, total, limit, offset)
    items = await service.list_invoices(**filters)
    total = await service.count_invoices(**count_filters)
    return build_page_response(items, total, limit, offset)


@router.get("/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice(
    invoice_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    service = InvoiceService(db)
    invoice = await service.get(invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if user.role == "parent":
        await verify_student_access(invoice.student_id, user, db)
    return invoice


@router.get("/{invoice_id}/download")
async def download_invoice(
    invoice_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    service = InvoiceService(db)
    invoice = await service.get(invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if user.role == "parent":
        await verify_student_access(invoice.student_id, user, db)

    student = await db.get(Student, invoice.student_id)
    student_name = (
        f"{student.first_name} {student.last_name}" if student else invoice.student_id
    )
    pdf = build_invoice_pdf(invoice, student_name)
    return pdf_response(pdf, f"{invoice.invoice_number}.pdf")


@router.post("/{invoice_id}/status", response_model=InvoiceResponse)
async def update_invoice_status(
    invoice_id: str,
    data: InvoiceStatusUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance")),
):
    service = InvoiceService(db)
    return await service.update_status(invoice_id, data.status, user.id)
