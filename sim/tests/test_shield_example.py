"""Example-based tests for the safety shield (O3)."""
import pytest

from sim import shield
from sim.domain import Verdict


def v(y="kst", s="station"):
    return Verdict(y, s, "R3", "a crewed vehicle holds course")


def test_crewed_requires_human_approval():
    t = shield.hard_triggers(pc=1e-5, crewed_involved=True)
    assert [x.code for x in t] == ["CREWED"] and shield.level(t) == "L2" and shield.needs_human(t)


def test_no_trigger_means_full_autonomy():
    assert shield.level(shield.hard_triggers(pc=1e-6, crewed_involved=False)) == "L4"


def test_silent_counterpart_notifies_but_acts():
    t = shield.hard_triggers(pc=1e-5, crewed_involved=False, silent=True)
    assert shield.level(t) == "L3" and not shield.needs_human(t)


def test_rules_beat_policy():
    final, conflict = shield.arbitrate(policy_action=0, verdict_action=1)
    assert final == 1 and conflict


def test_override_before_commit_swaps():
    assert shield.human_decision("override", v(), is_committed=False) == ("station", "kst", "OVERRIDDEN")


def test_override_after_commit_starts_new_round():
    assert shield.human_decision("override", v(), is_committed=True) == ("kst", "station", "NEW_ROUND")


def test_override_cannot_make_debris_yield():
    out = shield.human_decision("override", v("sat", "deb"), is_committed=False, stand_on_can_move=False)
    assert out == ("sat", "deb", "OVERRIDE_NOT_POSSIBLE")


def test_stop_holds_both():
    assert shield.human_decision("stop", v(), is_committed=False) == (None, None, "STOPPED")


def test_unknown_choice_rejected():
    with pytest.raises(ValueError):
        shield.human_decision("maybe", v(), is_committed=False)
