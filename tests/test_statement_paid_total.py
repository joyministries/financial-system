"""Regression tests for the statement "Amount Paid to date" total.

Both PDF paths (single-student download and the school/grade bundles) used to
compute the paid total with a prefix match::

    sum(row["credit"] for row in ledger
        if (row["reference"] or "").upper().startswith("RCP"))

Receipts are not reliably RCP-prefixed in the database — verified payments
carry references such as ``FNB``, ``FNB - Split``, ``REC 185`` or NULL. Those
rows rendered in the ledger but were silently dropped from the paid total, so
the footer under-reported what the family had actually paid.

The ledger builders now flag genuine receipts with ``is_payment`` and the
footer sums those rows. Brought-forward credits and credit notes still share
the credit column, so they must remain excluded.
"""

from datetime import UTC, datetime
from decimal import Decimal
from types import SimpleNamespace

from app.api.v1.financial import _ledger_for_statement_rows
from app.services.statement import total_paid_from_ledger


def _statement(**overrides):
    base = {
        "id": "11111111-1111-4111-8111-111111111111",
        "student_id": "22222222-2222-4222-8222-222222222222",
        "academic_year": 2026,
        "month": 1,
        "opening_balance": Decimal("0.00"),
        "total_installments": Decimal("24880.00"),
        "total_additional_charges": Decimal("0.00"),
        "total_payments": Decimal("0.00"),
        "closing_balance": Decimal("0.00"),
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def _payment(reference, amount, method="bank_transfer"):
    return SimpleNamespace(
        id="33333333-3333-4333-8333-333333333333",
        reference_number=reference,
        amount=Decimal(amount),
        payment_method=method,
        payment_date=datetime(2026, 1, 19, tzinfo=UTC),
        status="verified",
    )


def _old_rcp_total(rows):
    """The buggy implementation, kept so the regression is provable."""
    return sum(
        (row.get("credit") or 0)
        for row in rows
        if (row.get("reference") or "").upper().startswith("RCP")
    )


class TestNonRcpReceiptsCountAsPaid:
    def test_bank_reference_is_counted(self):
        """A receipt referenced 'FNB' must count toward the paid total."""
        rows = _ledger_for_statement_rows(_statement(), [], [_payment("FNB", "1600.00")])
        assert total_paid_from_ledger(rows) == Decimal("1600.00")

    def test_rec_numbered_reference_is_counted(self):
        rows = _ledger_for_statement_rows(_statement(), [], [_payment("REC 185", "2250.00")])
        assert total_paid_from_ledger(rows) == Decimal("2250.00")

    def test_split_payment_reference_is_counted(self):
        rows = _ledger_for_statement_rows(_statement(), [], [_payment("FNB - Split", "980.50")])
        assert total_paid_from_ledger(rows) == Decimal("980.50")

    def test_rcp_reference_still_counted(self):
        rows = _ledger_for_statement_rows(_statement(), [], [_payment("RCP0019741", "1600.00")])
        assert total_paid_from_ledger(rows) == Decimal("1600.00")

    def test_mixed_reference_styles_sum_together(self):
        payments = [
            _payment("RCP0019741", "1600.00"),
            _payment("FNB", "1940.00"),
            _payment("REC 185", "776.00"),
        ]
        rows = _ledger_for_statement_rows(_statement(), [], payments)
        assert total_paid_from_ledger(rows) == Decimal("4316.00")

    def test_old_implementation_missed_these_amounts(self):
        """Documents the regression: the old filter dropped non-RCP receipts."""
        rows = _ledger_for_statement_rows(_statement(), [], [_payment("FNB", "1600.00")])
        assert _old_rcp_total(rows) == 0
        assert total_paid_from_ledger(rows) == Decimal("1600.00")


class TestNonReceiptCreditsExcluded:
    def test_credit_notes_are_not_paid(self):
        rows = _ledger_for_statement_rows(_statement(), [], [_payment("CRN0001421", "1164.00")])
        assert total_paid_from_ledger(rows) == Decimal("0.00")

    def test_refless_brought_forward_is_not_paid(self):
        rows = _ledger_for_statement_rows(_statement(), [], [_payment(None, "500.00")])
        assert total_paid_from_ledger(rows) == Decimal("0.00")

    def test_blank_reference_is_not_paid(self):
        rows = _ledger_for_statement_rows(_statement(), [], [_payment("", "500.00")])
        assert total_paid_from_ledger(rows) == Decimal("0.00")

    def test_payments_and_credit_notes_are_separated(self):
        payments = [
            _payment("FNB", "1600.00"),
            _payment("CRN0001421", "1164.00"),
            _payment(None, "500.00"),
        ]
        rows = _ledger_for_statement_rows(_statement(), [], payments)
        assert total_paid_from_ledger(rows) == Decimal("1600.00")


class TestRowTagging:
    def test_payment_row_is_flagged(self):
        rows = _ledger_for_statement_rows(_statement(), [], [_payment("FNB", "1600.00")])
        flagged = [r for r in rows if r.get("is_payment")]
        assert len(flagged) == 1
        assert flagged[0]["credit"] == Decimal("1600.00")
        assert flagged[0]["description"] == "Payment — bank_transfer"

    def test_credit_note_row_is_not_flagged(self):
        rows = _ledger_for_statement_rows(_statement(), [], [_payment("CRN0001421", "1164.00")])
        assert not any(r.get("is_payment") for r in rows)

    def test_fee_and_balance_rows_are_not_flagged(self):
        rows = _ledger_for_statement_rows(_statement(), [], [])
        assert not any(r.get("is_payment") for r in rows)

    def test_empty_ledger_returns_zero(self):
        assert total_paid_from_ledger([]) == Decimal("0")


class TestHelperRobustness:
    def test_none_credit_on_flagged_row_is_ignored(self):
        assert total_paid_from_ledger([{"is_payment": True, "credit": None}]) == Decimal("0")

    def test_missing_credit_key_is_ignored(self):
        assert total_paid_from_ledger([{"is_payment": True}]) == Decimal("0")

    def test_string_credit_is_coerced(self):
        assert total_paid_from_ledger([{"is_payment": True, "credit": "12.34"}]) == Decimal("12.34")

    def test_float_credit_is_coerced(self):
        assert total_paid_from_ledger([{"is_payment": True, "credit": 12.34}]) == Decimal("12.34")
