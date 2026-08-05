import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class StudentDocument(Base):
    """A file attached to a student application (birth certificate, transcript,
    report card, ID document, etc.).

    Files are stored on disk under the configured uploads directory; the DB
    row keeps the original name for display and the safe stored name.
    """

    __tablename__ = "student_documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    student_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("students.id"), nullable=False, index=True
    )
    document_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="other"
    )  # birth_certificate | transcript | report_card | id_document | other
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_filename: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    content_type: Mapped[str | None] = mapped_column(String(100))
    file_size: Mapped[int] = mapped_column(Integer, default=0)
    uploaded_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )

    student: Mapped["Student"] = relationship(back_populates="documents")


from app.models.grade import Student  # noqa: E402, F401
