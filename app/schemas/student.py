from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, EmailStr, Field, model_validator

from app.schemas.common import (
    SafeFullNameOptional,
    SafeName,
    SafeNameOptional,
)


class GuardianCreate(BaseModel):
    """Parent/guardian contact info collected on the student form.

    guardian_id is a free-text ID supplied by the school (e.g. national ID,
    staff badge, etc.) — it is NOT the portal user id.

    Provide either full_name OR first_name + last_name.
    """

    first_name: SafeNameOptional = None
    last_name: SafeNameOptional = None
    full_name: SafeFullNameOptional = None
    guardian_id: str | None = Field(default=None, max_length=100)
    phone: str | None = Field(default=None, max_length=50)
    email: EmailStr | None = None
    physical_address: str | None = Field(default=None, max_length=255)
    po_box: str | None = Field(default=None, max_length=100)

    @model_validator(mode="after")
    def _require_name(self) -> "GuardianCreate":
        if not (self.full_name or (self.first_name and self.last_name)):
            raise ValueError("Provide full_name or first_name + last_name")
        return self

    @property
    def display_name(self) -> str:
        if self.full_name:
            return self.full_name
        return f"{self.first_name} {self.last_name}".strip()


class GuardianResponse(BaseModel):
    id: str
    student_id: str
    guardian_type: str
    first_name: str | None
    last_name: str | None
    full_name: str
    guardian_id: str | None
    phone: str | None
    email: str | None
    physical_address: str | None
    po_box: str | None

    model_config = {"from_attributes": True}


class StudentCreate(BaseModel):
    student_number: str = Field(min_length=1, max_length=50)
    first_name: SafeName
    last_name: SafeName
    grade_id: str
    enrollment_date: datetime
    # Two parents: primary is compulsory, secondary is optional.
    parent_1: GuardianCreate
    parent_2: GuardianCreate | None = None


class ChildRegisterCreate(BaseModel):
    """Parent-facing child registration. The student number is generated
    automatically and the primary guardian is the logged-in parent.

    The registering parent's guardian details for THIS child are optional
    (phone / address / relationship); when omitted the parent's account
    details are used. The other parent's details are optional too.
    """

    first_name: SafeName
    last_name: SafeName
    grade_id: str
    # Registering parent's guardian details for this child (optional).
    # Name always comes from the parent's account; the rest is editable
    # by the person registering. email overrides the account email on the
    # guardian record when supplied.
    relationship: str | None = Field(default=None, pattern="^(father|mother)$")
    guardian_id: str | None = Field(default=None, max_length=100)
    phone: str | None = Field(default=None, max_length=50)
    email: EmailStr | None = None
    physical_address: str | None = Field(default=None, max_length=255)
    po_box: str | None = Field(default=None, max_length=100)
    # Other parent's details (optional).
    other_parent: GuardianCreate | None = None


class GuardianUpdate(BaseModel):
    """Parent-editable guardian contact details (settings)."""

    first_name: SafeNameOptional = None
    last_name: SafeNameOptional = None
    full_name: SafeFullNameOptional = None
    guardian_id: str | None = Field(default=None, max_length=100)
    phone: str | None = Field(default=None, max_length=50)
    email: EmailStr | None = None
    physical_address: str | None = Field(default=None, max_length=255)
    po_box: str | None = Field(default=None, max_length=100)


class StudentUpdate(BaseModel):
    first_name: SafeNameOptional = None
    last_name: SafeNameOptional = None
    grade_id: str | None = None
    is_active: bool | None = None
    payment_preference: str | None = Field(default=None, pattern="^(monthly|cumulative)$")


class PaymentPreferenceUpdate(BaseModel):
    """Parent-chosen payment style for a child's fees."""

    payment_preference: str = Field(pattern="^(monthly|cumulative)$")


class StudentResponse(BaseModel):
    id: str
    student_number: str
    first_name: str
    last_name: str
    grade_id: str
    parent_id: str | None
    enrollment_date: datetime
    is_active: bool
    registration_status: str = "approved"
    payment_preference: str = "monthly"
    created_at: datetime
    guardians: list[GuardianResponse] = []

    model_config = {"from_attributes": True}


class MonthlyScheduleResponse(BaseModel):
    id: str
    fee_structure_id: str
    month: int
    academic_year: int
    amount_due: Decimal
    due_date: datetime
    is_paid: bool

    model_config = {"from_attributes": True}


class OutstandingBalanceResponse(BaseModel):
    id: str
    student_id: str
    monthly_schedule_id: str
    original_amount: Decimal
    rollover_amount: Decimal
    amount_paid: Decimal
    balance: Decimal
    status: str

    model_config = {"from_attributes": True}
