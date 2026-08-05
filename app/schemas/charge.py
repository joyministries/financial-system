from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class AdditionalChargeCreate(BaseModel):
    student_id: str
    charge_type: str = Field(min_length=1, max_length=50)
    description: str = Field(min_length=1, max_length=255)
    amount: Decimal = Field(gt=0)
    academic_year: int = Field(ge=2000, le=2100)
    month: int = Field(ge=1, le=12)


class GradeChargeCreate(BaseModel):
    """Grade-level charge applied to every student in the grade.

    Students can opt out by passing their student id in exclude_student_ids —
    their charge row is never created.
    """

    grade_id: str
    charge_type: str = Field(min_length=1, max_length=50)
    description: str = Field(min_length=1, max_length=255)
    amount: Decimal = Field(gt=0)
    academic_year: int = Field(ge=2000, le=2100)
    month: int = Field(ge=1, le=12)
    exclude_student_ids: list[str] = []


class AdditionalChargeResponse(BaseModel):
    id: str
    student_id: str
    grade_id: str | None
    charge_type: str
    description: str
    amount: Decimal
    academic_year: int
    month: int
    is_paid: bool
    created_at: datetime

    model_config = {"from_attributes": True}
