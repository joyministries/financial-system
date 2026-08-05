import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_role, verify_student_access
from app.models.user import User
from app.schemas.document import StudentDocumentResponse
from app.services.audit import AuditService
from app.services.document import DocumentService

router = APIRouter(prefix="/documents", tags=["Documents"])


def _require_valid_student_id(student_id: str) -> str:
    """Reject malformed student_id before any path/DB work happens."""
    try:
        uuid.UUID(student_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Student not found")
    return student_id


async def _ensure_doc_access(document, user: User, db: AsyncSession) -> None:
    """Parents may only access documents attached to their own children."""
    if user.role == "parent":
        await verify_student_access(document.student_id, user, db)


@router.get("/{student_id}", response_model=list[StudentDocumentResponse])
async def list_documents(
    student_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Application documents attached to a student (birth certificate,
    transcripts, etc.). Parents see only their own children's documents."""
    _require_valid_student_id(student_id)
    if user.role == "parent":
        await verify_student_access(student_id, user, db)
    service = DocumentService(db)
    return await service.list_for_student(student_id)


@router.post("/{student_id}", response_model=StudentDocumentResponse, status_code=201)
async def upload_document(
    student_id: str,
    doc_type: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Upload one application document (PDF/PNG/JPG, max 10 MB)."""
    _require_valid_student_id(student_id)
    if user.role == "parent":
        await verify_student_access(student_id, user, db)
    service = DocumentService(db)
    document = await service.upload(student_id, doc_type, file, uploaded_by=user)
    audit = AuditService(db)
    await audit.log(
        "student_document", document.id, "upload", user.id,
        new_values={
            "student_id": student_id,
            "document_type": doc_type,
            "filename": document.original_filename,
        },
    )
    return document


@router.get("/{student_id}/files/{document_id}")
async def download_document(
    student_id: str,
    document_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Download the stored file for a document."""
    _require_valid_student_id(student_id)
    service = DocumentService(db)
    document = await service.get_or_raise(document_id)
    if document.student_id != student_id:
        raise HTTPException(status_code=404, detail="Document not found")
    await _ensure_doc_access(document, user, db)
    path = service.resolve_path(document)
    return FileResponse(
        path,
        media_type=document.content_type or "application/octet-stream",
        filename=document.original_filename,
        headers={"X-Content-Type-Options": "nosniff"},
    )


@router.delete("/{student_id}/files/{document_id}")
async def delete_document(
    student_id: str,
    document_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance")),
):
    """Remove a document (file + record). Admin/finance only."""
    service = DocumentService(db)
    document = await service.get_or_raise(document_id)
    if document.student_id != student_id:
        raise HTTPException(status_code=404, detail="Document not found")
    deleted = await service.delete(document_id)
    audit = AuditService(db)
    await audit.log(
        "student_document", document_id, "delete", user.id,
        new_values={"student_id": student_id},
    )
    return {"detail": f"Deleted {deleted.original_filename}"}
