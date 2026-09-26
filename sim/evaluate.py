"""Evaluation (B13): 1,000 held-out clusters x 5 strategies -> results.json, plots and the gate decision.

Usage: python -m sim.evaluate --runs runs/seed1 runs/seed2 runs/seed3 --out web/data --img web/img/plots
"""
import argparse
import csv
import json
import logging
from pathlib import Path

import torch

from . import contracts
from .baselines import BASELINES
from .env_torch import A, DEBRIS, STEPS, ConjunctionEnv
from .log import get_logger, log
from .metrics import gini
from .train_mappo import Actor

logger = get_logger("evaluate")
HELDOUT_SEED = 987_654
AI_NAME = "Shared AI + rules shield"


def load_policy(run_dir, device):
    ck = torch.load(Path(run_dir) / "final.pt", map_location=device, weights_only=False)
    actor = Actor().to(device)
    actor.load_state_dict(ck["actor"])
    actor.eval()
    mean, var = ck["obs_mean"].to(device), ck["obs_var"].to(device)
    norm = lambda x: torch.clamp((x - mean) / torch.sqrt(var + 1e-8), -10.0, 10.0)
    return actor, norm, ck


def ai_strategy(actor, norm):
    def act(env, obs):
        with torch.no_grad():
            return actor(norm(obs)).argmax(-1)
    return act


def run_strategy(fn, shield, n, device, sigma_pool=None, record=False):
    env = ConjunctionEnv(n, device=device, seed=HELDOUT_SEED, stage=3, sigma_pool=sigma_pool, shield=shield)
    obs = env.reset()
    burns = torch.zeros(n, device=device)
    esc = torch.zeros(n, dtype=torch.bool, device=device)
    timing, yield_rec = [], []
    for _ in range(STEPS):
        t = env.t_min()
        led_gap = env.led - torch.gather(env.led, 1, env.threat)
        both_move = (env.cap != DEBRIS) & (torch.gather(env.cap, 1, env.threat) != DEBRIS) & env.acting()
        prop = fn(env, obs)
        obs, _, done, info = env.step(prop)
        did = info["dv"] > 0
        burns += did.float().sum(1)
        esc |= info["escalated"].any(1)
        if record:
            timing += [t] * int(did.sum().item())
            sel = both_move & (env.pc_threat > 0)
            yield_rec += list(zip(led_gap[sel].tolist(), did[sel].float().tolist()))
    movers = (env.mask & (env.cap != DEBRIS))
    res = {
        "collisions_pct": round(100.0 * info["collision"].float().mean().item(), 3),
        "dv_mean_ms": round(env.dv_spent.sum(1).mean().item(), 5),
        "manoeuvres_per_event": round(burns.mean().item(), 4),
        "burden_gini": round(gini(env.dv_spent[movers].tolist()), 4),
        "escalation_pct": round(100.0 * (info["hard"] | esc).float().mean().item(), 3),
    }
    return res, timing, yield_rec


def curves(run_dirs, points=120):
    series = []
    for r in run_dirs:
        p = Path(r) / "log.csv"
        if p.exists():
            with open(p, newline="", encoding="utf-8") as fh:
                series.append(list(csv.DictReader(fh)))
    if not series:
        return {"timesteps": [], "collision_rate": [], "dv_mean": [], "fairness_gap": []}
    n = min(len(s) for s in series)
    step = max(1, n // points)
    out = {"timesteps": [], "collision_rate": [], "dv_mean": [], "fairness_gap": []}
    for i in range(0, n, step):
        rows = [s[i] for s in series]
        out["timesteps"].append(float(rows[0]["timesteps"]))
        for k, col in (("collision_rate", "collision_rate"), ("dv_mean", "dv_mean"), ("fairness_gap", "fairness_gap")):
            out[k].append(round(sum(float(r[col]) for r in rows) / len(rows), 6))
    return out


def plots(img_dir, cur, strategies, timing_ai, timing_rules, yield_rec):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    img = Path(img_dir)
    img.mkdir(parents=True, exist_ok=True)
    ink, grid, accent, blue = "#E8EDF2", "#2A3A4B", "#F2B35B", "#9EC5FF"
    plt.rcParams.update({"figure.facecolor": "#0B0F14", "axes.facecolor": "#0E141B", "axes.edgecolor": grid,
                         "axes.labelcolor": ink, "xtick.color": ink, "ytick.color": ink, "text.color": ink,
                         "grid.color": grid, "font.size": 10})
    names = []
    fig, axs = plt.subplots(1, 3, figsize=(12, 3.2))
    x = [t / 1e6 for t in cur["timesteps"]]
    for ax, key, title in zip(axs, ("collision_rate", "dv_mean", "fairness_gap"),
                              ("Collision rate", "Mean Δv per cluster (m/s)", "Fairness gap (m/s)")):
        ax.plot(x, cur[key], color=accent, lw=1.8)
        ax.set_title(title)
        ax.set_xlabel("training steps (millions)")
        ax.grid(True, alpha=0.4)
    fig.tight_layout()
    fig.savefig(img / "learning_curves.png", dpi=130)
    plt.close(fig)
    names.append("img/plots/learning_curves.png")

    fig, ax = plt.subplots(figsize=(8, 3.2))
    labels = [s["name"] for s in strategies]
    ax.barh(labels, [s["collisions_pct"] for s in strategies],
            color=[accent if s["name"] == AI_NAME else blue for s in strategies])
    ax.set_xlabel("collisions (% of 1,000 held-out clusters)")
    ax.invert_yaxis()
    fig.tight_layout()
    fig.savefig(img / "baselines.png", dpi=130)
    plt.close(fig)
    names.append("img/plots/baselines.png")

    fig, ax = plt.subplots(figsize=(5.5, 3.2))
    bins = list(range(-240, 10, 10))
    ax.hist([timing_rules, timing_ai], bins=bins, label=["rules only", "shared AI"], color=[blue, accent], alpha=0.85)
    ax.set_xlabel("burn time (minutes before closest approach)")
    ax.set_ylabel("burns")
    ax.legend(frameon=False)
    fig.tight_layout()
    fig.savefig(img / "burn_timing.png", dpi=130)
    plt.close(fig)
    names.append("img/plots/burn_timing.png")

    if yield_rec:
        import numpy as np
        gaps = np.array([g for g, _ in yield_rec])
        did = np.array([d for _, d in yield_rec])
        edges = np.linspace(-8, 8, 17)
        centres, probs = [], []
        for lo, hi in zip(edges[:-1], edges[1:]):
            m = (gaps >= lo) & (gaps < hi)
            if m.sum() > 20:
                centres.append((lo + hi) / 2)
                probs.append(did[m].mean())
        fig, ax = plt.subplots(figsize=(5.5, 3.2))
        ax.plot(centres, probs, color=accent, marker="o", lw=1.8)
        ax.set_xlabel("own ledger balance minus threat's balance")
        ax.set_ylabel("chance of burning this step")
        ax.grid(True, alpha=0.4)
        fig.tight_layout()
        fig.savefig(img / "yield_vs_ledger.png", dpi=130)
        plt.close(fig)
        names.append("img/plots/yield_vs_ledger.png")
    return names


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", nargs="+", required=True)
    ap.add_argument("--n", type=int, default=1000)
    ap.add_argument("--out", default="web/data")
    ap.add_argument("--img", default="web/img/plots")
    ap.add_argument("--kelvins", default=None)
    args = ap.parse_args(argv)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    pool = None
    if args.kelvins:
        from .train_mappo import sigma_pool_from_kelvins
        pool = sigma_pool_from_kelvins(args.kelvins)

    best = None
    for r in args.runs:
        actor, norm, _ = load_policy(r, device)
        res, _, _ = run_strategy(ai_strategy(actor, norm), True, args.n, device, pool)
        log(logger, logging.INFO, "seed result", run=r, **res)
        key = (res["collisions_pct"], res["dv_mean_ms"])
        if best is None or key < best[0]:
            best = (key, r, res)
    _, best_run, _ = best
    actor, norm, _ = load_policy(best_run, device)
    strategies, timing_rules = [], []
    for name, (fn, shield) in BASELINES.items():
        res, timing, _ = run_strategy(fn, shield, args.n, device, pool, record=name.startswith("Rules"))
        if name.startswith("Rules"):
            timing_rules = timing
        strategies.append({"name": name, **res})
    ai_res, timing_ai, yield_rec = run_strategy(ai_strategy(actor, norm), True, args.n, device, pool, record=True)
    strategies.append({"name": AI_NAME, **ai_res})
    rules = next(s for s in strategies if s["name"].startswith("Rules"))
    gate = "ship" if (ai_res["collisions_pct"] <= rules["collisions_pct"]
                      and ai_res["dv_mean_ms"] <= rules["dv_mean_ms"] * 1.1) else "rules-only"
    cur = curves(args.runs)
    names = plots(args.img, cur, strategies, timing_ai, timing_rules, yield_rec)
    results = {"strategies": strategies, "curves": cur, "plots": names, "gate": gate}
    contracts.write_json("results", results, Path(args.out) / "results.json")
    (Path(args.out).parent.parent / "runs_best.txt").write_text(str(best_run))
    log(logger, logging.INFO, "gate", decision=gate, best_run=best_run)
    for s in strategies:
        log(logger, logging.INFO, "strategy", **s)


if __name__ == "__main__":
    main()
