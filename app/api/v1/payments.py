from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import (
    get_current_user,
    get_parent_student_ids,
    require_role,
    verify_student_access,
)
from app.models.user import User
from app.schemas.payment import (
    PaymentAllocationCreate,
    PaymentAllocationResponse,
    PaymentCreate,
    PaymentResponse,
    PaymentReversalCreate,
    PaymentVerification,
    ProofOfPaymentUpload,
)
from app.services.payment import PaymentService
from app.services.receipt import ReceiptService

router = APIRouter(prefix="/payments", tags=["Payments"])


@router.post("/", response_model=PaymentResponse)
async def record_payment(
    data: PaymentCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance")),
):
    service = PaymentService(db)
    return await service.record_payment(data, user.id)


@router.get("/", response_model=list[PaymentResponse])
async def list_payments(
    student_id: str | None = None,
    status: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    service = PaymentService(db)
    if user.role == "parent":
        child_ids = await get_parent_student_ids(user, db)
        if not child_ids:
            return []
        if student_id:
            if student_id not in child_ids:
                raise HTTPException(status_code=403, detail="Access denied")
            return await service.list_for_student(student_id, limit=limit, offset=offset)
        return await service.list_for_students(child_ids, limit=limit, offset=offset)
    if student_id:
        return await service.list_for_student(student_id, limit=limit, offset=offset)
    if status == "pending":
        return await service.list_pending(limit=limit, offset=offset)
    return await service.list_all(limit=limit, offset=offset)


@router.get("/{payment_id}", response_model=PaymentResponse)
async def get_payment(
    payment_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    service = PaymentService(db)
    payment = await service.get(payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    if user.role == "parent":
        await verify_student_access(payment.student_id, user, db)
    return payment


@router.post("/allocate", response_model=PaymentAllocationResponse)
async def allocate_payment(
    data: PaymentAllocationCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance")),
):
    service = PaymentService(db)
    return await service.allocate(data)


@router.post("/verify")
async def verify_payment(
    data: PaymentVerification,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance")),
):
    from app.services.audit import AuditService

    service = PaymentService(db)
    payment = await service.verify_payment(data.payment_id, data.action, user.id)
    if not payment:
        raise HTTPException(
            status_code=404, detail="Payment not found or already processed"
        )

    audit = AuditService(db)
    await audit.log("payment", data.payment_id, f"verify_{data.action}", user.id)

    if data.action == "approve":
        receipt_service = ReceiptService(db)
        receipt = await receipt_service.generate(payment)
        # Notify the parent (fire-and-forget after the response; the SMS/email
        # providers must never block the office).
        from app.services.email import send_payment_receipt_email_async
        from app.services.sms import send_payment_receipt_sms_async

        background_tasks.add_task(
            send_payment_receipt_sms_async, payment.student_id, payment.amount,
            receipt.receipt_number,
        )
        background_tasks.add_task(
            send_payment_receipt_email_async, payment.student_id, payment.amount,
            receipt.receipt_number, payment.payment_date,
        )
        return {"detail": "Payment verified", "receipt_number": receipt.receipt_number}

    return {"detail": f"Payment {data.action}d"}


@router.post("/reverse")
async def reverse_payment(
    data: PaymentReversalCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin")),
):
    from app.services.audit import AuditService

    service = PaymentService(db)
    reversal = await service.reverse(data, user.id)

    audit = AuditService(db)
    await audit.log(
        "payment", data.payment_id, "reverse", user.id,
        new_values={"reason": data.reason},
    )

    return {"detail": "Payment reversed", "reversal_id": reversal.id}


@router.post("/upload-proof")
async def upload_proof_of_payment(
    data: ProofOfPaymentUpload,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance", "parent")),
):
    service = PaymentService(db)
    payment = await service.upload_proof(data.payment_id, data.proof_url)
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    return {"detail": "Proof uploaded"}
