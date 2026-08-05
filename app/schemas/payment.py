from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class PaymentCreate(BaseModel):
    student_id: str
    amount: Decimal = Field(gt=0, description="Must be positive")
    payment_method: str = Field(min_length=1)
    payment_date: datetime
    reference_number: str | None = None
    notes: str | None = None


class PaymentAllocationCreate(BaseModel):
    payment_id: str
    outstanding_balance_id: str | None = None
    additional_charge_id: str | None = None
    amount_allocated: Decimal = Field(gt=0)


class PaymentResponse(BaseModel):
    id: str
    student_id: str
    amount: Decimal
    payment_method: str
    payment_date: datetime
    reference_number: str | None
    status: str
    allocated_by: str | None
    notes: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class PaymentAllocationResponse(BaseModel):
    id: str
    payment_id: str
    outstanding_balance_id: str | None
    additional_charge_id: str | None
    amount_allocated: Decimal

    model_config = {"from_attributes": True}


class PaymentReversalCreate(BaseModel):
    payment_id: str
    reason: str = Field(min_length=1)


class ProofOfPaymentUpload(BaseModel):
    payment_id: str
    proof_url: str = Field(min_length=1)


class PaymentVerification(BaseModel):
    payment_id: str
    action: str = Field(pattern="^(approve|reject)$")
