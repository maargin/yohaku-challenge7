"""Domain types shared by rules, handshake, ledger, shield and the episode simulator."""
from dataclasses import dataclass, field
from typing import Optional, Tuple

CAPABILITIES = ("debris", "manoeuvrable", "autonomous", "crewed")
PURPOSES = ("public_good", "commercial", "none")
COMMONS = "commons"

# Discrete action space shared with the RL policy (U2) and the website.
ACTIONS = ("hold", "small_open", "large_open", "small_close", "radial", "request_yield", "escalate")
HOLD, SMALL_OPEN, LARGE_OPEN, SMALL_CLOSE, RADIAL, REQUEST_YIELD, ESCALATE = range(7)
DV_BY_ACTION = {HOLD: 0.0, SMALL_OPEN: 0.02, LARGE_OPEN: 0.1, SMALL_CLOSE: 0.02, RADIAL: 0.05,
                REQUEST_YIELD: 0.0, ESCALATE: 0.0}


@dataclass(frozen=True)
class RegistryEntry:
    """State-verified truth about an object. Never taken from a declaration."""
    agent_id: str
    operator: str
    capability: str
    purpose: str = "none"
    emerging: bool = False


@dataclass(frozen=True)
class Declaration:
    """What an agent announces in PROPOSE. May disagree with the registry (false declaration)."""
    agent_id: str
    capability: str
    purpose: str
    fuel: float
    silent: bool = False


@dataclass(frozen=True)
class Penalty:
    kind: str            # FALSE_DECLARATION | SILENCE
    operator: str
    evidence: Tuple[Tuple[str, str], ...] = ()


@dataclass(frozen=True)
class Verdict:
    yielder: Optional[str]
    stand_on: Optional[str]
    rule: str
    reason: str
    penalties: Tuple[Penalty, ...] = field(default_factory=tuple)
    escalate: Optional[str] = None   # trigger code raised by the rules themselves (BOTH_NM, BOTH_CREWED)

    def action_for(self, agent_id):
        return SMALL_OPEN if agent_id == self.yielder else HOLD
