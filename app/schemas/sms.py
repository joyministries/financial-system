from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class SmsSendRequest(BaseModel):
    """Manual one-off SMS (e.g. to a parent whose number isn't on a student)."""

    to_phone: str = Field(min_length=7, max_length=20)
    content: str = Field(min_length=1, max_length=1600)
    student_id: str | None = None


class SmsReminderRequest(BaseModel):
    """Send balance reminders to every active student currently owing."""

    academic_year: int = Field(ge=2000, le=2100)
    month: int = Field(ge=1, le=12)


class SmsTestRequest(BaseModel):
    """Send a fixed test message to verify the provider channel end-to-end."""

    to_phone: str = Field(min_length=7, max_length=20)


class SmsMessageOut(BaseModel):
    id: str
    student_id: str | None
    to_phone: str
    content: str
    template: str
    status: str
    provider: str
    provider_message_id: str | None
    provider_status: str | None
    cost: Decimal | None
    error: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class SmsSendResponse(BaseModel):
    id: str
    status: str
    to_phone: str
    detail: str


class SmsReminderResponse(BaseModel):
    sent: int
    skipped_no_phone: int
    skipped_failed: int
    errors: list[str]
