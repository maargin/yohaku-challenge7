"""Live server: accepted payloads give safety-layer wording; anything out of range is rejected (fail closed)."""
import json

import pytest
from hypothesis import given, strategies as st

from sim import live_server as ls

agent = st.fixed_dictionaries({
    "name": st.text(max_size=40), "capability": st.sampled_from(ls.CAPABILITIES), "purpose": st.sampled_from(ls.PURPOSES),
    "fuel": st.floats(0, 1), "ledger": st.floats(-5, 5), "silent": st.booleans()})
encounter = st.fixed_dictionaries({
    "miss_m": st.floats(-3000, 3000), "offset_m": st.floats(0, 500), "sigma0_m": st.floats(30, 5000), "sigma_min_m": st.floats(30, 5000)})
burn = st.fixed_dictionaries({"agent": st.sampled_from([0, 1]), "t_min": st.floats(-240, 0), "dv_ms": st.floats(0, 1)})
intervention = st.fixed_dictionaries({"agent": st.sampled_from([0, 1]), "t_min": st.floats(-240, 0), "text": st.sampled_from(ls.INTERVENTIONS)})
outcome = st.fixed_dictionaries({
    "collision": st.booleans(), "final_miss_m": st.floats(0, 1e5), "yielder": st.sampled_from([None, 0, 1]), "human": st.booleans(),
    "reasons": st.lists(st.sampled_from(ls.REASONS), max_size=3), "burns": st.lists(burn, max_size=24),
    "interventions": st.lists(intervention, max_size=24)})
payload = st.fixed_dictionaries({"agents": st.tuples(agent, agent).map(list), "encounter": encounter, "outcome": outcome})
bad_value = st.one_of(
    st.floats(min_value=1e6, allow_nan=False, allow_infinity=False), st.floats(max_value=-1e6, allow_nan=False, allow_infinity=False),
    st.just(None), st.just(True), st.text(min_size=1, max_size=5).filter(lambda s: s not in ls.CAPABILITIES + ls.INTERVENTIONS))


@given(payload)
def test_valid_payloads_give_safety_layer_wording(p):
    v = ls.validate(p)
    f = ls.facts(v)
    text = ls.template(f)
    assert 0 < len(text) <= 600
    blob = json.dumps(f) + text
    assert not ls.RULE_WORD.search(blob) and not ls.RULE_CODE.search(blob)
    assert all(a["name"] and len(a["name"]) <= ls.NAME_MAX for a in v["agents"])


@given(payload, st.sampled_from(["fuel", "ledger", "miss_m", "sigma0_m", "final_miss_m", "capability", "text"]), bad_value)
def test_out_of_range_field_is_rejected(p, field, bad):
    p = json.loads(json.dumps(p))
    if field in ("fuel", "capability"):
        p["agents"][0][field] = bad
    elif field == "ledger":
        p["agents"][1][field] = bad
    elif field in ("miss_m", "sigma0_m"):
        p["encounter"][field] = bad
    elif field == "final_miss_m":
        p["outcome"][field] = bad
    else:
        p["outcome"]["interventions"] = [{"agent": 0, "t_min": -100.0, "text": bad}]
    with pytest.raises(ValueError):
        ls.validate(p)


def test_non_object_payloads_are_rejected():
    for p in (None, [], "x", 3, {"agents": [{}], "encounter": {}}, {"agents": [{}, {}], "encounter": {}}):
        with pytest.raises(ValueError):
            ls.validate(p)


DEBRIS = {"name": "Fragment", "capability": "debris", "purpose": "none", "fuel": 0.0, "ledger": 0.0, "silent": False}
SAT = {"name": "Sat", "capability": "manoeuvrable", "purpose": "commercial", "fuel": 0.6, "ledger": 0.0, "silent": False}
HEAD_ON = {"miss_m": 8.0, "offset_m": 5.0, "sigma0_m": 1200.0, "sigma_min_m": 100.0}


def _random_actor():
    torch = pytest.importorskip("torch")
    from sim.train_mappo import Actor
    torch.manual_seed(1)
    return Actor().eval(), (lambda x: x)


def test_run_live_two_debris_head_on_collide():
    from sim.live_run import run_live
    actor, norm = _random_actor()
    out = run_live({"agents": [DEBRIS, dict(DEBRIS, name="Other")], "encounter": HEAD_ON}, actor, norm)
    assert out["collision"] and len(out["steps"]) == 24
    assert all(d == 0 for s in out["steps"] for d in s["dv"])
    assert all(w is None for s in out["steps"] for w in s["why"])


def test_run_live_manoeuvrable_pair_is_saved_by_the_safety_layer():
    from sim.live_run import run_live
    actor, norm = _random_actor()
    out = run_live({"agents": [SAT, dict(SAT, name="Sat B", capability="autonomous")], "encounter": HEAD_ON}, actor, norm)
    assert not out["collision"]
    assert any(d > 0 for s in out["steps"] for d in s["dv"])
    assert out["human"] and "high collision probability" in out["reasons"]
    for s in out["steps"]:
        assert len(s["probs"]) == 2 and all(len(row) == 7 for row in s["probs"])
        assert all(w is None or w in ls.INTERVENTIONS for w in s["why"])
