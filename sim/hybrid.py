"""AI first, rules as fallback: use the AI's action only when it is confident and consistent with the rules;
otherwise the Who-Yields rules decide. Hard escalations are unaffected (they sit in the shield)."""
import torch

from .baselines import rules_only
from .domain import REQUEST_YIELD, SMALL_CLOSE, SMALL_OPEN, RADIAL


def consistent(env, action):
    """AI action allowed by the rules: stand-on agents never burn; yielders never close or ask the other to yield."""
    burn = (action >= SMALL_OPEN) & (action <= RADIAL)
    stand_on_burn = ~env.i_yields & burn
    yielder_bad = env.i_yields & ((action == SMALL_CLOSE) | (action == REQUEST_YIELD))
    return ~(stand_on_burn | yielder_bad)


def hybrid_strategy(actor, norm, threshold=0.9, stats=None):
    def act(env, obs):
        with torch.no_grad():
            probs = torch.softmax(actor(norm(obs)), -1)
        conf, ai_action = probs.max(-1)
        use_ai = (conf >= threshold) & consistent(env, ai_action)
        chosen = torch.where(use_ai, ai_action, rules_only(env, obs))
        if stats is not None:
            relevant = env.acting() & env.danger
            stats["ai"] = stats.get("ai", 0) + int((use_ai & relevant).sum())
            stats["total"] = stats.get("total", 0) + int(relevant.sum())
        return chosen
    return act
