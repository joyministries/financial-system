from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.common import PageResponse


def _normalize_email(value: str) -> str:
    """Trim whitespace and lowercase so lookups never miss on case/space."""
    return value.strip().lower()


class DataDeletionRequestCreate(BaseModel):
    """Public form payload — any data subject can request erasure.

    Only the email identifying the account and an optional reason are
    accepted. The endpoint never returns whether an account was found (that
    would leak which emails exist), so the response is always the same
    generic acknowledgement.
    """

    email: EmailStr
    reason: str | None = Field(default=None, max_length=2000)

    @field_validator("email")
    @classmethod
    def _email_norm(cls, v: str) -> str:
        return _normalize_email(v)


class DataDeletionRequestResponse(BaseModel):
    id: str
    user_id: str
    email: str
    user_full_name: str | None = None
    reason: str | None = None
    status: str
    decided_by: str | None = None
    decided_at: str | None = None
    rejection_reason: str | None = None
    created_at: str

    model_config = {"from_attributes": True}


class DataDeletionRequestListResponse(PageResponse[DataDeletionRequestResponse]):
    """Pagination envelope for the admin deletion queue."""


class RejectionReason(BaseModel):
    reason: str = Field(min_length=1, max_length=500)


class DataDeletionRequestAcknowledgement(BaseModel):
    detail: str