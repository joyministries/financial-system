"""Unit tests for the optional grade-fee argument on statement helpers.

Every student is billed once in January: the annual payment plan produces a
single ``MonthlySchedule`` row at month 1 covering the whole year. February
through December therefore have no invoice of their own, so
``Statement.total_installments`` is ``0``.

The grade's monthly tuition instalment can fill the ``Fees for MM/YYYY`` row
and ``Amount Due for Month`` for such months, **display-only**: the annual
invoice already sits in the statement balance, so adding the instalment again
would double-bill the rest of the year (Grade 8 would jump from
R8,940 outstanding to R41,720).

**No production caller supplies it any more.** It does not reconcile with the
annual invoice (Grade 8: R2,980 x 12 = R35,760 against an R37,360 invoice),
so rendering it presented families with a bill they never received.
``app/services/monthly_fee.py`` and the ``grade_monthly_fee`` response field
are retained for reporting; these tests pin the helper's behaviour so the
fallback stays a conscious opt-in rather than a forgotten default.
"""

from decimal import Decimal

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
    def test_empty_month_reports_the_grade_fee(self):
        assert _monthly_amount_due(_statement(), D("2980.00")) == D("2980.00")

    def test_settled_empty_month_reports_zero(self):
        stmt = _statement(total_payments=D("2980.00"))
        assert _monthly_amount_due(stmt, D("2980.00")) == D("0")

    def test_invoice_derived_month_ignores_the_fallback(self):
        stmt = _statement(month=1, total_installments=D("37360.00"), total_payments=D("1000"))
        assert _monthly_amount_due(stmt, D("2980.00")) == D("36360.00")

    def test_default_is_zero_due_unchanged_from_before(self):
        assert _monthly_amount_due(_statement()) == D("0")

    def test_additional_charges_still_add_on_top_of_the_fallback(self):
        stmt = _statement(total_additional_charges=D("500.00"))
        assert _monthly_amount_due(stmt, D("2980.00")) == D("3480.00")
