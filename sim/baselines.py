"""Baseline strategies (B11). Each maps (env, obs) -> proposals [N, A]."""
import torch

from .domain import HOLD, SMALL_OPEN
from .env_torch import MANOEUVRE_PC


def do_nothing(env, obs):
    return torch.full((env.N, 6), HOLD, dtype=torch.long, device=env.device)


def both_burn(env, obs):
    """Everyone at risk burns once as soon as Pc > 1e-4 (no coordination)."""
    go = (env.pc_threat > MANOEUVRE_PC) & ~env.burned
    return torch.where(go, SMALL_OPEN, HOLD).long()


def lower_id_yields(env, obs):
    """The agent with the lower index always moves (ignores capability, fuel and purpose)."""
    go = (env.pc_threat > MANOEUVRE_PC) & ~env.burned & (env.idx[None, :] < env.threat)
    return torch.where(go, SMALL_OPEN, HOLD).long()


def rules_only(env, obs):
    """Who-Yields rules: the rules yielder burns once when Pc > 1e-4."""
    go = (env.pc_threat > MANOEUVRE_PC) & ~env.burned & env.i_yields
    return torch.where(go, SMALL_OPEN, HOLD).long()


BASELINES = {"Do nothing": (do_nothing, False), "Both burn if Pc > 1e-4": (both_burn, False),
             "Lower ID yields": (lower_id_yields, False), "Rules only (Who-Yields)": (rules_only, True)}
