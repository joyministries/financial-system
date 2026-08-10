import logging
from datetime import UTC, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_role
from app.models.grade import Student
from app.models.schedule import OutstandingBalance
from app.schemas.sms import (
    SmsMessageOut,
    SmsReminderRequest,
    SmsReminderResponse,
    SmsSendRequest,
    SmsSendResponse,
    SmsStudentSendRequest,
    SmsTemplateOut,
    SmsTemplateRenderRequest,
    SmsTemplateRenderResponse,
    SmsTemplateUpdate,
    SmsTestRequest,
)
from app.services.reminder import send_payment_link_reminders
from app.services.sms import SmsNotConfiguredError, SmsService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sms", tags=["sms"])

staff_only = require_role("admin", "finance")


@router.post("/send", response_model=SmsSendResponse)
async def send_sms(
    payload: SmsSendRequest,
    user=Depends(staff_only),
    db: AsyncSession = Depends(get_db),
) -> SmsSendResponse:
    """Send a one-off SMS. `student_id` is optional but links the message to
    the student for reporting."""
    service = SmsService(db)
    try:
        message = await service.send(
            payload.to_phone,
            payload.content,
            student_id=payload.student_id,
            template="manual",
            created_by=user.id,
        )
    except (SmsNotConfiguredError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        # Provider failure — persist the failed row BEFORE returning, so the
        # SMS log always shows what was attempted.
        await db.commit()
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    await db.commit()
    return SmsSendResponse(
        id=message.id,
        status=message.status,
        to_phone=message.to_phone,
        detail="SMS sent" if message.status == "sent" else "SMS provider rejected the message",
    )


@router.post("/test", response_model=SmsSendResponse)
async def send_test_sms(
    payload: SmsTestRequest,
    user=Depends(staff_only),
    db: AsyncSession = Depends(get_db),
) -> SmsSendResponse:
    """Send the fixed test message to verify the provider channel works."""
    service = SmsService(db)
    try:
        message = await service.send_test(payload.to_phone, created_by=user.id)
    except (SmsNotConfiguredError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        # Persist the failed row so the log shows the attempt.
        await db.commit()
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    await db.commit()
    return SmsSendResponse(
        id=message.id,
        status=message.status,
        to_phone=message.to_phone,
        detail="Test SMS sent" if message.status == "sent" else "Test SMS failed",
    )


@router.post("/reminders", response_model=SmsReminderResponse)
async def send_balance_reminders(
    payload: SmsReminderRequest,
    user=Depends(staff_only),
    db: AsyncSession = Depends(get_db),
) -> SmsReminderResponse:
    """Send balance reminders to every active student with an unpaid balance.

    One SMS per student to their billing parent's mobile. Students without a
    usable guardian phone are counted and reported (not silently dropped).
    """
    stmt = (
        select(Student)
        .join(
            OutstandingBalance,
            OutstandingBalance.student_id == Student.id,
        )
        .where(
            Student.is_active == True,  # noqa: E712
            OutstandingBalance.status != "paid",
        )
        .distinct()
    )
    result = await db.execute(stmt)
    students = result.scalars().all()

    service = SmsService(db)
    sent = 0
    skipped_no_phone = 0
    errors: list[str] = []
    for student in students:
        balance_stmt = select(OutstandingBalance).where(
            OutstandingBalance.student_id == student.id,
            OutstandingBalance.status != "paid",
        )
        balance_rows = (await db.execute(balance_stmt)).scalars().all()
        total = sum((row.balance or Decimal("0")) for row in balance_rows)

        phone = await service.get_student_phone(student)
        if not phone:
            skipped_no_phone += 1
            continue
        try:
            await service.send_balance_reminder(
                student, total, payload.month, payload.academic_year
            )
            sent += 1
        except (SmsNotConfiguredError, ValueError) as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except RuntimeError as exc:
            errors.append(f"{student.student_number}: {exc}")

    await db.commit()
    return SmsReminderResponse(
        sent=sent,
        skipped_no_phone=skipped_no_phone,
        skipped_failed=len(errors),
        errors=errors[:20],
    )


@router.post("/reminders/paylink", response_model=SmsReminderResponse)
async def send_paylink_reminders_now(
    user=Depends(staff_only),
    db: AsyncSession = Depends(get_db),
) -> SmsReminderResponse:
    """Send payment-link reminders NOW to every due student's billing parent.

    Each SMS contains a secure pay-by-link for the parent's current
    outstanding balance (same link as the parent 'Pay Online' flow).
    """
    try:
        result = await send_payment_link_reminders(db, created_by=user.id)
    except SmsNotConfiguredError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    await db.commit()
    return SmsReminderResponse(**result)


@router.get("/messages", response_model=list[SmsMessageOut])
async def list_sms_log(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    status: str | None = Query(default=None, max_length=20),
    _user=Depends(staff_only),
    db: AsyncSession = Depends(get_db),
) -> list[SmsMessageOut]:
    """SMS send log, newest first."""
    return await SmsService(db).list_log(limit=limit, offset=offset, status=status)


# ── curated templates ────────────────────────────────────────
@router.get("/templates", response_model=list[SmsTemplateOut])
async def list_sms_templates(
    _user=Depends(staff_only),
    db: AsyncSession = Depends(get_db),
) -> list[SmsTemplateOut]:
    """List editable message templates (admin-curated SMS content)."""
    return await SmsService(db).list_templates()


@router.put("/templates/{key}", response_model=SmsTemplateOut)
async def update_sms_template(
    key: str,
    payload: SmsTemplateUpdate,
    user=Depends(staff_only),
    db: AsyncSession = Depends(get_db),
) -> SmsTemplateOut:
    """Create or update a message template. The saved body is used for every
    future send with that template key (overriding the built-in fallback)."""
    service = SmsService(db)
    template = await service.upsert_template(
        key=key,
        body=payload.body,
        name=payload.name,
        is_active=payload.is_active,
        updated_by=user.id,
    )
    await db.commit()
    return template


@router.post("/templates/{key}/render", response_model=SmsTemplateRenderResponse)
async def render_sms_template(
    key: str,
    payload: SmsTemplateRenderRequest,
    _user=Depends(staff_only),
    db: AsyncSession = Depends(get_db),
) -> SmsTemplateRenderResponse:
    """Preview a template with sample/real values — never sends."""
    service = SmsService(db)
    template = await service.get_template(key)
    content, missing = service.render_template(
        key, payload.values, fallback=template.body if template else None
    )
    return SmsTemplateRenderResponse(key=key, content=content, missing=missing)


# ── single parent ────────────────────────────────────────────
@router.post("/send-to-student", response_model=SmsSendResponse)
async def send_sms_to_student(
    payload: SmsStudentSendRequest,
    user=Depends(staff_only),
    db: AsyncSession = Depends(get_db),
) -> SmsSendResponse:
    """Send one SMS to a single student's billing parent.

    Resolves the parent's mobile from the student's guardians, renders the
    chosen curated template (or uses `content` verbatim), and logs the send.
    `content` wins over `template_key` when both are supplied.
    """
    student = await db.get(Student, payload.student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    service = SmsService(db)
    if payload.content:
        content = payload.content
        template_key = "manual"
    elif payload.template_key:
        template_key = payload.template_key
        template = await service.get_template(template_key)
        values: dict[str, str | None] = {
            "parent": await service.parent_first_name(student),
            "student": student.first_name,
        }
        # Fill in balance context if the template uses it.
        if "{balance}" in (template.body if template else "") or "{month}" in (
            template.body if template else ""
        ):
            from app.services.reminder import outstanding_total

            values["balance"] = f"{await outstanding_total(db, student.id):,.2f}"
            values["month"] = f"{datetime.now(UTC).month:02d}"
            values["year"] = str(datetime.now(UTC).year)
        if "{amount}" in (template.body if template else ""):
            from app.services.reminder import outstanding_total

            values["amount"] = f"{await outstanding_total(db, student.id):,.2f}"
        content, missing = service.render_template(
            template_key, values, fallback=template.body if template else None
        )
        if missing:
            raise HTTPException(
                status_code=422,
                detail=f"Template {template_key!r} has unfilled placeholders: {', '.join(missing)}",
            )
    else:
        raise HTTPException(status_code=422, detail="Provide template_key or content")

    phone = await service.get_student_phone(student)
    if not phone:
        raise HTTPException(status_code=422, detail="Student has no guardian mobile number")

    try:
        message = await service.send(
            phone,
            content,
            student_id=student.id,
            template=template_key,
            created_by=user.id,
        )
    except (SmsNotConfiguredError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        await db.commit()
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    await db.commit()
    return SmsSendResponse(
        id=message.id,
        status=message.status,
        to_phone=message.to_phone,
        detail="SMS sent" if message.status == "sent" else "SMS provider rejected the message",
    )
