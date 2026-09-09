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


def _fake_row(student_number, first_name, last_name, grade, balance):
    return SimpleNamespace(
        student_number=student_number,
        first_name=first_name,
        last_name=last_name,
        grade=grade,
        total_balance=balance,
    )


@pytest.mark.asyncio
async def test_students_xlsx_falls_back_when_openpyxl_missing():
    """Exercise the real ReportService.students_xlsx() with openpyxl
    blocked at import time — the exact deployed failure mode — and
    assert the stdlib fallback produces a loadable workbook.
    """
    fake_db = SimpleNamespace()
    fake_db.execute = mock.AsyncMock(
        return_value=SimpleNamespace(
            all=lambda: [
                _fake_row("1001", "Alex", "Kuti", "GRADE 8", 1250.5),
                _fake_row("1002", "Thandi", "Kunene", "GRADE R", 0.0),
            ]
        )
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
    fake_db = SimpleNamespace()
    fake_db.execute = mock.AsyncMock(
        return_value=SimpleNamespace(
            all=lambda: [
                _fake_row("1001", "Alex", "Kuti", "GRADE 8", 1250.5),
            ]
        )
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