"""Web data builder (B8): writes web/data/objects.json, socrates_top.json and episodes.json.

Every file is validated against its schema before it is written (fail closed).
Usage:
  python -m sim.make_web_data --celestrak data/raw/active.json data/raw/debris-*.json \
      --socrates data/raw/socrates.csv --out web/data
"""
import argparse
import csv
import json
import logging
import random
from pathlib import Path

from . import contracts
from .episodes import run_episode
from .log import get_logger, log

SPEC_DIR = Path(__file__).resolve().parent / "specs"
OMM_FIELDS = ("OBJECT_NAME", "OBJECT_ID", "EPOCH", "MEAN_MOTION", "ECCENTRICITY", "INCLINATION",
              "RA_OF_ASC_NODE", "ARG_OF_PERICENTER", "MEAN_ANOMALY", "EPHEMERIS_TYPE", "CLASSIFICATION_TYPE",
              "NORAD_CAT_ID", "ELEMENT_SET_NO", "REV_AT_EPOCH", "BSTAR", "MEAN_MOTION_DOT", "MEAN_MOTION_DDOT")
CREWED_NAMES = ("ISS (ZARYA)", "ISS (NAUKA)", "CSS (TIANHE)", "TIANHE", "CREW DRAGON", "SHENZHOU", "SOYUZ-MS")
OPERATOR_PREFIXES = (
    ("STARLINK", "SpaceX"), ("ONEWEB", "OneWeb"), ("KUIPER", "Amazon Kuiper"), ("IRIDIUM", "Iridium"),
    ("GLOBALSTAR", "Globalstar"), ("ORBCOMM", "ORBCOMM"), ("FLOCK", "Planet"), ("SKYSAT", "Planet"),
    ("LEMUR", "Spire"), ("ISS", "ISS partners"), ("CSS", "China Manned Space"), ("TIANHE", "China Manned Space"),
    ("COSMOS 2251", "Russia (legacy)"), ("FENGYUN 1C", "China (legacy)"),
)
MIX = {"crewed": None, "autonomous": 1500, "manoeuvrable": 800, "debris": 700}

logger = get_logger("make_web_data")


def classify(name):
    """Total classification rule (BR-6): every record gets exactly one class."""
    n = (name or "").upper()
    if " DEB" in n or n.endswith("DEB") or "R/B" in n:
        return "debris"
    if any(n.startswith(c) or c in n for c in CREWED_NAMES):
        return "crewed"
    if n.startswith("STARLINK"):
        return "autonomous"
    return "manoeuvrable"


def operator_for(name):
    n = (name or "").upper()
    for prefix, op in OPERATOR_PREFIXES:
        if n.startswith(prefix):
            return op
    return "Other operator"


def build_objects(records, seed=7):
    by_class = {k: [] for k in MIX}
    seen = set()
    for r in records:
        try:
            norad = int(r["NORAD_CAT_ID"])
        except (KeyError, TypeError, ValueError):
            log(logger, logging.WARNING, "skipping record without NORAD id")
            continue
        if norad in seen or not all(f in r for f in contracts_required()):
            continue
        seen.add(norad)
        cls = classify(r.get("OBJECT_NAME"))
        by_class[cls].append({
            "id": norad, "name": str(r["OBJECT_NAME"])[:64], "class": cls,
            "operator": operator_for(r.get("OBJECT_NAME")),
            "omm": {k: r[k] for k in OMM_FIELDS if k in r},
        })
    rng = random.Random(seed)
    out = []
    for cls, n in MIX.items():
        items = sorted(by_class[cls], key=lambda o: o["id"])
        if n is not None and len(items) > n:
            items = rng.sample(items, n)
        out.extend(sorted(items, key=lambda o: o["id"]))
    return out


def contracts_required():
    return ("OBJECT_NAME", "NORAD_CAT_ID", "EPOCH", "MEAN_MOTION", "ECCENTRICITY", "INCLINATION",
            "RA_OF_ASC_NODE", "ARG_OF_PERICENTER", "MEAN_ANOMALY", "BSTAR")


def build_socrates(csv_path, top=50):
    rows = []
    with open(csv_path, newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            try:
                rows.append({
                    "id1": int(r["NORAD_CAT_ID_1"]), "name1": r["OBJECT_NAME_1"].strip()[:64],
                    "id2": int(r["NORAD_CAT_ID_2"]), "name2": r["OBJECT_NAME_2"].strip()[:64],
                    "tca": r["TCA"].strip(), "range_km": float(r["TCA_RANGE"]),
                    "rel_speed_kms": float(r["TCA_RELATIVE_SPEED"]),
                    "max_prob": min(1.0, max(0.0, float(r["MAX_PROB"]))),
                })
            except (KeyError, ValueError):
                continue
    rows.sort(key=lambda x: (x["range_km"], x["id1"], x["id2"]))
    return rows[:top]


def load_specs(spec_dir=SPEC_DIR):
    return [json.loads(p.read_text(encoding="utf-8")) for p in sorted(Path(spec_dir).glob("*.json"))]


def build_episodes(specs, policy=None):
    episodes = []
    proposer = None
    if policy is not None:
        from .ai_proposer import make_proposer
        proposer = make_proposer(policy)
    for spec in specs:
        if "email_world" in spec:
            episodes.append(run_episode(spec, variant="scripted"))
        episodes.append(run_episode(spec, variant="rules"))
        if proposer is not None:
            episodes.append(run_episode(spec, variant="ai", proposer=proposer))
    return episodes


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--celestrak", nargs="*", default=[], help="CelesTrak GP JSON files")
    ap.add_argument("--socrates", help="CelesTrak SOCRATES CSV")
    ap.add_argument("--out", default="web/data")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--policy", help="exported policy.json; adds AI-variant episodes")
    args = ap.parse_args(argv)
    out = Path(args.out)

    if args.celestrak:
        records = []
        for f in args.celestrak:
            records.extend(json.loads(Path(f).read_text(encoding="utf-8")))
        objs = build_objects(records, args.seed)
        contracts.write_json("objects", objs, out / "objects.json")
        log(logger, logging.INFO, "wrote objects", count=len(objs))
    if args.socrates:
        soc = build_socrates(args.socrates)
        contracts.write_json("socrates_top", soc, out / "socrates_top.json")
        log(logger, logging.INFO, "wrote socrates_top", count=len(soc))
    policy = contracts.read_json("policy", args.policy) if args.policy else None
    eps = build_episodes(load_specs(), policy)
    contracts.write_json("episodes", eps, out / "episodes.json")
    log(logger, logging.INFO, "wrote episodes", count=len(eps))


if __name__ == "__main__":
    main()
