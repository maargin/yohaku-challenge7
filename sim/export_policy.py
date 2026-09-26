"""Policy export (B14): actor weights + observation normalisation -> policy.json, 100 test vectors -> testvec.json.

Usage: python -m sim.export_policy --run runs/seed1 --out web/data
"""
import argparse
import math
from pathlib import Path

import torch

from . import contracts
from .domain import ACTIONS
from .env_torch import A, OBS_DIM, STEPS, ConjunctionEnv
from .evaluate import load_policy

CLIP = 10.0


def to_json(actor, mean, var):
    layers = [m for m in actor.net if isinstance(m, torch.nn.Linear)]
    std = torch.sqrt(var + 1e-8)
    return {
        "arch": [OBS_DIM] + [l.out_features for l in layers],
        "activation": "tanh",
        "obs_mean": [float(x) for x in mean.cpu()],
        "obs_std": [float(x) for x in std.cpu()],
        "layers": [{"W": [[float(w) for w in row] for row in l.weight.detach().cpu()],
                    "b": [float(b) for b in l.bias.detach().cpu()]} for l in layers],
        "actions": list(ACTIONS),
    }


def forward_json(policy, obs):
    """Pure-Python forward pass of policy.json (mirrors web/js/policy.js)."""
    x = [max(-CLIP, min(CLIP, (o - m) / s)) for o, m, s in zip(obs, policy["obs_mean"], policy["obs_std"])]
    for k, layer in enumerate(policy["layers"]):
        y = [sum(w * xi for w, xi in zip(row, x)) + b for row, b in zip(layer["W"], layer["b"])]
        x = [math.tanh(v) for v in y] if k < len(policy["layers"]) - 1 else y
    return x


def sample_obs(n_vectors, seed=4242):
    env = ConjunctionEnv(64, device="cpu", seed=seed, stage=3)
    obs = env.reset()
    pool = []
    g = torch.Generator().manual_seed(seed)
    for _ in range(STEPS):
        m = env.acting()
        pool += obs[m].tolist()
        obs, _, _, _ = env.step(torch.randint(0, 7, (env.N, A), generator=g))
    step = max(1, len(pool) // n_vectors)
    return pool[::step][:n_vectors]


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True)
    ap.add_argument("--out", default="web/data")
    args = ap.parse_args(argv)
    actor, norm, ck = load_policy(args.run, "cpu")
    policy = to_json(actor, ck["obs_mean"], ck["obs_var"])
    vecs = []
    for o in sample_obs(100):
        with torch.no_grad():
            logits = actor(norm(torch.tensor([o], dtype=torch.float32)))[0].tolist()
        vecs.append({"obs": o, "logits": logits})
    worst = max(abs(a - b) for v in vecs for a, b in zip(forward_json(policy, v["obs"]), v["logits"]))
    if worst > 1e-4:
        raise SystemExit(f"round-trip check failed: max error {worst}")
    out = Path(args.out)
    contracts.write_json("policy", policy, out / "policy.json")
    contracts.write_json("testvec", vecs, out / "testvec.json")
    print(f"exported policy from {args.run}; round-trip max error {worst:.2e}")


if __name__ == "__main__":
    main()
