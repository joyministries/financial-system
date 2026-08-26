from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class GradeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str | None = None


class GradeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = None


class GradeResponse(BaseModel):
    id: str
    name: str
    description: str | None
    is_active: bool
    is_archived: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class FeeStructureCreate(BaseModel):
    grade_id: str
    academic_year: int = Field(ge=2000, le=2100)
    category: str = Field(min_length=1, max_length=50)
    annual_amount: Decimal = Field(gt=0)
    payment_plan: str = Field(default="monthly", pattern="^(monthly|yearly)$")
    monthly_installment: Decimal | None = Field(default=None, gt=0)


class FeeStructureUpdate(BaseModel):
    category: str | None = Field(default=None, min_length=1, max_length=50)
    annual_amount: Decimal | None = Field(default=None, gt=0)
    payment_plan: str | None = Field(default=None, pattern="^(monthly|yearly)$")
    monthly_installment: Decimal | None = Field(default=None, gt=0)


class FeeStructureResponse(BaseModel):
    id: str
    grade_id: str
    academic_year: int
    category: str
    annual_amount: Decimal
    payment_plan: str
    monthly_installment: Decimal | None
    is_active: bool

    model_config = {"from_attributes": True}


# ── Per-student fee overrides (discounts) ────────────────────────────


class StudentFeeOverrideCreate(BaseModel):
    """Set a fee override for a specific student on a fee structure."""
    student_id: str
    fee_structure_id: str
    annual_amount: Decimal = Field(ge=0, description="Discounted amount or percent")
    discount_type: str = Field(default="override", pattern="^(override|percent)$")
    reason: str | None = Field(default=None, max_length=255)


class StudentFeeOverrideUpdate(BaseModel):
    annual_amount: Decimal | None = Field(default=None, ge=0)
    discount_type: str | None = Field(default=None, pattern="^(override|percent)$")
    reason: str | None = Field(default=None, max_length=255)
    is_active: bool | None = None


class BulkFeeOverrideCreate(BaseModel):
    """Apply the same discount to multiple students at once."""
    student_ids: list[str] = Field(min_length=1, max_length=100)
    fee_structure_id: str
    annual_amount: Decimal = Field(ge=0, description="Discounted amount or percent")
    discount_type: str = Field(default="override", pattern="^(override|percent)$")
    reason: str | None = Field(default=None, max_length=255)


class StudentFeeOverrideResponse(BaseModel):
    id: str
    student_id: str
    fee_structure_id: str
    annual_amount: Decimal
    discount_type: str
    reason: str | None
    created_by: str | None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
