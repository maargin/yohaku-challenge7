"""MAPPO training (B12): one shared actor for every satellite, a centralised critic for the cluster.

Trained together, acting alone: at run time each satellite uses only its own observation.
Usage: python -m sim.train_mappo --seed 1 --minutes 120 --out runs/seed1 [--kelvins data/raw/kelvins_train.csv]
"""
import argparse
import csv
import json
import logging
import time
from pathlib import Path

import torch
import torch.nn as nn

from .env_torch import A, N_ACTIONS, OBS_DIM, STEPS, ConjunctionEnv
from .log import get_logger, log

logger = get_logger("train")


class Actor(nn.Module):
    def __init__(self, hidden=64):
        super().__init__()
        self.net = nn.Sequential(nn.Linear(OBS_DIM, hidden), nn.Tanh(), nn.Linear(hidden, hidden), nn.Tanh(),
                                 nn.Linear(hidden, N_ACTIONS))

    def forward(self, x):
        return self.net(x)


class Critic(nn.Module):
    def __init__(self, hidden=256):
        super().__init__()
        self.net = nn.Sequential(nn.Linear(A * OBS_DIM + OBS_DIM + A, hidden), nn.Tanh(), nn.Linear(hidden, hidden),
                                 nn.Tanh(), nn.Linear(hidden, 1))

    def forward(self, gstate, own, agent_oh):
        return self.net(torch.cat([gstate, own, agent_oh], -1)).squeeze(-1)


class RunningNorm:
    def __init__(self, dim, device):
        self.mean = torch.zeros(dim, device=device)
        self.var = torch.ones(dim, device=device)
        self.count = 1e-4

    def update(self, x):
        bm, bv, bc = x.mean(0), x.var(0, unbiased=False), x.shape[0]
        delta, tot = bm - self.mean, self.count + bc
        self.mean = self.mean + delta * bc / tot
        self.var = (self.var * self.count + bv * bc + delta ** 2 * self.count * bc / tot) / tot
        self.count = tot

    def __call__(self, x):
        return torch.clamp((x - self.mean) / torch.sqrt(self.var + 1e-8), -10.0, 10.0)


def sigma_pool_from_kelvins(path, limit=20000):
    from .scenarios import event_table, load_kelvins
    ev = event_table(load_kelvins(path))
    vals = [e["sigma0_m"] for e in ev][:limit]
    return vals or None


def rollout(env, actor, norm, device, agent_oh):
    obs = env.reset()
    buf = {k: [] for k in ("obs", "gs", "act", "logp", "rew", "mask")}
    raws = []
    stats = {"conflict": 0.0, "dv": 0.0, "coll": 0.0}
    for _ in range(STEPS):
        mask = env.acting()
        o = norm(obs)
        with torch.no_grad():
            dist = torch.distributions.Categorical(logits=actor(o))
            a = dist.sample()
        nobs, r, done, info = env.step(a)
        raws.append(obs)
        buf["obs"].append(o)
        buf["gs"].append(o.reshape(env.N, A * OBS_DIM))
        buf["act"].append(a)
        buf["logp"].append(dist.log_prob(a))
        buf["rew"].append(r)
        buf["mask"].append(mask)
        stats["conflict"] += (info["conflict"] & mask).float().sum().item()
        stats["dv"] += info["dv"].sum().item()
        obs = nobs
    stats["coll"] = info["collision"].float().mean().item()
    stats["fair_gap"] = _fair_gap(env)
    raw = torch.stack(raws)
    return {k: torch.stack(v) for k, v in buf.items()}, stats, raw


def _fair_gap(env):
    movers = env.mask & (env.cap != 3)
    cnt = movers.float().sum(1).clamp(min=1)
    mean_b = (env.dv_spent * movers).sum(1) / cnt
    return (((env.dv_spent - mean_b[:, None]).abs() * movers).sum(1) / cnt).mean().item()


def gae(rew, val, gamma=0.99, lam=0.95):
    T = rew.shape[0]
    adv = torch.zeros_like(rew)
    last = torch.zeros_like(rew[0])
    for t in reversed(range(T)):
        nv = val[t + 1] if t + 1 < T else torch.zeros_like(val[0])
        delta = rew[t] + gamma * nv - val[t]
        last = delta + gamma * lam * last
        adv[t] = last
    return adv, adv + val


def train(args):
    device = torch.device("cuda" if torch.cuda.is_available() and not args.cpu else "cpu")
    torch.manual_seed(args.seed)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    pool = sigma_pool_from_kelvins(args.kelvins) if args.kelvins else None
    actor, critic = Actor().to(device), Critic().to(device)
    opt = torch.optim.Adam(list(actor.parameters()) + list(critic.parameters()), lr=args.lr)
    norm = RunningNorm(OBS_DIM, device)
    agent_oh = torch.eye(A, device=device)
    stage, stage_steps, total_steps, it = 1, 0, 0, 0
    budgets = {1: args.s1_steps, 2: args.s2_steps}
    recent = []
    t0 = time.time()
    logf = open(out / "log.csv", "w", newline="", encoding="utf-8")
    wr = csv.writer(logf)
    wr.writerow(["iter", "timesteps", "stage", "collision_rate", "dv_mean", "fairness_gap", "conflict_rate",
                 "entropy", "elapsed_s"])
    try:
        while time.time() - t0 < args.minutes * 60:
            env = ConjunctionEnv(args.envs, device=device, seed=args.seed * 100003 + it, stage=stage,
                                 sigma_pool=pool, shield=True, reward=args.reward)
            buf, stats, raw = rollout(env, actor, norm, device, agent_oh)
            m = buf["mask"]
            norm.update(raw[m])
            n_act = m.float().sum().item()
            total_steps += int(n_act)
            stage_steps += int(n_act)
            T, N = buf["rew"].shape[:2]
            own = buf["obs"]
            gs = buf["gs"][:, :, None, :].expand(T, N, A, A * OBS_DIM)
            oh = agent_oh[None, None].expand(T, N, A, A)
            with torch.no_grad():
                val = critic(gs, own, oh)
            adv, ret = gae(buf["rew"], val)
            flat = lambda x: x[m]
            f_obs, f_gs, f_oh = flat(own), flat(gs), flat(oh)
            f_act, f_logp, f_adv, f_ret = flat(buf["act"]), flat(buf["logp"]), flat(adv), flat(ret)
            f_adv = (f_adv - f_adv.mean()) / (f_adv.std() + 1e-8)
            ent_coef = max(0.001, 0.01 * (1 - total_steps / max(1, args.anneal_steps)))
            n = f_obs.shape[0]
            ent_mean = 0.0
            for _ in range(args.epochs):
                perm = torch.randperm(n, device=device)
                for s in range(0, n, args.minibatch):
                    idx = perm[s:s + args.minibatch]
                    dist = torch.distributions.Categorical(logits=actor(f_obs[idx]))
                    logp = dist.log_prob(f_act[idx])
                    ratio = torch.exp(logp - f_logp[idx])
                    a1 = ratio * f_adv[idx]
                    a2 = torch.clamp(ratio, 1 - args.clip, 1 + args.clip) * f_adv[idx]
                    v = critic(f_gs[idx], f_obs[idx], f_oh[idx])
                    ent = dist.entropy().mean()
                    loss = -torch.min(a1, a2).mean() + 0.5 * ((v - f_ret[idx]) ** 2).mean() - ent_coef * ent
                    opt.zero_grad()
                    loss.backward()
                    nn.utils.clip_grad_norm_(list(actor.parameters()) + list(critic.parameters()), 0.5)
                    opt.step()
                    ent_mean = ent.item()
            conflict_rate = stats["conflict"] / max(1.0, n_act)
            dv_mean = stats["dv"] / env.N
            wr.writerow([it, total_steps, stage, round(stats["coll"], 5), round(dv_mean, 5), round(stats["fair_gap"], 5),
                         round(conflict_rate, 5), round(ent_mean, 4), round(time.time() - t0, 1)])
            logf.flush()
            recent = (recent + [stats["coll"]])[-5:]
            if it % 10 == 0:
                log(logger, logging.INFO, "iter", it=it, stage=stage, timesteps=total_steps, coll=stats["coll"],
                    dv=dv_mean, conflict=conflict_rate)
            if stage < 3 and ((len(recent) == 5 and max(recent) < 0.01 and stage_steps > budgets[stage] // 4)
                              or stage_steps > budgets[stage]):
                torch.save({"actor": actor.state_dict(), "critic": critic.state_dict(), "stage": stage}, out / f"stage{stage}.pt")
                log(logger, logging.INFO, "advance stage", from_stage=stage, timesteps=total_steps)
                stage, stage_steps, recent = stage + 1, 0, []
            if it % 25 == 0:
                _save(out, actor, critic, norm, stage, total_steps, args)
            it += 1
    finally:
        _save(out, actor, critic, norm, stage, total_steps, args)
        logf.close()
    log(logger, logging.INFO, "done", timesteps=total_steps, stage=stage, minutes=round((time.time() - t0) / 60, 1))


def _save(out, actor, critic, norm, stage, total_steps, args):
    torch.save({"actor": actor.state_dict(), "critic": critic.state_dict(), "obs_mean": norm.mean.cpu(),
                "obs_var": norm.var.cpu(), "stage": stage, "timesteps": total_steps, "seed": args.seed},
               Path(out) / "final.pt")
    (Path(out) / "meta.json").write_text(json.dumps({"stage": stage, "timesteps": total_steps, "seed": args.seed,
                                                     "reward": args.reward}))


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--minutes", type=float, default=60.0)
    ap.add_argument("--out", default="runs/seed1")
    ap.add_argument("--envs", type=int, default=4096)
    ap.add_argument("--epochs", type=int, default=4)
    ap.add_argument("--minibatch", type=int, default=16384)
    ap.add_argument("--lr", type=float, default=3e-4)
    ap.add_argument("--clip", type=float, default=0.2)
    ap.add_argument("--s1-steps", type=int, default=2_000_000)
    ap.add_argument("--s2-steps", type=int, default=5_000_000)
    ap.add_argument("--anneal-steps", type=int, default=30_000_000)
    ap.add_argument("--kelvins", default=None)
    ap.add_argument("--cpu", action="store_true")
    ap.add_argument("--reward", choices=["v1", "v2"], default="v1")
    train(ap.parse_args(argv))


if __name__ == "__main__":
    main()
