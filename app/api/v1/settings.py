from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_role
from app.schemas.setting import (
    EmailSettingsIn,
    EmailSettingsOut,
    NotificationSettingsOut,
    ReminderSettingsIn,
    ReminderSettingsOut,
    SmsSettingsIn,
    SmsSettingsOut,
)
from app.services.setting import SettingService

router = APIRouter(prefix="/settings", tags=["settings"])

admin_only = require_role("admin")


@router.get("/notifications", response_model=NotificationSettingsOut)
async def get_notification_settings(
    _user=Depends(admin_only),
    db: AsyncSession = Depends(get_db),
) -> NotificationSettingsOut:
    """Current email/SMS channel configuration (secrets masked). Admin only."""
    return await SettingService(db).get_public()


@router.put("/notifications/email", response_model=EmailSettingsOut)
async def update_email_settings(
    payload: EmailSettingsIn,
    user=Depends(admin_only),
    db: AsyncSession = Depends(get_db),
) -> EmailSettingsOut:
    """Save SMTP configuration. Blank/`********` password keeps the stored one."""
    return await SettingService(db).update_email(payload, user.id)


@router.put("/notifications/sms", response_model=SmsSettingsOut)
async def update_sms_settings(
    payload: SmsSettingsIn,
    user=Depends(admin_only),
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
    _user=Depends(admin_only),
    db: AsyncSession = Depends(get_db),
) -> ReminderSettingsOut:
    """Current automated payment-link reminder schedule (admin only)."""
    config = await SettingService(db).get_reminder_config()
    return _reminder_out(config)


@router.put("/reminders", response_model=ReminderSettingsOut)
async def update_reminder_settings(
    payload: ReminderSettingsIn,
    user=Depends(admin_only),
    db: AsyncSession = Depends(get_db),
) -> ReminderSettingsOut:
    """Save the reminder schedule. Admin only."""
    config = await SettingService(db).update_reminder_config(payload, user.id)
    return _reminder_out(config)


# ── site / gateway base URLs ─────────────────────────────────
# These pin where PayFast sends the browser back and where the ITN callback
# lives, overriding stale PAYFAST_BASE_URL / FRONTEND_BASE_URL env values.

class BaseUrlIn(BaseModel):
    value: str


@router.get("/base-urls")
async def get_base_urls(
    _user=Depends(admin_only),
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
    user=Depends(admin_only),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    svc = SettingService(db)
    await svc.set_plain("frontend_base_url", payload.value, user.id)
    await db.commit()
    return {"frontend_base_url": payload.value.strip()}


@router.put("/base-urls/payfast")
async def set_payfast_base_url(
    payload: BaseUrlIn,
    user=Depends(admin_only),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    svc = SettingService(db)
    await svc.set_plain("payfast_base_url", payload.value, user.id)
    await db.commit()
    return {"payfast_base_url": payload.value.strip()}
