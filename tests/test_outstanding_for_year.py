"""``Outstanding for Year`` must show the fee instalments not yet due.

``amount_due_for_month`` sets the same quantity aside as ``not_yet_due``, so
the three printed lines stay distinct::

    Outstanding for Year       = fee x months not yet due
    Amount Due for Month       = balance - that - prior-year carry-in
    Balance carried forward    = the account's closing balance
"""

from decimal import Decimal

from app.api.v1.financial import _outstanding_for_year


def _statement(month=10, current_amount_due="8400.00", brought_forward="1940.00"):
    class _S:
        pass

    s = _S()
    s.month = month
    s.current_amount_due = Decimal(current_amount_due)
    s.brought_forward = Decimal(brought_forward)
    return s


class TestOutstandingIsRemainingInstalments:
    def test_october_shows_november_and_december(self):
        """Right now (October 2026) that is two Grade 2 instalments."""
        assert _outstanding_for_year(_statement(month=10), Decimal("1940.00")) == Decimal(
            "3880.00"
        )

    def test_december_is_zero(self):
        """Every instalment has fallen due — nothing left to collect."""
        assert _outstanding_for_year(_statement(month=12), Decimal("1940.00")) == Decimal("0")

    def test_january_shows_eleven_months(self):
        assert _outstanding_for_year(_statement(month=1), Decimal("1940.00")) == Decimal(
            "21340.00"
        )

    def test_mid_year_is_the_remaining_months(self):
        assert _outstanding_for_year(_statement(month=6), Decimal("1940.00")) == Decimal(
            "11640.00"
        )

    def test_unresolved_fee_is_zero(self):
        assert _outstanding_for_year(_statement(month=10), Decimal("0")) == Decimal("0")

    def test_missing_month_falls_back_to_the_whole_year(self):
        """Mirrors amount_due_for_month, which treats a missing month as 0."""
        assert _outstanding_for_year(_statement(month=None), Decimal("1940.00")) == Decimal(
            "23280.00"
        )


class TestOutstandingIgnoresTheAccountBalance:
    def test_closing_balance_does_not_leak_in(self):
        """A R8,400 balance must still print two instalments, not R8,400."""
        assert (
            _outstanding_for_year(
                _statement(current_amount_due="8400.00"), Decimal("1940.00")
            )
            == Decimal("3880.00")
        )

    def test_prior_year_carry_in_does_not_leak_in(self):
        assert (
            _outstanding_for_year(
                _statement(brought_forward="1940.00"), Decimal("1940.00")
            )
            == Decimal("3880.00")
        )
