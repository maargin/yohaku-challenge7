"""Example-based tests for the handshake protocol (O2)."""
import pytest

from sim import handshake as hs


def m(i, frm, to, typ, t=-200.0):
    return hs.Message(f"e:{i}", t, frm, to, typ, "")


def test_commit_requires_both_executed():
    s = hs.apply_all(hs.HandshakeState(), [m(1, "a", "b", "PROPOSE"), m(2, "b", "a", "PROPOSE"),
                                           m(3, "a", "b", "ACK"), m(4, "b", "a", "DO-NOT-MOVE"),
                                           m(5, "a", "b", "EXECUTED")])
    assert not hs.committed(s, "a", "b")
    s = hs.apply(s, m(6, "b", "a", "EXECUTED"))
    assert hs.committed(s, "a", "b")


def test_duplicate_message_is_ignored():
    s1 = hs.apply(hs.HandshakeState(), m(1, "a", "b", "PROPOSE"))
    assert hs.apply(s1, m(1, "a", "b", "PROPOSE")) == s1


def test_silence_after_window():
    s = hs.apply(hs.HandshakeState(), m(1, "a", "b", "PROPOSE", t=-240))
    assert not hs.is_silent(s, "b", -240, -220)
    assert hs.is_silent(s, "b", -240, -210)
    assert not hs.is_silent(s, "a", -240, -100)


def test_new_round_clears_commit_but_keeps_history():
    s = hs.apply_all(hs.HandshakeState(), [m(1, "a", "b", "EXECUTED"), m(2, "b", "a", "EXECUTED")])
    r = hs.new_round(s)
    assert not hs.committed(r, "a", "b") and r.seen == s.seen


def test_unknown_type_rejected():
    with pytest.raises(ValueError):
        hs.apply(hs.HandshakeState(), m(1, "a", "b", "HELLO"))
