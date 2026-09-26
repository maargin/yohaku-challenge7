"""Property + example tests for the illustrative physics (BR-5)."""
import pytest
from hypothesis import given
from hypothesis import strategies as st

from sim import physics
from sim.tests.strategies import encounter


@given(encounter)
def test_pc_in_unit_interval(e):
    assert 0.0 <= physics.pc(e["miss_m"], e["sigma_m"]) <= 1.0


@given(encounter, st.floats(0.0, 3000.0, allow_nan=False))
def test_pc_falls_with_miss_distance(e, extra):
    assert physics.pc(e["miss_m"] + extra, e["sigma_m"]) <= physics.pc(e["miss_m"], e["sigma_m"])


@given(st.floats(-240, 0), st.floats(100, 3000), st.floats(10, 100))
def test_sigma_between_bounds(t, s0, smin):
    s = physics.sigma_at(t, s0, smin)
    assert smin - 1e-9 <= s <= s0 + 1e-9


def test_early_small_burn_beats_late_burn():
    early = physics.separation_gain_m(0.02, 230)
    late = physics.separation_gain_m(0.02, 30)
    assert early > late > 0
    assert physics.separation_gain_m(0.02, 230) == pytest.approx(3 * 0.02 * 230 * 60 * 0.6)


def test_sigma_must_be_positive():
    with pytest.raises(ValueError):
        physics.pc(10.0, 0.0)
