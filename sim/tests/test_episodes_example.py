"""Example-based tests: every story scenario plays out as specified (O1–O3, J4, J7)."""
import math

import pytest

from sim import contracts
from sim.episodes import run_episode
from sim.make_web_data import build_episodes, classify, load_specs

SPECS = {s["id"]: s for s in load_specs()}


def verdict_of(ep):
    return next(s["verdict"] for s in ep["steps"] if s.get("verdict"))


def escalations(ep):
    return [s["escalation"] for s in ep["steps"] if s["escalation"]]


def msg_types(ep):
    return [m["type"] for s in ep["steps"] for m in s["messages"]]


def test_all_episodes_validate():
    contracts.validate("episodes", build_episodes(list(SPECS.values())))


@pytest.mark.parametrize("sid", sorted(SPECS))
def test_ledgers_balance(sid):
    ep = run_episode(SPECS[sid], "rules")
    assert math.isclose(sum(ep["outcome"]["ledger_after"].values()), 0.0, abs_tol=1e-6)


def test_aeolus_system_world_handshake_and_early_burn():
    ep = run_episode(SPECS["aeolus-2019"], "rules")
    assert verdict_of(ep)["yielder"] == "starlink-44"
    assert {"PROPOSE", "ACK", "DO-NOT-MOVE", "EXECUTED"} <= set(msg_types(ep))
    burn_t = next(s["t_min"] for s in ep["steps"] if s["actions"]["starlink-44"]["action"] == 1)
    assert burn_t <= -200


def test_aeolus_email_world_has_no_handshake_and_late_burn():
    ep = run_episode(SPECS["aeolus-2019"], "scripted")
    assert msg_types(ep) == []
    assert ep["outcome"]["dv_ms"]["aeolus"] > 0 and ep["outcome"]["dv_ms"]["starlink-44"] == 0
    assert any("paging" in s.get("note", "") for s in ep["steps"])


def test_crewed_escalates_with_three_branches():
    ep = run_episode(SPECS["crewed-vs-commercial"], "rules")
    assert escalations(ep)[0]["trigger"] == "CREWED" and escalations(ep)[0]["level"] == "L2"
    step = next(s for s in ep["steps"] if "branches" in s)
    assert set(step["branches"]) == {"approve", "override", "stop"}


def test_crewed_stop_branch_means_nobody_burns():
    ep = run_episode(SPECS["crewed-vs-commercial"], "rules", human_choice="stop", with_branches=False)
    assert all(v == 0 for v in ep["outcome"]["dv_ms"].values())


def test_crewed_override_before_commit_swaps_yielder():
    ep = run_episode(SPECS["crewed-vs-commercial"], "rules", human_choice="override", with_branches=False)
    assert ep["outcome"]["dv_ms"]["station"] > 0 and ep["outcome"]["dv_ms"]["kst-2210"] == 0


def test_debris_owner_pays():
    ep = run_episode(SPECS["debris-vs-sat"], "rules")
    led = ep["outcome"]["ledger_after"]
    assert led["Kestrel Constellation"] > 0 > led["Legacy Launch Co"]


def test_low_fuel_cubesat_protected():
    ep = run_episode(SPECS["cubesat-low-fuel"], "rules")
    assert verdict_of(ep)["rule"] == "R4" and ep["outcome"]["dv_ms"]["amr-cube"] == 0


def test_silent_counterpart_penalised_and_other_acts():
    ep = run_episode(SPECS["silent-counterpart"], "rules")
    assert verdict_of(ep)["yielder"] == "sci-ocean"
    assert escalations(ep)[0]["trigger"] == "SILENT"
    assert ep["outcome"]["ledger_after"]["Silent Operator X"] < -1.5
    assert all(m["from"] != "opx-17" for s in ep["steps"] for m in s["messages"])


def test_false_declaration_recorded():
    ep = run_episode(SPECS["false-declaration"], "rules")
    assert verdict_of(ep)["yielder"] == "kst-4102"
    assert ep["outcome"]["ledger_after"]["commons"] >= 2.0


def test_twins_tiebreak_single_yielder():
    ep = run_episode(SPECS["twins-tiebreak"], "rules")
    moved = [k for k, v in ep["outcome"]["dv_ms"].items() if v > 0]
    assert moved == ["sci-ocean"] and verdict_of(ep)["rule"] == "R8c"


def test_late_override_starts_new_round():
    ep = run_episode(SPECS["late-override"], "rules")
    assert any("new handshake round" in s.get("note", "") for s in ep["steps"])
    assert msg_types(ep).count("PROPOSE") >= 4


@pytest.mark.parametrize("name,cls", [("ISS (ZARYA)", "crewed"), ("ISS DEB", "debris"), ("STARLINK-1007", "autonomous"),
                                      ("COSMOS 2251 DEB", "debris"), ("SL-16 R/B", "debris"), ("SENTINEL-2A", "manoeuvrable"),
                                      ("", "manoeuvrable")])
def test_classification(name, cls):
    assert classify(name) == cls
