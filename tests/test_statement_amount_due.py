"""``Amount Due for Month`` must quote the amount actually owed.

The line used to be computed as *this month's instalment minus this month's
payments*. For a month billed by January's annual invoice the instalment is
``0`` and the grade tuition fee was substituted, so a September statement for
(1982) Hlelolwenkosi Mazibuko reported::

    grade fee 1,940 - payments 2,000 = -60

A negative "amount due" is nonsense to a parent, and it disagreed with the
two lines next to it. The school's own statement quotes a single figure —
``Amount Due for 2026`` — which is the running balance at the statement date.
All three summary lines now quote that same stored balance:

    Amount Due for Month      8,400
    Balance carried forward   8,400
    Outstanding for Year      8,400

``Statement.current_amount_due`` is set to ``closing_balance`` at generation
time, so it is the balance owed as at the statement period — exactly what the
school reports. The helper therefore takes no grade fee any more: what falls
due is whatever the statement says is owed.
"""

from decimal import Decimal

from app.api.v1.financial import _monthly_amount_due

D = Decimal


def _statement(**overrides):
    """A September 2026 statement in the shape generate_from_breakdown writes."""

    class S:
        pass

    s = S()
    s.id = "11111111-1111-4111-8111-111111111111"
    s.student_id = "22222222-2222-4222-8222-222222222222"
    s.academic_year = 2026
    s.month = 9
    s.opening_balance = D("10400.00")
    s.total_fees = D("25320.00")
    s.total_installments = D("0")
    s.total_additional_charges = D("0")
    s.total_payments = D("2000.00")
    s.closing_balance = D("8400.00")
    s.current_amount_due = D("8400.00")
    for key, value in overrides.items():
        setattr(s, key, value)
    return s


class TestAmountDueForMonth:
    def test_reports_the_amount_owed_instead_of_a_negative_split(self):
        # (1982) Mazibuko: no September invoice, R2,000 paid against a
        # R10,400 opening. The old arithmetic gave 1,940 - 2,000 = -60.
        stmt = _statement()
        assert _monthly_amount_due(stmt) == D("8400.00")

    def test_agrees_with_balance_carried_forward_and_outstanding(self):
        stmt = _statement()
        assert (
            _monthly_amount_due(stmt)
            == stmt.current_amount_due
            == stmt.closing_balance
        )

    def test_ignores_the_month_payment_that_already_reduced_the_balance(self):
        # The R2,000 September payment is already inside current_amount_due;
        # subtracting it a second time is what produced the -60.
        stmt = _statement(total_payments=D("2000.00"))
        assert _monthly_amount_due(stmt) != D("-60.00")

    def test_is_not_the_stored_installments_minus_payments(self):
        # Guards the old formula: instalments 0 + grade fee 1,940 - 2,000.
        stmt = _statement()
        assert _monthly_amount_due(stmt) != D("-60.00")

    def test_uses_the_stored_balance_whatever_the_month_shape(self):
        # Invoiced month (total_installments 0, fees on the annual invoice).
        invoiced = _statement(current_amount_due=D("5960.00"))
        assert _monthly_amount_due(invoiced) == D("5960.00")

        # A month that does carry its own instalment reports the same way.
        instalment = _statement(
            total_installments=D("2980.00"), current_amount_due=D("3200.00"),
            closing_balance=D("3200.00"),
        )
        assert _monthly_amount_due(instalment) == D("3200.00")

    def test_settled_month_reports_zero(self):
        stmt = _statement(
            opening_balance=D("0"), total_payments=D("0"),
            closing_balance=D("0"), current_amount_due=D("0"),
        )
        assert _monthly_amount_due(stmt) == D("0")

    def test_never_returns_less_than_the_zero_balance(self):
        # A statement whose stored balance is null must not report a negative.
        stmt = _statement(current_amount_due=None)
        assert _monthly_amount_due(stmt) == D("0")
