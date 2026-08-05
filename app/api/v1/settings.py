from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_role
from app.schemas.setting import (
    EmailSettingsIn,
    EmailSettingsOut,
    NotificationSettingsOut,
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
