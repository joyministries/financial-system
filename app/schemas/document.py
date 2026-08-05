from datetime import datetime

from pydantic import BaseModel


class StudentDocumentResponse(BaseModel):
    id: str
    student_id: str
    document_type: str
    original_filename: str
    content_type: str | None
    file_size: int
    created_at: datetime

    model_config = {"from_attributes": True}
