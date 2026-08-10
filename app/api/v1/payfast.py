"""PayFast payment gateway routes.

* POST /payfast/initiate — parent starts a PayFast payment for a child.
* POST /payfast/itn      — PayFast Instant Transaction Notification webhook.
* GET  /payfast/return   — browser redirect target after a successful payment.
* GET  /payfast/cancel   — browser redirect target after the payer cancels.
"""
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.deps import require_role, verify_student_access
from app.core.rate_limit import limiter
from app.models.user import User
from app.schemas.payfast import PayFastInitiateCreate, PayFastInitiateResponse
from app.schemas.payment import PaymentCreate
from app.services import payfast as pf
from app.services.audit import AuditService
from app.services.payment import PaymentService
from app.services.receipt import ReceiptService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/payfast", tags=["PayFast"])


@router.post("/initiate", response_model=PayFastInitiateResponse)
@limiter.limit("20/hour")
async def initiate_payment(
    request: Request,
    data: PayFastInitiateCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("parent")),
):
    if not pf.is_configured():
        raise HTTPException(
            status_code=503,
            detail="PayFast is not configured. Set PAYFAST_MERCHANT_ID and PAYFAST_MERCHANT_KEY.",
        )

    await verify_student_access(data.student_id, user, db)

    # Record the pending payment so the ITN can reconcile against it.
    service = PaymentService(db)
    from datetime import UTC, datetime

    payment = await service.record_payment(
        PaymentCreate(
            student_id=data.student_id,
            amount=data.amount,
            payment_method="payfast",
            payment_date=datetime.now(UTC),
            reference_number=f"PF-{data.student_id[:8].upper()}",
            notes=data.item_description,
        ),
        user_id=user.id,
    )
    await db.commit()
    await db.refresh(payment)

    form_fields = pf.build_form_data(
        payment_id=payment.id,
        amount=data.amount,
        item_name=data.item_name,
        item_description=data.item_description,
        name_first=user.full_name.split(" ", 1)[0] or "Parent",
        name_last=user.full_name.split(" ", 1)[1] if " " in user.full_name else "",
        email_address=user.email,
    )

    audit = AuditService(db)
    await audit.log("payfast", payment.id, "initiate", user.id,
                    new_values={"amount": str(data.amount)})

    settings = get_settings()
    payment_url = f"{settings.FRONTEND_BASE_URL.rstrip('/')}/pay/{payment.id}"

    return PayFastInitiateResponse(
        payment_id=payment.id,
        payfast_url=pf.process_url(),
        payment_url=payment_url,
        form_fields=form_fields,
    )


@router.post("/itn")
async def payfast_itn(
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """PayFast Instant Transaction Notification.

    Server-to-server POST (application/x-www-form-urlencoded). The body is
    validated by (1) MD5 signature and (2) re-submitting the payload to
    PayFast's /eng/query/validate endpoint. PayFast retries until it gets a
    200, so this endpoint always returns 200 and logs failures instead of
    raising.
    """
    form = await request.form()
    payload = {k: (v if isinstance(v, str) else str(v)) for k, v in form.items()}

    received_sig = payload.pop("signature", None)
    settings = get_settings()

    # 1. Signature check — cheap, catches forgery before any DB work.
    if not pf.verify_signature(payload, received_sig, settings.PAYFAST_PASSPHRASE):
        logger.warning("PayFast ITN rejected: signature mismatch (m_payment_id=%s)",
                       payload.get("m_payment_id"))
        return {"status": "rejected"}

    # 2. Server-side validation with PayFast.
    if not await pf.validate_itn_with_payfast(payload):
        logger.warning("PayFast ITN rejected: server validation failed (m_payment_id=%s)",
                       payload.get("m_payment_id"))
        return {"status": "rejected"}

    payment_id = payload.get("m_payment_id")
    status = payload.get("payment_status", "").upper()
    gross = payload.get("amount_gross")

    service = PaymentService(db)
    payment = await service.get(payment_id) if payment_id else None
    if not payment:
        logger.warning("PayFast ITN for unknown payment_id=%s", payment_id)
        return {"status": "rejected"}

    # 3. Amount reconciliation — protect against tampered amounts.
    if gross:
        from decimal import Decimal, InvalidOperation

        try:
            if Decimal(gross) != payment.amount:
                logger.warning(
                    "PayFast ITN amount mismatch: gateway=%s payment=%s (payment=%s)",
                    gross, payment.amount, payment.id,
                )
                return {"status": "rejected"}
        except InvalidOperation:
            logger.warning("PayFast ITN unparseable amount_gross=%r", gross)
            return {"status": "rejected"}

    audit = AuditService(db)

    if status == pf.STATUS_COMPLETE:
        if payment.status == "pending":
            payment.status = "verified"
            payment.reference_number = payload.get("pf_payment_id", payment.reference_number)
            await db.flush()
            receipt = await ReceiptService(db).generate(payment)
            await audit.log("payfast", payment.id, "itn_complete", payment.allocated_by,
                            new_values={"pf_payment_id": payload.get("pf_payment_id"),
                                        "amount_gross": gross})
            logger.info("PayFast payment %s verified (receipt %s)", payment.id,
                        receipt.receipt_number)

            # Notify the office: a parent has paid via PayFast.
            from app.models.grade import Student
            from app.models.user import User
            from app.services.notification import NotificationService

            parent = await db.get(User, payment.allocated_by) if payment.allocated_by else None
            student = await db.get(Student, payment.student_id)
            parent_name = parent.full_name if parent else "A parent"
            student_name = (
                f"{student.first_name} {student.last_name}" if student else "a student"
            )
            notification = NotificationService(db)
            await notification.notify_staff(
                title="Payment received via PayFast",
                message=(
                    f"{parent_name} paid R{payment.amount:,.2f} for {student_name} "
                    f"(ref {receipt.receipt_number})."
                ),
                category="payment_received",
                entity_type="student",
                entity_id=payment.student_id,
            )

            # Notify the parent (background, after response): SMS + email receipt.
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
        return {"status": "ok"}

    if status in (pf.STATUS_FAILED, pf.STATUS_CANCELLED):
        if payment.status == "pending":
            payment.status = "rejected"
            await audit.log("payfast", payment.id, f"itn_{status.lower()}",
                            payment.allocated_by,
                            new_values={"pf_payment_id": payload.get("pf_payment_id")})
        return {"status": "ok"}

    # PENDING or unknown — leave pending; admin can reconcile manually.
    logger.info("PayFast ITN for %s with status %s left pending", payment.id, status)
    return {"status": "ok"}


@router.get("/return")
async def payfast_return(
    request: Request,
    payment_id: str = "",
):
    settings = get_settings()
    base = settings.FRONTEND_BASE_URL.rstrip("/")
    return RedirectResponse(f"{base}/parent?payfast=success&payment_id={payment_id}")


@router.get("/cancel")
async def payfast_cancel(
    request: Request,
    payment_id: str = "",
):
    settings = get_settings()
    base = settings.FRONTEND_BASE_URL.rstrip("/")
    return RedirectResponse(f"{base}/parent?payfast=cancelled&payment_id={payment_id}")
