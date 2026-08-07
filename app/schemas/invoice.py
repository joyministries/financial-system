from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class InvoiceItem(BaseModel):
    type: str  # fee | charge | opening
    description: str
    amount: Decimal


class InvoiceResponse(BaseModel):
    id: str
    invoice_number: str
    student_id: str
    academic_year: int
    month: int
    issue_date: datetime
    due_date: datetime
    subtotal: Decimal
    amount_paid: Decimal
    balance_due: Decimal
    status: str
    items: list[InvoiceItem]
    created_by: str
    created_at: datetime

    model_config = {"from_attributes": True}


class InvoiceGenerateRequest(BaseModel):
    student_id: str
    academic_year: int = Field(ge=2000, le=2100)
    month: int = Field(ge=1, le=12)


class InvoiceStatusUpdate(BaseModel):
    status: str = Field(pattern="^(paid|void)$")
