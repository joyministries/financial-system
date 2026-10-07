"""A receipt must reach the statement, not just the ledger.

Statements are snapshots taken when they were generated. Until this was
wired up, a payment recorded afterwards never reached the stored row, so
``Amount Due for Month`` kept quoting the pre-payment balance — (1982) paid
R1,000 on 6 October and the line still read 2,580 because the statement had
been generated the evening before.

``StatementService.refresh_for_student`` rebuilds those rows from the live
ledger and is called by every payment write (``PaymentService.record_payment``
/ ``verify_payment`` / ``edit`` / ``reverse`` / ``void``, the hard-delete
route, and the PayFast ITN). These tests pin the invariants that keep the
whole-school report honest:

* only months that already exist are rebuilt — generating missing ones would
  fabricate future statements and silently change report totals;
* nothing is rebuilt when there is nothing to rebuild, so a refresh can never
  invent a student's statement set;
* the expensive yearly breakdown is computed once, not once per month.
"""

import asyncio

from app.services.statement import StatementService


class _FakeStatement:
    def __init__(self, month):
        self.month = month


class _FakeDB:
    def __init__(self):
        self.deleted = []
        self.flushed = 0

    async def delete(self, obj):
        self.deleted.append(obj)

    async def flush(self):
        self.flushed += 1


def _service(existing_months):
    """A StatementService whose I/O is stubbed, counting each call."""
    db = _FakeDB()
    service = StatementService(db)
    calls = {"breakdown": 0, "charges": 0, "brought_forward": 0, "generated": [], "flushes": []}

    async def list_for_student(student_id, academic_year):
        return [_FakeStatement(m) for m in existing_months]

    async def monthly_breakdown(student_id, academic_year):
        calls["breakdown"] += 1
        return [{"month": m} for m in range(1, 13)]

    async def list_charges(student_id, academic_year):
        calls["charges"] += 1
        return ["charge"]

    async def brought_forward_for(student_id, academic_year):
        calls["brought_forward"] += 1
        return "BF"

    async def generate_from_breakdown(
        student_id, academic_year, month, breakdown, charges=None,
        brought_forward=None, flush=True,
    ):
        calls["generated"].append((month, charges, brought_forward))
        calls["flushes"].append(flush)

    service.list_for_student = list_for_student
    service.ledger.monthly_breakdown = monthly_breakdown
    service.charge_service.list_for_student = list_charges
    service.brought_forward_for = brought_forward_for
    service.generate_from_breakdown = generate_from_breakdown
    return service, db, calls


class TestRefreshForStudent:
    def test_rebuilds_exactly_the_months_that_existed(self):
        # 1982 has statements for months 1..10 only. Refreshing must not
        # manufacture November/December rows: they would add columns to the
        # whole-school export for a schedule the school never issued.
        service, db, calls = _service(range(1, 11))

        rebuilt = asyncio.run(service.refresh_for_student("student-1", 2026))

        assert rebuilt == 10
        assert [month for month, _, _ in calls["generated"]] == list(range(1, 11))
        assert len(db.deleted) == 10
        # Inserts must be batched: a per-row flush is a network round trip
        # each against the remote DB, so refresh flushes once at the end.
        assert calls["flushes"] == [False] * 10
        assert db.flushed >= 1

    def test_returns_zero_when_the_student_has_no_statements(self):
        # No statements yet means nothing to refresh — generating here would
        # invent a statement set for a student who has none.
        service, db, calls = _service([])

        rebuilt = asyncio.run(service.refresh_for_student("student-1", 2026))

        assert rebuilt == 0
        assert calls["generated"] == []
        assert db.deleted == []
        assert calls["breakdown"] == 0

    def test_computes_the_expensive_breakdown_once(self):
        # Twelve months share one ledger query. Routing each month through
        # StatementService.generate() would re-run it every time.
        service, db, calls = _service(range(1, 13))

        asyncio.run(service.refresh_for_student("student-1", 2026))

        assert calls["breakdown"] == 1
        assert calls["charges"] == 1
        assert calls["brought_forward"] == 1

    def test_passes_fetched_charges_and_brought_forward_to_every_month(self):
        service, db, calls = _service([1, 2, 3])

        asyncio.run(service.refresh_for_student("student-1", 2026))

        assert calls["generated"] == [
            (1, ["charge"], "BF"),
            (2, ["charge"], "BF"),
            (3, ["charge"], "BF"),
        ]
