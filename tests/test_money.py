from decimal import Decimal

from fb.money import as_float, cents, line_total, money_sum
from fb.pdf import total


def test_float_drift_does_not_leak_into_totals():
    assert 0.1 + 0.2 != 0.3  # the bug this module exists to avoid
    assert money_sum([0.1, 0.2]) == Decimal("0.30")
    assert as_float(money_sum([0.1] * 10)) == 1.0


def test_line_totals_round_half_up_to_cents():
    assert line_total(3, 0.335) == Decimal("1.01")
    assert line_total(1.5, 19.99) == Decimal("29.99")  # 29.985 rounds up, not to even
    assert cents(2.675) == Decimal("2.68")  # float 2.675 is 2.67499999... in binary


def test_invoice_total_sums_rounded_lines_exactly():
    items = [{"qty": 3, "unit_price": 0.335}, {"qty": 1.5, "unit_price": 19.99}]
    assert total(items) == 31.0
    many = [{"qty": 1, "unit_price": 0.1}] * 1000
    assert total(many) == 100.0
