"""Who-Yields rules engine (B3, BR-1).

A pure function of shared data only: both declarations, the registry and ledger balances.
Rules are applied in order; the first rule that separates the two agents decides.
The same logic is mirrored in web/js/rules.js and checked for parity.
"""
from dataclasses import dataclass

from .domain import Penalty, Verdict

LOW_FUEL = 0.20
FREE_RIDER = -3.0
FUEL_TIE = 0.05
LEDGER_TIE = 0.5
STAND_ON_MARGIN_MIN = 60.0


@dataclass(frozen=True)
class Effective:
    agent_id: str
    operator: str
    capability: str
    purpose: str
    fuel: float
    balance: float
    non_manoeuvrable: bool


def effective(decl, registry, balances):
    """Return (Effective, penalties). Registry values always win over declared ones."""
    reg = registry[decl.agent_id]
    penalties = []
    if decl.capability != reg.capability or decl.purpose != reg.purpose:
        evidence = (
            ("declared_capability", decl.capability), ("registered_capability", reg.capability),
            ("declared_purpose", decl.purpose), ("registered_purpose", reg.purpose),
        )
        penalties.append(Penalty("FALSE_DECLARATION", reg.operator, evidence))
    fuel = min(1.0, max(0.0, float(decl.fuel)))
    nm = reg.capability == "debris" or fuel <= 0.0 or decl.silent
    eff = Effective(decl.agent_id, reg.operator, reg.capability, reg.purpose, fuel,
                    float(balances.get(reg.operator, 0.0)), nm)
    return eff, penalties


def stand_on_deadline(tca_min=0.0):
    """The stand-on agent must act by this time if the yielder has not executed."""
    return tca_min - STAND_ON_MARGIN_MIN


def _exactly_one(a, b, pred):
    pa, pb = pred(a), pred(b)
    if pa and not pb:
        return a
    if pb and not pa:
        return b
    return None


def _tiebreak(a, b):
    if abs(a.fuel - b.fuel) > FUEL_TIE:
        return ("R8a", a if a.fuel > b.fuel else b, "larger fuel margin yields")
    if abs(a.balance - b.balance) > LEDGER_TIE:
        return ("R8b", a if a.balance < b.balance else b, "lower ledger balance yields")
    return ("R8c", a if a.agent_id < b.agent_id else b, "deterministic ID tie-break")


def verdict(decl_a, decl_b, registry, balances):
    """Compute the Who-Yields verdict. Symmetric: swapping the arguments gives the same yielder."""
    a, pa = effective(decl_a, registry, balances)
    b, pb = effective(decl_b, registry, balances)
    penalties = tuple(sorted(pa + pb, key=lambda p: (p.operator, p.kind)))

    def result(rule, yielder, reason, escalate=None):
        if yielder is None:
            return Verdict(None, None, rule, reason, penalties, escalate)
        other = b if yielder is a else a
        return Verdict(yielder.agent_id, other.agent_id, rule, reason, penalties, escalate)

    if a.non_manoeuvrable and b.non_manoeuvrable:
        return result("R1", None, "neither object can move", "BOTH_NM")

    stuck = _exactly_one(a, b, lambda x: x.non_manoeuvrable)
    if stuck is not None:
        return result("R2", b if stuck is a else a, "the other object cannot move")

    crewed = _exactly_one(a, b, lambda x: x.capability == "crewed")
    if crewed is not None:
        return result("R3", b if crewed is a else a, "a crewed vehicle holds course")
    if a.capability == "crewed" and b.capability == "crewed":
        rule, y, why = _tiebreak(a, b)
        return result("R3b", y, f"both crewed; proposal by {rule} ({why})", "BOTH_CREWED")

    low = _exactly_one(a, b, lambda x: x.fuel < LOW_FUEL)
    if low is not None:
        return result("R4", b if low is a else a, "the low-fuel satellite holds course")

    rider = _exactly_one(a, b, lambda x: x.balance <= FREE_RIDER)
    if rider is not None:
        return result("R5", rider, "free-rider loses priority")

    auto = _exactly_one(a, b, lambda x: x.capability == "autonomous")
    if auto is not None:
        return result("R6", auto, "the more capable (autonomous) satellite moves")

    public = _exactly_one(a, b, lambda x: x.purpose == "public_good")
    if public is not None and {a.purpose, b.purpose} == {"public_good", "commercial"}:
        return result("R7", b if public is a else a, "commercial yields to public-good mission")

    rule, y, why = _tiebreak(a, b)
    return result(rule, y, why)
