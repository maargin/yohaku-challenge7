"""Batched multi-agent conjunction environment on the GPU (B10).

N clusters x up to 6 agents run in parallel. Each agent sees its most dangerous neighbour
(the threat) and that neighbour's announced intent. The AI proposes any action; the shield
(U1 rules + BR-U2-1) decides what is executed. Dynamics are illustrative (linearised).
"""
import math

import torch

from . import physics
from .domain import HOLD, LARGE_OPEN, RADIAL, REQUEST_YIELD, SMALL_CLOSE, SMALL_OPEN, ESCALATE, DV_BY_ACTION

A = 6
OBS_DIM = 24
N_ACTIONS = 7
STEPS = 24
STEP_MIN = 10.0
START_MIN = -240.0
MAN, AUTO, CREWED, DEBRIS = 0, 1, 2, 3
PUB, COM, NONE = 0, 1, 2
LOW_FUEL, FREE_RIDER, FUEL_TIE, LEDGER_TIE = 0.20, -3.0, 0.05, 0.5
DEADLINE_MIN = -60.0
MANOEUVRE_PC = 1e-4
PC_HIGH = 1e-3
SECONDARY_M = 1000.0
MEAN_MOTION = 0.0011           # rad/s at ~550 km
FUEL_BUDGET_MS = 1.0
BETA, GAMMA = 0.5, 0.99
R_COLLISION, R_SECONDARY, R_CONFLICT, R_ESCALATE, R_REQUEST, FAIR_LAMBDA = -100.0, -20.0, -1.0, -5.0, -0.1, 0.5
DV = torch.tensor([DV_BY_ACTION[i] for i in range(N_ACTIONS)])
SAFE_PC = 1e-5
REWARDS = {
    # v1: the approved design (BR-U2-2)
    "v1": {"fuel_w": 1.0, "unneeded_w": 0.0, "repeat_w": 0.0, "fair_lambda": FAIR_LAMBDA},
    # v2: discourages repeat burns and burns when already safe; stronger fuel and fairness terms
    "v2": {"fuel_w": 3.0, "unneeded_w": 1.0, "repeat_w": 1.0, "fair_lambda": 1.0},
}


def pc_t(miss, sigma, radius=physics.HARD_BODY_RADIUS_M):
    s2 = sigma * sigma
    return torch.clamp((radius * radius) / (2.0 * s2) * torch.exp(-(miss * miss) / (2.0 * s2)), 0.0, 1.0)


def who_yields(cap_i, pur_i, fuel_i, led_i, sil_i, idx_i, cap_j, pur_j, fuel_j, led_j, sil_j, idx_j):
    """Vectorised Who-Yields (U1 R1–R8c). Returns (has_yielder, i_yields)."""
    nm_i = (cap_i == DEBRIS) | (fuel_i <= 0) | sil_i
    nm_j = (cap_j == DEBRIS) | (fuel_j <= 0) | sil_j
    cr_i, cr_j = cap_i == CREWED, cap_j == CREWED
    lo_i, lo_j = fuel_i < LOW_FUEL, fuel_j < LOW_FUEL
    fr_i, fr_j = led_i <= FREE_RIDER, led_j <= FREE_RIDER
    au_i, au_j = cap_i == AUTO, cap_j == AUTO
    pb_i, pb_j = pur_i == PUB, pur_j == PUB
    mixed = (pb_i & (pur_j == COM)) | (pb_j & (pur_i == COM))

    tie = torch.where((fuel_i - fuel_j).abs() > FUEL_TIE, fuel_i > fuel_j,
                      torch.where((led_i - led_j).abs() > LEDGER_TIE, led_i < led_j, idx_i < idx_j))
    y = tie
    y = torch.where(mixed & (pb_i ^ pb_j), ~pb_i, y)
    y = torch.where(au_i ^ au_j, au_i, y)
    y = torch.where(fr_i ^ fr_j, fr_i, y)
    y = torch.where(lo_i ^ lo_j, ~lo_i, y)
    y = torch.where(cr_i & cr_j, tie, y)
    y = torch.where(cr_i ^ cr_j, ~cr_i, y)
    y = torch.where(nm_i ^ nm_j, ~nm_i, y)
    has = ~(nm_i & nm_j)
    return has, y & has


class ConjunctionEnv:
    def __init__(self, n_clusters, device="cpu", seed=0, stage=3, sigma_pool=None, shield=True, reward="v1"):
        self.N, self.device, self.stage, self.shield = n_clusters, torch.device(device), stage, shield
        self.rw = REWARDS[reward]
        self.gen = torch.Generator(device=self.device).manual_seed(int(seed))
        self.sigma_pool = None if sigma_pool is None else torch.as_tensor(sigma_pool, dtype=torch.float32,
                                                                           device=self.device)
        self.idx = torch.arange(A, device=self.device)

    # ---------- sampling ----------
    def _u(self, *shape, lo=0.0, hi=1.0):
        return lo + (hi - lo) * torch.rand(*shape, generator=self.gen, device=self.device)

    def _randint(self, lo, hi, shape):
        return torch.randint(lo, hi, shape, generator=self.gen, device=self.device)

    def reset(self):
        N, dev = self.N, self.device
        if self.stage == 3:
            n = self._randint(2, A + 1, (N,))
        else:
            n = torch.full((N,), 2, device=dev, dtype=torch.long)
        self.n = n
        self.mask = self.idx[None, :] < n[:, None]
        if self.stage == 1:
            cap = torch.full((N, A), DEBRIS, device=dev, dtype=torch.long)
            cap[:, 0] = self._randint(0, 2, (N,))
        elif self.stage == 2:
            cap = self._randint(0, 2, (N, A))
        else:
            r = self._u(N, A)
            cap = torch.where(r < 0.40, MAN, torch.where(r < 0.70, AUTO, torch.where(r < 0.78, CREWED, DEBRIS)))
            cap[:, 0] = torch.where(cap[:, 0] == DEBRIS, torch.full_like(cap[:, 0], MAN), cap[:, 0])
        cap = torch.where(self.mask, cap, torch.full_like(cap, DEBRIS))
        self.cap = cap
        self.pur = torch.where(cap == DEBRIS, torch.full_like(cap, NONE), self._randint(0, 3, (N, A)))
        self.fuel = torch.where(cap == DEBRIS, torch.zeros(N, A, device=dev), self._u(N, A, lo=0.05, hi=1.0))
        self.led = torch.zeros(N, A, device=dev) if self.stage == 1 else self._u(N, A, lo=-5.0, hi=5.0)
        sil = (self._u(N, A) < 0.08) & (cap != DEBRIS) & (self.idx[None, :] > 0) if self.stage == 3 else \
            torch.zeros(N, A, dtype=torch.bool, device=dev)
        self.silent = sil & self.mask

        # pair geometry (symmetric), primary partner pp[i] = i xor 1 (or 0 if missing)
        if self.sigma_pool is not None:
            s0 = self.sigma_pool[self._randint(0, len(self.sigma_pool), (N, A, A))]
        else:
            s0 = torch.exp(math.log(800.0) + 0.6 * torch.randn(N, A, A, generator=self.gen, device=dev))
        s0 = torch.clamp(s0, 150.0, 3000.0)
        sym = lambda x: torch.triu(x, 1) + torch.triu(x, 1).transpose(1, 2)
        self.sigma0 = sym(s0) + torch.eye(A, device=dev)[None] * 1000.0
        self.sigma_min = sym(s0 * self._u(N, A, A, lo=0.08, hi=0.3)) + torch.eye(A, device=dev)[None] * 100.0
        sign = torch.where(self._u(N, A, A) < 0.5, -1.0, 1.0)
        m0_far = sign * self._u(N, A, A, lo=300.0, hi=3000.0)
        p0_far = self._u(N, A, A, lo=0.0, hi=400.0)
        m0_near = self._u(N, A, A, lo=-150.0, hi=150.0)
        p0_near = self._u(N, A, A, lo=0.0, hi=40.0)
        pp = self.idx ^ 1
        pp = torch.where(pp[None, :] < n[:, None], pp[None, :].expand(N, A), torch.zeros(N, A, dtype=torch.long, device=dev))
        self.pp = pp
        near = torch.zeros(N, A, A, dtype=torch.bool, device=dev)
        near.scatter_(2, pp[:, :, None], True)
        near = (near | near.transpose(1, 2)) & ~torch.eye(A, dtype=torch.bool, device=dev)[None]
        self.near = near
        self.m0 = sym(torch.where(near, m0_near, m0_far))
        self.p0 = sym(torch.where(near, p0_near, p0_far))
        coup = torch.where(self._u(N, A, A) < 0.5, -1.0, 1.0)
        m0sign = torch.where(self.m0 >= 0, 1.0, -1.0)
        self.coup = torch.where(near, m0sign, coup)            # coup[n, i, j]: effect of d_i on pair (i, j)
        self.d = torch.zeros(N, A, device=dev)
        self.dv_spent = torch.zeros(N, A, device=dev)
        self.burned = torch.zeros(N, A, dtype=torch.bool, device=dev)
        self.intent = torch.zeros(N, A, dtype=torch.long, device=dev)     # 0 hold 1 burn 2 request 3 escalated
        self.esc_used = torch.zeros(N, A, dtype=torch.bool, device=dev)
        self.hard_flag = torch.zeros(N, dtype=torch.bool, device=dev)
        self.secondary = torch.zeros(N, device=dev)
        self.conflicts = torch.zeros(N, A, device=dev)
        self.t_idx = 0
        self._refresh()
        self.phi = self._phi()
        return self.obs()

    # ---------- geometry ----------
    def t_min(self):
        return START_MIN + STEP_MIN * self.t_idx

    def _miss(self):
        gain = self.coup * self.d[:, :, None] + self.coup.transpose(1, 2) * self.d[:, None, :]
        return torch.hypot(self.p0, self.m0 + gain)

    def _refresh(self):
        t = self.t_min()
        frac = max(0.0, min(1.0, -t / 240.0))
        self.sigma = self.sigma_min + (self.sigma0 - self.sigma_min) * frac
        self.miss = self._miss()
        pair_ok = self.mask[:, :, None] & self.mask[:, None, :] & ~torch.eye(A, dtype=torch.bool, device=self.device)[None]
        self.pair_ok = pair_ok
        pc = pc_t(self.miss, self.sigma)
        self.pc = torch.where(pair_ok, pc, torch.zeros_like(pc))
        self.threat = self.pc.argmax(dim=2)                                         # [N, A]
        g = lambda x: torch.gather(x, 1, self.threat)
        self.pc_threat = torch.gather(self.pc, 2, self.threat[:, :, None]).squeeze(2)
        self.miss_threat = torch.gather(self.miss, 2, self.threat[:, :, None]).squeeze(2)
        self.has_y, self.i_yields = who_yields(self.cap, self.pur, self.fuel, self.led, self.silent, self.idx[None].expand_as(self.cap),
                                               g(self.cap), g(self.pur), g(self.fuel), g(self.led), g(self.silent), self.threat)

    def _phi(self):
        pmax = self.pc.flatten(1).max(dim=1).values
        return -torch.clamp(torch.log10(pmax + 1e-12), -8.0, 0.0)

    # ---------- observation ----------
    def obs(self):
        N, dev = self.N, self.device
        g = lambda x: torch.gather(x, 1, self.threat)
        t = torch.full((N, A), -self.t_min() / 240.0, device=dev)
        m = torch.gather(self.m0 + self.coup * self.d[:, :, None] + self.coup.transpose(1, 2) * self.d[:, None, :], 2,
                         self.threat[:, :, None]).squeeze(2)
        p = torch.gather(self.p0, 2, self.threat[:, :, None]).squeeze(2)
        s = torch.gather(self.sigma, 2, self.threat[:, :, None]).squeeze(2)
        s0 = torch.gather(self.sigma0, 2, self.threat[:, :, None]).squeeze(2)
        cap_oh = torch.stack([self.cap == MAN, self.cap == AUTO, self.cap == CREWED], -1).float()
        tcap = g(self.cap)
        tcap_oh = torch.stack([tcap == DEBRIS, tcap == AUTO, tcap == CREWED], -1).float()
        tint = torch.nn.functional.one_hot(g(self.intent), 4).float()
        third = torch.where(self.pair_ok & ~self.near, self.miss, torch.full_like(self.miss, 5000.0))
        third_min = torch.clamp(third.min(dim=2).values, max=5000.0)
        feats = [
            t[..., None], (m / 1000.0)[..., None], (p / 1000.0)[..., None], (self.miss_threat / 1000.0)[..., None],
            (torch.clamp(torch.log10(self.pc_threat + 1e-12), -10.0, 0.0) / 10.0)[..., None], (s / s0)[..., None],
            cap_oh, self.fuel[..., None], (self.led / 5.0)[..., None],
            tcap_oh, g(self.fuel)[..., None], (g(self.led) / 5.0)[..., None], tint,
            self.i_yields.float()[..., None], (self.d / 1000.0)[..., None], (third_min / 5000.0)[..., None],
            g(self.silent).float()[..., None],
        ]
        o = torch.cat(feats, -1)
        return torch.where(self.mask[..., None], o, torch.zeros_like(o))

    def acting(self):
        """Agents whose proposal matters (not masked, not debris, not silent, fuel left)."""
        return self.mask & (self.cap != DEBRIS) & ~self.silent & (self.fuel > 0)

    # ---------- step ----------
    def apply_shield(self, prop):
        t = self.t_min()
        act = self.acting()
        stand_on = ~self.i_yields
        burn = (prop >= SMALL_OPEN) & (prop <= RADIAL)
        executed = prop.clone()
        conflict = torch.zeros_like(act)
        c1 = stand_on & burn
        executed = torch.where(c1, torch.full_like(prop, HOLD), executed)
        c2 = self.i_yields & (prop == SMALL_CLOSE)
        executed = torch.where(c2, torch.full_like(prop, SMALL_OPEN), executed)
        c3 = self.i_yields & (prop == REQUEST_YIELD)
        executed = torch.where(c3 | (prop == REQUEST_YIELD), torch.full_like(prop, HOLD), executed)
        executed = torch.where(prop == ESCALATE, torch.full_like(prop, HOLD), executed)
        forced = self.i_yields & ~self.burned & (t >= DEADLINE_MIN) & (self.pc_threat > MANOEUVRE_PC) & \
            ~((executed >= SMALL_OPEN) & (executed <= RADIAL))
        executed = torch.where(forced, torch.full_like(prop, SMALL_OPEN), executed)
        conflict = (c1 | c2 | c3 | forced) & act
        return executed, conflict

    def step(self, prop):
        """prop: [N, A] long proposals. Returns obs, reward [N, A], done (bool), info."""
        prop = prop.to(self.device).long()
        act = self.acting()
        crewed_pair = (self.cap == CREWED) | (torch.gather(self.cap, 1, self.threat) == CREWED)
        self.hard_flag |= ((self.pc_threat > PC_HIGH) | crewed_pair | torch.gather(self.silent, 1, self.threat)).__and__(self.mask).any(1)
        if self.shield:
            executed, conflict = self.apply_shield(prop)
        else:
            executed = torch.where(prop == SMALL_CLOSE, prop, prop)
            executed = torch.where((prop == REQUEST_YIELD) | (prop == ESCALATE), torch.full_like(prop, HOLD), executed)
            conflict = torch.zeros_like(act)
        executed = torch.where(act, executed, torch.full_like(executed, HOLD))
        dv = DV.to(self.device)[executed]
        dv = torch.where(dv <= self.fuel * FUEL_BUDGET_MS, dv, torch.zeros_like(dv))
        executed = torch.where((dv == 0) & (executed != HOLD) & (executed <= RADIAL), torch.full_like(executed, HOLD), executed)
        lead_s = -self.t_min() * 60.0
        along = physics.ALONG_TRACK_GAIN * dv * lead_s * physics.ENCOUNTER_PROJECTION
        radial = 2.0 * dv / MEAN_MOTION * physics.ENCOUNTER_PROJECTION
        delta = torch.where(executed == SMALL_CLOSE, -along, torch.where(executed == RADIAL, radial, along))
        delta = torch.where(dv > 0, delta, torch.zeros_like(delta))
        prev_far = (self.miss >= SECONDARY_M) & self.pair_ok & ~self.near
        unneeded = (dv > 0) & (self.pc_threat < SAFE_PC)
        repeat = (dv > 0) & self.burned
        self.d = self.d + delta
        self.fuel = torch.clamp(self.fuel - dv / FUEL_BUDGET_MS, 0.0, 1.0)
        self.dv_spent = self.dv_spent + dv
        self.burned |= dv > 0
        esc = (prop == ESCALATE) & act
        self.intent = torch.where(dv > 0, 1, torch.where(esc, 3, torch.where((prop == REQUEST_YIELD) & act, 2, 0)))
        self.conflicts += conflict.float()

        self.t_idx += 1
        done = self.t_idx >= STEPS
        self._refresh()
        new_close = (prev_far & (self.miss < SECONDARY_M)).float().sum((1, 2)) / 2.0
        self.secondary += new_close
        phi2 = self._phi()
        shaping = GAMMA * phi2 - self.phi
        self.phi = phi2
        team = shaping + R_SECONDARY * new_close
        selfr = (-self.rw["fuel_w"] * dv / 0.1 + R_CONFLICT * conflict.float()
                 + R_REQUEST * ((prop == REQUEST_YIELD) & act).float()
                 - self.rw["unneeded_w"] * unneeded.float() - self.rw["repeat_w"] * repeat.float())
        disc = esc & ~self.esc_used
        selfr = selfr + R_ESCALATE * esc.float()
        self.esc_used |= disc
        collision = torch.zeros(self.N, dtype=torch.bool, device=self.device)
        fair = torch.zeros(self.N, device=self.device)
        if done:
            collision = ((self.miss < physics.HARD_BODY_RADIUS_M) & self.pair_ok).flatten(1).any(1)
            movers = self.mask & (self.cap != DEBRIS)
            cnt = movers.float().sum(1).clamp(min=1)
            mean_b = (self.dv_spent * movers).sum(1) / cnt
            gap = ((self.dv_spent - mean_b[:, None]).abs() * movers).sum(1) / cnt / 0.1
            fair = -self.rw["fair_lambda"] * gap
            team = team + R_COLLISION * collision.float() + fair
        reward = BETA * team[:, None] + (1 - BETA) * selfr
        reward = torch.where(self.mask, reward, torch.zeros_like(reward))
        info = {"executed": executed, "conflict": conflict, "dv": dv, "collision": collision,
                "hard": self.hard_flag.clone(), "escalated": esc}
        return self.obs(), reward, done, info

    def global_state(self, obs):
        return obs.reshape(self.N, A * OBS_DIM)
