"""Scalar reference implementation of one environment step (B9) — the oracle for env_torch.

Deliberately written with plain Python loops and the U1 modules (`sim.rules.verdict`,
`sim.physics`) so that it shares no vectorised code with the GPU environment.
"""
import math

from . import physics
from .domain import ESCALATE, HOLD, RADIAL, REQUEST_YIELD, SMALL_CLOSE, SMALL_OPEN, Declaration, RegistryEntry
from .rules import verdict

CAP_NAMES = {0: "manoeuvrable", 1: "autonomous", 2: "crewed", 3: "debris"}
PUR_NAMES = {0: "public_good", 1: "commercial", 2: "none"}


def snapshot(env, c):
    """Copy cluster c of a ConjunctionEnv into plain Python structures."""
    n = int(env.n[c])
    tolist = lambda x: x[c].detach().cpu().tolist()
    return {
        "n": n, "t_min": env.t_min(), "cap": tolist(env.cap)[:n], "pur": tolist(env.pur)[:n],
        "fuel": tolist(env.fuel)[:n], "led": tolist(env.led)[:n], "silent": tolist(env.silent)[:n],
        "m0": tolist(env.m0), "p0": tolist(env.p0), "coup": tolist(env.coup), "sigma0": tolist(env.sigma0),
        "sigma_min": tolist(env.sigma_min), "near": tolist(env.near), "d": tolist(env.d)[:n],
        "burned": tolist(env.burned)[:n],
    }


def _miss(s, i, j):
    gain = s["coup"][i][j] * s["d"][i] + s["coup"][j][i] * s["d"][j]
    return math.hypot(s["p0"][i][j], s["m0"][i][j] + gain)


def _sigma(s, i, j):
    frac = max(0.0, min(1.0, -s["t_min"] / 240.0))
    return s["sigma_min"][i][j] + (s["sigma0"][i][j] - s["sigma_min"][i][j]) * frac


def pc_matrix(s):
    n = s["n"]
    return [[0.0 if i == j else physics.pc(_miss(s, i, j), _sigma(s, i, j)) for j in range(n)] for i in range(n)]


def threats(s):
    pc = pc_matrix(s)
    out = []
    for i in range(s["n"]):
        row = pc[i]
        best = max(range(s["n"]), key=lambda j: (row[j], -j))
        out.append(best)
    return out, pc


def yields(s):
    """i_yields per agent, computed with the U1 Python rules engine."""
    thr, _ = threats(s)
    ids = [f"a{i}" for i in range(s["n"])]
    reg = {ids[i]: RegistryEntry(ids[i], f"op{i}", CAP_NAMES[s["cap"][i]], PUR_NAMES[s["pur"][i]])
           for i in range(s["n"])}
    bals = {f"op{i}": s["led"][i] for i in range(s["n"])}
    out = []
    for i in range(s["n"]):
        j = thr[i]
        if j == i:
            out.append(False)
            continue
        di = Declaration(ids[i], reg[ids[i]].capability, reg[ids[i]].purpose, s["fuel"][i], s["silent"][i])
        dj = Declaration(ids[j], reg[ids[j]].capability, reg[ids[j]].purpose, s["fuel"][j], s["silent"][j])
        out.append(verdict(di, dj, reg, bals).yielder == ids[i])
    return out


def dangerous(pc, miss, sigma, manoeuvre_pc=1e-4, dilution_pc=1e-3):
    worst = min(1.0, (physics.HARD_BODY_RADIUS_M ** 2) / (2.0 * max(miss * miss, 1e-6)) * math.exp(-0.5))
    return pc > manoeuvre_pc or (sigma > 2.0 * miss and worst > dilution_pc)


def shield_step(s, prop, deadline_min=-60.0, manoeuvre_pc=1e-4):
    """Executed actions and conflicts per BR-U2-1 (the fuel limit is applied later, in step)."""
    thr, pc = threats(s)
    y = yields(s)
    executed, conflict = [], []
    for i in range(s["n"]):
        p = prop[i]
        acting = s["cap"][i] != 3 and not s["silent"][i] and s["fuel"][i] > 0
        if not acting:
            executed.append(HOLD)
            conflict.append(False)
            continue
        e, c = p, False
        is_burn = SMALL_OPEN <= p <= RADIAL
        if not y[i] and is_burn:
            e, c = HOLD, True
        elif y[i] and p == SMALL_CLOSE:
            e, c = SMALL_OPEN, True
        elif p == REQUEST_YIELD:
            e, c = HOLD, y[i]
        elif p == ESCALATE:
            e = HOLD
        j = thr[i]
        risky = dangerous(pc[i][j], _miss(s, i, j), _sigma(s, i, j), manoeuvre_pc)
        if (y[i] and not s["burned"][i] and s["t_min"] >= deadline_min and risky
                and not (SMALL_OPEN <= e <= RADIAL)):
            e, c = SMALL_OPEN, True
        executed.append(e)
        conflict.append(c)
    return executed, conflict
