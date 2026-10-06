"""Unit tests for the optional grade-fee argument on statement helpers.

Every student is billed once in January: the annual payment plan produces a
single ``MonthlySchedule`` row at month 1 covering the whole year. February
through December therefore have no invoice of their own, so
``Statement.total_installments`` is ``0``.

The grade's monthly tuition instalment can fill the ``Fees for MM/YYYY`` ledger
row for such months, **display-only**: the annual invoice already sits in the
statement balance, so adding the instalment again would double-bill the rest of
the year (Grade 8 would jump from R8,940 outstanding to R41,720).

**The grade fee never enters the balance — but it does reach ``Amount Due for
Month``, as a subtrahend.** That line quotes the *arrears*: the closing balance
less the instalments that have not fallen due yet, less the prior year's
carry-in (see ``test_statement_amount_due.py``). Adding the fee to the balance
would double-bill the rest of the year (Grade 8 would jump from R8,940
outstanding to R41,720).

``app/services/monthly_fee.py`` and the ``grade_monthly_fee`` response field
serve both the ledger row and that calculation. These tests pin each half so
neither behaviour drifts.
"""

from decimal import Decimal

import pytest

from app.api.v1.financial import _ledger_for_statement_rows, _monthly_amount_due
from app.services.statement import fee_installment_for_statement

D = Decimal


def _statement(**overrides):
    class S:
        pass

    s = S()
    s.id = "11111111-1111-4111-8111-111111111111"
    s.student_id = "22222222-2222-4222-8222-222222222222"
    s.academic_year = 2026
    s.month = 9
    s.opening_balance = D("8940.00")
    s.total_fees = D("0.00")
    s.total_installments = D("0.00")
    s.total_additional_charges = D("0.00")
    s.total_payments = D("0.00")
    s.closing_balance = D("8940.00")
    s.current_amount_due = D("8940.00")
    s.brought_forward = D("0.00")
    for key, value in overrides.items():
        setattr(s, key, value)
    return s


def _fee_row(rows):
    return [r for r in rows if str(r.get("description", "")).startswith("Fees for")]


class TestFeeInstallmentResolution:
    def test_invoice_derived_installment_wins_and_moves_balance(self):
        assert fee_installment_for_statement(D("24880.00"), D("2980.00")) == (
            D("24880.00"),
            True,
        )

    def test_empty_month_falls_back_to_grade_fee_without_moving_balance(self):
        assert fee_installment_for_statement(D("0"), D("2980.00")) == (D("2980.00"), False)

    def test_no_grade_fee_renders_no_row(self):
        assert fee_installment_for_statement(D("0"), D("0")) == (D("0"), False)

    def test_zero_invoice_installment_is_treated_as_empty(self):
        # total_installments can arrive as a string/Decimal from the ORM.
        assert fee_installment_for_statement("0.00", D("1940.00")) == (D("1940.00"), False)


class TestLedgerFeeRow:
    def test_january_fee_row_moves_the_balance(self):
        stmt = _statement(
            month=1, opening_balance=D("0"), total_installments=D("37360.00"),
            closing_balance=D("37360.00"),
        )
        rows = _ledger_for_statement_rows(stmt, [], [], D("2980.00"))
        fee = _fee_row(rows)
        assert len(fee) == 1
        assert fee[0]["debit"] == D("37360.00")
        assert fee[0]["balance"] == D("37360.00")

    def test_september_fee_row_is_shown_but_does_not_move_the_balance(self):
        stmt = _statement(month=9, opening_balance=D("8940.00"))
        rows = _ledger_for_statement_rows(stmt, [], [], D("2980.00"))
        fee = _fee_row(rows)
        assert len(fee) == 1
        assert fee[0]["debit"] == D("2980.00")
        assert fee[0]["balance"] == D("8940.00")

    def test_september_closing_balance_is_unchanged_by_the_fallback(self):
        stmt = _statement(
            month=9,
            opening_balance=D("8940.00"),
            total_payments=D("2980.00"),
            closing_balance=D("5960.00"),
        )
        rows = _ledger_for_statement_rows(stmt, [], [], D("2980.00"))
        # Fee row (display only) then the payment: the running balance must
        # match what the stored statement already reports.
        assert rows[-1]["balance"] == D("5960.00")

    def test_without_a_grade_fee_the_month_has_no_fee_row(self):
        stmt = _statement(month=9, opening_balance=D("8940.00"))
        rows = _ledger_for_statement_rows(stmt, [], [], D("0"))
        assert _fee_row(rows) == []

    def test_default_argument_keeps_prior_behaviour(self):
        # Existing callers/tests pass no fee: an empty month renders no row.
        stmt = _statement(month=9, opening_balance=D("8940.00"))
        assert _fee_row(_ledger_for_statement_rows(stmt, [], [])) == []


class TestMonthlyAmountDue:
    """``Amount Due for Month`` is the *arrears*, not the whole balance.

    Closing balance less the instalments that have not fallen due yet, less
    the prior year's carry-in. The grade fee is that subtrahend's unit — it
    never moves the balance (see ``TestLedgerFeeRow`` above).
    """

    #: Grade 8 monthly tuition — three of the twelve instalments are still
    #: ahead of the September statement, so 8,940 - 3 x 2,980 = 0.
    GRADE_8_FEE = D("2980.00")

    def test_months_not_yet_due_are_set_aside(self):
        # Three instalments (8,940) have not fallen due; the matching balance
        # is therefore fully paid up and nothing is overdue.
        assert _monthly_amount_due(_statement(), self.GRADE_8_FEE) == D("0")

    def test_reports_only_the_balance_in_excess_of_the_future_instalments(self):
        stmt = _statement(
            closing_balance=D("12000.00"), current_amount_due=D("12000.00"),
        )
        # 12,000 - 8,940 still ahead = 3,060 genuinely overdue.
        assert _monthly_amount_due(stmt, self.GRADE_8_FEE) == D("3060.00")

    def test_settled_month_reports_zero(self):
        stmt = _statement(
            total_payments=D("2980.00"),
            closing_balance=D("0"),
            current_amount_due=D("0"),
        )
        assert _monthly_amount_due(stmt, self.GRADE_8_FEE) == D("0")

    def test_invoice_derived_month_reports_what_has_fallen_due(self):
        # January bills the whole year up front (37,360) and 1,000 is paid.
        # 36,360 is still unpaid, but only January's instalment is in arrears;
        # the other 11 (11 x 2,980 = 32,780) have not fallen due.
        stmt = _statement(
            month=1,
            total_installments=D("37360.00"),
            total_payments=D("1000"),
            closing_balance=D("36360.00"),
            current_amount_due=D("36360.00"),
        )
        assert _monthly_amount_due(stmt, self.GRADE_8_FEE) == D("3580.00")

    def test_takes_a_grade_fee_argument(self):
        # The fee is required: it is the unit of "not yet due".
        assert _monthly_amount_due(_statement(), self.GRADE_8_FEE) == D("0")
        with pytest.raises(TypeError):
            _monthly_amount_due(_statement())

    def test_additional_charges_are_overdue_from_the_month_they_landed(self):
        stmt = _statement(
            total_additional_charges=D("500.00"),
            closing_balance=D("9440.00"),
            current_amount_due=D("9440.00"),
        )
        # The future instalments still come to 8,940, so the entire excess —
        # the R500 once-off — is what is overdue.
        assert _monthly_amount_due(stmt, self.GRADE_8_FEE) == D("500.00")

    def test_the_carried_forward_balance_is_not_this_year_arrears(self):
        stmt = _statement(
            closing_balance=D("10940.00"), current_amount_due=D("10940.00"),
            brought_forward=D("2000.00"),
        )
        # 10,940 - 8,940 ahead - 2,000 carried in = 0 overdue.
        assert _monthly_amount_due(stmt, self.GRADE_8_FEE) == D("0")
