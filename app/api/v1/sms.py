import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_role
from app.models.grade import Student
from app.schemas.common import PageResponse, build_page_response
from app.schemas.sms import (
    SmsMessageOut,
    SmsReminderRequest,
    SmsReminderResponse,
    SmsSendRequest,
    SmsSendResponse,
    SmsStudentSendRequest,
    SmsTemplateActivateRequest,
    SmsTemplateCreate,
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
    from app.services.ledger import LedgerService

    ledger_rows = await LedgerService(db).students_outstanding(payload.academic_year)
    students = []
    for row in ledger_rows:
        if row["outstanding"] <= 0:
            continue
        student = await db.get(Student, row["student_id"])
        if student and student.is_active:
            students.append((student, row["outstanding"]))

    service = SmsService(db)
    sent = 0
    skipped_no_phone = 0
    errors: list[str] = []
    for student, total in students:
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


@router.get("/messages", response_model=PageResponse[SmsMessageOut])
async def list_sms_log(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    status: str | None = Query(default=None, max_length=20),
    _user=Depends(staff_only),
    db: AsyncSession = Depends(get_db),
) -> PageResponse[SmsMessageOut]:
    """SMS send log, newest first — one page + pagination metadata."""
    service = SmsService(db)
    items = await service.list_log(limit=limit, offset=offset, status=status)
    total = await service.count(status=status)
    return build_page_response(items, total, limit, offset)


# ── curated templates ────────────────────────────────────────
@router.get("/templates", response_model=list[SmsTemplateOut])
async def list_sms_templates(
    _user=Depends(staff_only),
    db: AsyncSession = Depends(get_db),
) -> list[SmsTemplateOut]:
    """Message templates with every saved variant per slot.

    Built-in defaults are merged in, so the card shows the actual message
    before anything has been saved. `is_active` marks the variant future sends
    use (true on the built-in default entry when nothing is in use yet).
    """
    groups = await SmsService(db).list_message_template_groups()
    return [SmsTemplateOut(**g) for g in groups]


@router.get("/statement-templates", response_model=list[SmsTemplateOut])
async def list_statement_templates(
    _user=Depends(staff_only),
    db: AsyncSession = Depends(get_db),
) -> list[SmsTemplateOut]:
    """Statement-workflow templates, with saved variants and the built-in
    default merged in — same shape as `GET /sms/templates`."""
    groups = await SmsService(db).list_statement_template_groups()
    return [SmsTemplateOut(**g) for g in groups]


@router.post("/templates", response_model=SmsTemplateOut)
async def create_sms_template(
    payload: SmsTemplateCreate,
    user=Depends(staff_only),
    db: AsyncSession = Depends(get_db),
) -> SmsTemplateOut:
    """Save a new variant of a message slot. The FIRST variant saved for a slot
    becomes the one in use; afterwards the admin chooses via
    `PUT /sms/templates/{slot}/activate`."""
    service = SmsService(db)
    try:
        template = await service.create_template(
            payload.slot, payload.name, payload.body, updated_by=user.id
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    await db.commit()
    return SmsTemplateOut(
        id=template.id,
        slot=template.slot,
        name=template.name,
        body=template.body,
        is_active=template.is_active,
        is_default=False,
        updated_at=template.updated_at,
    )


@router.put("/templates/{template_id}", response_model=SmsTemplateOut)
async def update_sms_template(
    template_id: str,
    payload: SmsTemplateUpdate,
    user=Depends(staff_only),
    db: AsyncSession = Depends(get_db),
) -> SmsTemplateOut:
    """Edit a saved variant's name/body; `is_active: true` also switches the
    slot's sends to this variant."""
    service = SmsService(db)
    try:
        template = await service.update_variant(
            template_id,
            name=payload.name,
            body=payload.body,
            is_active=payload.is_active,
            updated_by=user.id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    await db.commit()
    return SmsTemplateOut(
        id=template.id,
        slot=template.slot,
        name=template.name,
        body=template.body,
        is_active=template.is_active,
        is_default=False,
        updated_at=template.updated_at,
    )


@router.put("/templates/{slot}/activate", response_model=SmsTemplateOut)
async def activate_sms_template(
    slot: str,
    payload: SmsTemplateActivateRequest,
    user=Depends(staff_only),
    db: AsyncSession = Depends(get_db),
) -> SmsTemplateOut:
    """Choose which template a slot sends: pass a saved variant id, or null to
    put the built-in default back in use."""
    service = SmsService(db)
    try:
        await service.activate_template(payload.template_id, slot)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    await db.commit()
    variants = await service.list_variants((slot,))
    groups = service.template_groups((slot,), variants)
    if payload.template_id:
        entry = next((g for g in groups if g["id"] == payload.template_id), None)
    else:
        entry = next((g for g in groups if g["is_default"]), groups[0])
    if entry is None:
        raise HTTPException(status_code=404, detail="Template not found")
    return SmsTemplateOut(**entry)


@router.delete("/templates/{template_id}", response_model=SmsSendResponse)
async def delete_sms_template(
    template_id: str,
    user=Depends(staff_only),
    db: AsyncSession = Depends(get_db),
) -> SmsSendResponse:
    """Delete a saved variant. If it was in use, the slot falls back to the
    built-in default text on every future send."""
    service = SmsService(db)
    try:
        await service.delete_template(template_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    await db.commit()
    return SmsSendResponse(id=template_id, status="deleted", to_phone="", detail="Template deleted")


@router.post("/templates/render", response_model=SmsTemplateRenderResponse)
async def render_sms_template(
    payload: SmsTemplateRenderRequest,
    _user=Depends(staff_only),
    db: AsyncSession = Depends(get_db),
) -> SmsTemplateRenderResponse:
    """Preview a template with sample/real values — never sends.

   Identify the template by a saved variant `id`, or by `slot`/`key` to render
    the variant currently in use (built-in default when nothing is saved)."""
    service = SmsService(db)
    template = None
    if payload.id:
        template = await service.get_variant(payload.id)
        if template is None:
            raise HTTPException(status_code=404, detail="Template not found")
    else:
        slot = payload.slot or payload.key
        if not slot:
            raise HTTPException(status_code=422, detail="Provide template id or slot")
        template = await service.get_template(slot)
    content, missing = service.render_template(
        template.slot, payload.values, fallback=template.body if template else None
    )
    return SmsTemplateRenderResponse(
        key=template.slot if template else (payload.slot or payload.key or ""),
        content=content,
        missing=missing,
    )


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
        # Accept a saved variant id OR a slot name: the variant's saved body
        # wins, otherwise the slot's in-use variant, else the built-in default.
        template = await service.get_variant(template_key)
        if template is None:
            template = await service.get_template(template_key)
        template_body = template.body if template else None
        values: dict[str, str | None] = {
            "parent": await service.parent_first_name(student),
            "student": student.first_name,
        }
        # Fill in balance context if the template uses it.
        if "{balance}" in (template_body or "") or "{month}" in (template_body or ""):
            from app.services.reminder import outstanding_total

            values["balance"] = f"{await outstanding_total(db, student.id):,.2f}"
            values["month"] = f"{datetime.now(UTC).month:02d}"
            values["year"] = str(datetime.now(UTC).year)
        if "{amount}" in (template_body or ""):
            from app.services.reminder import outstanding_total

            values["amount"] = f"{await outstanding_total(db, student.id):,.2f}"
        content, missing = service.render_template(
            template_key, values, fallback=template_body
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
