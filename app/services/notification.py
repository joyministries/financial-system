"""Notification fan-out + queries.

Staff notifications are fanned out to every admin/finance user so the whole
office sees them regardless of who is logged in. `notify_staff` runs inside
the caller's transaction (flush, no commit) — the caller commits as part of
its own operation, keeping notification delivery atomic with the event.
"""
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification
from app.models.user import User

STAFF_ROLES = ("admin", "finance")


class NotificationService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def notify_staff(
        self,
        *,
        title: str,
        message: str,
        category: str = "system",
        entity_type: str | None = None,
        entity_id: str | None = None,
    ) -> list[Notification]:
        """Create one notification per admin/finance user (staff fan-out)."""
        stmt = select(User.id).where(User.role.in_(STAFF_ROLES), User.is_active == True)  # noqa: E712
        result = await self.db.execute(stmt)
        recipient_ids = result.scalars().all()
        if not recipient_ids:
            return []

        notifications = [
            Notification(
                user_id=uid,
                title=title,
                message=message,
                category=category,
                entity_type=entity_type,
                entity_id=entity_id,
            )
            for uid in recipient_ids
        ]
        self.db.add_all(notifications)
        await self.db.flush()
        return notifications

    async def list_for_user(
        self, user_id: str, limit: int = 50, offset: int = 0, unread_only: bool = False
    ) -> tuple[list[Notification], int, int]:
        """Return (notifications, total_for_filter, unread_count)."""
        base = select(Notification).where(Notification.user_id == user_id)
        if unread_only:
            base = base.where(Notification.is_read == False)  # noqa: E712

        count_stmt = select(func.count()).select_from(base.subquery())
        total = (await self.db.execute(count_stmt)).scalar_one()

        stmt = (
            base.order_by(Notification.created_at.desc(), Notification.id.desc())
            .limit(limit)
            .offset(offset)
        )
        rows = (await self.db.execute(stmt)).scalars().all()

        unread = (
            await self.db.execute(
                select(func.count())
                .select_from(Notification)
                .where(Notification.user_id == user_id, Notification.is_read == False)  # noqa: E712
            )
        ).scalar_one()

        return list(rows), total, unread

    async def unread_count(self, user_id: str) -> int:
        result = await self.db.execute(
            select(func.count())
            .select_from(Notification)
            .where(Notification.user_id == user_id, Notification.is_read == False)  # noqa: E712
        )
        return result.scalar_one()

    async def mark_read(self, notification_id: str, user_id: str) -> Notification | None:
        notification = await self.db.get(Notification, notification_id)
        if not notification or notification.user_id != user_id:
            return None
        if not notification.is_read:
            notification.is_read = True
            notification.read_at = datetime.now(UTC)
            await self.db.flush()
        return notification

    async def mark_all_read(self, user_id: str) -> int:
        """Mark every notification for the user read; return the count updated."""
        stmt = select(Notification).where(
            Notification.user_id == user_id, Notification.is_read == False  # noqa: E712
        )
        rows = (await self.db.execute(stmt)).scalars().all()
        now = datetime.now(UTC)
        for row in rows:
            row.is_read = True
            row.read_at = now
        if rows:
            await self.db.flush()
        return len(rows)

    async def purge_viewed(self, seconds: int) -> int:
        """Delete notifications that were viewed (read) more than `seconds` ago.

        Unread notifications are never touched — staff must keep actionable
        items (pending approvals, payments to verify) until they act on them.
        Read rows without a read_at timestamp (created before this feature)
        are treated as old enough to purge. Returns the number of rows deleted.
        """
        cutoff = datetime.now(UTC) - timedelta(seconds=seconds)
        result = await self.db.execute(
            delete(Notification).where(
                Notification.is_read == True,  # noqa: E712
                or_(
                    Notification.read_at.is_(None),
                    Notification.read_at < cutoff,
                ),
            )
        )
        return result.rowcount or 0
