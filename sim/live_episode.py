"""A live Mission Control scenario for two real catalogue objects, decided by the episode simulator.

The scenario is hypothetical (the two objects are put on a close pass with the requested geometry); their class,
name and operator are real. The result is an ordinary AI-variant episode, so every panel on the site can play it.
"""
import json
from pathlib import Path

from . import contracts
from .ai_proposer import make_proposer
from .episodes import run_episode

CLASSES = ("debris", "manoeuvrable", "autonomous", "crewed")
COMMERCIAL = ("spacex", "starlink", "oneweb", "amazon", "kuiper", "planet", "iridium", "ses ", "eutelsat", "telesat",
              "spire", "globalstar", "orbcomm")
DEFAULT_FUEL = {"debris": 0.0, "manoeuvrable": 0.6, "autonomous": 0.7, "crewed": 0.5}
NAME_MAX = 40


def load_objects(path):
    """{norad id: {id, name, class, operator}} from the site's objects file."""
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    items = data if isinstance(data, list) else data["objects"]
    out = {}
    for o in items:
        if o.get("class") not in CLASSES:
            continue
        oid = int(o["id"])
        out[oid] = {"id": oid, "name": str(o["name"])[:NAME_MAX], "class": o["class"],
                    "operator": str(o.get("operator") or "Unknown operator")[:NAME_MAX]}
    return out


def purpose_for(obj):
    if obj["class"] == "debris":
        return "none"
    text = f'{obj["operator"]} {obj["name"]} '.lower()
    return "commercial" if any(k in text for k in COMMERCIAL) else "public_good"


def build_spec(a, b, miss_m=80.0, sigma0_m=1200.0, sigma_min_m=100.0, fuel=None):
    """Episode spec for objects a and b (records from load_objects). fuel: optional {norad id: 0..1}."""
    fuel = fuel or {}
    agents, registry = [], {}
    for o in (a, b):
        aid = f"obj-{o['id']}"
        f = 0.0 if o["class"] == "debris" else min(1.0, max(0.0, float(fuel.get(o["id"], DEFAULT_FUEL[o["class"]]))))
        agents.append({"id": aid, "name": o["name"], "operator": o["operator"], "fuel": f})
        registry[aid] = {"capability": o["class"], "purpose": purpose_for(o)}
    sigma0 = max(30.0, float(sigma0_m))
    return {
        "id": f"live-{a['id']}-{b['id']}",
        "title": f"Live: {a['name']} and {b['name']}"[:120],
        "agents": agents, "registry": registry,
        "encounter": {"miss0_m": abs(float(miss_m)), "sigma0_m": sigma0, "sigma_min_m": min(sigma0, max(30.0, float(sigma_min_m)))},
    }


def run_pair(spec, policy_json):
    """The AI-variant episode for the spec, validated against the site's contract."""
    ep = run_episode(spec, variant="ai", proposer=make_proposer(policy_json))
    contracts.validate("episodes", [ep])
    return ep
