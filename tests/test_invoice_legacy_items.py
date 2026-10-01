"""Regression tests for legacy invoices whose ``items`` column is NULL.

``scripts/import_real_data.py`` inserts invoice rows with raw SQL that omits
the ``items`` column, so those rows land with ``items IS NULL``. FastAPI then
serialises them through ``InvoiceResponse``, whose ``items`` field was a
non-optional ``list[InvoiceItem]``, raising a Pydantic ValidationError. That
turned every ``GET /invoices/`` page containing a legacy invoice into an HTTP
500 (in production: 184 of 447 invoices, breaking the admin list at ~page 5).
"""

from datetime import UTC, datetime
from decimal import Decimal
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.schemas.invoice import InvoiceResponse


def _invoice(**overrides):
    base = {
        "id": "0d6a1f6e-2f5a-4c0e-9c2a-9a6d1b7f4e01",
        "invoice_number": "INV0010436",
        "student_id": "1b2c3d4e-5f60-4718-8293-a4b5c6d7e8f9",
        "academic_year": 2026,
        "month": 1,
        "issue_date": datetime(2026, 1, 8, tzinfo=UTC),
        "due_date": datetime(2026, 1, 31, tzinfo=UTC),
        "subtotal": Decimal("38860.00"),
        "amount_paid": Decimal("0.00"),
        "balance_due": Decimal("38860.00"),
        "status": "issued",
        "items": None,  # the legacy imported rows
        "created_by": "2c3d4e5f-6071-4829-93a4-b5c6d7e8f901",
        "created_at": datetime(2026, 1, 8, tzinfo=UTC),
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def test_legacy_invoice_with_null_items_serialises():
    """A NULL items column must serialise as an empty list, not raise."""
    response = InvoiceResponse.model_validate(_invoice())
    assert response.items == []


def test_legacy_invoice_keeps_its_financial_fields():
    """Coercing items must not disturb the money fields."""
    response = InvoiceResponse.model_validate(_invoice())
    assert response.invoice_number == "INV0010436"
    assert response.subtotal == Decimal("38860.00")
    assert response.balance_due == Decimal("38860.00")
    assert response.month == 1
    assert response.academic_year == 2026


def test_current_invoice_items_are_unchanged():
    """New-format invoices keep their items verbatim."""
    items = [
        {"type": "opening", "description": "Opening balance (carried forward)", "amount": "0"},
        {"type": "fee", "description": "Tuition — monthly installment", "amount": "1940.00"},
    ]
    response = InvoiceResponse.model_validate(_invoice(items=items))
    assert len(response.items) == 2
    assert response.items[0].type == "opening"
    assert response.items[1].amount == Decimal("1940.00")


def test_null_items_on_every_page_shape():
    """The failure was per-row, so any page containing one legacy row 500'd."""
    page = [_invoice(items=None), _invoice(id="x", invoice_number="INV0010437", items=[])]
    for row in page:
        assert InvoiceResponse.model_validate(row).items is not None


def test_list_endpoint_returns_200_not_500_for_legacy_rows():
    """End-to-end: a list route returning legacy rows must not raise a 500.

    This is the shape that broke ``GET /invoices/`` in production — FastAPI
    validates the response against ``InvoiceResponse``, so one NULL ``items``
    row turned the whole page into an HTTP 500.
    """
    app = FastAPI()

    @app.get("/invoices/", response_model=list[InvoiceResponse])
    async def list_invoices():
        return [
            _invoice(items=None),
            _invoice(
                id="b",
                invoice_number="INV-2026-10-FAFB",
                items=[
                    {"type": "opening", "description": "Opening balance", "amount": "0"},
                    {"type": "fee", "description": "Tuition", "amount": "1940.00"},
                ],
            ),
        ]

    response = TestClient(app).get("/invoices/")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 2
    assert body[0]["items"] == []
    assert body[0]["invoice_number"] == "INV0010436"
    assert len(body[1]["items"]) == 2
