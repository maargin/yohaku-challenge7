"""Policy proposer for the website's AI-variant episodes.

Builds the same 24-float observation as env_torch for each agent of a scripted episode and
runs the exported policy (policy.json) with a pure-Python forward pass. Always shielded.
"""
import math

from .domain import ACTIONS
from .export_policy import forward_json

CAP_ONEHOT = {"manoeuvrable": (1, 0, 0), "autonomous": (0, 1, 0), "crewed": (0, 0, 1), "debris": (0, 0, 0)}
THREAT_ONEHOT = {"debris": (1, 0, 0), "autonomous": (0, 1, 0), "crewed": (0, 0, 1), "manoeuvrable": (0, 0, 0)}


def softmax(xs):
    m = max(xs)
    e = [math.exp(x - m) for x in xs]
    s = sum(e)
    return [v / s for v in e]


def observation(ctx, aid, other):
    a, o = ctx["agents"][aid], ctx["agents"][other]
    miss = ctx["miss_m"]
    return [
        -ctx["t_min"] / 240.0, miss / 1000.0, 0.0, miss / 1000.0,
        max(-10.0, min(0.0, math.log10(ctx["pc"] + 1e-12))) / 10.0, ctx["sigma_m"] / ctx["sigma0_m"],
        *CAP_ONEHOT[a["capability"]], a["fuel"], a["ledger"] / 5.0,
        *THREAT_ONEHOT[o["capability"]], o["fuel"], o["ledger"] / 5.0,
        1.0 if o["intent"] == "hold" else 0.0, 1.0 if o["intent"] == "burn" else 0.0, 0.0, 0.0,
        1.0 if ctx["yielder"] == aid else 0.0, a["offset_m"] / 1000.0, 1.0, 1.0 if o["silent"] else 0.0,
    ]


def make_proposer(policy):
    def propose(ctx):
        ids = list(ctx["agents"])
        out = {}
        for aid in ids:
            other = ids[1] if aid == ids[0] else ids[0]
            probs = softmax(forward_json(policy, observation(ctx, aid, other)))
            action = max(range(len(ACTIONS)), key=lambda k: probs[k])
            out[aid] = (action, [round(p, 6) for p in probs])
        return out
    return propose
