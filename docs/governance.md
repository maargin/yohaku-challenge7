# Governance model

The prototype shows how satellites can coordinate. This document sets out who stays in charge, who is responsible, and what everyone owes. The website's Governance section uses the same text.

## 1. Responsibility

An AI system cannot be held liable, so every decision the network makes must trace back to a person or organisation. The evidence for fault comes from the handshake log and the ledger: whether each party followed the shared rules, shared its data, and answered in time.

| Failure mode | Operator | AI developer | Tracking / data provider | Licensing state | International body |
|---|---|---|---|---|---|
| Wrong or late tracking data | Secondary: should question stale data | — | **Primary**: accuracy and timeliness of warnings | Supervises the provider if it licenses it | Sets data-quality norms |
| Flawed AI policy (acted within its declared domain) | Secondary: chose to deploy it | **Primary**: design, testing, declared operating domain | — | Certifies the system for use | Maintains shared test scenarios |
| AI used outside its declared domain | **Primary** | Secondary: domain must be clearly stated | — | Supervision | — |
| Silent or ignored handshake | **Primary**: presumed responsible | — | — | Enforcement | Records repeat offenders |
| False class or purpose declaration | **Primary**: evidence entry in the ledger | — | — | **Primary**: verifies registration | Publishes the registry standard |
| Human override that causes harm | **Primary**: the decision is logged with the actor | — | — | Supervision | — |
| Rules gap (the rules gave no good answer) | Shared | Shared | — | Shared | **Primary**: owns the rules |

This follows the principle of the Outer Space Treaty (Art. VI): states remain responsible for the national activities they license. The matrix adds who inside that system answers for which failure.

## 2. Learning governance

The network learns from past encounters, but it never changes its own rules or model.

1. **Every case is logged:** the declarations, verdict, handshake messages, human decisions and outcome.
2. **Anyone can propose an update:** an operator, an AI developer or a regulator, supported by the logged cases.
3. **An independent Orbital Incident Board reviews the proposal:** it tests the change on held-out scenarios, checks fairness (burden Gini) and confirms that hard triggers cannot be weakened. Aviation incident boards are the model.
4. **The approved change is released as a new version:** the version number is recorded, and every future decision records which version made it.

Hard escalation triggers are outside the learning loop. A model update can never remove them.

## 3. NARETU obligations charter

This section follows the NARETU framing from the challenge brief, credited to Chief Titus Letaapo and Samburu obligations-based governance. It starts from obligations rather than rights: what is owed, by whom, to whom, and across what time horizon.

| Who | Owes | To whom | Horizon |
|---|---|---|---|
| Operators | Shared ephemerides and a timely handshake; their fair share of avoidance manoeuvres; disposal at end of life | Other operators; the commons | Every encounter; mission lifetime |
| AI developers | Explainable decisions; a clearly declared operating domain; triggers they cannot switch off | Operators; the people affected by decisions | Every release |
| Tracking and data providers | Neutral, timely warnings with honest uncertainty | Every operator equally | Every warning |
| States | Supervision of the operators they license; verified registration of class and purpose | Other states; the public | Continuous |
| Everyone | A usable orbit: no net addition to long-lived debris; protection first for the small, the stuck and the crewed | Those who have not launched yet | Decades |

## 4. Misuse cases considered in the design

| Misuse | Counter-measure |
|---|---|
| Declaring a higher-priority class (for example, claiming to be crewed) to avoid moving | The registry wins over the declaration; the false declaration costs −2 credits and is recorded as evidence |
| Staying silent to force the other side to move | A silent party is treated as unable to move, pays −1 credit, and carries presumptive responsibility |
| Letting others always yield (free-riding) | A balance of −3 or less makes that party the yielder (rule R5) |
| An AI learning to avoid human review | Hard triggers sit outside the policy and are never penalised in training |
| A late unilateral change after both sides committed | Refused; any change must go back through a new handshake round |
