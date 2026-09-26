# YOHAKU 2026 · Challenge 7 — orbital coordination prototype

A prototype for coordinating collision avoidance between satellites run by different operators, with no central controller:

- every satellite applies the same **Who-Yields rules** to shared handshake data, so both sides reach the same verdict;
- a **handshake protocol** (PROPOSE / ACK / DO-NOT-MOVE / EXECUTED / ESCALATE) replaces email;
- a double-entry **fairness ledger** records who absorbs the cost of staying safe;
- a **safety shield** escalates high-stakes cases to a human, and no AI policy can switch those triggers off;
- a small multi-agent RL policy can propose actions, always behind the shield.

The full specification is in [`docs/PRD.md`](docs/PRD.md).

## Layout
| Path | Contents |
|---|---|
| `sim/` | Python: contracts, rules, handshake, ledger, shield, episode simulator, data builder (and later the RL environment and training) |
| `schema/` | JSON Schemas for every data file the website reads |
| `web/` | Static website (no build step) |
| `tools/` | Helper scripts (parity cases, SRI hashes) |
| `docs/` | PRD and governance content |

## Quick start
```bash
pip install -r requirements.txt
npm install
pytest                     # example-based + property-based tests (Hypothesis)
npm test                   # JS rules tests + Python/JS parity (fast-check)
python -m sim.make_web_data --celestrak data/raw/active.json --socrates data/raw/socrates.csv
python -m http.server 8000 # then open http://localhost:8000/web/
```

Collision probabilities in this project are **illustrative**: dynamics are linearised and public orbit data carries no covariance.

## Data and credits
- Orbital elements and conjunction screening: CelesTrak (T.S. Kelso).
- Conjunction scenarios: ESA Kelvins Collision Avoidance Challenge dataset, CC-BY-4.0, Zenodo 10.5281/zenodo.4463683 (Uriot et al. 2022).

## Licence
MIT — see [`LICENSE`](LICENSE).
