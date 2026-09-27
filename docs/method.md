# Method (short)

## Data
- **Objects:** 3,006 real objects from CelesTrak GP data, snapshotted on 26 Sep 2026 (1,500 Starlink, 800 other active, 700 debris, 6 crewed). They are classified by name and propagated in the browser with SGP4 (satellite.js).
- **Close approaches:** the day's 50 closest approaches from CelesTrak SOCRATES.
- **Conjunction geometry and uncertainty:** taken from the ESA Kelvins Collision Avoidance dataset (CC-BY-4.0, 13,154 real events). Tracking-uncertainty pairs (first warning, last warning) and the miss distances of safe passes are resampled from whole events.

## Onboard AI, safety layer, handshake, ledger (`sim/`)
- **Onboard AI:** one shared policy (MLP 24→64→64→7) runs on every satellite. From its own view of the most dangerous neighbour it proposes one of seven actions: hold, small or large opening burn, closing burn, radial burn, request the other to yield, or escalate.
- **Safety layer:** every proposal passes through the same fixed check before execution. A **priority check** (a deterministic function of shared data only: debris never moves, crewed holds, low fuel is protected, free-riders lose priority, then fair tie-breaks; the registry always overrides declarations) decides which satellite has the right to move. Eight **hard triggers** map to autonomy levels L1–L3 and send the case to a human; the AI cannot switch them off. If the AI proposes something the safety layer forbids, the safe action is executed and the conflict is logged. A human override is possible only before both sides commit.
- **Handshake:** PROPOSE, ACK, DO-NOT-MOVE, EXECUTED and ESCALATE messages. Duplicates are idempotent, and silence is detected after 30 minutes.
- **Ledger:** double-entry, with a commons account. Balances always sum to zero.
- **JS port:** the priority check and the policy are ported to JS and checked against Python (2,000 generated cases; policy parity < 1e-4).

## Simulator and training
- **Environment:** encounters of 2–6 satellites, 24 steps of 10 minutes each. Dynamics are linearised: burn effects use along-track drift. The collision probability is the illustrative small-object Gaussian formula with a 20 m hard-body radius. A close pass hidden by large uncertainty (probability dilution) still counts as dangerous.
- **GPU implementation:** batched on the GPU (4,096 clusters) and tested against a scalar reference implementation.
- **Training:** MAPPO, one shared actor with a centralised critic. The curriculum runs debris → two satellites → 2–6 satellites, including crewed and silent ones. 3 seeds × 30 minutes on one RTX 5060 Ti, about 836 million steps each.
- **Reward:** collision −100, risk-reduction shaping, secondary close pass −20, fuel, fairness, safety-layer conflicts, and repeat or unneeded burns. Hard-trigger escalations are never penalised.
- **Live mode:** with the optional local server (`sim/live_server.py`) the simulator itself decides every scenario and live encounter on request and a local language model writes the explanations; without it, a browser port of the environment for two satellites (`web/js/liveEnv.js`, checked step by step against the GPU environment on recorded clusters) is used. Every live step can be opened to show the working: the 24 inputs, the network output, the physics with its numbers and the safety layer's checks (the shown numbers are tested against the simulator's record).

## Evaluation
10,000 held-out clusters (30% safe passes with real Kelvins miss distances), 95% Wilson confidence intervals:

| Strategy | Collisions | Mean Δv (m/s) | Manoeuvres | Burden Gini |
|---|---|---|---|---|
| Do nothing | 7.91 % | 0 | 0 | 0 |
| Both burn when dangerous | 0.34 % | 0.053 | 2.66 | 0.20 |
| Lower ID yields | 1.04 % | 0.030 | 1.52 | 0.54 |
| Shared onboard AI (with safety layer) | 0.66 % | 0.044 | 2.22 | 0.43 |

Classification view (truth = collides if nobody acts): accuracy 99.34 % (99.16–99.48), recall 91.66 % (89.52–93.39), 50 avoidable and 16 unavoidable collisions (two objects that cannot move).

## Limits
- Dynamics are linearised and the collision probabilities are illustrative. This is not an operational tool.
- Scenarios are synthetic encounters with Kelvins-based geometry and uncertainty. The 2019 replay is scripted from ESA's published timeline.
- "Both burn" has fewer collisions but uses 20 % more fuel and needs no coordination. The trade-off is shown, not hidden.
- Explanations are written by a local open-weight language model for the recorded scenarios only. A template fallback applies whenever generation fails.
