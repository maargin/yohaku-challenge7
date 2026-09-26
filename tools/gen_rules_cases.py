"""Generate random Who-Yields cases with the Python verdicts, for the JS parity test (oracle).

Usage: python -m tools.gen_rules_cases --n 2000 --seed 20260927 --out web/tests/fixtures/rules_cases.json
"""
import argparse
import json
import random
from pathlib import Path

from sim.domain import CAPABILITIES, PURPOSES, Declaration, RegistryEntry
from sim.rules import verdict

BOUNDARY_FUEL = (0.0, 0.19999, 0.2, 0.20001, 0.5, 1.0)
BOUNDARY_BAL = (-3.0001, -3.0, -2.9999, 0.0, 0.5)


def case(rng, i):
    ids = [f"a-{rng.randint(0, 99)}", f"b-{rng.randint(0, 99)}"]
    ops = rng.sample(["K", "O", "A", "N", "L"], 2)
    reg, decls = {}, []
    for aid, op in zip(ids, ops):
        r = RegistryEntry(aid, op, rng.choice(CAPABILITIES), rng.choice(PURPOSES))
        honest = rng.random() < 0.7
        fuel = rng.choice(BOUNDARY_FUEL) if rng.random() < 0.3 else round(rng.random(), 4)
        d = Declaration(aid, r.capability if honest else rng.choice(CAPABILITIES),
                        r.purpose if honest else rng.choice(PURPOSES), fuel, silent=rng.random() < 0.15)
        reg[aid] = r
        decls.append(d)
    bals = {op: (rng.choice(BOUNDARY_BAL) if rng.random() < 0.3 else round(rng.uniform(-6, 6), 3)) for op in ops}
    v = verdict(decls[0], decls[1], reg, bals)
    return {
        "id": i,
        "registry": {k: {"operator": r.operator, "capability": r.capability, "purpose": r.purpose} for k, r in reg.items()},
        "decls": [{"agent_id": d.agent_id, "capability": d.capability, "purpose": d.purpose, "fuel": d.fuel,
                   "silent": d.silent} for d in decls],
        "balances": bals,
        "expected": {"yielder": v.yielder, "stand_on": v.stand_on, "rule": v.rule,
                     "penalties": sorted(p.operator for p in v.penalties)},
    }


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=2000)
    ap.add_argument("--seed", type=int, default=20260927)
    ap.add_argument("--out", default="web/tests/fixtures/rules_cases.json")
    args = ap.parse_args(argv)
    rng = random.Random(args.seed)
    cases = [case(rng, i) for i in range(args.n)]
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"seed": args.seed, "cases": cases}, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {len(cases)} cases (seed {args.seed}) to {out}")


if __name__ == "__main__":
    main()
