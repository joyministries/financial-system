from decimal import Decimal

from pydantic import BaseModel, Field


class PayFastInitiateCreate(BaseModel):
    """Parent request to start a PayFast payment for one of their children."""

    student_id: str = Field(min_length=1)
    amount: Decimal = Field(gt=0, description="Amount in ZAR (positive)")
    item_name: str = Field(default="School Fees", min_length=1, max_length=100)
    item_description: str = Field(default="School fees payment", max_length=255)


class PayFastInitiateResponse(BaseModel):
    """Data the frontend needs to submit the PayFast form."""

    payment_id: str
    payfast_url: str
    payment_url: str
    form_fields: dict[str, str]
