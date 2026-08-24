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
from app.schemas.common import CountResponse, PageResponse, build_page_response
from app.schemas.payment import (
    PaymentAllocationCreate,
    PaymentAllocationResponse,
    PaymentCreate,
    PaymentDeallocate,
    PaymentEdit,
    PaymentReallocate,
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


@router.get("/", response_model=PageResponse[PaymentResponse])
async def list_payments(
    student_id: str | None = None,
    status: str | None = None,
    search: str | None = None,
    month: int | None = Query(default=None, ge=1, le=12),
    year: int | None = Query(default=None, ge=2000, le=2100),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List payments — one page only (LIMIT/OFFSET at the DB level) plus
    pagination metadata so the UI never needs a separate count call."""
    service = PaymentService(db)
    if user.role == "parent":
        child_ids = await get_parent_student_ids(user, db)
        if not child_ids:
            return build_page_response([], 0, limit, offset)
        if student_id:
            if student_id not in child_ids:
                raise HTTPException(status_code=403, detail="Access denied")
            items = await service.list_for_student(
                student_id, limit=limit, offset=offset, month=month, year=year
            )
            total = await service.count_for_student(student_id, month=month, year=year)
            return build_page_response(items, total, limit, offset)
        items = await service.list_for_students(
            child_ids, limit=limit, offset=offset, month=month, year=year, search=search
        )
        total = await service.count_for_students(
            child_ids, month=month, year=year, search=search
        )
        return build_page_response(items, total, limit, offset)
    if student_id:
        items = await service.list_for_student(
            student_id, limit=limit, offset=offset, month=month, year=year
        )
        total = await service.count_for_student(student_id, month=month, year=year)
        return build_page_response(items, total, limit, offset)
    if status == "pending":
        items = await service.list_pending(
            limit=limit, offset=offset, month=month, year=year, search=search
        )
        total = await service.count_pending(month=month, year=year, search=search)
        return build_page_response(items, total, limit, offset)
    items = await service.list_all(
        limit=limit, offset=offset, month=month, year=year, search=search
    )
    total = await service.count_all(month=month, year=year, search=search)
    return build_page_response(items, total, limit, offset)


@router.get("/count", response_model=CountResponse)
async def count_payments(
    student_id: str | None = None,
    status: str | None = None,
    search: str | None = None,
    month: int | None = Query(default=None, ge=1, le=12),
    year: int | None = Query(default=None, ge=2000, le=2100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Total matching payments for pagination (mirrors GET /payments filters)."""
    service = PaymentService(db)
    if user.role == "parent":
        child_ids = await get_parent_student_ids(user, db)
        if not child_ids:
            return CountResponse(total=0)
        if student_id:
            if student_id not in child_ids:
                raise HTTPException(status_code=403, detail="Access denied")
            return CountResponse(
                total=await service.count_for_student(student_id, month=month, year=year)
            )
        return CountResponse(
            total=await service.count_for_students(
                child_ids, month=month, year=year, search=search
            )
        )
    if student_id:
        return CountResponse(
            total=await service.count_for_student(student_id, month=month, year=year)
        )
    if status == "pending":
        return CountResponse(
            total=await service.count_pending(month=month, year=year, search=search)
        )
    return CountResponse(total=await service.count_all(month=month, year=year, search=search))


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
        # Notify the office: a payment was verified (receipt issued).
        from app.models.grade import Student
        from app.services.notification import NotificationService

        student = await db.get(Student, payment.student_id)
        student_name = (
            f"{student.first_name} {student.last_name}" if student else "a student"
        )
        await NotificationService(db).notify_staff(
            title="Payment verified",
            message=(
                f"{user.full_name} verified R{payment.amount:,.2f} for "
                f"{student_name} (receipt {receipt.receipt_number})."
            ),
            category="payment_received",
            entity_type="student",
            entity_id=payment.student_id,
        )
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

    if data.action == "reject":
        from app.models.grade import Student
        from app.services.notification import NotificationService

        student = await db.get(Student, payment.student_id)
        student_name = (
            f"{student.first_name} {student.last_name}" if student else "a student"
        )
        await NotificationService(db).notify_staff(
            title="Payment rejected",
            message=(
                f"{user.full_name} rejected a R{payment.amount:,.2f} payment "
                f"for {student_name}. The parent should be contacted."
            ),
            category="payment_reversed",
            entity_type="student",
            entity_id=payment.student_id,
        )

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

    # Notify the office (staff-wide): a payment was reversed.
    from app.models.grade import Student
    from app.services.notification import NotificationService

    payment = await service.get(data.payment_id)
    student = await db.get(Student, payment.student_id) if payment else None
    student_name = f"{student.first_name} {student.last_name}" if student else "a student"
    notification = NotificationService(db)
    await notification.notify_staff(
        title="Payment reversed",
        message=(
            f"{user.full_name} reversed a payment of R{payment.amount:,.2f} "
            f"for {student_name}. Reason: {data.reason}"
        ),
        category="payment_reversed",
        entity_type="student",
        entity_id=payment.student_id if payment else None,
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


@router.put("/{payment_id}", response_model=PaymentResponse)
async def edit_payment(
    payment_id: str,
    data: PaymentEdit,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance")),
):
    """Edit payment details (amount, student, method, date, reference, notes).
    Changing student_id or amount requires all allocations to be removed first."""
    service = PaymentService(db)
    from app.services.audit import AuditService

    payment = await service.edit(payment_id, data)
    await AuditService(db).log("payment", payment_id, "edit", user.id, new_values=data.model_dump(exclude_unset=True))
    return payment


@router.delete("/allocations/{allocation_id}")
async def deallocate_payment(
    allocation_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance")),
):
    """Remove an allocation and reverse its effect on the balance/charge."""
    service = PaymentService(db)
    from app.services.audit import AuditService

    alloc = await service.deallocate(allocation_id)
    await AuditService(db).log(
        "payment", alloc.payment_id, "deallocate", user.id,
        new_values={"allocation_id": allocation_id, "amount": str(alloc.amount_allocated)},
    )
    return {"detail": "Allocation removed", "allocation_id": allocation_id}


@router.post("/reallocate", response_model=PaymentAllocationResponse)
async def reallocate_payment(
    data: PaymentReallocate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance")),
):
    """Move funds from one allocation target to another on the same payment."""
    service = PaymentService(db)
    from app.services.audit import AuditService

    alloc = await service.reallocate(data)
    await AuditService(db).log(
        "payment", data.payment_id, "reallocate", user.id,
        new_values=data.model_dump(exclude_unset=True),
    )
    return alloc
