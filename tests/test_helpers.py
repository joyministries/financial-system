from decimal import Decimal

from app.core.money import calculate_monthly_installment, calculate_rollover


def test_monthly_installment():
    result = calculate_monthly_installment(Decimal("12000.00"), 12)
    assert result == Decimal("1000.00")


def test_monthly_installment_uneven():
    result = calculate_monthly_installment(Decimal("10000.00"), 12)
    assert result == Decimal("833.33")


def test_rollover_no_payment():
    result = calculate_rollover(Decimal("0"), Decimal("1000"), Decimal("0"))
    assert result == Decimal("1000.00")


def test_rollover_partial_payment():
    result = calculate_rollover(Decimal("0"), Decimal("1000"), Decimal("400"))
    assert result == Decimal("600.00")


def test_rollover_full_payment():
    result = calculate_rollover(Decimal("0"), Decimal("1000"), Decimal("1000"))
    assert result == Decimal("0.00")


def test_rollover_with_previous_balance():
    result = calculate_rollover(Decimal("500"), Decimal("1000"), Decimal("800"))
    assert result == Decimal("700.00")


def test_rollover_overpayment():
    result = calculate_rollover(Decimal("0"), Decimal("1000"), Decimal("1500"))
    assert result == Decimal("0.00")
