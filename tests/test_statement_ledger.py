"""Regression tests for the canonical statement ledger.

The rule these lock down: the school raises ONE annual fee per year, so a
statement must never emit a per-month "Fees for MM/YYYY" debit. That bug printed
a phantom R1,940 charge on a student's statement after the invoice behind it
had been voided, because the renderer trusted a stale monthly snapshot.
"""

from datetime import UTC, datetime
from decimal import Decimal as Dec
from types import SimpleNamespace

import pytest

from app.services.statement import build_statement_ledger, derive_ledger_footer


@pytest.fixture(autouse=True)
async def setup_database():
    """Shadow the conftest fixture: ledger rendering is pure, no DB required.

    The suite-wide fixture drops/creates every table on a live Postgres, which
    would make these unit tests unrunnable without a database.
    """
    yield

YEAR = 2026
ANNUAL_FEE = Dec("23380.00")
ISSUED = datetime(2026, 1, 16, tzinfo=UTC)


def _payment(day: int, month: int, amount: str, ref: str | None, method="bank_transfer"):
    return SimpleNamespace(
        payment_date=datetime(YEAR, month, day, tzinfo=UTC),
        amount=Dec(amount),
        reference_number=ref,
        payment_method=method,
    )


def _charge(day: int, month: int, amount: str, desc="Locker fee", ctype=None):
    return SimpleNamespace(
        created_at=datetime(YEAR, month, day, tzinfo=UTC),
        amount=Dec(amount),
        description=desc,
        charge_type=ctype,
    )


def _ledger(charges=(), payments=(), opening="0", fee=ANNUAL_FEE, fee_date=ISSUED):
    return build_statement_ledger(
        academic_year=YEAR,
        annual_fee=Dec(fee),
        annual_fee_date=fee_date,
        opening_balance=Dec(opening),
        charges=list(charges),
        payments=list(payments),
    )


def _descriptions(rows):
    return [r["description"] for r in rows]


def test_fee_appears_exactly_once_as_annual_charge():
    rows = _ledger(payments=[_payment(5, 9, "2020.00", "RCP0021152")])
    assert _descriptions(rows).count("Annual school fees 2026") == 1
    fee_rows = [r for r in rows if r["description"].startswith("Annual school fees")]
    assert fee_rows[0]["debit"] == ANNUAL_FEE
    assert fee_rows[0]["credit"] is None


def test_no_per_month_fee_lines_ever_render():
    """The R1,940 phantom-fee regression."""
    rows = _ledger(payments=[_payment(5, 9, "2020.00", "RCP0021152")])
    assert not [d for d in _descriptions(rows) if d.startswith("Fees for")]
    assert not [d for d in _descriptions(rows) if "installment" in d.lower()]


def test_voided_monthly_invoice_does_not_reappear():
    """A stale month-8 snapshot of 1,940 must not leak into the ledger.

    This is the exact defect reported: the m08 statement snapshot still held
    total_installments=1940 after the invoice was voided, so the old renderer
    printed a fee the account was never charged.
    """
    rows = _ledger(payments=[_payment(3, 8, "1900.00", "RCP0020953")])
    assert all(Dec(r["debit"] or 0) != Dec("1940.00") for r in rows)


def test_rows_are_sorted_chronologically():
    rows = _ledger(
        payments=[
            _payment(5, 9, "2020.00", "RCP0021152"),
            _payment(16, 1, "2000.00", "RCP0019720"),
            _payment(12, 2, "1960.00", "RCP0019953"),
        ]
    )
    dates = [
        datetime.strptime(r["date"], "%d %b %Y") for r in rows if not r.get("bold")
    ]
    assert dates == sorted(dates)


def test_fee_is_dated_to_its_issue_date_not_a_due_date():
    rows = _ledger()
    fee_row = next(r for r in rows if r["description"].startswith("Annual school fees"))
    assert fee_row["date"] == "16 Jan 2026"


def test_balance_is_the_running_sum_of_displayed_rows():
    rows = _ledger(
        payments=[
            _payment(16, 1, "2000.00", "RCP0019720"),
            _payment(5, 9, "2020.00", "RCP0021152"),
        ]
    )
    running = Dec("0")
    for row in rows:
        if row.get("bold"):
            continue
        running += Dec(row["debit"] or 0) - Dec(row["credit"] or 0)
        assert row["balance"] == running


def test_carried_forward_equals_last_running_balance():
    rows = _ledger(
        payments=[
            _payment(16, 1, "2000.00", "RCP0019720"),
            _payment(5, 9, "2020.00", "RCP0021152"),
        ]
    )
    closing = rows[-1]
    assert closing["description"] == "Balance carried forward"
    assert closing["balance"] == rows[-2]["balance"]


def test_ledger_opens_and_closes_with_a_balance_row():
    rows = _ledger()
    assert rows[0]["description"] == "Balance brought forward"
    assert rows[0]["bold"] is True
    assert rows[-1]["description"] == "Balance carried forward"
    assert rows[-1]["bold"] is True


def test_additional_charges_render_as_debits_with_real_dates():
    rows = _ledger(charges=[_charge(12, 3, "350.00", "Locker fee", "extra")])
    charge = next(r for r in rows if r["debit"] == Dec("350.00"))
    assert charge["description"] == "Locker fee (extra)"
    assert charge["date"] == "12 Mar 2026"


def test_charge_then_payment_same_day_keeps_charge_first():
    rows = _ledger(
        charges=[_charge(4, 5, "350.00")],
        payments=[_payment(4, 5, "1000.00", "RCP0020434")],
    )
    same_day = [r for r in rows if r["date"] == "04 May 2026"]
    assert same_day[0]["debit"] == Dec("350.00")
    assert same_day[1]["credit"] == Dec("1000.00")


def test_credit_note_is_labelled_and_counted_as_a_credit():
    rows = _ledger(payments=[_payment(21, 4, "500.00", "CRN0001401", "credit_note")])
    note = next(r for r in rows if r["description"].startswith("Credit note"))
    assert note["credit"] == Dec("500.00")


def test_derives_footer_from_displayed_rows():
    rows = _ledger(
        payments=[
            _payment(16, 1, "2000.00", "RCP0019720"),
            _payment(12, 2, "1960.00", "RCP0019953"),
            _payment(5, 9, "2020.00", "RCP0021152"),
        ]
    )
    footer = derive_ledger_footer(rows, month=9)
    assert footer["amount_paid"] == Dec("5980.00")
    assert footer["amount_year_due"] == rows[-1]["balance"]
    assert footer["amount_year_due"] == ANNUAL_FEE - Dec("5980.00")


def test_amount_due_for_month_is_never_negative():
    """An overpayment in the month must not print as a negative charge."""
    rows = _ledger(payments=[_payment(5, 9, "2020.00", "RCP0021152")])
    footer = derive_ledger_footer(rows, month=9)
    assert footer["amount_due"] == Dec("0.00")


def test_amount_due_for_month_counts_that_month_only():
    rows = _ledger(
        payments=[
            _payment(16, 1, "2000.00", "RCP0019720"),
            _payment(12, 2, "1960.00", "RCP0019953"),
        ]
    )
    # February has no debits of its own, so its own-month amount due is zero.
    assert derive_ledger_footer(rows, month=2)["amount_due"] == Dec("0.00")
    # Without a single month in focus the footer nets the whole displayed
    # period: the annual fee less every payment shown.
    assert derive_ledger_footer(rows, month=None)["amount_due"] == ANNUAL_FEE - Dec("3960.00")


def test_footer_reconciles_with_opening_balance():
    rows = _ledger(
        opening="5000.00",
        payments=[_payment(5, 9, "2020.00", "RCP0021152")],
    )
    footer = derive_ledger_footer(rows, month=9)
    assert footer["amount_year_due"] == Dec("5000.00") + ANNUAL_FEE - Dec("2020.00")


def test_student_without_invoice_has_no_fee_line():
    rows = _ledger(fee="0", payments=[_payment(5, 9, "500.00", "RCP0021152")])
    assert not [d for d in _descriptions(rows) if "Annual school fees" in d]
    assert rows[-1]["balance"] == Dec("-500.00")
