# [Project Name TBD] — Product Requirements Document

*Version 0.4 · 26 Sep 2026 · Status: approved for build · Team: 2 members · Working placeholder: **"the System"***

This PRD is a living document: it is updated as the build progresses and becomes the record of the full implementation.

---

## 1. Context

- **Event:** Space4Innovation × Tama University, YOHAKU 2026. **Challenge 7: "What can we learn from mycelium? Fungi, AI and shared decisions in orbit"** (challenge leads: Diana Mastracci, Prof. Takashi Hikasa).
- **Deadline:** Sunday 27 September 2026, 14:00 CEST.
- **Required:** a solution in any form, plus a 2-minute video explaining it.

## 2. Problem statement

Orbit has become **orbital mixed traffic**. About 10,000 active satellites from many operators share space with about 40,000 tracked debris objects. In 12 months, Starlink alone made about 355,000 collision-avoidance manoeuvres.

There is **no universal right-of-way**, and coordination is still ad hoc:

- **September 2019:** ESA's Aeolus had to manoeuvre alone to avoid Starlink 44, because a follow-up email was never seen.
- **December 2025:** orbital data was shared only 14 minutes before a 200 m close pass.

As AI takes over more of these decisions, key questions remain open:

- Who moves when both objects can? What changes when one is debris?
- Who pays the fuel cost of repeated avoidance? Should a satellite's purpose, or its contribution to the risk, matter?
- Where should AI sit, and when must a human step in?
- Who is responsible when an AI-shaped decision causes harm? Who decides what the network learns?
- **NARETU:** what does each actor owe the others, and those who come after?

## 3. Solution overview

The System is a coordination system inspired by mycorrhizal (fungal) networks.

| Fungal network | The System |
|---|---|
| Hyphal tips sense and respond locally | Every satellite carries the **same small trained AI policy**, which senses risk and decides on its own |
| One connected network | Satellites broadcast intent to their neighbours over "hyphae" links (shared data plus a handshake) |
| A market with sanctions (Kiers et al. 2011) | A **fairness ledger** rewards those who yield and penalises free-riders |
| What nature lacks | Shared **right-of-way rules**, **human escalation**, **responsibility allocation**, **governed learning** and **obligations to the future (NARETU)** |

**Tagline:** *"Borrow the fungus's architecture, not its morality."*

## 4. Goals and non-goals

| Goals | Non-goals |
|---|---|
| G1: A working decentralised prototype with a trained AI | Operational-grade collision probability or orbit determination |
| G2: An explicit answer to every challenge question | Integration with real operator systems |
| G3: An honest analogy map (holds / bends / breaks) | Certified safety or legal advice |
| G4: An answer to the NARETU obligations question | A native mobile app |
| G5: A compelling 2-minute video and a demo link that opens | |

## 5. Personas

- **P1, Judges:** interested in mixed-traffic ethics, priority for vulnerable users, and governance. They need to grasp the idea in 2 minutes, then explore it.
- **P2, Satellite operator:** uses the dashboard. Sees alerts and AI decisions, and approves or overrides them.
- **P3, Regulator / incident board:** reviews the decision log and approves learning updates.

---

## 6. Features

### 6.1 Core demo features

| ID | Feature | Description | Acceptance criteria |
|---|---|---|---|
| F1 | **Space Map** | 3D Earth showing about 3,000 real objects from a CelesTrak snapshot, coloured by type: grey = debris, blue = manoeuvrable, green = autonomous, gold = crewed. Time-lapse playback. | Loads in under 5 s; at least 30 fps; legend shown; credit "Data: CelesTrak" |
| F2 | **Danger Threads (hyphae)** | Glowing arcs link objects on a close pass. They get thicker and brighter as risk rises and fade afterwards (a slime-mould-style reinforce-and-decay rule). | Thread lifecycle visible for every scripted event |
| F3 | **Onboard AI Brain** | A trained, shared RL policy runs live in the browser for each satellite. A panel shows what the satellite sees, its action probabilities and the action it chose. | Browser output matches Python within 1e-4 on 100 test vectors |
| F4 | **Who-Yields Rules** | Right-of-way rules in the style of maritime COLREGs. Priority: debris and non-manoeuvrable objects hold course, then crewed, then low-fuel, then science / public-good, then commercial. Tie-breaks: larger fuel margin yields, then ledger balance, then a deterministic ID. The object holding course must act by a deadline if the other side stays silent. | Deterministic: both satellites compute the same verdict |
| F5 | **Intent Handshake Feed** | Chat-style log of PROPOSE / ACK / DO-NOT-MOVE / EXECUTED / ESCALATE messages | Visible for each event, with timestamps |
| F6 | **Fairness Ledger** | Per operator: fuel spent, avoidance manoeuvres absorbed, risk contributed, debris legacy. Yielding earns credit; free-riders lose priority. Optional orbit-use fee pool, with a discount for emerging space nations. | Updates after each event; bar chart |
| F7 | **Human Escalation Ladder** | Autonomy levels L0–L4. A human is called in when Pc > 1e-3, a crewed vehicle is involved, rules conflict, the counterpart is silent, the fuel cost is high, AI confidence is low, or the predictor raises an alarm. Modal offers Approve / Override / Stop. Überlingen rule: an agreed machine plan beats an ad-hoc override. | Modal appears on trigger; the action is logged with who decided |
| F8 | **Danger Predictor** | LightGBM model trained on about 13,000 real ESA conjunction events. Predicts early whether a warning will become dangerous, compared against ESA's "latest risk" baseline. | Honest metrics reported against the baseline |
| F9 | **AI Explainer** | A local open-weight LLM writes a plain-English reason for each decision. Explanations are pre-generated for the public site and generated live in Live mode, with a template fallback. | Every scripted event has an explanation; the site works without the server |
| F10 | **2019 Aeolus Replay** | Split screen: "Email world" (the real timeline) against "the System's world" | Runs in under 40 s; labelled "scripted from ESA's published timeline" |
| F11 | **Kessler Finale** | "What if we fail?": one collision becomes thousands of fragments, and the threads multiply | Runs without the frame rate collapsing |
| F12 | **Results Panel** | AI against 3 baselines on 1,000 test scenarios, plus learning curves and emergent-behaviour plots | Loaded from `results.json` |
| F17 | **Live API mode** | The site calls a small server on the GPU machine. (a) **Ask the AI why:** a live LLM answer about the current decision. (b) **Generate a new scenario:** fresh near-misses solved by the trained AI. (c) **Run tests now:** a live baseline comparison. A badge shows LIVE or OFFLINE. | The site detects the API automatically; every live feature has a static fallback |

### 6.2 Governance features (page sections and video)

| ID | Feature | Description |
|---|---|---|
| F13 | **Where the Analogy Breaks** | Table of where the fungal analogy holds, bends and breaks (Simard et al. 1997; Kiers et al. 2011; Karst et al. 2023) |
| F14 | **Responsibility Matrix** | Failure modes against operator / AI developer / data provider / licensing state / international body. Evidence of fault: whether the rules were followed, and what the ledger shows. |
| F15 | **Learning Governance** | The network logs every case. Changes to rules or models need approval from an independent "Orbital Incident Board", and every version is recorded. |
| F16 | **NARETU Obligations Charter** | What each actor owes, to whom, and over what time horizon, including a cap on the debris legacy left to future generations. The NARETU framing is credited to the challenge brief and to Chief Titus Letaapo. |

---

## 7. System architecture

```
+-------------------------- GPU training server ---------------------------+
|  BACKEND (Python)                                                        |
|  (1) Data pipeline   -> scenarios, objects, SOCRATES top-50              |
|  (2) RL training     -> MAPPO policy (GPU) -> policy.json                |
|  (3) Evaluation      -> results.json + plots                             |
|  (4) Risk predictor  -> LightGBM -> risk scores                          |
|  (5) Explainer       -> local LLM -> explanations.json                   |
|  (6) Live API        -> FastAPI (HTTPS, private network only)            |
+--------------+-------------------------------------+---------------------+
               | static JSON / PNG (build artefacts) | live (optional)
               v                                     v
+----------------------- FRONTEND (static website) ------------------------+
|  globe, threads, AI brain (in-browser inference), rules, handshake,      |
|  ledger, escalation, replay, Kessler, results, governance                |
+--------------------------------------------------------------------------+
```

**Principle: live when possible, always safe offline.** The website runs entirely from static files. When the Live API is reachable, it switches to LIVE mode and a badge in the top bar shows it.

### 7.1 Live API

A small FastAPI server on the GPU machine. The website sends it requests and receives results.

| Endpoint | Purpose | Uses |
|---|---|---|
| `GET /health` | Availability check; drives the LIVE / OFFLINE badge | — |
| `POST /explain` | Send a decision, optionally with a question; get a plain-English answer | Local LLM |
| `POST /simulate` | Send settings (number of satellites, debris, fuel levels); get fresh episodes run by the trained policy | RL policy (GPU) |
| `POST /benchmark` | Run N test scenarios now; get AI vs baseline metrics | RL environment (GPU) |
| `POST /predict_risk` | Send a conjunction's CDM history; get a danger score | LightGBM |

**Access:** served over HTTPS inside a private network. Devices outside it, such as judges' browsers, fall back to OFFLINE mode automatically.

**Guardrails:**
- rate limit
- maximum scenario size
- an allow-list of site origins (CORS)
- the API runs only during demos

## 8. Backend (Python, GPU server)

| Module | Purpose |
|---|---|
| `sim/scenarios.py` | Load the ESA Kelvins CSV (CC-BY-4.0) and bootstrap whole events into encounter geometry: miss vector, relative velocity, uncertainty schedule |
| `sim/env_torch.py` | Batched multi-agent GPU environment with 4,096 parallel encounters. Clohessy-Wiltshire dynamics projected onto the encounter plane. 24 steps of 10 minutes each. |
| `sim/rules.py` | Who-Yields rules engine (mirrored in JS) |
| `sim/baselines.py` | Four baselines: do nothing; both burn if Pc > 1e-4; lower ID yields; rules only |
| `sim/train_mappo.py` | PPO with a shared actor and a centralised critic. Curriculum: debris, then 2 satellites, then 2–6 satellites including crewed vehicles and third parties. 3 seeds; CSV logs. |
| `sim/evaluate.py` | Runs 1,000 held-out seeds and writes `results.json` plus plots: learning curves, baseline table, yield-vs-ledger curve, burn-timing histogram, along-track-only (±T) ablation |
| `sim/risk_model.py` | LightGBM on CDMs issued at least 2 days before TCA, compared with the latest-risk baseline |
| `sim/explain.py` | Batch LLM explanations, written to `explanations.json` |
| `sim/export_policy.py` | Exports weights and observation normalisation to `policy.json`, and 100 test vectors to `testvec.json` |
| `sim/make_web_data.py` | Builds the web data: a CelesTrak subset to `objects.json`, the SOCRATES top 50 to `socrates_top.json`, and scripted episodes to `episodes.json` |
| `sim/api.py` | Live API (§7.1) |
| `sim/tests/` | Tests: CW burn produces the expected shift; Pc sanity; rule determinism; environment shapes |

### RL specification

- **Observation** (~24 floats):
  - time to TCA, miss vector, log Pc, σ, relative velocity
  - own and neighbour fuel, ledger balance and class
  - the neighbour's declared intent
  - the offset already committed
  - the miss distance to any third party
- **Actions** (Discrete(7)):
  - hold
  - small opening burn, large opening burn, small closing burn
  - radial burn
  - request that the other object yields
  - escalate to a human
- **Reward:** β·team + (1−β)·self, made up of:
  - −100 for a collision
  - Pc shaping
  - −20 for creating a secondary conjunction
  - −fuel used
  - −fairness gap
  - −5 for escalating
  - −0.1 per yield request
- **Network and training:** MLP 64×64 with tanh; 4,096 parallel environments; learning rate 3e-4; γ = 0.99; λ = 0.95; clip 0.2.

## 9. Frontend (static website)

**Tech:** plain HTML with ES modules and no build step. Libraries from a CDN: `globe.gl` (three.js), `satellite.js` (SGP4) and `Chart.js`. Dark space theme plus a light mode; responsive, designed desktop-first.

**Layout:**

1. **Hero:** headline statistics and a "Launch demo" button.
2. **Mission Control:**
   - **Centre:** globe (F1) with threads (F2).
   - **Left panel:** event list and escalation status (F7).
   - **Right panel tabs:** AI Brain (F3), Handshake (F5), Explanation (F9), Ledger (F6).
   - **Top bar:**
     - time controls and a scenario picker
     - buttons: "Replay 2019" (F10), "What if we fail?" (F11)
     - a "Rules only vs AI" toggle
     - the LIVE / OFFLINE badge
   - **Modal:** human decision (Approve / Override / Stop).
3. **Results** (F12).
4. **How it works:** diagram mapping mycelium to orbit.
5. **Governance sections:** where the analogy breaks (F13), responsibility (F14), learning governance (F15), NARETU charter (F16).
6. **Sources and credits.**

**JS modules** (in `web/js/`):

| Module | Role |
|---|---|
| `globe.js` | Globe rendering |
| `threads.js` | Danger threads |
| `env.js` | CW dynamics port |
| `policy.js` | MLP forward pass and parity test |
| `rules.js` | Who-Yields rules |
| `ledger.js` | Fairness ledger |
| `escalation.js` | Human escalation |
| `explainer.js` | Explanations: live, then static, then template |
| `api.js` | Live API client and badge |
| `replay.js` | 2019 Aeolus replay |
| `kessler.js` | Kessler finale |
| `results.js` | Results panel |
| `ui.js` | Page wiring |

**Data** (in `web/data/`): `objects.json`, `socrates_top.json`, `episodes.json`, `policy.json`, `testvec.json`, `explanations.json`, `results.json`, `risk_scores.json`.

**Performance:**
- at most 3,000 points
- positions propagated about once a second, not every frame
- objects drawn as points, not meshes

## 10. Repository

```
README.md · LICENSE (MIT) · .gitignore
docs/  PRD.md · governance.md · method.md · submission-answers.md
sim/   backend
web/   frontend
```

- The repository is private for now and will be made public if the submission requires it.
- The Live API URL is kept in a local, uncommitted config file. A `config.example.js` is committed instead.
- **Credits:**
  - ESA Kelvins Collision Avoidance dataset: CC-BY-4.0, Zenodo 10.5281/zenodo.4463683 (Uriot et al. 2022)
  - CelesTrak (T.S. Kelso)
  - globe.gl and satellite.js (MIT)
  - No GPL code is included.

## 11. Non-functional requirements

- The static site works fully without the server; LIVE mode switches on when the server is reachable.
- Every Pc value is labelled **illustrative**, and the use of linearised dynamics is stated.
- The site runs at 30 fps or better on a laptop and first loads in under 5 s.

## 12. Success metrics

- **RL against baselines, over 1,000 scenarios:**
  - collisions no higher than the best rule baseline
  - less Δv per event
  - a lower burden Gini
  - escalations below 10%
- **Emergent behaviour:**
  - the probability of yielding rises with ledger imbalance
  - burns happen earlier and smaller, and are along-track
- **Predictor:** results reported honestly against ESA's baseline.
- **Demo:** every feature reachable, and the video no longer than 2:00.

## 13. Priorities

| Tier | Scope |
|---|---|
| **MUST** | Video; submission answers; a demo link that opens; F1, F2, F4, F5, F6, F7, F10; F13–F16 |
| **SHOULD** | F3 (trained RL in the browser); F12 results; F9 explainer (static) |
| **COULD** | F17 Live API; F8 predictor; F11 Kessler finale; F15 as a diagram |

## 14. Risks and fallbacks

| Risk | Fallback |
|---|---|
| Multi-agent RL does not converge | Single-agent PPO against a rule-following partner, with the same policy on every satellite |
| GPU or driver issue | Train on CPU instead |
| Predictor performs poorly | Report it honestly and use it only as one escalation signal |
| LLM unavailable | Template explanations |
| Time overrun | F11 and F15 become slides; the Live API is reduced to `/health` and `/explain` |
| Live API unreachable | Static mode still shows every feature |

## 15. Video outline (2:00)

| Time | Beat |
|---|---|
| 0:00 | **Hook:** 207,000 avoidance manoeuvres in 6 months, and the 2019 email miss |
| 0:15 | **Mycelium lens**, then the twist: it is a "market with sanctions" |
| 0:35 | **Demo:** the 2019 replay, the AI brain, the handshake and the ledger |
| 1:10 | **Humans and AI:** escalation, the Überlingen lesson, the learning board |
| 1:30 | **Where the analogy breaks** |
| 1:45 | **NARETU charter**, closing on "protect the vulnerable first" |

## 16. Verification

- `pytest sim/tests` passes, and the collision rate in evaluation is below 1% at each curriculum stage.
- The browser console shows "policy parity OK" (maximum error below 1e-4).
- Manual walkthrough: every feature is visible, and the site works with the server offline.

## 17. Submission (YOHAKU 2026 final form)

| Field | Deliverable |
|---|---|
| Team name, solution title, members, location, organisation, bios | To be decided and filled in by the team |
| 2-minute video (required) | Screen recording of the demo with the team's own voice-over |
| Final work link (required) | Demo website URL and a governance one-pager (PDF) |
| Code repository | This repository (MIT) |
| Relationships & Consequences | Answer draws on F4, F6, F7 |
| Knowledge, Authority & Reciprocity | Answer draws on F13 and the credits |
| Orbital Stewardship & Justice | Answer draws on F6, F11, F16 |
| Responsible AI & Accountability | Answer draws on F3, F7, F14, F15 |
| From Obligation to Action | Next steps: open handshake protocol spec; ledger pilot on existing data-sharing platforms; input to priority-rule standards; university mixed-traffic testbed |
| AI use | An honest disclosure of the AI tools used during the build and of the AI components in the solution |

Full drafts of the text answers are in `docs/submission-answers.md`.

---

## 18. Team and ownership

| | **Member A — Sanskar** (lead, backend & story) | **Member B** (frontend, full-time) |
|---|---|---|
| **Owns folder** | `sim/`, `docs/` | `web/` |
| **Features** | F3 model side (training, export), F4 rules engine (Python + `rules.js`), F8, F9 (LLM), F12 data, F17 server; F13–F16 content; submission answers; video + voice-over | F1, F2, F5, F6, F7, F10, F11; F3 panel + `policy.js`/`env.js`; F9/F12/F17 UI; governance sections layout (F13–F16); hosting + deploy |
| **Machine** | GPU server 1 (training, LLM, Live API) | Own Linux machine (same spec) for web dev; optional extra training seeds |
| **Delivers to the other** | Real data files replacing mocks (§19), `rules.js`, API URL for Live mode | Deployed demo URL, screen-recording-ready UI |

**Working rules**
- Branches: `backend/*` (A) and `frontend/*` (B); small PRs into `main`; A reviews B's PRs and vice versa (10-min max).
- Each member only edits their own folder; shared files (`README.md`, `docs/PRD.md`) edited by A.
- B starts immediately against **mock data files** (§19) committed by A in the first hour; A swaps in real files later with the same format.
- Sync points (15 min call): 16:00, 20:00, 23:30 IST Sat; 08:30, 12:00 IST Sun.

**Team timeline (IST)**
| When | Member A | Member B |
|---|---|---|
| Sat 15:00–16:00 | Mock data files + contracts (§19) + `rules.js` | Page skeleton, layout, theme, globe (F1) with `objects.json` |
| 16:00–20:00 | RL env, tests, baselines, training (GPU) | Threads (F2), event list, handshake feed (F5), ledger (F6) |
| 20:00 | **Hosting decided + first deploy** (B) | |
| 20:00–23:30 | Evaluation, plots, export `policy.json`, static explanations | Escalation modal (F7), AI Brain panel + `policy.js` parity test (F3), Aeolus replay (F10) |
| 23:30–01:30 | Governance content (F13–F16), submission answer drafts | Results panel (F12), governance sections, sources/credits |
| 01:30–06:30 | Sleep (extra training seeds run overnight) | Sleep |
| Sun 06:30–08:30 | Live API + predictor (COULD) | Live mode UI (`api.js`), Kessler (F11), polish |
| 08:30 | **Feature freeze** | |
| 08:30–10:30 | Final data swap, one-pager, answers final | Bug fixes, performance, final deploy |
| 10:30–13:30 | Video script, record + voice-over, edit | Screen recordings for the video; test on another device |
| 13:30–16:30 | Fill form, **submit by 16:30 IST** | Buffer / backup |

## 19. Interface contracts (data files and API)

All files live in `web/data/`. Mocks (same shape, fake values) are committed first; real files replace them.

- **`objects.json`** — `[{ "id": 25544, "name": "ISS (ZARYA)", "class": "crewed"|"autonomous"|"manoeuvrable"|"debris", "operator": "string", "omm": { CelesTrak OMM JSON fields } }]`
- **`episodes.json`** — `[{ "id": "aeolus-2019", "title": "...", "scripted": true, "agents": [{ "id", "name", "class", "operator", "fuel": 0-1, "ledger": number }], "steps": [{ "t_min": -240..0, "pc": number, "miss_m": number, "sigma_m": number, "actions": { "<agentId>": { "action": 0-6, "probs": [7 floats] } }, "messages": [{ "from", "to", "type": "PROPOSE|ACK|DO-NOT-MOVE|EXECUTED|ESCALATE", "text" }], "escalation": null | { "trigger": "string", "level": "L0".."L4" } }], "outcome": { "collision": bool, "dv_ms": { "<agentId>": number }, "ledger_after": { "<operator>": number } } }]`
- **`policy.json`** — `{ "arch": [24, 64, 64, 7], "activation": "tanh", "obs_mean": [24], "obs_std": [24], "layers": [{ "W": [[...]], "b": [...] }], "actions": ["hold", "small_open", "large_open", "small_close", "radial", "request_yield", "escalate"] }`
- **`testvec.json`** — `[{ "obs": [24], "logits": [7] }]` (100 entries, for the parity test)
- **`explanations.json`** — `{ "<episodeId>:<stepIndex>": "plain-English text" }`
- **`results.json`** — `{ "strategies": [{ "name", "collisions_pct", "dv_mean_ms", "manoeuvres_per_event", "burden_gini", "escalation_pct" }], "curves": { "timesteps": [...], "collision_rate": [...], "dv_mean": [...], "fairness_gap": [...] }, "plots": ["img/plots/*.png"] }`
- **`socrates_top.json`** — `[{ "id1", "name1", "id2", "name2", "tca": "ISO", "range_km", "rel_speed_kms", "max_prob" }]`
- **Live API** — base URL from `web/config.local.js` (`window.LIVE_API = "https://..."`); endpoints as §7.1; `/simulate` returns the `episodes.json` item shape; `/explain` returns `{ "text": "..." }`; `/benchmark` returns the `results.json` `strategies` shape.
