import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Notification(Base):
    """In-app notification delivered to staff (admin/finance) users.

    Created for events the office should act on or at least be aware of:
    a PayFast payment received, a parent self-registration, a pending
    student application, or a payment reversal.
    """

    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    # Recipient. Staff notifications are fanned out to every admin/finance user.
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    # Machine-readable category: payment_received | parent_registered |
    # student_applied | payment_reversed | system
    category: Mapped[str] = mapped_column(String(50), nullable=False, default="system")
    # Optional link target so the frontend can deep-link (e.g. a student id).
    entity_type: Mapped[str | None] = mapped_column(String(50))
    entity_id: Mapped[str | None] = mapped_column(String(36))
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # When the recipient opened it; used to auto-delete viewed notifications
    # shortly after they are read (see NotificationService.purge_viewed).
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )

    user: Mapped["User"] = relationship()

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<Notification {self.category} to={self.user_id} read={self.is_read}>"


from app.models.user import User  # noqa: E402, F401
