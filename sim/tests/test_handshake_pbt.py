"""Property-based tests for the handshake (PBT-04 idempotence, PBT-03 invariants)."""
from hypothesis import given

from sim import handshake as hs
from sim.tests.strategies import messages


@given(messages())
def test_replaying_the_log_changes_nothing(msgs):
    once = hs.apply_all(hs.HandshakeState(), msgs)
    assert hs.apply_all(once, msgs) == once


@given(messages())
def test_each_message_idempotent(msgs):
    s = hs.HandshakeState()
    for msg in msgs:
        s1 = hs.apply(s, msg)
        assert hs.apply(s1, msg) == s1
        s = s1


@given(messages())
def test_commit_implies_both_executed_seen(msgs):
    s = hs.apply_all(hs.HandshakeState(), msgs)
    if hs.committed(s, "sat-a", "sat-b"):
        executed_senders = {m.frm for m in msgs if m.type == "EXECUTED"}
        assert {"sat-a", "sat-b"} <= executed_senders
