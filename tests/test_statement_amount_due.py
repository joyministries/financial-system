"""``Amount Due for Month`` must quote what is actually overdue.

It sets aside the instalments that have not fallen due yet and the prior
year's carry-in, so the arrears figure stays distinct from both
``Balance carried forward`` and ``Outstanding for Year``::

    amount_due = closing - (fee x months not yet due) - brought_forward
"""

from decimal import Decimal

from app.api.v1.financial import _monthly_amount_due

D = Decimal

#: Monthly fee used by the fixtures, and the prior-year carry-in.
GRADE_2_FEE = D("1940.00")
BROUGHT_FORWARD = D("1940.00")


def _statement(**overrides):
    """October 2026 statement in the shape generate_from_breakdown writes."""

    class S:
        pass

    s = S()
    s.id = "11111111-1111-4111-8111-111111111111"
    s.student_id = "22222222-2222-4222-8222-222222222222"
    s.academic_year = 2026
    s.month = 10
    s.opening_balance = D("8400.00")
    s.total_fees = D("25320.00")
    s.total_installments = D("0")
    s.total_additional_charges = D("0")
    s.total_payments = D("16920.00")
    s.closing_balance = D("8400.00")
    s.current_amount_due = D("8400.00")
    s.brought_forward = BROUGHT_FORWARD
    for key, value in overrides.items():
        setattr(s, key, value)
    return s


class TestAmountDueForMonth:
    def test_reports_2580_for_1982_in_october(self):
        # The school's own figures: billed 25,320, paid 16,920, fee 1,940,
        # ten months due, brought forward 1,940.
        stmt = _statement()
        assert _monthly_amount_due(stmt, GRADE_2_FEE) == D("2580.00")

    def test_is_not_the_whole_running_balance(self):
        # "Amount Due for Month" and "Outstanding for Year" must differ:
        # 8,400 still unpaid, but only 2,580 of it is actually overdue.
        stmt = _statement()
        assert _monthly_amount_due(stmt, GRADE_2_FEE) != stmt.current_amount_due
        assert stmt.current_amount_due == D("8400.00")

    def test_sets_aside_the_instalments_not_yet_due(self):
        # November and December (2 x 1,940 = 3,880) have not fallen due yet.
        # Without them the figure would be 8,400 - 1,940 = 6,460.
        stmt = _statement()
        with_only_bf_removed = stmt.current_amount_due - BROUGHT_FORWARD
        assert with_only_bf_removed == D("6460.00")
        assert _monthly_amount_due(stmt, GRADE_2_FEE) == D("2580.00")

    def test_excludes_the_prior_year_carry_in(self):
        # The R1,940 carried in from 2025 sits in the balance but was not
        # charged this year, so it is not this year's arrears.
        with_bf = _monthly_amount_due(_statement(), GRADE_2_FEE)
        without_bf = _monthly_amount_due(
            _statement(brought_forward=D("0")), GRADE_2_FEE
        )
        assert without_bf == D("4520.00")
        assert without_bf - with_bf == BROUGHT_FORWARD

    def test_never_reports_a_negative(self):
        # A family that has paid ahead must not be shown a negative amount.
        stmt = _statement(
            current_amount_due=D("1000.00"),
            closing_balance=D("1000.00"),
            total_payments=D("24320.00"),
        )
        assert _monthly_amount_due(stmt, GRADE_2_FEE) == D("0")

    def test_settled_month_reports_zero(self):
        stmt = _statement(
            opening_balance=D("0"), total_payments=D("25320.00"),
            closing_balance=D("0"), current_amount_due=D("0"),
            brought_forward=D("0"),
        )
        assert _monthly_amount_due(stmt, GRADE_2_FEE) == D("0")

    def test_is_not_the_month_installment_minus_the_month_payments(self):
        # Guards the old formula that produced -60 on this student's
        # September statement: 1,940 - 2,000.
        stmt = _statement(month=9, total_payments=D("2000.00"))
        assert _monthly_amount_due(stmt, GRADE_2_FEE) != D("-60.00")
        assert _monthly_amount_due(stmt, GRADE_2_FEE) >= D("0")

    def test_a_statement_without_a_carry_in_reports_the_fee_overdue_only(self):
        # No prior-year balance: overdue = fees billed this year that are due,
        # minus what has been paid.
        stmt = _statement(
            brought_forward=D("0"), current_amount_due=D("19400.00"),
            closing_balance=D("19400.00"), total_payments=D("5920.00"),
            total_fees=D("25320.00"),
        )
        # 19,400 - 3,880 (Nov, Dec) = 15,520 overdue this year.
        assert _monthly_amount_due(stmt, GRADE_2_FEE) == D("15520.00")

    def test_a_statement_missing_the_column_falls_back_to_zero(self):
        # Stubs (and rows written before the column existed) without the
        # attribute must not raise.
        stmt = _statement()
        del stmt.brought_forward
        assert _monthly_amount_due(stmt, GRADE_2_FEE) == D("4520.00")

    def test_a_late_in_the_year_month_reports_more_than_an_early_one(self):
        # October's instalment has fallen due where September's had not, so
        # the arrears grow by one fee (1,940) even though nothing moved.
        sept = _monthly_amount_due(_statement(month=9), GRADE_2_FEE)
        oct_ = _monthly_amount_due(_statement(month=10), GRADE_2_FEE)
        assert oct_ - sept == GRADE_2_FEE
