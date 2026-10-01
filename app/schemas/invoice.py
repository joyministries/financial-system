from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field, field_validator


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

    @field_validator("items", mode="before")
    @classmethod
    def _default_null_items(cls, value: Any) -> Any:
        """Treat a NULL ``items`` column as an empty line-item list.

        Invoices imported by ``scripts/import_real_data.py`` were inserted with
        raw SQL that omitted the ``items`` column, so those rows hold NULL and
        used to fail validation here — turning every ``GET /invoices/`` page
        containing a legacy invoice into an HTTP 500.
        """
        return [] if value is None else value


class InvoiceGenerateRequest(BaseModel):
    student_id: str
    academic_year: int = Field(ge=2000, le=2100)
    month: int = Field(ge=1, le=12)


class InvoiceStatusUpdate(BaseModel):
    status: str = Field(pattern="^(paid|void)$")
