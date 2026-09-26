"""Round-trip (PBT-02) and fail-closed tests for data contracts."""
import pytest
from hypothesis import given
from hypothesis import strategies as st

from sim import contracts

keys = st.from_regex(r"[a-z-]{1,20}:[0-9]{1,3}", fullmatch=True)
explanations = st.dictionaries(keys, st.text(max_size=200), max_size=30)
strategy_row = st.fixed_dictionaries({
    "name": st.text(min_size=1, max_size=30),
    "collisions_pct": st.floats(0, 100, allow_nan=False),
    "dv_mean_ms": st.floats(0, 5, allow_nan=False),
    "manoeuvres_per_event": st.floats(0, 5, allow_nan=False),
    "burden_gini": st.floats(0, 1, allow_nan=False),
    "escalation_pct": st.floats(0, 100, allow_nan=False),
})
results = st.fixed_dictionaries({
    "strategies": st.lists(strategy_row, max_size=5),
    "curves": st.fixed_dictionaries({k: st.lists(st.floats(-1e6, 1e6, allow_nan=False), max_size=10)
                                     for k in ("timesteps", "collision_rate", "dv_mean", "fairness_gap")}),
    "plots": st.lists(st.from_regex(r"img/plots/[a-z_]{1,10}\.png", fullmatch=True), max_size=4),
})


@given(explanations)
def test_explanations_round_trip(obj):
    assert contracts.loads("explanations", contracts.dumps("explanations", obj)) == obj


@given(results)
def test_results_round_trip(obj):
    assert contracts.loads("results", contracts.dumps("results", obj)) == obj


def test_invalid_data_is_rejected():
    with pytest.raises(contracts.ContractError):
        contracts.validate("results", {"strategies": [], "curves": {}, "plots": []})


def test_unknown_kind_rejected():
    with pytest.raises(contracts.ContractError):
        contracts.validate("nope", {})
