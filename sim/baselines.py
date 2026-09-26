"""Baseline strategies (B11). Each maps (env, obs) -> proposals [N, A]."""
import torch

from .domain import HOLD, SMALL_OPEN


def do_nothing(env, obs):
    return torch.full((env.N, 6), HOLD, dtype=torch.long, device=env.device)


def both_burn(env, obs):
    """Everyone at risk burns once as soon as the pass is dangerous (no coordination)."""
    go = env.danger & ~env.burned
    return torch.where(go, SMALL_OPEN, HOLD).long()


def lower_id_yields(env, obs):
    """The agent with the lower index always moves (ignores capability, fuel and purpose)."""
    go = env.danger & ~env.burned & (env.idx[None, :] < env.threat)
    return torch.where(go, SMALL_OPEN, HOLD).long()


def rules_only(env, obs):
    """Who-Yields rules: the rules yielder burns once when the pass is dangerous."""
    go = env.danger & ~env.burned & env.i_yields
    return torch.where(go, SMALL_OPEN, HOLD).long()


BASELINES = {"Do nothing": (do_nothing, False), "Both burn when dangerous": (both_burn, False),
             "Lower ID yields": (lower_id_yields, False), "Rules only (Who-Yields)": (rules_only, True)}
