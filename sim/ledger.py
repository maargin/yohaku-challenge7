"""Fairness ledger (B5, BR-3): double-entry, append-only, with a commons account.

Every credit has an equal debit, so all balances (commons included) always sum to zero.
Functions return a new Ledger; nothing is mutated in place.
"""
import copy
from dataclasses import dataclass, field
from typing import Dict, List

from .domain import COMMONS

DV_REF = 0.1          # m/s per credit
MIN_YIELD_CREDIT = 0.1
SILENCE_COST = 1.0
FALSE_DECLARATION_COST = 2.0
STAT_KEYS = ("dv_spent_ms", "manoeuvres_absorbed", "risk_contributed", "debris_legacy",
             "silences", "false_declarations")


@dataclass
class Ledger:
    balances: Dict[str, float] = field(default_factory=lambda: {COMMONS: 0.0})
    stats: Dict[str, Dict[str, float]] = field(default_factory=dict)
    entries: List[dict] = field(default_factory=list)


def _clone(ledger):
    return copy.deepcopy(ledger)


def _ensure(ledger, operator):
    ledger.balances.setdefault(operator, 0.0)
    ledger.balances.setdefault(COMMONS, 0.0)
    ledger.stats.setdefault(operator, {k: 0.0 for k in STAT_KEYS})


def opening(balances):
    """Create a ledger whose opening balances are balanced by the commons account."""
    led = Ledger()
    for op, bal in sorted(balances.items()):
        if op == COMMONS:
            continue
        _ensure(led, op)
        led.balances[op] += float(bal)
        led.balances[COMMONS] -= float(bal)
        led.entries.append({"t_min": None, "kind": "OPENING", "operator": op, "amount": float(bal),
                            "reason": "opening balance", "evidence": None})
    return led


def transfer(ledger, debit_op, credit_op, amount, kind, reason, t_min=None, evidence=None):
    if amount < 0:
        raise ValueError("amount must be non-negative")
    led = _clone(ledger)
    _ensure(led, debit_op)
    _ensure(led, credit_op)
    led.balances[debit_op] -= amount
    led.balances[credit_op] += amount
    led.entries.append({"t_min": t_min, "kind": kind, "operator": credit_op, "counterparty": debit_op,
                        "amount": amount, "reason": reason, "evidence": evidence})
    return led


def yield_credit(dv_ms):
    return max(MIN_YIELD_CREDIT, float(dv_ms) / DV_REF)


def record_yield(ledger, yielder_op, beneficiary_op, dv_ms, t_min=None):
    """The yielder earns credit, paid by the operator that benefited (polluter pays for debris)."""
    c = yield_credit(dv_ms)
    led = transfer(ledger, beneficiary_op, yielder_op, c, "YIELD", "yielded to avoid a collision", t_min)
    led.stats[yielder_op]["dv_spent_ms"] += float(dv_ms)
    led.stats[yielder_op]["manoeuvres_absorbed"] += 1
    return led


def record_silence(ledger, operator, t_min=None):
    led = transfer(ledger, operator, COMMONS, SILENCE_COST, "SILENCE", "no handshake within the window", t_min)
    led.stats[operator]["silences"] += 1
    return led


def record_false_declaration(ledger, operator, evidence, t_min=None):
    led = transfer(ledger, operator, COMMONS, FALSE_DECLARATION_COST, "FALSE_DECLARATION",
                   "declared class or purpose differs from registry", t_min, dict(evidence))
    led.stats[operator]["false_declarations"] += 1
    return led


def record_risk(ledger, operator, pc):
    led = _clone(ledger)
    _ensure(led, operator)
    led.stats[operator]["risk_contributed"] += float(pc)
    return led


def set_debris_legacy(ledger, operator, count):
    led = _clone(ledger)
    _ensure(led, operator)
    led.stats[operator]["debris_legacy"] = float(count)
    return led


def fee(ledger, operator, emerging):
    bal = ledger.balances.get(operator, 0.0)
    return 1.0 * (1.0 + 0.1 * max(0.0, -bal)) * (0.5 if emerging else 1.0)


def total(ledger):
    return sum(ledger.balances.values())


def balances(ledger):
    return {k: round(v, 6) for k, v in sorted(ledger.balances.items())}
