# Method (short)

## Data
- **Objects:** 3,006 real objects from CelesTrak GP data, snapshotted on 26 Sep 2026 (1,500 Starlink, 800 other active, 700 debris, 6 crewed). They are classified by name and propagated in the browser with SGP4 (satellite.js).
- **Close approaches:** the day's 50 closest approaches from CelesTrak SOCRATES.
- **Conjunction uncertainty:** taken from the ESA Kelvins Collision Avoidance dataset (CC-BY-4.0). Uncertainties are bootstrapped from whole events.

## Rules, handshake, ledger, shield (`sim/`)
- **Who-Yields rules (R1–R8c):** a deterministic function of shared data only. The registry always overrides declarations.
- **Handshake:** PROPOSE, ACK, DO-NOT-MOVE, EXECUTED and ESCALATE messages. Duplicates are idempotent, and silence is detected after 30 minutes.
- **Ledger:** double-entry, with a commons account. Balances always sum to zero.
- **Safety shield:** eight hard triggers, each mapped to an autonomy level L1–L3. The rules win over the AI, and an override is only possible before both sides commit.
- **JS port:** the rules are ported to JS and checked against Python on 2,000 generated cases.

## Simulator and training
- **Environment:** encounters of 2–6 satellites, 24 steps of 10 minutes each. Dynamics are linearised: burn effects use along-track drift. The collision probability is the illustrative small-object Gaussian formula with a 20 m hard-body radius.
- **GPU implementation:** batched on the GPU (4,096 clusters) and tested against a scalar reference implementation built on the Python rules.
- **Training:** MAPPO, one shared actor with a centralised critic. The curriculum runs debris → two satellites → 2–6 satellites, including crewed and silent ones. 3 seeds × 30 minutes on one RTX 5060 Ti, about 836 million steps each.
- **Reward:** collision −100, risk-reduction shaping, secondary close pass −20, fuel, fairness, shield conflicts, and repeat or unneeded burns. Hard-trigger escalations are never penalised.

## Evaluation
1,000 held-out clusters, 5 strategies:

| Strategy | Collisions | Mean Δv (m/s) | Manoeuvres | Burden Gini |
|---|---|---|---|---|
| Do nothing | 10.2 % | 0 | 0 | 0 |
| Both burn if Pc > 1e-4 | 0.2 % | 0.064 | 3.2 | 0.05 |
| Lower ID yields | 1.3 % | 0.035 | 1.76 | 0.48 |
| Rules only | 1.0 % | 0.041 | 2.07 | 0.39 |
| Shared AI + rules shield | 0.7 % | 0.041 | 2.05 | 0.40 |

Gate: the AI ships only if its collisions are no higher than rules-only and its fuel use is within 10 %. **Passed.** An earlier reward version cut collisions to 0.6 % but used 2.6× the fuel, and failed the gate.

## Limits
- Dynamics are linearised and the collision probabilities are illustrative. This is not an operational tool.
- Scenarios are synthetic encounters with Kelvins-based uncertainty. The 2019 replay is scripted from ESA's published timeline.
- "Both burn" has fewer collisions but uses 55 % more fuel and needs no coordination. The trade-off is shown, not hidden.
- Explanations are written by a local open-weight language model. A template fallback applies whenever generation fails.
