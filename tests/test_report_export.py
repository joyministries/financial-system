from decimal import Decimal
from io import BytesIO
from types import SimpleNamespace
from unittest import mock

import pytest
from openpyxl import load_workbook

from app.services.report import ReportService
from app.services.xlsx_writer import build_suspension_list_xlsx

HEADERS = ["Customer", "Grade", "Amount", "Comments", "Learners on suspension"]


def test_fallback_writer_builds_valid_workbook():
    buf = build_suspension_list_xlsx(
        sheet_label="SEPTEMBER",
        headers=HEADERS,
        data_rows=[
            ["(1001) Alex Kuti", "8", 1250.5, None, None],
            ["(1002) Thandi Kunene", "R", 0.0, None, None],
            ["(1003) O'Brien & Son", "1", 499.99, None, None],
        ],
        column_widths=(("A", 56.89), ("B", 28.66), ("C", 21.66), ("D", 14.33), ("E", 24.11)),
        sum_footer=True,
        sum_total=1750.49,
    )
    buf.seek(0)
    wb = load_workbook(BytesIO(buf.read()))

    ws = wb.active
    assert ws.title == "SEPTEMBER"

    # Header row styling
    assert [c.value for c in ws[1]] == HEADERS
    assert ws["A1"].font.bold is True
    assert ws["A1"].fill.fgColor.rgb == "FFFFFF00"
    # A left, B/C/E center (matches the openpyxl version)
    assert ws["A1"].alignment.horizontal == "left"
    assert ws["B1"].alignment.horizontal == "center"
    assert ws["C1"].alignment.horizontal == "center"
    assert ws["E1"].alignment.horizontal == "center"

    # Data rows
    assert ws["A2"].value == "(1001) Alex Kuti"
    assert ws["B2"].value == "8"
    assert ws["C2"].value == 1250.5
    assert ws["A3"].value == "(1002) Thandi Kunene"
    assert ws["C3"].value == 0.0
    # Ampersand + apostrophe survive the XML escaping round-trip
    assert ws["A4"].value == "(1003) O'Brien & Son"

    # SUM footer
    assert ws["B5"].value == "OUTSTANDING BALANCE"
    assert ws["C5"].value == "=SUM(C2:C4)"

    # Column widths
    assert ws.column_dimensions["A"].width == 56.89


def _inv_row(student_id, student_number, first_name, last_name, grade_name, required):
    """One row of LedgerService.students_outstanding's invoice aggregate."""
    return SimpleNamespace(
        id=student_id,
        student_number=student_number,
        first_name=first_name,
        last_name=last_name,
        grade_name=grade_name,
        required=required,
    )


def _fake_ledger_db(invoices, payments=()):
    """Emulate the two queries LedgerService.students_outstanding runs.

    First execute() returns invoice rows (one per student, with the summed
    ``required``); second returns ``(student_id, paid)`` pairs, which the
    ledger consumes with ``dict(...)``. A single AsyncMock keyed on call
    order matches the implementation without a real database.
    """
    db = SimpleNamespace()
    db.execute = mock.AsyncMock(
        side_effect=[
            SimpleNamespace(all=lambda: list(invoices)),
            SimpleNamespace(all=lambda: list(payments)),
        ]
    )
    return db


@pytest.mark.asyncio
async def test_students_xlsx_falls_back_when_openpyxl_missing():
    """Exercise the real ReportService.students_xlsx() with openpyxl
    blocked at import time — the exact deployed failure mode — and
    assert the stdlib fallback produces a loadable workbook.
    """
    fake_db = _fake_ledger_db(
        [
            _inv_row("s1", "1001", "Alex", "Kuti", "GRADE 8", 1250.5),
            _inv_row("s2", "1002", "Thandi", "Kunene", "GRADE R", 0.0),
        ]
    )

    real_import = __import__

    def _block_openpyxl(name, globals=None, locals=None, fromlist=(), level=0):
        if name == "openpyxl":
            raise ImportError("No module named 'openpyxl'")
        return real_import(name, globals, locals, fromlist, level)

    service = ReportService(db=fake_db)  # type: ignore[arg-type]

    with mock.patch("builtins.__import__", side_effect=_block_openpyxl):
        buf = await service.students_xlsx(academic_year=2026, month=9)

    buf.seek(0)
    wb = load_workbook(BytesIO(buf.read()))
    ws = wb.active

    assert ws.title == "SEPTEMBER"
    assert [c.value for c in ws[1]] == HEADERS
    assert ws["A2"].value == "(1001) Alex Kuti"
    assert ws["B2"].value == "8"  # GRADE 8 -> "8"
    assert ws["B3"].value == "R"  # GRADE R -> "R"
    assert ws["C3"].value == 0.0
    assert ws["B4"].value == "OUTSTANDING BALANCE"
    assert ws["C4"].value == "=SUM(C2:C3)"


@pytest.mark.asyncio
async def test_students_xlsx_still_uses_openpyxl_when_available():
    """Parity check: the primary openpyxl path must keep working and
    produce the same shape as the fallback.
    """
    fake_db = _fake_ledger_db(
        [
            _inv_row("s1", "1001", "Alex", "Kuti", "GRADE 8", 1250.5),
        ]
    )

    service = ReportService(db=fake_db)  # type: ignore[arg-type]
    buf = await service.students_xlsx(academic_year=2026, month=9)

    buf.seek(0)
    wb = load_workbook(BytesIO(buf.read()))
    ws = wb.active

    assert ws.title == "SEPTEMBER"
    assert ws["A2"].value == "(1001) Alex Kuti"
    assert ws["B2"].value == "8"
    assert ws["C2"].value == 1250.5
    assert ws["B3"].value == "OUTSTANDING BALANCE"
    assert ws["C3"].value == "=SUM(C2:C2)"

# ---------------------------------------------------------------------------
# Per-student x per-month outstanding matrix (the Reports -> Outstanding Fees
# Excel/CSV export). The export needs one row per student with a column per
# month instead of a single cumulative figure for the whole year.
# ---------------------------------------------------------------------------


def _matrix_row(student_id, student_number, first_name, last_name, grade, outstanding):
    """A row shaped like students_outstanding / _monthly_statement_rows."""
    return {
        "student_id": student_id,
        "student_number": student_number,
        "name": f"{first_name} {last_name}",
        "grade": grade,
        "required": Decimal(outstanding),
        "paid": Decimal("0"),
        "outstanding": Decimal(outstanding),
    }


class _FakeLedger:
    """Stand-in for LedgerService.students_outstanding.

    Returns the row set registered for whichever ``up_to_month`` was asked
    for, so the matrix's per-month columns can be asserted with no database.
    """

    def __init__(self, by_month):
        self.by_month = by_month
        self.calls = []

    async def students_outstanding(self, academic_year, grade_id=None, up_to_month=None):
        self.calls.append(up_to_month)
        return self.by_month.get(up_to_month, [])


@pytest.mark.asyncio
async def test_outstanding_matrix_is_running_balance_per_month():
    """Carry-over mode: every month is the balance at that month's end."""
    ledger = _FakeLedger({
        1: [
            _matrix_row("s1", "1001", "Alex", "Kuti", "GRADE 8", "1000"),
            _matrix_row("s2", "1002", "Thandi", "Kunene", "GRADE R", "500"),
        ],
        2: [
            _matrix_row("s1", "1001", "Alex", "Kuti", "GRADE 8", "400"),
            _matrix_row("s2", "1002", "Thandi", "Kunene", "GRADE R", "500"),
        ],
        # Thandi has no rows from March on; she must still get a full row.
        3: [_matrix_row("s1", "1001", "Alex", "Kuti", "GRADE 8", "400")],
    })
    service = ReportService(db=SimpleNamespace())
    service.ledger = ledger

    result = await service.outstanding_matrix(2026, month_only=False, up_to_month=3)

    assert ledger.calls == [1, 2, 3]
    assert result["month_only"] is False
    assert [m["label"] for m in result["months"]] == ["January", "February", "March"]
    assert [s["name"] for s in result["students"]] == ["Alex Kuti", "Thandi Kunene"]

    alex = result["students"][0]
    assert alex["student_number"] == "1001"
    assert alex["grade"] == "GRADE 8"
    assert alex["balances"] == {"1": "1000", "2": "400", "3": "400"}

    # Absent from March -> zero, never a missing key.
    assert result["students"][1]["balances"] == {"1": "500", "2": "500", "3": "0"}

    # Per-month column totals, which replace the old cumulative block.
    assert result["totals"] == {"1": "1500", "2": "900", "3": "400"}


@pytest.mark.asyncio
async def test_outstanding_matrix_month_only_uses_that_months_own_rows():
    """Month-only mode: each column is just that month, not a running total."""
    service = ReportService(db=SimpleNamespace())
    seen = []

    async def fake_rows(academic_year, month, grade_id=None):
        seen.append(month)
        return [_matrix_row("s1", "1001", "Alex", "Kuti", "GRADE 8", str(month * 100))]

    service._monthly_statement_rows = fake_rows

    result = await service.outstanding_matrix(2026, month_only=True, up_to_month=4)

    assert seen == [1, 2, 3, 4]
    assert result["month_only"] is True
    assert result["students"][0]["balances"] == {
        "1": "100", "2": "200", "3": "300", "4": "400",
    }
    assert result["totals"] == {"1": "100", "2": "200", "3": "300", "4": "400"}


@pytest.mark.asyncio
async def test_outstanding_matrix_defaults_to_full_year():
    """Omitting up_to_month exports Jan..Dec, and a student seen only in a
    late month still appears with zeros for the earlier months."""
    ledger = _FakeLedger({
        11: [_matrix_row("s9", "1009", "Late", "Enrolment", "GRADE 1", "750")],
    })
    service = ReportService(db=SimpleNamespace())
    service.ledger = ledger

    result = await service.outstanding_matrix(2026)

    assert ledger.calls == list(range(1, 13))
    assert len(result["months"]) == 12
    assert result["months"][0]["label"] == "January"
    assert result["months"][11]["label"] == "December"

    balances = result["students"][0]["balances"]
    assert balances["1"] == "0"
    assert balances["11"] == "750"
    assert result["totals"]["11"] == "750"
