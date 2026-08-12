import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class SmsTemplate(Base):
    """Editable SMS message templates.

    Each template has a stable `key` (the code path that uses it) and a
    `body` with `{placeholder}` tokens that are substituted at send time
    (e.g. `{parent}`, `{student}`, `{amount}`, `{balance}`, `{link}`).
    Admins curate these from Settings -> SMS -> Message Templates; the
    built-in defaults in `app/services/sms.py` are the fallback when a
    template row does not exist.
    """

    __tablename__ = "sms_templates"

    key: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )


class SmsMessage(Base):
    """Audit log of every SMS the system attempts to send.

    A row is created BEFORE the provider call (status `queued`) and updated to
    `sent` / `failed` once the provider responds. `delivered` is reserved for
    delivery-receipt webhooks. The provider's message id and per-send cost are
    kept for reconciliation.
    """

    __tablename__ = "sms_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    student_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("students.id"), index=True
    )
    to_phone: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    template: Mapped[str] = mapped_column(String(50), default="manual")
    status: Mapped[str] = mapped_column(String(20), default="queued", index=True)
    provider: Mapped[str] = mapped_column(String(50), default="smsportal")
    provider_message_id: Mapped[str | None] = mapped_column(String(100))
    provider_status: Mapped[str | None] = mapped_column(String(100))
    cost: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    error: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    student: Mapped["Student | None"] = relationship()


from app.models.grade import Student  # noqa: E402, F401
from app.models.user import User  # noqa: E402, F401