from decimal import ROUND_HALF_UP, Decimal

CENTS = Decimal("0.01")


def to_decimal(value: float | int | str | Decimal) -> Decimal:
    """Normalize any numeric input to a 2-decimal-place Decimal."""
    if isinstance(value, Decimal):
        return value.quantize(CENTS, rounding=ROUND_HALF_UP)
    return Decimal(str(value)).quantize(CENTS, rounding=ROUND_HALF_UP)


def to_float(value: Decimal) -> float:
    """Convert Decimal back to float for serialization. Use at boundaries only."""
    return float(value)


def calculate_monthly_installment(annual_amount: Decimal, months: int = 12) -> Decimal:
    return (annual_amount / months).quantize(CENTS, rounding=ROUND_HALF_UP)


def calculate_rollover(
    previous_balance: Decimal, current_due: Decimal, amount_paid: Decimal
) -> Decimal:
    remaining = previous_balance + current_due - amount_paid
    return max(Decimal("0"), remaining).quantize(CENTS, rounding=ROUND_HALF_UP)
