"""An admin-recorded payment must produce a receipt.

Commit 03677f9 made ``POST /payments/`` create payments as ``verified``
directly, on the reasoning that the finance user typing the receipt *is*
the verification. Receipt issuance, though, lived only in the approve
branch of ``POST /payments/verify`` — the path this now bypasses. So
recorded payments appeared on statements with no receipt at all: ten
receiptless payments had accumulated in the week before this fix, and the
most recent organic receipt was from a Celery backfill on 11 September.

``PaymentService.record_payment`` now issues the receipt itself whenever
the payment is created verified. ``pending`` payments (PayFast and the
reminder link) are untouched — those collect their receipt from the ITN,
and issuing one here would leave a receipt attached to a payment that was
never confirmed.
"""

import asyncio
from datetime import datetime

from app.schemas.payment import PaymentCreate
from app.services import receipt as receipt_mod
from app.services.payment import PaymentService


class _FakeDB:
    def __init__(self):
        self.added = []
        self.flushed = 0

    def add(self, obj):  # AsyncSession.add is synchronous
        self.added.append(obj)

    async def flush(self):
        self.flushed += 1


def _service(monkeypatch):
    """A PaymentService with statement refresh stubbed and receipts spied on."""
    db = _FakeDB()
    service = PaymentService(db)
    generated = []

    async def refresh_statements(student_id, payment_date):
        return None

    class _SpyReceiptService:
        def __init__(self, session):
            self.session = session

        async def generate(self, payment):
            generated.append(payment)
            return "RCP-TEST"

    service.refresh_statements = refresh_statements
    monkeypatch.setattr(receipt_mod, "ReceiptService", _SpyReceiptService)
    return service, generated


def _data():
    return PaymentCreate(
        student_id="student-1",
        amount=1000,
        payment_method="Bank Transfer",
        payment_date=datetime(2026, 10, 6),
    )


class TestRecordPaymentReceipt:
    def test_a_verified_payment_issues_a_receipt(self, monkeypatch):
        # This is the admin's "record payment" path — it never reaches
        # POST /payments/verify, so the receipt has to be raised here.
        service, generated = _service(monkeypatch)

        payment = asyncio.run(
            service.record_payment(_data(), "admin-1", status="verified")
        )

        assert len(generated) == 1
        assert generated[0] is payment

    def test_the_receipt_is_attached_to_the_payment_that_was_created(self, monkeypatch):
        service, generated = _service(monkeypatch)

        payment = asyncio.run(
            service.record_payment(_data(), "admin-1", status="verified")
        )

        assert generated[0].student_id == "student-1"
        assert generated[0].id == payment.id

    def test_a_pending_payment_does_not_issue_a_receipt(self, monkeypatch):
        # PayFast/reminder payments are created `pending` and collect their
        # receipt from the ITN. Issuing one here would hang a receipt off a
        # payment the payer may never complete.
        service, generated = _service(monkeypatch)

        asyncio.run(service.record_payment(_data(), "parent-1", status="pending"))

        assert generated == []

    def test_the_payment_is_still_persisted(self, monkeypatch):
        service, generated = _service(monkeypatch)

        asyncio.run(service.record_payment(_data(), "admin-1", status="verified"))

        assert len(service.db.added) == 1
        assert service.db.flushed >= 1
