"""Example tests for the environment and shield semantics (BR-U2-1)."""
import torch

from sim.domain import ESCALATE, HOLD, REQUEST_YIELD, SMALL_CLOSE, SMALL_OPEN
from sim.env_torch import DEBRIS, STEPS, ConjunctionEnv


def env1():
    env = ConjunctionEnv(64, device="cpu", seed=5, stage=1)
    env.reset()
    return env


def test_stage1_satellite_yields_to_debris():
    env = env1()
    assert (env.cap[:, 1] == DEBRIS).all()
    assert env.i_yields[:, 0].all() and not env.i_yields[:, 1].any()


def test_closing_burn_by_yielder_becomes_opening():
    env = env1()
    prop = torch.full((env.N, 6), SMALL_CLOSE)
    executed, conflict = env.apply_shield(prop)
    assert (executed[:, 0] == SMALL_OPEN).all() and conflict[:, 0].all()


def test_request_yield_by_yielder_is_conflict_and_hold():
    env = env1()
    executed, conflict = env.apply_shield(torch.full((env.N, 6), REQUEST_YIELD))
    assert (executed[:, 0] == HOLD).all() and conflict[:, 0].all()


def test_escalate_is_hold_without_conflict():
    env = env1()
    executed, conflict = env.apply_shield(torch.full((env.N, 6), ESCALATE))
    assert (executed[:, 0] == HOLD).all() and not conflict[:, 0].any()


def test_deadline_forces_burn_when_risky():
    env = env1()
    burned_by_deadline = torch.zeros(env.N, dtype=torch.bool)
    risky = torch.zeros(env.N, dtype=torch.bool)
    for _ in range(STEPS):
        if env.t_min() >= -60:
            risky |= env.pc_threat[:, 0] > 1e-4
        _, _, _, info = env.step(torch.full((env.N, 6), HOLD))
        burned_by_deadline |= info["dv"][:, 0] > 0
    assert (burned_by_deadline | ~risky).all()


def test_do_nothing_can_collide_and_is_penalised():
    env = ConjunctionEnv(512, device="cpu", seed=11, stage=1, shield=False)
    env.reset()
    total = torch.zeros(env.N)
    for _ in range(STEPS):
        _, r, done, info = env.step(torch.full((env.N, 6), HOLD))
        total += r[:, 0]
    assert info["collision"].any()
    assert total[info["collision"]].mean() < total[~info["collision"]].mean()


def test_v2_reward_penalises_repeat_burns_more_than_v1():
    totals = {}
    for rw in ("v1", "v2"):
        env = ConjunctionEnv(128, device="cpu", seed=21, stage=1, reward=rw)
        env.reset()
        tot = torch.zeros(env.N)
        for _ in range(STEPS):
            _, r, _, _ = env.step(torch.full((env.N, 6), SMALL_OPEN))   # burn every step
            tot += r[:, 0]
        totals[rw] = tot.mean().item()
    assert totals["v2"] < totals["v1"]


def test_dilution_flags_close_pass_with_huge_uncertainty():
    from sim.env_torch import is_dangerous
    pc = torch.tensor([1e-6, 1e-6, 1e-6])
    miss = torch.tensor([10.0, 10.0, 2000.0])
    sigma = torch.tensor([3000.0, 5.0, 3000.0])
    assert is_dangerous(pc, miss, sigma).tolist() == [True, False, False]


def test_low_risk_share_creates_safe_passes_that_rules_do_not_burn_for():
    import numpy as np
    from sim.baselines import rules_only
    geom = (np.array([[300.0, 60.0], [400.0, 80.0]], dtype=np.float32), np.array([1500.0, 1900.0], dtype=np.float32))
    env = ConjunctionEnv(400, device="cpu", seed=9, stage=2, geom_pool=geom, low_risk=1.0)
    obs = env.reset()
    assert (env.m0[:, 0, 1].abs() >= 300).all()
    burned = torch.zeros(env.N, dtype=torch.bool)
    for _ in range(STEPS):
        obs, _, _, info = env.step(rules_only(env, obs))
        burned |= (info["dv"] > 0).any(1)
    assert burned.float().mean() < 0.05
    assert not info["collision"].any()
