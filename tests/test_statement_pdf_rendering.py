"""Statement PDF rendering rules for structural rows and the summary block.

Two placeholder artefacts were printing on generated statements:

* ``Balance brought forward`` rendered ``R 0.00`` in the Credit column for any
  student who started the year owing nothing, and
* ``Amount Due for Month`` rendered ``R 0.00`` for every month billed through
  January's annual invoice (February..December), which by definition has no
  instalment of its own.

Both now print nothing at all, so a figure on a statement always means money
is actually owed or was actually paid.
"""

from decimal import Decimal

from app.services.pdf import _statement_row_amounts, _stmt_total_rows

D = Decimal
PAID = D("24080.00")


def _structural(description, balance, bold=True):
    return {"description": description, "balance": balance, "bold": bold}


class TestStructuralRowAmounts:
    def test_opening_row_with_no_balance_prints_nothing(self):
        assert _statement_row_amounts(_structural("Balance brought forward", D("0"))) == (
            None,
            None,
        )

    def test_opening_row_owes_money_debits_the_balance(self):
        assert _statement_row_amounts(_structural("Balance brought forward", D("8940"))) == (
            D("8940"),
            None,
        )

    def test_opening_row_in_credit_shows_the_credit(self):
        assert _statement_row_amounts(_structural("Balance brought forward", D("-1500"))) == (
            None,
            D("1500"),
        )

    def test_closing_row_never_prints_amounts(self):
        assert _statement_row_amounts(_structural("Balance carried forward", D("8940"))) == (
            None,
            None,
        )

    def test_transaction_rows_pass_through_untouched(self):
        assert _statement_row_amounts(
            {"description": "Fees for 01/2026", "debit": D("37360.00"), "credit": None}
        ) == (D("37360.00"), None)
        assert _statement_row_amounts(
            {"description": "Payment — bank_transfer", "debit": None, "credit": D("2980.00")}
        ) == (None, D("2980.00"))

    def test_referenceless_payment_mislabeled_brought_forward_is_not_structural(self):
        # A payment with no reference number reuses the "Balance brought
        # forward" wording but is not bold, so it must keep its credit.
        row = {
            "description": "Balance brought forward",
            "debit": None,
            "credit": D("500.00"),
            "bold": False,
        }
        assert _statement_row_amounts(row) == (None, D("500.00"))


class TestSummaryRows:
    def test_zero_monthly_due_is_omitted_entirely(self):
        labels = [label for label, _ in _stmt_total_rows(D("0"), PAID, D("13280.00"))]
        assert "Amount Due for Month" not in labels
        assert labels == ["Amount Paid to date", "Outstanding for Year"]

    def test_settled_month_with_a_credit_balance_is_also_omitted(self):
        labels = [label for label, _ in _stmt_total_rows(D("-2980.00"), PAID)]
        assert "Amount Due for Month" not in labels

    def test_money_owed_keeps_the_line(self):
        rows = dict(_stmt_total_rows(D("2980.00"), PAID, D("13280.00")))
        assert rows["Amount Due for Month"] == D("2980.00")

    def test_paid_and_year_rows_are_always_present(self):
        assert dict(_stmt_total_rows(D("0"), PAID))["Amount Paid to date"] == PAID

    def test_year_row_is_optional(self):
        assert "Outstanding for Year" not in dict(_stmt_total_rows(D("0"), PAID))
