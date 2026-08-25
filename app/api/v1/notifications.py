from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.deps import require_role
from app.models.user import User
from app.schemas.common import build_page_response
from app.schemas.notification import (
    BroadcastNotificationCreate,
    BroadcastNotificationResponse,
    NotificationListResponse,
    NotificationResponse,
    UnreadCountResponse,
)
from app.services.notification import NotificationService

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("/", response_model=NotificationListResponse)
async def list_notifications(
    unread_only: bool = False,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance", "parent")),
):
    service = NotificationService(db)
    if user.role in ("admin", "finance"):
        # Self-clean: drop notifications that were viewed more than a few seconds
        # ago so the bell reflects deletions immediately without waiting for cron.
        await service.purge_viewed(get_settings().READ_NOTIFICATION_RETENTION_SECONDS)
        await db.commit()
    items, total, unread = await service.list_for_user(
        user.id, limit=limit, offset=offset, unread_only=unread_only
    )
    page = build_page_response(
        [NotificationResponse.model_validate(n) for n in items], total, limit, offset
    )
    return NotificationListResponse(
        items=page.items,
        total=page.total,
        unread=unread,
        page=page.page,
        page_size=page.page_size,
        total_pages=page.total_pages,
        has_next_page=page.has_next_page,
        has_previous_page=page.has_previous_page,
    )


@router.get("/unread-count", response_model=UnreadCountResponse)
async def unread_count(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance", "parent")),
):
    service = NotificationService(db)
    return UnreadCountResponse(count=await service.unread_count(user.id))


@router.post("/{notification_id}/read", response_model=NotificationResponse)
async def mark_read(
    notification_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance", "parent")),
):
    service = NotificationService(db)
    notification = await service.mark_read(notification_id, user.id)
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    return notification


@router.post("/read-all", response_model=UnreadCountResponse)
async def mark_all_read(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance", "parent")),
):
    service = NotificationService(db)
    updated = await service.mark_all_read(user.id)
    return UnreadCountResponse(count=updated)


@router.post("/broadcast", response_model=BroadcastNotificationResponse)
async def broadcast_notification(
    data: BroadcastNotificationCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "super_admin")),
):
    """Admin sends a notification to ALL parents — creates an in-app
    notification for each parent and fires a push notification to
    every device that registered a push token."""
    service = NotificationService(db)

    # 1. In-app: fan-out one notification per parent user.
    in_app_count = await service.notify_parents(
        title=data.title,
        message=data.message,
        category="system",
    )

    # 2. Push: send to every parent with a push token.
    from app.services.push import send_push_to_role

    push_sent = await send_push_to_role(
        db, "parent", data.title, data.message,
    )

    await db.commit()
    return BroadcastNotificationResponse(
        in_app_count=in_app_count,
        push_sent=push_sent,
        push_failed=0,
    )
