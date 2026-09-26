"""Property tests for the GPU environment: oracle vs the scalar reference and invariants (E3)."""
import math

import pytest
import torch
from hypothesis import given, settings
from hypothesis import strategies as st

from sim import env_ref
from sim.env_torch import A, DEBRIS, OBS_DIM, STEPS, ConjunctionEnv, pc_t
from sim import physics

seeds = st.integers(0, 10_000)
stages = st.sampled_from([1, 2, 3])


def make(seed, stage, n=16):
    env = ConjunctionEnv(n, device="cpu", seed=seed, stage=stage)
    return env, env.reset()


@settings(max_examples=40)
@given(seeds, stages)
def test_rules_match_python_oracle(seed, stage):
    env, _ = make(seed, stage)
    for c in range(env.N):
        s = env_ref.snapshot(env, c)
        n = s["n"]
        assert env.i_yields[c, :n].tolist() == env_ref.yields(s)


@settings(max_examples=40)
@given(seeds, stages)
def test_pc_and_threat_match_oracle(seed, stage):
    env, _ = make(seed, stage)
    for c in range(env.N):
        s = env_ref.snapshot(env, c)
        thr, pc = env_ref.threats(s)
        n = s["n"]
        for i in range(n):
            for j in range(n):
                assert math.isclose(env.pc[c, i, j].item(), pc[i][j], rel_tol=1e-4, abs_tol=1e-12)
        got = env.threat[c, :n].tolist()
        for i in range(n):
            assert math.isclose(pc[i][got[i]], pc[i][thr[i]], rel_tol=1e-4, abs_tol=1e-12)


@settings(max_examples=30)
@given(seeds, stages, st.lists(st.integers(0, 6), min_size=A, max_size=A))
def test_shield_matches_oracle(seed, stage, props):
    env, _ = make(seed, stage)
    prop = torch.tensor([props] * env.N)
    executed, conflict = env.apply_shield(prop)
    executed = torch.where(env.acting(), executed, torch.zeros_like(executed))
    for c in range(env.N):
        s = env_ref.snapshot(env, c)
        n = s["n"]
        e_ref, c_ref = env_ref.shield_step(s, props[:n])
        assert executed[c, :n].tolist() == e_ref
        assert conflict[c, :n].tolist() == c_ref


@settings(max_examples=25)
@given(seeds, stages)
def test_observations_finite_and_shaped(seed, stage):
    env, obs = make(seed, stage)
    for _ in range(STEPS):
        assert obs.shape == (env.N, A, OBS_DIM)
        assert torch.isfinite(obs).all()
        assert (obs[..., 9] >= 0).all() and (obs[..., 9] <= 1).all()
        obs, r, done, _ = env.step(torch.randint(0, 7, (env.N, A)))
        assert torch.isfinite(r).all()
    assert done


@settings(max_examples=20)
@given(seeds, stages)
def test_deterministic_with_seed(seed, stage):
    e1, o1 = make(seed, stage)
    e2, o2 = make(seed, stage)
    g = torch.Generator().manual_seed(seed)
    for _ in range(STEPS):
        a = torch.randint(0, 7, (e1.N, A), generator=g)
        o1, r1, _, _ = e1.step(a)
        o2, r2, _, _ = e2.step(a)
        assert torch.equal(o1, o2) and torch.equal(r1, r2)


@settings(max_examples=20)
@given(seeds, stages)
def test_debris_and_silent_never_act(seed, stage):
    env, _ = make(seed, stage)
    idle = (env.cap == DEBRIS) | env.silent | ~env.mask
    fuel0 = env.fuel.clone()
    for _ in range(STEPS):
        env.step(torch.randint(0, 7, (env.N, A)))
    assert torch.equal(env.fuel[idle], fuel0[idle])
    assert (env.dv_spent[idle] == 0).all()


@settings(max_examples=20)
@given(seeds, stages)
def test_stand_on_never_burns_after_shield(seed, stage):
    env, _ = make(seed, stage)
    for _ in range(STEPS):
        stand_on = ~env.i_yields & env.acting()
        _, _, _, info = env.step(torch.randint(1, 5, (env.N, A)))
        assert (info["dv"][stand_on] == 0).all()


@given(st.floats(0, 5000, allow_nan=False), st.floats(50, 3000, allow_nan=False))
def test_pc_matches_physics(miss, sigma):
    assert math.isclose(pc_t(torch.tensor(miss, dtype=torch.float64), torch.tensor(sigma, dtype=torch.float64)).item(),
                        physics.pc(miss, sigma), rel_tol=1e-9, abs_tol=1e-15)
