# YOHAKU 2026 — draft answers for the final submission form

Placeholders in [brackets] are for the team to fill in. Answers point to the features in `docs/PRD.md`.

## Team and project
- **Team or group name:** [TEAM NAME]
- **Solution title:** [PROJECT NAME] — local decisions, shared rules, human oversight for crowded orbit
- **Team members:** [NAMES]
- **Location:** [CITY / REGION, COUNTRY for each member]
- **Organisation, university or community:** [ORGANISATION]
- **Short bios:** [1–2 sentences per member]
- **2-minute video:** [LINK]
- **Final work:** [DEMO URL] and the one-pager (`docs/one-pager.pdf`)
- **Code repository:** [REPOSITORY URL] (MIT licence)

## Relationships & Consequences
*Who is affected by your idea, and what changes for them?*

**Satellite operators:**
- They stop negotiating collision risks by email.
- Both satellites compute the same right-of-way verdict from shared data, then confirm it with a machine handshake.
- Nobody waits for a message that may never be read, which is what happened with Aeolus and Starlink 44 in 2019.

**Small operators and non-propulsive CubeSats:**
- The rules treat them as vulnerable users. Low fuel, debris and crewed vehicles hold course first.
- Emerging-nation operators get a discounted fee.

**Crewed missions:**
- They always hold course.
- Any encounter involving them goes to a human.

**Regulators:**
- They get an auditable log of who decided what, on which data.

**Future generations:**
- They inherit fewer collisions and less debris.

**What changes in practice:** the cost of staying safe is recorded in a shared ledger, instead of falling silently on whoever is most cautious.

## Knowledge, Authority & Reciprocity
*What knowledge or perspectives does your solution draw on, and who should be credited?*

**Traffic governance:**
- maritime right-of-way rules (COLREGs)
- aviation collision-avoidance coordination (TCAS)
- the lesson of the 2002 Überlingen accident: never leave authority ambiguous

**Research and practice:**
- mixed-traffic ethics research on protecting vulnerable road users
- Space Safety Coalition best practices
- ESA's account of the 2019 Aeolus manoeuvre

**Data:**
- the ESA Kelvins Collision Avoidance dataset (CC-BY-4.0, Uriot et al. 2022)
- CelesTrak orbital data and SOCRATES screening (T.S. Kelso)

**Inspiration and critique:**
- The challenge's mycelium lens.
- Research showing that fungal networks behave more like markets with sanctions (Kiers et al. 2011) than caring communes (Karst et al. 2023).

**Obligations framing:** the NARETU framing, credited to Chief Titus Letaapo and Samburu obligations-based governance.

**Reciprocity is built in.** The ledger credits whoever yields and charges free-riders, silence and false declarations.

## Orbital Stewardship & Justice
*How does your solution treat orbit as a shared responsibility?*

Orbit is treated as a commons with a shared, double-entry ledger.

**What the ledger records:**
- every manoeuvre and its fuel cost
- every contribution to risk, including debris left behind
- every silence

**How the ledger enforces fairness:**
- Debris owners pay for the dodges their debris causes.
- Free-riders lose priority.
- Balances always sum to zero, so nobody's safety is paid for invisibly by someone else.

**Right-of-way rules protect the vulnerable first:** debris cannot move, crewed vehicles hold course, and low-fuel CubeSats are spared.

**A charter of obligations:** operators, AI developers, data providers and states each owe something specific. Everyone owes those not yet launched a usable orbit, with no net addition to long-lived debris.

## Responsible AI & Accountability
*If AI is involved, what does it do or decide, and who remains accountable?*

**What the AI does:**
- Every satellite runs the same small AI policy, trained with multi-agent reinforcement learning.
- It proposes when and how to burn.
- It never acts alone. A safety shield checks every proposal against the shared rules, and the rules win when they disagree.

**When a human decides:**
- Hard triggers always go to a human: a crewed vehicle, high collision probability, a rule conflict or low AI confidence.
- The AI cannot switch these triggers off, and training never rewards avoiding them.
- A human can approve, override (before both sides commit) or stop. Every decision is logged.

**Who stays accountable:**
- The responsibility matrix assigns each failure to the operator, the AI developer, the data provider, the licensing state or the rule-setting body.
- The network cannot change its own rules. Updates need approval from an independent incident board.

**Evaluation result:** on 1,000 held-out scenarios, the AI behind the shield had 0.7% collisions against 1.0% for the rules alone, at the same fuel use. Collision probabilities are illustrative.

## From Obligation to Action (1)
*What could actually happen next, and who could do it?*

**Operators and industry groups** (e.g. the Space Safety Coalition):
- Publish the handshake as an open message specification.
- Start with PROPOSE / ACK / DO-NOT-MOVE / EXECUTED / ESCALATE on top of existing ephemeris sharing.

**Coordination services:**
- Pilot the shared ledger alongside existing collision-avoidance and data-sharing services, first as a read-only record of who yielded.

**Regulators and standards bodies:**
- Use the Who-Yields priority order as a starting point for harmonised right-of-way standards.
- Include how a satellite's class and purpose are verified at licensing.

## From Obligation to Action (2)
*What could actually happen next, and who could do it?*

**Universities** (for example, Tama University's work on mixed-traffic ethics):
- Run the simulator as a testbed.
- Ask operators, students and the public which priority rules they accept, and where they would draw the line for human review.

**AI developers:**
- Publish declared operating domains and adopt shared held-out test scenarios.

**The team:**
- Open the repository.
- Add real covariance data where available.
- Invite critique of the rules and the ledger.

## AI use
*Did you use AI? Which tools, what for, what did you check independently, and is AI part of your solution?*

**Tools used to build the entry:**
- [AI TOOLS USED — name them here]
- Used for: research summaries, drafting documents, and writing and testing code.

**Checked independently:**
- The rules, ledger and shield logic are covered by automated example-based and property-based tests.
- The GPU simulator is checked against an independent reference implementation.
- The browser rules and policy match the Python versions exactly.
- Evaluation results come from 1,000 held-out scenarios.
- Key facts were checked against their sources: the 2019 ESA account and the FCC manoeuvre reports.

**AI inside the solution:**
- a small multi-agent reinforcement-learning policy, trained by the team and always behind the rules shield
- an existing open-weight language model, run locally, that wrote the plain-English explanations shown on the site

## Sharing restrictions
None. The code, data sources and documents can be shared publicly.

## Permission to share
[YES / NO — team decision]
