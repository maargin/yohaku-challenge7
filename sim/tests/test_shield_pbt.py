"""Property tests: hard triggers can never be suppressed by the policy (PBT-03)."""
from hypothesis import given
from hypothesis import strategies as st

from sim import shield
from sim.domain import Verdict

policy_outputs = st.tuples(st.one_of(st.none(), st.integers(0, 6)), st.one_of(st.none(), st.floats(0, 1)))


@given(pc=st.floats(0, 1, allow_nan=False), crewed=st.booleans(), silent=st.booleans(),
       fuel_frac=st.floats(0, 2, allow_nan=False), policy=policy_outputs)
def test_hard_conditions_always_escalate(pc, crewed, silent, fuel_frac, policy):
    action, conf = policy
    t = shield.hard_triggers(pc=pc, crewed_involved=crewed, silent=silent, fuel_cost_frac=fuel_frac,
                             policy_confidence=conf, policy_conflict=action is not None and action != 1)
    codes = {x.code for x in t}
    if pc > shield.PC_HIGH:
        assert "PC_HIGH" in codes
    if crewed:
        assert "CREWED" in codes
    if silent:
        assert "SILENT" in codes
    if fuel_frac > shield.FUEL_COST_FRAC:
        assert "FUEL_COST" in codes
    if (pc > shield.PC_HIGH or crewed):
        assert shield.needs_human(t)


@given(policy_action=st.one_of(st.none(), st.integers(0, 6)), verdict_action=st.integers(0, 6))
def test_rules_always_win(policy_action, verdict_action):
    final, conflict = shield.arbitrate(policy_action, verdict_action)
    assert final == verdict_action
    assert conflict == (policy_action is not None and policy_action != verdict_action)


@given(choice=st.sampled_from(shield.HUMAN_CHOICES))
def test_after_commit_yielder_never_changes_except_stop(choice):
    v = Verdict("a", "b", "R6", "x")
    y, s, _ = shield.human_decision(choice, v, is_committed=True)
    if choice != "stop":
        assert (y, s) == ("a", "b")
