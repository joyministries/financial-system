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


@router.get("/", response_model=list[InvoiceResponse])
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
    service = InvoiceService(db)
    filters = {
        "academic_year": academic_year,
        "month": month,
        "status": status,
        "limit": limit,
        "offset": offset,
    }
    if user.role == "parent":
        child_ids = await get_parent_student_ids(user, db)
        if not child_ids:
            return []
        if student_id:
            if student_id not in child_ids:
                raise HTTPException(status_code=403, detail="Access denied")
            return await service.list_invoices(student_ids=[student_id], **filters)
        return await service.list_invoices(student_ids=child_ids, **filters)
    if student_id:
        return await service.list_invoices(student_ids=[student_id], **filters)
    return await service.list_invoices(**filters)


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
