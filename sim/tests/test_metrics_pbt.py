"""Property + example tests for evaluation metrics."""
import pytest
from hypothesis import given
from hypothesis import strategies as st

from sim.metrics import gini

burdens = st.lists(st.floats(0, 10, allow_nan=False), min_size=1, max_size=50)


@given(burdens)
def test_gini_in_unit_interval(xs):
    assert 0.0 <= gini(xs) <= 1.0


@given(st.floats(0.01, 10), st.integers(1, 30))
def test_gini_zero_when_equal(v, n):
    assert gini([v] * n) == pytest.approx(0.0, abs=1e-9)


@given(burdens)
def test_gini_order_invariant(xs):
    assert gini(xs) == pytest.approx(gini(list(reversed(xs))))


def test_gini_one_carries_all():
    assert gini([0, 0, 0, 1]) == pytest.approx(0.75)


def test_gini_rejects_negative():
    with pytest.raises(ValueError):
        gini([1, -1])
