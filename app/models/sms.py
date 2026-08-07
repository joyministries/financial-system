import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class SmsMessage(Base):
    """Audit log of every SMS the system attempts to send.

    A row is created BEFORE the provider call (status `queued`) and updated to
    `sent` / `failed` once the provider responds. `delivered` is reserved for
    delivery-receipt webhooks. The provider's message id and per-send cost are
    kept for reconciliation.
    """

    __tablename__ = "sms_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    student_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("students.id"))
    to_phone: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    template: Mapped[str] = mapped_column(String(50), default="manual")
    status: Mapped[str] = mapped_column(String(20), default="queued")
    provider: Mapped[str] = mapped_column(String(50), default="smsportal")
    provider_message_id: Mapped[str | None] = mapped_column(String(100))
    provider_status: Mapped[str | None] = mapped_column(String(100))
    cost: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    error: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    student: Mapped["Student | None"] = relationship()


from app.models.grade import Student  # noqa: E402, F401
from app.models.user import User  # noqa: E402, F401
