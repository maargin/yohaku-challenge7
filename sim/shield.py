"""Safety shield (B6, BR-4) — security-critical, kept isolated (SECURITY-11).

Hard escalation triggers are evaluated here, outside any AI policy, and cannot be
suppressed by it. The rules verdict always wins over a policy proposal.
"""
from dataclasses import dataclass

PC_HIGH = 1e-3
LOW_CONFIDENCE = 0.5
FUEL_COST_FRAC = 0.10

# code -> autonomy level granted when the trigger fires (lower = more human control)
TRIGGER_LEVELS = {
    "BOTH_NM": "L1",
    "BOTH_CREWED": "L1",
    "PC_HIGH": "L2",
    "CREWED": "L2",
    "RULE_CONFLICT": "L2",
    "LOW_CONFIDENCE": "L2",
    "SILENT": "L3",
    "FUEL_COST": "L3",
}
HUMAN_APPROVAL_LEVELS = ("L0", "L1", "L2")
HUMAN_CHOICES = ("approve", "override", "stop")


@dataclass(frozen=True)
class Trigger:
    code: str
    level: str
    reason: str

    def to_dict(self):
        return {"trigger": self.code, "level": self.level, "reason": self.reason}


REASONS = {
    "BOTH_NM": "neither object can move; operators and regulator notified",
    "BOTH_CREWED": "two crewed vehicles; humans decide, AI advises",
    "PC_HIGH": "collision probability above 1e-3",
    "CREWED": "a crewed vehicle is involved",
    "RULE_CONFLICT": "AI proposal differs from the rules; the rules win",
    "LOW_CONFIDENCE": "AI confidence below 0.5",
    "SILENT": "counterpart silent; acting and notifying a human",
    "FUEL_COST": "burn uses more than 10% of remaining fuel",
}


def hard_triggers(*, pc, crewed_involved, rules_escalation=None, silent=False, fuel_cost_frac=0.0,
                  policy_confidence=None, policy_conflict=False):
    codes = []
    if rules_escalation:
        codes.append(rules_escalation)
    if pc > PC_HIGH:
        codes.append("PC_HIGH")
    if crewed_involved and "BOTH_CREWED" not in codes:
        codes.append("CREWED")
    if policy_conflict:
        codes.append("RULE_CONFLICT")
    if policy_confidence is not None and policy_confidence < LOW_CONFIDENCE:
        codes.append("LOW_CONFIDENCE")
    if silent:
        codes.append("SILENT")
    if fuel_cost_frac > FUEL_COST_FRAC:
        codes.append("FUEL_COST")
    triggers = [Trigger(c, TRIGGER_LEVELS[c], REASONS[c]) for c in dict.fromkeys(codes)]
    return sorted(triggers, key=lambda t: (t.level, t.code))


def level(triggers):
    """Autonomy level granted: the most restrictive trigger wins; no trigger = L4."""
    return min((t.level for t in triggers), default="L4")


def needs_human(triggers):
    return level(triggers) in HUMAN_APPROVAL_LEVELS


def arbitrate(policy_action, verdict_action):
    """Return (final_action, conflict). The rules verdict is always executed."""
    conflict = policy_action is not None and policy_action != verdict_action
    return verdict_action, conflict


def can_override(is_committed):
    return not is_committed


def human_decision(choice, verdict, is_committed, stand_on_can_move=True):
    """Apply a human choice. Returns (yielder, stand_on, outcome_code).

    approve  -> keep the verdict
    override -> swap yielder/stand-on, only before commit and only if the stand-on object can move;
                after commit a new handshake round starts instead
    stop     -> both hold
    """
    if choice not in HUMAN_CHOICES:
        raise ValueError(f"unknown human choice {choice}")
    if choice == "approve":
        return verdict.yielder, verdict.stand_on, "APPROVED"
    if choice == "stop":
        return None, None, "STOPPED"
    if not can_override(is_committed):
        return verdict.yielder, verdict.stand_on, "NEW_ROUND"
    if verdict.yielder is None or verdict.stand_on is None or not stand_on_can_move:
        return verdict.yielder, verdict.stand_on, "OVERRIDE_NOT_POSSIBLE"
    return verdict.stand_on, verdict.yielder, "OVERRIDDEN"
