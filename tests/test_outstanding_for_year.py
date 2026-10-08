"""Regression tests for the statement "Outstanding for Year" figure.

The figure was fed straight from ``current_amount_due``, which is the closing
balance: everything still unpaid *including* the prior-year carried-in balance.
Two things contradicted that:

* the whole-school outstanding column's tooltip promises the opposite —
  "excluding last year's carry-in";
* ``Amount Due for Month`` already subtracts the carry-in
  (:func:`app.services.statement.amount_due_for_month`).

So a family could see R1,940 of last year's debt presented as this year's
outstanding, and the two headline figures on the same statement disagreed
about whether that R1,940 counted.

``_outstanding_for_year`` strips the prior-year carry-in so that

    billed excluding carry-in − Amount Paid to date == Outstanding for Year

holds exactly — every B/F invoice in the database bills the carry-in as its
own January invoice, so the carry-in really is inside the closing balance and
subtrahend is safe.
"""

from decimal import Decimal

from app.api.v1.financial import _outstanding_for_year


def _statement(current_amount_due="8400.00", brought_forward="1940.00"):
    class _S:
        pass

    s = _S()
    s.current_amount_due = Decimal(current_amount_due)
    s.brought_forward = Decimal(brought_forward)
    return s


class TestOutstandingForYearExcludesCarryIn:
    def test_prior_year_carry_in_is_excluded(self):
        """Student 1982: closing 8,400 of which 1,940 is last year's balance."""
        assert _outstanding_for_year(_statement()) == Decimal("6460.00")

    def test_without_carry_in_the_figure_is_unchanged(self):
        assert (
            _outstanding_for_year(_statement(brought_forward="0.00")) == Decimal("8400.00")
        )

    def test_missing_carry_in_attribute_treated_as_zero(self):
        class _NoBF:
            current_amount_due = Decimal("8400.00")

        assert _outstanding_for_year(_NoBF()) == Decimal("8400.00")

    def test_never_goes_negative_when_overpaid(self):
        """Carry-in larger than the closing balance must floor at zero."""
        assert (
            _outstanding_for_year(
                _statement(current_amount_due="500.00", brought_forward="1940.00")
            )
            == Decimal("0.00")
        )


class TestOutstandingReconcilesWithCarryIn:
    def test_outstanding_plus_carry_in_is_the_closing_balance(self):
        s = _statement()
        assert _outstanding_for_year(s) + s.brought_forward == s.current_amount_due
