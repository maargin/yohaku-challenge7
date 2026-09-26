# [Project Name TBD] — Product Requirements Document

*Version 1.3 · 26 Sep 2026 · Status: final for submission · Working placeholder: **"the System"** (final name to be chosen by the team before the video is recorded)*

This PRD is a living document: it is updated as the build progresses and becomes the record of the full implementation.

---

## 1. Context

- **Event:** Space4Innovation × Tama University, YOHAKU 2026. **Challenge 7: "What can we learn from mycelium? Fungi, AI and shared decisions in orbit"** (challenge leads: Diana Mastracci, Prof. Takashi Hikasa).
- **Deadline:** Sunday 27 September 2026, 14:00 CEST (17:30 IST). Internal target: submitted by 13:00 CEST, with one hour of buffer.
- **Required:** a solution in any form, plus a 2-minute video explaining it.

## 2. Problem statement

Orbit has become **orbital mixed traffic**. ESA counts about 11,600 functioning satellites among roughly 41,700 objects regularly tracked by surveillance networks (ESA, May 2025); most of the rest are debris, dead satellites and rocket bodies. Between June 2025 and May 2026, Starlink alone reported more than 355,000 collision-avoidance manoeuvres to the FCC, 207,152 of them in the last six months.

That figure partly reflects a policy choice: Starlink manoeuvres at a collision probability of 3e-7, far stricter than the common 1e-4 threshold. Every manoeuvre also makes everyone else's orbit predictions for that satellite stale. **One operator's safety choice becomes a cost for its neighbours**, which is exactly the kind of shared burden this project addresses.

There is **no universal right-of-way**, and coordination is still ad hoc:

- **September 2019:** ESA's Aeolus manoeuvred alone to avoid Starlink 44. SpaceX later said a bug in its on-call paging system meant ESA's follow-up messages were never seen.
- **December 2025:** SpaceX reported that a satellite deployed from a Chinese Kinetica-1 launch passed about 200 m from Starlink-6079, saying no coordination had been done. The launch provider, CAS Space, said it was looking into the claim. The facts remain disputed, which is itself the point: there was no shared record to check.

As AI takes over more of these decisions, key questions remain open:

- Who moves when both objects can? What changes when one is debris?
- Who pays the fuel cost of repeated avoidance? Should a satellite's purpose, or its contribution to the risk, matter?
- Where should AI sit, and when must a human step in?
- Who is responsible when an AI-shaped decision causes harm? Who decides what the network learns?
- **NARETU:** what does each actor owe the others, and those who come after?

## 3. Solution overview

The System is a coordination system for shared orbit. The challenge's mycelium analogy was the starting reference; the product itself uses plain orbital-coordination language.

| Idea (from the challenge reference) | The System |
|---|---|
| Hyphal tips sense and respond locally | Every satellite carries the **same small trained AI policy**, which senses risk and decides on its own |
| One connected network | Satellites broadcast intent to their neighbours over risk links (shared data plus a handshake) |
| A market with sanctions (Kiers et al. 2011) | A **fairness ledger** rewards those who yield and penalises free-riders |
| What nature lacks | Shared **right-of-way rules**, **human escalation**, **responsibility allocation**, **governed learning** and **obligations to the future (NARETU)** |

**Tagline:** *"Local decisions. Shared rules. Human oversight."*

## 4. Goals and non-goals

| Goals | Non-goals |
|---|---|
| G1: A working decentralised prototype, with a trained AI if time allows (rules-only fallback is acceptable) | Operational-grade collision probability or orbit determination |
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
| F2 | **Risk Links** | Glowing arcs link objects on a close pass. They get thicker and brighter as risk rises and fade afterwards (a slime-mould-style reinforce-and-decay rule). | Thread lifecycle visible for every scripted event |
| F3 | **Onboard AI Brain** | A trained, shared RL policy runs live in the browser for each satellite. A panel shows what the satellite sees, its action probabilities and the action it chose. | Browser output matches Python within 1e-4 on 100 test vectors |
| F4 | **Who-Yields Rules** | Right-of-way rules in the style of maritime COLREGs. Priority: debris and non-manoeuvrable objects hold course, then crewed, then low-fuel, then science / public-good, then commercial. Tie-breaks: larger fuel margin yields, then ledger balance, then a deterministic ID. The object holding course must act by a deadline if the other side stays silent. A counterpart that does not answer the handshake is treated as non-manoeuvrable, and its silence is recorded in the ledger. Priority class and fuel state are declared through the handshake and must match the operator's registered, state-verified class; a false declaration is a ledger penalty and evidence of fault (F14). | Deterministic: both satellites compute the same verdict **from the shared handshake data only**, never from private estimates |
| F5 | **Intent Handshake Feed** | Chat-style log of PROPOSE / ACK / DO-NOT-MOVE / EXECUTED / ESCALATE messages | Visible for each event, with timestamps |
| F6 | **Fairness Ledger** | Per operator: fuel spent, avoidance manoeuvres absorbed, risk contributed, debris legacy. Yielding earns credit; free-riders lose priority. Optional orbit-use fee pool, with a discount for emerging space nations. | Updates after each event; bar chart |
| F7 | **Human Escalation Ladder** | Autonomy levels L0–L4. A human is called in when Pc > 1e-3, a crewed vehicle is involved, rules conflict, the counterpart is silent, the fuel cost is high, AI confidence is low, or the predictor raises an alarm. Modal offers Approve / Override / Stop. Überlingen rule: an agreed machine plan beats an ad-hoc override. Humans may override freely **until** both sides have sent EXECUTED-commit; after that, any change must re-enter the handshake and cannot be made unilaterally. **Escalation triggers are hard rules outside the AI policy; the policy cannot suppress them.** | Modal appears on trigger; the action is logged with who decided |
| F9 | **AI Explainer** | A local open-weight LLM writes a plain-English reason for each decision. Explanations are pre-generated for the public site, with a template fallback. | Every scripted event has an explanation; the site works without any server |
| F10 | **2019 Aeolus Replay** | Split screen: "Email world" (the real timeline) against "the System's world" | Runs in under 40 s; labelled "scripted from ESA's published timeline" |
| F11 | **Kessler Finale** | "What if we fail?": one collision becomes thousands of fragments, and the threads multiply | Runs without the frame rate collapsing |
| F12 | **Results Panel** | AI against 4 baselines on 1,000 test scenarios, plus learning curves and emergent-behaviour plots | Loaded from `results.json` |

### 6.2 Deferred features (not built for this submission)

These stay in the design but are cut from the 27 September build. The Live API is reachable only inside a private network, so judges would never see it; the predictor does not answer any challenge question directly.

| ID | Feature | Description |
|---|---|---|
| F8 | **Danger Predictor** | LightGBM model trained on about 13,000 real ESA conjunction events, to predict early whether a warning will become dangerous, compared against ESA's "latest risk" baseline |
| F17 | **Live API mode** | A small server on the GPU machine for live explanations, fresh scenarios and live benchmarks, with a LIVE / OFFLINE badge |

### 6.3 Governance features (page sections and video)

| ID | Feature | Description |
|---|---|---|
| F13 | **Where the Analogy Breaks** (video only) | A short beat in the 2-minute video on where the mycelium analogy holds, bends and breaks (Simard et al. 1997; Kiers et al. 2011; Karst et al. 2023). Not shown on the website. |
| F14 | **Responsibility Matrix** | Failure modes against operator / AI developer / data provider / licensing state / international body. Evidence of fault: whether the rules were followed, and what the ledger shows. An operator that failed to share data or answer the handshake carries presumptive responsibility for the outcome. |
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
|  (4) Risk predictor  -> LightGBM -> risk scores          [deferred]      |
|  (5) Explainer       -> local LLM -> explanations.json                   |
|  (6) Live API        -> FastAPI (private network only)   [deferred]      |
+--------------+-------------------------------------+---------------------+
               | static JSON / PNG (build artefacts) | live (optional)
               v                                     v
+----------------------- FRONTEND (static website) ------------------------+
|  globe, threads, AI brain (in-browser inference), rules, handshake,      |
|  ledger, escalation, replay, Kessler, results, governance                |
+--------------------------------------------------------------------------+
```

**Principle: static first.** The website runs entirely from pre-built static files, so the link judges open always works.

**Safety shield.** The trained policy never acts alone. Every proposed action passes through the Who-Yields rules (F4) and the escalation triggers (F7) before it is executed. If the policy and the rules disagree, the rules win and the case is escalated.

### 7.1 Live API (deferred)

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
| `sim/risk_model.py` | *(Deferred)* LightGBM on CDMs issued at least 2 days before TCA, compared with the latest-risk baseline |
| `sim/explain.py` | Batch LLM explanations, written to `explanations.json` |
| `sim/export_policy.py` | Exports weights and observation normalisation to `policy.json`, and 100 test vectors to `testvec.json` |
| `sim/make_web_data.py` | Builds the web data: a CelesTrak subset to `objects.json`, the SOCRATES top 50 to `socrates_top.json`, and scripted episodes to `episodes.json` |
| `sim/api.py` | *(Deferred)* Live API (§7.1) |
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
  - −5 for escalating (applies only to discretionary escalation; hard triggers in F7 escalate regardless and carry no penalty, so the policy cannot learn to avoid human oversight)
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
   - **Modal:** human decision (Approve / Override / Stop).
3. **Results** (F12).
4. **How it works:** diagram of local decisions, handshake, shared rules and ledger.
5. **Governance sections:** responsibility (F14), learning governance (F15), NARETU charter (F16). F13 is covered in the video only.
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
| `explainer.js` | Explanations: pre-generated, then template |
| `replay.js` | 2019 Aeolus replay |
| `kessler.js` | Kessler finale |
| `results.js` | Results panel |
| `ui.js` | Page wiring |

**Data** (in `web/data/`): `objects.json`, `socrates_top.json`, `episodes.json`, `policy.json`, `testvec.json`, `explanations.json`, `results.json`.

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

- The repository is private during the build and is made public at submission for the code-repository field.
- **Hosting:** Cloudflare Pages (free). A `_headers` file sets the HTTP security headers (CSP, HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy).
- The Live API URL is kept in a local, uncommitted config file. A `config.example.js` is committed instead.
- **Credits:**
  - ESA Kelvins Collision Avoidance dataset: CC-BY-4.0, Zenodo 10.5281/zenodo.4463683 (Uriot et al. 2022)
  - CelesTrak (T.S. Kelso)
  - globe.gl and satellite.js (MIT)
  - No GPL code is included.

## 11. Non-functional requirements

- The static site works fully without any server.
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
- **Governance:** every challenge question has a written answer that points to a specific feature.
- **Demo:** every MUST feature reachable from the public link, and the video no longer than 2:00.

## 13. Priorities

| Tier | Scope |
|---|---|
| **MUST** | Video; submission answers; a demo link that opens; F1, F2, F4, F5, F6, F7, F10; F14–F16 as written sections; F13 as a video beat |
| **SHOULD** | F3 (trained RL in the browser); F12 results; F9 explainer (static) |
| **COULD** | F11 Kessler finale; F15 as a diagram |
| **WON'T (this submission)** | F8 predictor; F17 Live API |

## 14. Risks and fallbacks

| Risk | Fallback |
|---|---|
| Multi-agent RL does not converge | Single-agent PPO against a rule-following partner, with the same policy on every satellite |
| GPU or driver issue | Train on CPU instead |
| LLM unavailable | Template explanations |
| Time overrun | Stop at the end of Phase 2 if needed (§16). Otherwise drop in this order: F11, then F3 (show the rules-only system and state that RL is future work), then F12. Never cut F7, F10 or F13–F16. |
| RL finishes but does not beat the rules baseline | Report it honestly; the rules layer is the product and RL is an experiment on top |

## 15. Video outline (2:00)

| Time | Beat |
|---|---|
| 0:00 | **Hook:** 207,152 Starlink avoidance manoeuvres in six months, and the 2019 missed message |
| 0:15 | **Mycelium lens**, then the twist: it is a "market with sanctions" |
| 0:35 | **Demo:** the 2019 replay, the AI brain, the handshake and the ledger |
| 1:10 | **Humans and AI:** escalation, the Überlingen lesson, the learning board |
| 1:30 | **Where the analogy breaks** |
| 1:45 | **NARETU charter**, closing on "protect the vulnerable first" |

## 16. Delivery phases

The build runs in six phases. Each phase has a clear exit criterion, and **a phase is not started until the previous one meets its exit criterion**, with one exception: RL training (Phase 3) runs in the background from Phase 1 onwards because it needs GPU time, not attention.

All times are CEST, with IST in brackets. Deadline: Sun 27 Sep, 14:00 (17:30).

### Summary

| Phase | Name | Tier | Target end (CEST) | Features |
|---|---|---|---|---|
| 0 | Foundations | MUST | Sat evening | Repo, data pipeline, scripted episodes |
| 1 | Core coordination | MUST | Sat night | F1, F2, F4, F5, F6, F7, safety shield |
| 2 | Story and governance | MUST | Sun 06:00 (09:30) | F10, F13–F16, submission answers |
| 3 | AI layer | SHOULD | Sun 08:00 (11:30), decision gate | F3, F12, F9 |
| 4 | Polish | COULD | Sun 10:00 (13:30) | F11, F15 diagram |
| 5 | Ship | MUST | Sun 13:00 (16:30) | Deploy, video, one-pager, submission |
| 6 | After submission | Future | — | F8, F17, next steps from §18 |

### Phase 0: Foundations

**Goal:** everything later phases need exists as data, so the frontend never waits on the backend.

| Work | Modules |
|---|---|
| Repository skeleton, licence, `.gitignore`, `config.example.js` | §10 |
| Load the ESA Kelvins CSV and build encounter geometry | `sim/scenarios.py` |
| CelesTrak subset and SOCRATES top 50 | `sim/make_web_data.py` → `objects.json`, `socrates_top.json` |
| Hand-script the demo events, including the 2019 Aeolus timeline | `episodes.json` |
| Batched GPU environment and unit tests | `sim/env_torch.py`, `sim/tests/` |

**Exit criterion:** `pytest sim/tests` passes and all web data files load in the browser.

### Phase 1: Core coordination

**Goal:** a rules-only version of the System that works end to end. This is the minimum credible product; everything after it is additive.

| Work | Features |
|---|---|
| Globe with real objects, coloured by type | F1 |
| Danger threads with reinforce-and-decay | F2 |
| Who-Yields rules in Python and JS, including silent counterparts and verified class | F4, `sim/rules.py`, `rules.js` |
| Handshake feed | F5 |
| Fairness ledger | F6 |
| Escalation ladder, hard triggers and override window | F7 |
| Safety shield wiring: every action passes through F4 and F7 | §7 |
| **Background:** start MAPPO training with the curriculum | `sim/train_mappo.py` |

**Exit criterion:** a scripted conflict plays out on the globe, both sides reach the same verdict, the handshake and ledger update, and a hard trigger opens the human modal.

### Phase 2: Story and governance

**Goal:** the parts judges will weigh most heavily. These answer the challenge questions directly.

| Work | Features |
|---|---|
| 2019 Aeolus replay: "Email world" against "the System's world" | F10 |
| Where the analogy breaks (holds / bends / breaks) | F13 |
| Responsibility matrix | F14 |
| Learning governance (written section) | F15 |
| NARETU obligations charter | F16 |
| Draft all text answers | `docs/submission-answers.md` |

**Exit criterion:** every MUST feature works, and every challenge question has a written answer that points to a feature. **If time runs out, the project can be submitted from here.**

### Phase 3: AI layer (decision gate)

**Goal:** replace rules-only behaviour with the trained policy, running behind the safety shield.

| Work | Features |
|---|---|
| Evaluate on 1,000 held-out seeds against 4 baselines | `sim/evaluate.py` → `results.json` |
| Export the policy and check browser parity | `sim/export_policy.py`, `policy.js`, F3 |
| Results panel | F12 |
| Pre-generate explanations, with template fallback | `sim/explain.py`, F9 |

**Decision gate at Sun 08:00 (11:30):**
- The policy matches or beats the best rules baseline on collisions → ship F3 and F12.
- It does not → ship rules-only, show the RL results honestly as an experiment, and state it as future work (§14).

**Exit criterion:** "policy parity OK" in the console, or the gate decision recorded.

### Phase 4: Polish

**Goal:** optional impact. Only started if Phases 0–3 are closed.

| Work | Features |
|---|---|
| Kessler finale | F11 |
| Learning-governance diagram | F15 (diagram) |
| Light mode, responsive checks, performance pass (§11) | §9 |

**Exit criterion:** code freeze at **Sun 10:00 (13:30)**, whatever state Phase 4 is in.

### Phase 5: Ship

| Time (CEST) | Work |
|---|---|
| 10:00 (13:30) | **Code freeze.** Deploy to the public URL; test from a device that is not the build machine |
| 10:30 (14:00) | Record the demo screen capture following §15 |
| 11:30 (15:00) | Voice-over and edit to no more than 2:00; export the governance one-pager PDF |
| 12:30 (16:00) | Fill in the form fields (§18), including the AI-use disclosure |
| 13:00 (16:30) | **Submit.** One hour kept as buffer |

**Exit criterion:** submission confirmation received.

### Phase 6: After submission

Not part of the 27 September deliverable. Listed so the design stays whole.

- F8 Danger Predictor and F17 Live API (§6.2).
- The "From Obligation to Action" next steps: an open handshake protocol spec, a ledger pilot on existing data-sharing platforms, input to priority-rule standards, and a university mixed-traffic testbed.
- Make the repository public if the organisers request it.

## 17. Verification

- `pytest sim/tests` passes, and the collision rate in evaluation is below 1% at each curriculum stage.
- The browser console shows "policy parity OK" (maximum error below 1e-4).
- Manual walkthrough: every MUST feature is visible from the public link, opened on a device that is not the build machine.

## 18. Submission (YOHAKU 2026 final form)

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

## 19. Interface contracts (data files)

All files live in `web/data/`. Only real data files are produced (no mocks); each file is committed as soon as the backend step that creates it finishes. Every file is validated against these shapes before the frontend uses it.

- **`objects.json`** — `[{ "id": 25544, "name": "ISS (ZARYA)", "class": "crewed"|"autonomous"|"manoeuvrable"|"debris", "operator": "string", "omm": { CelesTrak OMM JSON fields } }]`
- **`episodes.json`** — `[{ "id": "aeolus-2019", "title": "...", "scripted": true, "agents": [{ "id", "name", "class", "operator", "fuel": 0-1, "ledger": number }], "steps": [{ "t_min": -240..0, "pc": number, "miss_m": number, "sigma_m": number, "actions": { "<agentId>": { "action": 0-6, "probs": [7 floats] } }, "messages": [{ "from", "to", "type": "PROPOSE|ACK|DO-NOT-MOVE|EXECUTED|ESCALATE", "text" }], "escalation": null | { "trigger": "string", "level": "L0".."L4" } }], "outcome": { "collision": bool, "dv_ms": { "<agentId>": number }, "ledger_after": { "<operator>": number } } }]`
- **`episodes.json` optional fields (added in v1.3, backward-compatible)** — item `variant`: `"scripted" | "rules" | "ai"`; step `verdict`: `{ "yielder", "rule", "reason" }`; step `note`: short narrative text; escalation step `branches`: `{ "approve": [steps], "override": [steps], "stop": [steps] }`, the precomputed continuation for each human choice.
- **`policy.json`** — `{ "arch": [24, 64, 64, 7], "activation": "tanh", "obs_mean": [24], "obs_std": [24], "layers": [{ "W": [[...]], "b": [...] }], "actions": ["hold", "small_open", "large_open", "small_close", "radial", "request_yield", "escalate"] }`
- **`testvec.json`** — `[{ "obs": [24], "logits": [7] }]` (100 entries, for the parity test)
- **`explanations.json`** — `{ "<episodeId>.<variant>:<stepIndex>": "plain-English text" }` (variant = scripted / rules / ai)
- **`results.json`** — `{ "strategies": [{ "name", "collisions_pct", "dv_mean_ms", "manoeuvres_per_event", "burden_gini", "escalation_pct" }], "curves": { "timesteps": [...], "collision_rate": [...], "dv_mean": [...], "fairness_gap": [...] }, "plots": ["img/plots/*.png"] }`
- **`socrates_top.json`** — `[{ "id1", "name1", "id2", "name2", "tca": "ISO", "range_km", "rel_speed_kms", "max_prob" }]`
- **Live API (deferred, §6.2)** — base URL from `web/config.local.js` (`window.LIVE_API = "https://..."`); endpoints as §7.1; `/simulate` returns the `episodes.json` item shape; `/explain` returns `{ "text": "..." }`; `/benchmark` returns the `results.json` `strategies` shape.

## 20. Revision history

| Version | Date | Changes |
|---|---|---|
| 0.3 | 26 Sep 2026 | Approved for build |
| 1.0 | 26 Sep 2026 | Corrected orbital statistics and the December 2025 incident to match published sources; added a safety shield so rules and escalation triggers sit outside the AI policy; closed the escalation-penalty loophole in the reward; defined silent and non-cooperative counterparts; added verification of declared priority class; clarified when a human override is allowed; deferred F8 and F17; fixed the baseline count; added a build schedule |
| 1.1 | 26 Sep 2026 | Replaced the build schedule with six delivery phases, each with scope, exit criteria and a decision gate for the AI layer |
| 1.2 | 26 Sep 2026 | Became the single PRD (v0.5 archived in `docs/archive/`); added §19 Interface contracts (real data only, no mocks); hosting set to Cloudflare Pages with security headers; repository public at submission |
| 1.3 | 26 Sep 2026 | Optional episode fields (`variant`, `verdict`, `note`, `branches`) for the precomputed replay; F2 renamed Risk Links; mycelium kept as the challenge reference only (UI copy is neutral); F13 moved to the video |
