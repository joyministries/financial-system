"""A billing period may hold more than one invoice.

The historical import wrote each of a month's charges as its own row —
school fees, diary fee and brought forward for January 2026 became
``INV-1556-202601``, ``-2`` and ``-3`` — so 182 students have two or three
invoices for a single (student, year, month).

``get_for_period`` queried that period with ``scalar_one_or_none()``, which
raises ``MultipleResultsFound`` the moment a second row exists. The effect:

* ``POST /invoices/generate`` returned a 500 instead of the 409
  ``ConflictError`` it is written to return;
* ``generate_all`` caught the exception and counted the student as
  *failed* instead of *skipped*, so every whole-school run reported 182
  bogus failures.

Both callers only test whether the period is already billed, so the query
returns the earliest row and orders deterministically.
"""

import asyncio

from app.core.exceptions import ConflictError, NotFoundError
from app.services.invoice import InvoiceService


class _Invoice:
    def __init__(self, invoice_number):
        self.invoice_number = invoice_number


class _Scalars:
    def __init__(self, rows):
        self._rows = rows

    def first(self):
        return self._rows[0] if self._rows else None


class _Result:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return _Scalars(self._rows)


class _FakeDB:
    """Stands in for the session: returns canned rows and records queries."""

    def __init__(self, rows=(), student="student-object"):
        self.rows = list(rows)
        self.student = student
        self.statements = []

    async def get(self, model, pk):
        return self.student

    async def execute(self, stmt):
        self.statements.append(stmt)
        return _Result(self.rows)


class TestGetForPeriod:
    def test_several_invoices_in_one_period_does_not_raise(self):
        # January 2026 for 1556: brought forward + annual fees + diary fee.
        rows = [_Invoice("INV-1556-202601"), _Invoice("INV-1556-202601-2"),
                _Invoice("INV-1556-202601-3")]
        db = _FakeDB(rows)
        service = InvoiceService(db)

        found = asyncio.run(service.get_for_period("student-1", 2026, 1))

        assert found is rows[0]

    def test_empty_period_returns_none(self):
        db = _FakeDB([])
        service = InvoiceService(db)

        assert asyncio.run(service.get_for_period("student-1", 2026, 1)) is None

    def test_orders_deterministically(self):
        # "First row" must be a defined thing, not whatever the planner
        # happened to return, or two runs could disagree about the winner.
        db = _FakeDB([])
        service = InvoiceService(db)

        asyncio.run(service.get_for_period("student-1", 2026, 1))

        assert "ORDER BY" in str(db.statements[0])


class TestGenerateWithAnAlreadyBilledPeriod:
    def test_conflicts_instead_of_returning_a_500(self):
        # The route is written to answer 409 ConflictError when the period
        # is already billed; MultipleResultsFound escaped as an unhandled
        # exception, so the office saw a 500 for every imported student.
        db = _FakeDB([_Invoice("INV-1556-202601"), _Invoice("INV-1556-202601-2")])
        service = InvoiceService(db)

        try:
            asyncio.run(service.generate("student-1", 2026, 1, "user-1"))
        except ConflictError:
            pass
        else:
            raise AssertionError("generate() should raise ConflictError")

    def test_missing_student_still_raises_not_found(self):
        # The not-found check runs before the period lookup and must keep
        # winning — otherwise a typo'd id would report a billing conflict.
        db = _FakeDB([_Invoice("INV-1556-202601")], student=None)
        service = InvoiceService(db)

        try:
            asyncio.run(service.generate("missing", 2026, 1, "user-1"))
        except NotFoundError:
            pass
        else:
            raise AssertionError("generate() should raise NotFoundError")
        assert db.statements == []
