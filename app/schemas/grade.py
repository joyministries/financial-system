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
