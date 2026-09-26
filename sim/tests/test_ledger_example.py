"""Example-based tests for the fairness ledger (J4)."""
import pytest

from sim import ledger as lg
from sim.domain import COMMONS


def test_yield_is_paid_by_beneficiary():
    led = lg.record_yield(lg.opening({}), "Kestrel", "Legacy Launch", 0.05)
    assert led.balances["Kestrel"] == pytest.approx(0.5)
    assert led.balances["Legacy Launch"] == pytest.approx(-0.5)
    assert led.stats["Kestrel"]["manoeuvres_absorbed"] == 1
    assert lg.total(led) == pytest.approx(0.0)


def test_minimum_yield_credit():
    assert lg.yield_credit(0.0) == pytest.approx(0.1)


def test_silence_and_false_declaration_go_to_commons():
    led = lg.record_silence(lg.opening({}), "X")
    led = lg.record_false_declaration(led, "K", {"declared_capability": "crewed"})
    assert led.balances["X"] == pytest.approx(-1.0)
    assert led.balances["K"] == pytest.approx(-2.0)
    assert led.balances[COMMONS] == pytest.approx(3.0)
    assert led.entries[-1]["evidence"] == {"declared_capability": "crewed"}


def test_opening_balances_are_balanced_by_commons():
    led = lg.opening({"A": 1.5, "B": -0.5})
    assert lg.total(led) == pytest.approx(0.0)


def test_fee_discount_for_emerging_operator():
    led = lg.opening({"Amara": -2.0})
    assert lg.fee(led, "Amara", emerging=True) == pytest.approx(0.6)
    assert lg.fee(led, "Amara", emerging=False) == pytest.approx(1.2)


def test_negative_transfer_rejected():
    with pytest.raises(ValueError):
        lg.transfer(lg.opening({}), "A", "B", -1.0, "X", "bad")
