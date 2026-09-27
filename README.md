# YOHAKU 2026 · Challenge 7 — orbital coordination prototype

A prototype for coordinating collision avoidance between satellites run by different operators, with no central controller:

- every satellite runs the same **onboard AI** inside a shared **safety layer** (a fixed priority check on handshake data plus hard triggers), so both sides reach the same decision;
- a **handshake protocol** (PROPOSE / ACK / DO-NOT-MOVE / EXECUTED / ESCALATE) replaces email;
- a double-entry **fairness ledger** records who absorbs the cost of staying safe;
- a **safety shield** escalates high-stakes cases to a human, and no AI policy can switch those triggers off;
- a small multi-agent RL policy can propose actions, always behind the shield.

The full specification is in [`docs/PRD.md`](docs/PRD.md).

## Layout
| Path | Contents |
|---|---|
| `sim/` | Python: contracts, safety layer (priority check + triggers), handshake, ledger, episode simulator, data builder, GPU environment, MAPPO training and evaluation |
| `schema/` | JSON Schemas for every data file the website reads |
| `web/` | Static website (no build step) |
| `tools/` | Helper scripts (parity cases, SRI hashes) |
| `docs/` | PRD and governance content |

## Quick start
```bash
pip install -r requirements.txt
npm install
pytest                     # example-based + property-based tests (Hypothesis)
npm test                   # JS tests: safety layer, policy and live-simulator parity with Python
python -m sim.make_web_data --celestrak data/raw/active.json --socrates data/raw/socrates.csv
python -m http.server 8000 # then open http://localhost:8000/web/
```

Collision probabilities in this project are **illustrative**: dynamics are linearised and public orbit data carries no covariance.

## Data and credits
- Orbital elements and conjunction screening: CelesTrak (T.S. Kelso).
- Conjunction scenarios: ESA Kelvins Collision Avoidance Challenge dataset, CC-BY-4.0, Zenodo 10.5281/zenodo.4463683 (Uriot et al. 2022).

## Licence
MIT — see [`LICENSE`](LICENSE).

## Deploy (GitHub Pages)
Pushing to `main` runs `.github/workflows/pages.yml`, which checks and publishes `web/`.
```bash
npm run check:site                                   # site files only, vendor checksums
node tools/check_headers.mjs https://<user>.github.io/<repo>/
bash tools/prepublish_check.sh                       # before making the repository public
```
GitHub Pages cannot send custom HTTP headers, so the CSP and referrer policy are set with `<meta>` tags in `index.html`; `web/_headers` keeps the full header set for hosts that support it.
