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
    #: Prior-year carry-in (same value on every month of the year). It sits in
    #: the balance, so "Amount Due for Month" (month's fee + balance) includes
    #: it rather than subtracting it.
    brought_forward: Decimal = Decimal("0")
    due_date: datetime
    generated_at: datetime
    #: Grade's monthly tuition instalment. ``total_installments`` is 0 for
    #: months billed by January's annual invoice; clients use this to show the
    #: fee that actually falls due (it never moves the balance).
    grade_monthly_fee: Decimal = Decimal("0")

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


class MonthlyOwingStudent(BaseModel):
    student_id: str
    student_number: str
    name: str
    grade: str | None = None
    balance: Decimal


class MonthlySummaryResponse(BaseModel):
    academic_year: int
    month: int
    total_income: Decimal
    payment_count: int
    outstanding_total: Decimal
    students_owing: int
    students_owing_list: list[MonthlyOwingStudent]


class NextDueDateResponse(BaseModel):
    student_id: str
    student_name: str
    next_due_date: datetime | None
    next_month: int | None
    next_amount_due: Decimal
    next_description: str
    total_outstanding: Decimal
