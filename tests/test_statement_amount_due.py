"""``Amount Due for Month`` = the month's fee + the balance carried forward."""

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
    def test_adds_the_fee_to_the_balance_carried_forward(self):
        stmt = _statement()
        assert _monthly_amount_due(stmt, GRADE_2_FEE) == D("10340.00")

    def test_a_zero_balance_reports_the_fee_alone(self):
        stmt = _statement(
            opening_balance=D("0"),
            total_payments=D("25320.00"),
            closing_balance=D("0"),
            current_amount_due=D("0"),
            brought_forward=D("0"),
        )
        assert _monthly_amount_due(stmt, GRADE_2_FEE) == GRADE_2_FEE

    def test_an_unresolved_fee_reports_the_balance_alone(self):
        stmt = _statement()
        assert _monthly_amount_due(stmt, D("0")) == stmt.current_amount_due

    def test_never_reports_zero_while_money_is_owed(self):
        stmt = _statement(
            closing_balance=D("100.00"),
            current_amount_due=D("100.00"),
            brought_forward=D("0"),
        )
        assert _monthly_amount_due(stmt, GRADE_2_FEE) == D("2040.00")

    def test_a_receipt_lowers_it_by_exactly_that_amount(self):
        before = _monthly_amount_due(_statement(), GRADE_2_FEE)
        after = _monthly_amount_due(
            _statement(closing_balance=D("7400.00"), current_amount_due=D("7400.00")),
            GRADE_2_FEE,
        )
        assert before - after == D("1000.00")

    def test_the_prior_year_carry_in_is_not_subtracted(self):
        with_bf = _monthly_amount_due(_statement(), GRADE_2_FEE)
        without_bf = _monthly_amount_due(
            _statement(brought_forward=D("0")), GRADE_2_FEE
        )
        assert with_bf == without_bf

    def test_never_reports_a_negative(self):
        stmt = _statement(
            current_amount_due=D("1000.00"),
            closing_balance=D("1000.00"),
            total_payments=D("24320.00"),
        )
        assert _monthly_amount_due(stmt, GRADE_2_FEE) >= D("0")
