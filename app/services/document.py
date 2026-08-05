import secrets
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.exceptions import NotFoundError, ValidationError
from app.models.document import StudentDocument
from app.models.user import User

ALLOWED_DOCUMENT_TYPES = {
    "birth_certificate",
    "transcript",
    "report_card",
    "id_document",
    "other",
}
ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png"}
# Rough content-type allowlist (some browsers send application/octet-stream).
ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "application/octet-stream",
}
# Magic-byte signatures per allowed extension. The extension is only
# accepted when the file content actually starts with the matching bytes —
# a renamed executable (or HTML polyglot) is rejected regardless of the
# extension or content-type header the client claims.
MAGIC_BYTES = {
    ".pdf": b"%PDF",
    ".jpg": b"\xff\xd8\xff",
    ".jpeg": b"\xff\xd8\xff",
    ".png": b"\x89PNG\r\n\x1a\n",
}


class DocumentService:
    """Stores application documents on local disk and keeps a DB row per file.

    Files are saved under <UPLOAD_DIR>/<student_id>/ with a random stored name;
    the original name is preserved only in the database for safe display.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.settings = get_settings()
        self.storage_root = Path(self.settings.UPLOAD_DIR)

    def _validate_upload(
        self, doc_type: str, filename: str, content_type: str | None, content: bytes
    ) -> None:
        if doc_type not in ALLOWED_DOCUMENT_TYPES:
            raise ValidationError(
                f"Unsupported document type '{doc_type}'. Allowed: {sorted(ALLOWED_DOCUMENT_TYPES)}"
            )
        ext = Path(filename or "").suffix.lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise ValidationError(
                f"Unsupported file extension '{ext}'. Allowed: {sorted(ALLOWED_EXTENSIONS)}"
            )
        if content_type not in ALLOWED_CONTENT_TYPES:
            raise ValidationError(f"Unsupported content type '{content_type}'")
        max_bytes = self.settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
        if len(content) > max_bytes:
            raise ValidationError(
                f"File exceeds the {self.settings.MAX_UPLOAD_SIZE_MB} MB upload limit"
            )
        magic = MAGIC_BYTES[ext]
        if not content[: len(magic)] == magic:
            raise ValidationError(
                f"File content does not match a valid {ext.lstrip('.')} file"
            )

    async def upload(
        self,
        student_id: str,
        doc_type: str,
        file: UploadFile,
        uploaded_by: User | None = None,
    ) -> StudentDocument:
        content = await file.read()
        self._validate_upload(doc_type, file.filename or "", file.content_type, content)

        student_dir = self.storage_root / student_id
        student_dir.mkdir(parents=True, exist_ok=True)
        ext = Path(file.filename).suffix.lower()
        stored_name = f"{secrets.token_hex(8)}{ext}"
        (student_dir / stored_name).write_bytes(content)

        document = StudentDocument(
            student_id=student_id,
            document_type=doc_type,
            original_filename=file.filename or stored_name,
            stored_filename=stored_name,
            content_type=file.content_type,
            file_size=len(content),
            uploaded_by=uploaded_by.id if uploaded_by else None,
        )
        self.db.add(document)
        await self.db.flush()
        return document

    async def get(self, document_id: str) -> StudentDocument | None:
        return await self.db.get(StudentDocument, document_id)

    async def get_or_raise(self, document_id: str) -> StudentDocument:
        document = await self.get(document_id)
        if not document:
            raise NotFoundError("Document", document_id)
        return document

    async def list_for_student(self, student_id: str) -> list[StudentDocument]:
        from sqlalchemy import select

        stmt = (
            select(StudentDocument)
            .where(StudentDocument.student_id == student_id)
            .order_by(StudentDocument.created_at.desc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    def resolve_path(self, document: StudentDocument) -> Path:
        """Absolute path of the stored file. Missing file => NotFound."""
        path = self.storage_root / document.student_id / document.stored_filename
        if not path.is_file():
            raise NotFoundError("Document file")
        return path

    async def delete(self, document_id: str) -> StudentDocument | None:
        document = await self.get(document_id)
        if not document:
            return None
        path = self.storage_root / document.student_id / document.stored_filename
        if path.is_file():
            path.unlink(missing_ok=True)
        await self.db.delete(document)
        await self.db.flush()
        return document
