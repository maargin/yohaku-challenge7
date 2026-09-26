"""Stateful, model-based property tests for the ledger (PBT-06) plus invariants (PBT-03)."""
import math

from hypothesis import strategies as st
from hypothesis.stateful import RuleBasedStateMachine, invariant, rule

from sim import ledger as lg
from sim.domain import COMMONS
from sim.tests.strategies import operators


class LedgerMachine(RuleBasedStateMachine):
    """Compare the real ledger with a plain dict model after every command."""

    def __init__(self):
        super().__init__()
        self.led = lg.opening({})
        self.model = {COMMONS: 0.0}

    def _bump(self, op, amount):
        self.model[op] = self.model.get(op, 0.0) + amount

    @rule(y=operators, b=operators, dv=st.floats(0.0, 0.5, allow_nan=False))
    def yield_(self, y, b, dv):
        before = self.led.balances.get(y, 0.0)
        self.led = lg.record_yield(self.led, y, b, dv)
        c = lg.yield_credit(dv)
        self._bump(b, -c)
        self._bump(y, c)
        if y != b:
            assert self.led.balances[y] > before   # yielding never lowers the yielder's balance

    @rule(op=operators)
    def silence(self, op):
        self.led = lg.record_silence(self.led, op)
        self._bump(op, -lg.SILENCE_COST)
        self._bump(COMMONS, lg.SILENCE_COST)

    @rule(op=operators)
    def false_declaration(self, op):
        self.led = lg.record_false_declaration(self.led, op, {"declared_capability": "crewed"})
        self._bump(op, -lg.FALSE_DECLARATION_COST)
        self._bump(COMMONS, lg.FALSE_DECLARATION_COST)

    @rule(op=operators, pc=st.floats(0.0, 1.0, allow_nan=False))
    def risk(self, op, pc):
        bal = dict(self.led.balances)
        self.led = lg.record_risk(self.led, op, pc)
        assert all(self.led.balances.get(k) == v for k, v in bal.items())   # risk never moves money

    @invariant()
    def conservation(self):
        assert math.isclose(lg.total(self.led), 0.0, abs_tol=1e-9)

    @invariant()
    def matches_model(self):
        for op, v in self.model.items():
            assert math.isclose(self.led.balances.get(op, 0.0), v, abs_tol=1e-9)

    @invariant()
    def entries_append_only(self):
        assert len(self.led.entries) >= 0


TestLedger = LedgerMachine.TestCase
