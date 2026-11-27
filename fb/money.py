"""Money arithmetic. All sums and products are done in Decimal and rounded half-up to cents.

Binary floats cannot represent most cent values (0.1 + 0.2 != 0.3), so adding thousands of
invoice lines as floats drifts. Storage is still a double column and the JSON API still returns
numbers; the rule here is that nothing is added or multiplied as a float. Next step for a
real ledger: NUMERIC(12,2) or integer cents in the database.
"""

from collections.abc import Iterable
from decimal import ROUND_HALF_UP, Decimal

CENT = Decimal("0.01")
ZERO = Decimal("0")


def dec(x) -> Decimal:
    # str() first: Decimal(0.1) would carry the float's binary error into the result
    return Decimal(str(x))


def cents(x) -> Decimal:
    return dec(x).quantize(CENT, rounding=ROUND_HALF_UP)


def line_total(qty, unit_price) -> Decimal:
    return cents(dec(qty) * dec(unit_price))


def money_sum(values: Iterable) -> Decimal:
    return sum((cents(v) for v in values), ZERO)


def as_float(d: Decimal) -> float:
    return float(cents(d))
