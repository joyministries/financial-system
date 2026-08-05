from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class ReceiptResponse(BaseModel):
    id: str
    receipt_number: str
    payment_id: str
    student_id: str
    amount: Decimal
    payment_method: str
    allocated_by: str
    created_at: datetime

    model_config = {"from_attributes": True}


class StatementResponse(BaseModel):
    id: str
    student_id: str
    academic_year: int
    month: int
    opening_balance: Decimal
    total_fees: Decimal
    total_installments: Decimal
    total_additional_charges: Decimal
    total_payments: Decimal
    closing_balance: Decimal
    current_amount_due: Decimal
    due_date: datetime
    generated_at: datetime

    model_config = {"from_attributes": True}


class StatementGenerateRequest(BaseModel):
    student_id: str
    academic_year: int = Field(ge=2000, le=2100)
    month: int = Field(ge=1, le=12)


class ReportFilter(BaseModel):
    start_date: datetime | None = None
    end_date: datetime | None = None
    grade_id: str | None = None
    student_id: str | None = None
    payment_method: str | None = None
    academic_year: int | None = Field(default=None, ge=2000, le=2100)


class MonthSummary(BaseModel):
    month: int
    amount_required: Decimal
    amount_paid: Decimal
    outstanding: Decimal
    status: str  # paid | partial | pending | none


class StudentSummaryResponse(BaseModel):
    student_id: str
    academic_year: int
    total_required: Decimal
    total_paid: Decimal
    total_outstanding: Decimal
    months: list[MonthSummary]
