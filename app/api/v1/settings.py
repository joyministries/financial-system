from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_role
from app.schemas.setting import (
    AutoGenerationSettingsIn,
    AutoGenerationSettingsOut,
    EmailSettingsIn,
    EmailSettingsOut,
    NotificationSettingsOut,
    ReminderSettingsIn,
    ReminderSettingsOut,
    SmsSettingsIn,
    SmsSettingsOut,
    StatementGenerationSettingsIn,
    StatementGenerationSettingsOut,
)
from app.services.email import EmailNotConfiguredError, EmailService
from app.services.setting import SettingService

router = APIRouter(prefix="/settings", tags=["settings"])

super_admin_only = require_role("super_admin")


@router.get("/notifications", response_model=NotificationSettingsOut)
async def get_notification_settings(
    _user=Depends(super_admin_only),
    db: AsyncSession = Depends(get_db),
) -> NotificationSettingsOut:
    """Current email/SMS channel configuration (secrets masked). Admin only."""
    return await SettingService(db).get_public()


@router.put("/notifications/email", response_model=EmailSettingsOut)
async def update_email_settings(
    payload: EmailSettingsIn,
    user=Depends(super_admin_only),
    db: AsyncSession = Depends(get_db),
) -> EmailSettingsOut:
    """Save SMTP configuration. Blank/`********` password keeps the stored one."""
    return await SettingService(db).update_email(payload, user.id)


@router.put("/notifications/sms", response_model=SmsSettingsOut)
async def update_sms_settings(
    payload: SmsSettingsIn,
    user=Depends(super_admin_only),
    db: AsyncSession = Depends(get_db),
) -> SmsSettingsOut:
    """Save SMS provider configuration. Blank/`********` secrets keep stored ones."""
    return await SettingService(db).update_sms(payload, user.id)


# ── automated payment-link reminders ─────────────────────────
def _reminder_out(config: dict) -> ReminderSettingsOut:
    from app.services.reminder import next_run_date

    next_run = next_run_date(config)
    return ReminderSettingsOut(
        enabled=config.get("enabled", False),
        start_date=config.get("start_date", ""),
        interval_days=config.get("interval_days", 7),
        count=config.get("count", 4),
        last_run_date=config.get("last_run_date") or None,
        next_run_date=next_run.isoformat() if next_run else None,
    )


@router.get("/reminders", response_model=ReminderSettingsOut)
async def get_reminder_settings(
    _user=Depends(super_admin_only),
    db: AsyncSession = Depends(get_db),
) -> ReminderSettingsOut:
    """Current automated payment-link reminder schedule (admin only)."""
    config = await SettingService(db).get_reminder_config()
    return _reminder_out(config)


@router.put("/reminders", response_model=ReminderSettingsOut)
async def update_reminder_settings(
    payload: ReminderSettingsIn,
    user=Depends(super_admin_only),
    db: AsyncSession = Depends(get_db),
) -> ReminderSettingsOut:
    """Save the reminder schedule. Admin only."""
    config = await SettingService(db).update_reminder_config(payload, user.id)
    return _reminder_out(config)


# ── monthly invoice + statement auto-generation ─────────────
# Replaces the whole-school "Generate" buttons: on the configured day the
# scheduler creates that month's invoices for every approved student, then
# that month's statements. Existing rows are skipped, so a re-run never
# duplicates invoices, statements or parent SMS.

def _auto_generation_out(config: dict) -> AutoGenerationSettingsOut:
    from app.services.setting import next_auto_generation_date

    next_run = next_auto_generation_date(config)
    return AutoGenerationSettingsOut(
        enabled=bool(config.get("enabled", False)),
        day_of_month=int(config.get("day_of_month", 1)),
        notify_parents=bool(config.get("notify_parents", True)),
        last_run_date=config.get("last_run_date") or None,
        next_run_date=next_run.isoformat() if next_run else None,
    )


@router.get("/auto-generation", response_model=AutoGenerationSettingsOut)
async def get_auto_generation_settings(
    _user=Depends(super_admin_only),
    db: AsyncSession = Depends(get_db),
) -> AutoGenerationSettingsOut:
    """Current invoice + statement auto-generation schedule (admin only)."""
    config = await SettingService(db).get_auto_generation_config()
    return _auto_generation_out(config)


@router.put("/auto-generation", response_model=AutoGenerationSettingsOut)
async def update_auto_generation_settings(
    payload: AutoGenerationSettingsIn,
    user=Depends(super_admin_only),
    db: AsyncSession = Depends(get_db),
) -> AutoGenerationSettingsOut:
    """Save the invoice + statement auto-generation schedule. Admin only."""
    config = await SettingService(db).update_auto_generation_config(payload, user.id)
    return _auto_generation_out(config)


# ── student statement auto-generation ────────────────────────
def _statement_generation_out(config: dict) -> StatementGenerationSettingsOut:
    from app.services.setting import next_statement_generation_date

    next_run = next_statement_generation_date(config)
    return StatementGenerationSettingsOut(
        enabled=bool(config.get("enabled", False)),
        day_of_month=int(config.get("day_of_month", 1)),
        notify_parents=bool(config.get("notify_parents", True)),
        last_run_date=config.get("last_run_date") or None,
        next_run_date=next_run.isoformat() if next_run else None,
    )


@router.get("/statement-generation", response_model=StatementGenerationSettingsOut)
async def get_statement_generation_settings(
    _user=Depends(super_admin_only),
    db: AsyncSession = Depends(get_db),
) -> StatementGenerationSettingsOut:
    """Current student statement auto-generation schedule (admin only)."""
    config = await SettingService(db).get_statement_generation_config()
    return _statement_generation_out(config)


@router.put("/statement-generation", response_model=StatementGenerationSettingsOut)
async def update_statement_generation_settings(
    payload: StatementGenerationSettingsIn,
    user=Depends(super_admin_only),
    db: AsyncSession = Depends(get_db),
) -> StatementGenerationSettingsOut:
    """Save the student statement auto-generation schedule. Admin only."""
    config = await SettingService(db).update_statement_generation_config(payload, user.id)
    return _statement_generation_out(config)


class StatementGenerationRunIn(BaseModel):
    """Body for the manual "generate now" action.

    ``notify_parents`` is required so the button always states plainly whether
    this run texts guardians — never a silent default.
    """

    notify_parents: bool


class StatementGenerationRunOut(BaseModel):
    academic_year: int
    month: int
    generated: int
    skipped: int
    failed: int
    notify_parents: bool
    sms_sent: int
    sms_skipped_no_phone: int
    in_app_notified: int
    sms_error: str | None = None
    errors: list[str] = Field(default_factory=list)


@router.post("/statement-generation/run-now", response_model=StatementGenerationRunOut)
async def run_statement_generation_now(
    payload: StatementGenerationRunIn,
    user=Depends(super_admin_only),
    db: AsyncSession = Depends(get_db),
) -> StatementGenerationRunOut:
    """Generate the current month's statements now, optionally notifying parents.

    Runs the same work as the scheduled beat task on demand, ignoring the
    configured day. Generation is accumulative and idempotent (existing rows are
    skipped), and this does **not** touch the schedule's next-run date, so the
    admin can trigger a run any time without disturbing the schedule. Admin only.
    """
    from datetime import date

    from app.services.statement import generate_statements_and_notify

    today = date.today()
    summary = await generate_statements_and_notify(
        db,
        today.year,
        today.month,
        notify_parents=payload.notify_parents,
        actor_id=user.id,
    )
    await db.commit()
    return StatementGenerationRunOut(**summary)


# ── registration fee ─────────────────────────────────────────
# The one-time registration fee charged on student registration. Moved out of
# the per-grade FeeStructure ("Registration" category) so it is configured in
# one place instead of being duplicated per grade/year.

REGISTRATION_FEE_KEY = "registration_fee"


class BaseUrlIn(BaseModel):
    value: str


@router.get("/registration-fee")
async def get_registration_fee_setting(
    _user=Depends(super_admin_only),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    svc = SettingService(db)
    return {"amount": await svc.get_plain(REGISTRATION_FEE_KEY)}


@router.put("/registration-fee")
async def set_registration_fee_setting(
    payload: BaseUrlIn,
    user=Depends(super_admin_only),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    svc = SettingService(db)
    value = payload.value.strip()
    if value:
        from decimal import Decimal, InvalidOperation

        try:
            amount = Decimal(value)
        except InvalidOperation as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Registration fee must be a number",
            ) from exc
        if amount < 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Registration fee cannot be negative",
            )
    await svc.set_plain(REGISTRATION_FEE_KEY, value, user.id)
    await db.commit()
    return {"amount": value}


# ── site / gateway base URLs ─────────────────────────────────
# These pin where PayFast sends the browser back and where the ITN callback
# lives, overriding stale PAYFAST_BASE_URL / FRONTEND_BASE_URL env values.

@router.get("/base-urls")
async def get_base_urls(
    _user=Depends(super_admin_only),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    svc = SettingService(db)
    return {
        "frontend_base_url": await svc.get_plain("frontend_base_url"),
        "payfast_base_url": await svc.get_plain("payfast_base_url"),
    }


@router.put("/base-urls/frontend")
async def set_frontend_base_url(
    payload: BaseUrlIn,
    user=Depends(super_admin_only),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    svc = SettingService(db)
    value = payload.value.strip()
    await svc.set_plain("frontend_base_url", value, user.id)
    await db.commit()
    return {"frontend_base_url": value}


@router.put("/base-urls/payfast")
async def set_payfast_base_url(
    payload: BaseUrlIn,
    user=Depends(super_admin_only),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    svc = SettingService(db)
    await svc.set_plain("payfast_base_url", payload.value, user.id)
    await db.commit()
    return {"payfast_base_url": payload.value.strip()}


# ── test email ────────────────────────────────────────────────
class EmailTestRequest(BaseModel):
    to_email: str = Field(min_length=3, max_length=254)


class EmailTestResponse(BaseModel):
    detail: str


@router.post("/email/test", response_model=EmailTestResponse)
async def send_test_email(
    payload: EmailTestRequest,
    user=Depends(super_admin_only),
    db: AsyncSession = Depends(get_db),
) -> EmailTestResponse:
    """Send the fixed test message to verify the SMTP channel works."""
    try:
        await EmailService(db).send_test_email(payload.to_email)
    except EmailNotConfiguredError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        import logging
        logging.getLogger(__name__).exception("Test email failed")
        raise HTTPException(
            status_code=502,
            detail=f"SMTP error: {type(exc).__name__}: {exc}",
        ) from exc
    return EmailTestResponse(detail="Test email sent")
