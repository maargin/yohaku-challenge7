"""Intent handshake protocol (B4, BR-2). Pure value objects; apply() is idempotent."""
from dataclasses import dataclass, field, replace
from typing import FrozenSet, Tuple

MESSAGE_TYPES = ("PROPOSE", "ACK", "DO-NOT-MOVE", "EXECUTED", "ESCALATE")
SILENCE_WINDOW_MIN = 30.0


@dataclass(frozen=True)
class Message:
    id: str
    t_min: float
    frm: str
    to: str
    type: str
    text: str

    def to_dict(self):
        return {"id": self.id, "t_min": self.t_min, "from": self.frm, "to": self.to,
                "type": self.type, "text": self.text}


@dataclass(frozen=True)
class HandshakeState:
    seen: FrozenSet[str] = field(default_factory=frozenset)
    proposed: Tuple[Tuple[str, float], ...] = ()
    acked: FrozenSet[str] = field(default_factory=frozenset)
    do_not_move: FrozenSet[str] = field(default_factory=frozenset)
    executed: FrozenSet[str] = field(default_factory=frozenset)
    escalations: int = 0

    def proposed_by(self, agent_id):
        return any(a == agent_id for a, _ in self.proposed)


def apply(state, msg):
    """Apply one message. A message whose id was already seen changes nothing."""
    if msg.type not in MESSAGE_TYPES:
        raise ValueError(f"unknown message type {msg.type}")
    if msg.id in state.seen:
        return state
    seen = state.seen | {msg.id}
    if msg.type == "PROPOSE":
        proposed = state.proposed
        if not state.proposed_by(msg.frm):
            proposed = tuple(sorted(proposed + ((msg.frm, msg.t_min),)))
        return replace(state, seen=seen, proposed=proposed)
    if msg.type == "ACK":
        return replace(state, seen=seen, acked=state.acked | {msg.frm})
    if msg.type == "DO-NOT-MOVE":
        return replace(state, seen=seen, do_not_move=state.do_not_move | {msg.frm})
    if msg.type == "EXECUTED":
        return replace(state, seen=seen, executed=state.executed | {msg.frm})
    return replace(state, seen=seen, escalations=state.escalations + 1)


def apply_all(state, msgs):
    for m in msgs:
        state = apply(state, m)
    return state


def is_silent(state, agent_id, detected_at_min, now_min):
    """No PROPOSE within the silence window after detection."""
    return (not state.proposed_by(agent_id)) and (now_min - detected_at_min) >= SILENCE_WINDOW_MIN


def committed(state, agent_a, agent_b):
    """Both sides have sent EXECUTED."""
    return agent_a in state.executed and agent_b in state.executed


def new_round(state):
    """Start a fresh handshake round (used when a human overrides after commit)."""
    return HandshakeState(seen=state.seen, escalations=state.escalations)
