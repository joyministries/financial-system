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


class SmsTemplateOut(BaseModel):
    key: str
    name: str
    body: str
    is_active: bool
    updated_at: datetime

    model_config = {"from_attributes": True}


class SmsTemplateUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    body: str = Field(min_length=1, max_length=1600)
    is_active: bool = True


class SmsTemplateRenderRequest(BaseModel):
    """Render a template with the given values without sending.

    Values are the placeholder tokens in the template body, e.g.
    {"parent": "Thabo", "student": "Adam", "amount": "1 200,00"}.
    """

    values: dict[str, str] = Field(default_factory=dict)


class SmsTemplateRenderResponse(BaseModel):
    key: str
    content: str
    missing: list[str]


class SmsStudentSendRequest(BaseModel):
    """Send a templated (or custom) SMS to a single student's parent.

    Use `template_key` to render from a curated template, or pass
    `content` to send a custom message. `content` wins when both are given.
    """

    student_id: str = Field(min_length=1, max_length=36)
    template_key: str | None = Field(default=None, max_length=50)
    content: str | None = Field(default=None, max_length=1600)
