"""Live pair scenarios: any two catalogue objects with any allowed geometry give a valid AI-variant episode."""
from pathlib import Path

import pytest
from hypothesis import assume, given, settings, strategies as st

from sim import contracts, live_episode

POLICY = Path(__file__).resolve().parents[2] / "web" / "data" / "policy.json"
policy = contracts.read_json("policy", POLICY) if POLICY.exists() else None

obj = st.fixed_dictionaries({
    "id": st.integers(1, 99999), "name": st.from_regex(r"[A-Z0-9][A-Z0-9 \-()]{0,29}", fullmatch=True),
    "class": st.sampled_from(live_episode.CLASSES), "operator": st.from_regex(r"[A-Za-z][A-Za-z ]{0,29}", fullmatch=True)})


@pytest.mark.skipif(policy is None, reason="policy.json not built")
@settings(max_examples=20, deadline=None)
@given(obj, obj, st.floats(0, 3000), st.floats(30, 5000), st.floats(30, 5000))
def test_pair_episode_is_valid(a, b, miss, sigma0, sigma_min):
    assume(a["id"] != b["id"])
    spec = live_episode.build_spec(a, b, miss, sigma0, sigma_min)
    assert spec["encounter"]["sigma_min_m"] <= spec["encounter"]["sigma0_m"]
    ep = live_episode.run_pair(spec, policy)   # validates against the episodes contract
    assert ep["variant"] == "ai" and ep["id"] == f"live-{a['id']}-{b['id']}" and len(ep["steps"]) == 24
    assert all(ag["fuel"] == 0.0 for ag in ep["agents"] if ag["class"] == "debris")
    assert {ag["class"] for ag in ep["agents"]} == {a["class"], b["class"]}


def test_purpose_defaults():
    assert live_episode.purpose_for({"class": "debris", "name": "X DEB", "operator": "SpaceX"}) == "none"
    assert live_episode.purpose_for({"class": "autonomous", "name": "STARLINK-1", "operator": "SpaceX"}) == "commercial"
    assert live_episode.purpose_for({"class": "crewed", "name": "ISS (ZARYA)", "operator": "ISS partners"}) == "public_good"
