from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class CreditNoteCreate(BaseModel):
    """Payload to issue a new credit note against a student's fee account."""

    student_id: str
    credit_type: str = Field(default="adjustment", min_length=1, max_length=50)
    description: str = Field(min_length=1, max_length=255)
    amount: Decimal = Field(gt=0)
    auto_apply: bool = True


class CreditNoteVoid(BaseModel):
    """Payload to void an un-applied credit note."""

    reason: str = Field(min_length=1, max_length=255)


class CreditNoteResponse(BaseModel):
    id: str
    credit_number: str
    student_id: str
    credit_type: str
    description: str
    amount: Decimal
    status: str
    remaining_amount: Decimal
    issued_by: str
    voided_by: str | None
    void_reason: str | None
    voided_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}