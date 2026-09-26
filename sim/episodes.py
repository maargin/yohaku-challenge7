"""Episode simulator (B7): runs one encounter step by step and records an episodes.json item.

Pipeline per 10-minute step: dynamics -> detection/PROPOSE -> Who-Yields verdict -> shield
triggers -> (human decision) -> handshake ACK / DO-NOT-MOVE -> burn + EXECUTED -> ledger.
Variants: "rules" (the System), "scripted" (email world, no handshake), "ai" (U2 policy,
always passed through the shield).
"""
import math

from . import handshake as hs
from . import ledger as lg
from . import physics, rules, shield
from .domain import ACTIONS, COMMONS, DV_BY_ACTION, HOLD, LARGE_OPEN, SMALL_OPEN, Declaration, RegistryEntry

STEP_MIN = 10
START_MIN = -240
DETECTION_PC = 1e-5
FUEL_BUDGET_MS = 1.0   # remaining delta-v budget at fuel = 1.0 (illustrative)


def _one_hot(action):
    return [1.0 if i == action else 0.0 for i in range(len(ACTIONS))]


def _pc_from_script(script, t):
    pts = sorted((float(a), float(b)) for a, b in script)
    if t <= pts[0][0]:
        return pts[0][1]
    if t >= pts[-1][0]:
        return pts[-1][1]
    for (t0, p0), (t1, p1) in zip(pts, pts[1:]):
        if t0 <= t <= t1:
            w = (t - t0) / (t1 - t0) if t1 > t0 else 0.0
            return math.exp(math.log(p0) + w * (math.log(p1) - math.log(p0)))
    return pts[-1][1]


class _Ctx:
    def __init__(self, spec, variant):
        self.spec = spec
        self.variant = variant
        self.agents = spec["agents"]
        self.by_id = {a["id"]: a for a in self.agents}
        self.registry = {
            aid: RegistryEntry(aid, self.by_id[aid]["operator"], r["capability"], r.get("purpose", "none"),
                               bool(r.get("emerging", False)))
            for aid, r in spec["registry"].items()
        }
        self.silent = set(spec.get("silent", []))
        self.seq = 0

    def msg(self, t, frm, to, typ, text):
        self.seq += 1
        return hs.Message(f"{self.spec['id']}:{self.variant}:{self.seq}", float(t), frm, to, typ, text)

    def can_talk(self, aid):
        return self.registry[aid].capability != "debris" and aid not in self.silent

    def declaration(self, aid):
        reg = self.registry[aid]
        over = self.spec.get("declarations", {}).get(aid, {})
        return Declaration(aid, over.get("capability", reg.capability), over.get("purpose", reg.purpose),
                           float(self.by_id[aid]["fuel"]), silent=aid in self.silent)


def run_episode(spec, variant="rules", human_choice="approve", with_branches=True, proposer=None):
    """Simulate one episode. `proposer(step_info) -> (action, confidence)` is the optional AI policy."""
    if variant == "scripted":
        return _run_email_world(spec)
    ctx = _Ctx(spec, variant)
    enc = spec["encounter"]
    a_id, b_id = ctx.agents[0]["id"], ctx.agents[1]["id"]
    dv_burn = float(spec.get("dv_ms", DV_BY_ACTION[SMALL_OPEN]))
    notes = {int(k): v for k, v in spec.get("notes", {}).items()}
    led = lg.opening(spec.get("ledger0", {}))
    for aid, reg in ctx.registry.items():
        if reg.capability == "debris":
            led = lg.set_debris_legacy(led, reg.operator, spec.get("debris_legacy", {}).get(reg.operator, 1))

    state = hs.HandshakeState()
    detected = verdict = None
    yielder = stand_on = None
    escalated = False
    decided = False          # human decision (or no decision needed) has happened
    executed = False
    committed = False
    late_override_done = False
    burns, dv_used = [], {a["id"]: 0.0 for a in ctx.agents}
    peak_pc = 0.0
    steps = []
    branch_index = None

    for t in range(START_MIN, 0, STEP_MIN):
        sigma = physics.sigma_at(t, enc["sigma0_m"], enc["sigma_min_m"])
        miss = physics.miss_after(enc["miss0_m"], burns)
        if spec.get("pc_script") and not burns:
            p = _pc_from_script(spec["pc_script"], t)
        else:
            p = physics.pc(miss, sigma)
        peak_pc = max(peak_pc, p)
        msgs, esc = [], None
        actions = {aid: HOLD for aid in dv_used}

        if detected is None and p >= DETECTION_PC:
            detected = t
            for aid in (a_id, b_id):
                if ctx.can_talk(aid):
                    other = b_id if aid == a_id else a_id
                    d = ctx.declaration(aid)
                    msgs.append(ctx.msg(t, aid, other, "PROPOSE",
                                        f"{d.capability}, {d.purpose}, fuel {round(d.fuel * 100)}%"))

        if detected is not None and verdict is None:
            silence_known = (t - detected) >= hs.SILENCE_WINDOW_MIN
            if not ctx.silent or silence_known:
                verdict = rules.verdict(ctx.declaration(a_id), ctx.declaration(b_id), ctx.registry,
                                        lg.balances(led))
                yielder, stand_on = verdict.yielder, verdict.stand_on
                for pen in verdict.penalties:
                    led = lg.record_false_declaration(led, pen.operator, pen.evidence, t)
                for aid in sorted(ctx.silent):
                    led = lg.record_silence(led, ctx.registry[aid].operator, t)

        policy_action = policy_conf = None
        if verdict is not None and proposer is not None and not executed:
            policy_action, policy_conf = proposer({"t_min": t, "pc": p, "miss_m": miss, "sigma_m": sigma,
                                                   "yielder": yielder})
        if verdict is not None and not escalated and not executed:
            verdict_action = SMALL_OPEN if yielder else HOLD
            _, conflict = shield.arbitrate(policy_action, verdict_action)
            fuel_frac = 0.0
            if yielder:
                fuel = float(ctx.by_id[yielder]["fuel"])
                fuel_frac = dv_burn / (FUEL_BUDGET_MS * fuel) if fuel > 0 else 1.0
            crewed = any(ctx.registry[x].capability == "crewed" for x in (a_id, b_id))
            trig = shield.hard_triggers(pc=p, crewed_involved=crewed, rules_escalation=verdict.escalate,
                                        silent=bool(ctx.silent), fuel_cost_frac=fuel_frac,
                                        policy_confidence=policy_conf, policy_conflict=conflict)
            if trig:
                escalated = True
                top = trig[0]
                esc = {"trigger": top.code, "level": shield.level(trig), "reason": top.reason}
                target = stand_on or b_id
                src = yielder or a_id
                if ctx.can_talk(src):
                    msgs.append(ctx.msg(t, src, target, "ESCALATE", f"{top.code} · {shield.level(trig)}"))
                if shield.needs_human(trig):
                    branch_index = len(steps)
                    if verdict.yielder is not None or human_choice == "stop":
                        can_move = (verdict.stand_on is not None
                                    and ctx.registry[verdict.stand_on].capability != "debris"
                                    and verdict.stand_on not in ctx.silent
                                    and float(ctx.by_id[verdict.stand_on]["fuel"]) > 0)
                        yielder, stand_on, outcome = shield.human_decision(human_choice, verdict, committed,
                                                                           stand_on_can_move=can_move)
                        msgs.append(ctx.msg(t, src, target, "ESCALATE", f"human decision: {outcome}"))
                decided = True
            else:
                decided = True

        if verdict is not None and decided and not executed and (steps and steps[-1].get("verdict") is not None):
            if yielder is not None:
                if ctx.can_talk(yielder):
                    msgs.append(ctx.msg(t, yielder, stand_on, "ACK", f"will burn +{dv_burn} m/s along-track"))
                if stand_on is not None and ctx.can_talk(stand_on):
                    msgs.append(ctx.msg(t, stand_on, yielder, "DO-NOT-MOVE", "holding course"))
                burns.append((dv_burn, -t))
                dv_used[yielder] += dv_burn
                actions[yielder] = SMALL_OPEN
                if ctx.can_talk(yielder):
                    msgs.append(ctx.msg(t, yielder, stand_on, "EXECUTED", f"burn done, {dv_burn} m/s"))
                if stand_on is not None and ctx.can_talk(stand_on):
                    msgs.append(ctx.msg(t, stand_on, yielder, "EXECUTED", "hold committed"))
                beneficiary = ctx.registry[stand_on].operator if stand_on else COMMONS
                led = lg.record_yield(led, ctx.registry[yielder].operator, beneficiary, dv_burn, t)
            executed = True
            committed = True

        late_t = spec.get("late_override_t")
        if committed and late_t is not None and t >= late_t and not late_override_done:
            late_override_done = True
            _, _, outcome = shield.human_decision("override", verdict, committed)
            notes.setdefault(t, "Human override after commit: refused unilaterally; new handshake round")
            for aid in (a_id, b_id):
                if ctx.can_talk(aid):
                    other = b_id if aid == a_id else a_id
                    msgs.append(ctx.msg(t, aid, other, "PROPOSE", f"new round after override ({outcome})"))

        state = hs.apply_all(state, msgs)
        step = {
            "t_min": float(t), "pc": p, "miss_m": round(miss, 3), "sigma_m": round(sigma, 3),
            "actions": {aid: {"action": act, "probs": _one_hot(act)} for aid, act in actions.items()},
            "messages": [m.to_dict() for m in msgs],
            "escalation": esc,
        }
        if verdict is not None:
            step["verdict"] = {"yielder": yielder, "rule": verdict.rule, "reason": verdict.reason}
        if t in notes:
            step["note"] = notes[t]
        steps.append(step)

    final_miss = physics.miss_after(enc["miss0_m"], burns)
    for aid, reg in ctx.registry.items():
        if reg.capability == "debris" or aid in ctx.silent:
            led = lg.record_risk(led, reg.operator, peak_pc)

    episode = {
        "id": spec["id"], "title": spec["title"], "scripted": True, "variant": variant,
        "agents": [{"id": a["id"], "name": a["name"], "class": ctx.registry[a["id"]].capability,
                    "operator": a["operator"], "fuel": float(a["fuel"]),
                    "ledger": float(spec.get("ledger0", {}).get(a["operator"], 0.0))} for a in ctx.agents],
        "steps": steps,
        "outcome": {"collision": final_miss < physics.HARD_BODY_RADIUS_M,
                    "dv_ms": {k: round(v, 6) for k, v in dv_used.items()},
                    "ledger_after": lg.balances(led)},
    }
    if with_branches and branch_index is not None:
        branches = {}
        for choice in shield.HUMAN_CHOICES:
            alt = run_episode(spec, variant, human_choice=choice, with_branches=False, proposer=proposer)
            branches[choice] = alt["steps"][branch_index + 1:]
        episode["steps"][branch_index]["branches"] = branches
    return episode


def _run_email_world(spec):
    """The 'scripted' variant: no handshake; one operator burns late and alone."""
    ew = spec["email_world"]
    enc = spec["encounter"]
    notes = {int(k): v for k, v in ew.get("notes", {}).items()}
    burns, dv_used = [], {a["id"]: 0.0 for a in spec["agents"]}
    steps = []
    for t in range(START_MIN, 0, STEP_MIN):
        sigma = physics.sigma_at(t, enc["sigma0_m"], enc["sigma_min_m"])
        miss = physics.miss_after(enc["miss0_m"], burns)
        p = _pc_from_script(spec["pc_script"], t) if spec.get("pc_script") and not burns else physics.pc(miss, sigma)
        actions = {aid: HOLD for aid in dv_used}
        if t == int(ew["burn_t"]):
            dv = float(ew.get("dv_ms", DV_BY_ACTION[LARGE_OPEN]))
            burns.append((dv, -t))
            dv_used[ew["burner"]] += dv
            actions[ew["burner"]] = LARGE_OPEN
        step = {"t_min": float(t), "pc": p, "miss_m": round(miss, 3), "sigma_m": round(sigma, 3),
                "actions": {aid: {"action": act, "probs": _one_hot(act)} for aid, act in actions.items()},
                "messages": [], "escalation": None}
        if t in notes:
            step["note"] = notes[t]
        steps.append(step)
    final_miss = physics.miss_after(enc["miss0_m"], burns)
    reg = spec["registry"]
    return {
        "id": spec["id"], "title": spec["title"], "scripted": True, "variant": "scripted",
        "agents": [{"id": a["id"], "name": a["name"], "class": reg[a["id"]]["capability"],
                    "operator": a["operator"], "fuel": float(a["fuel"]),
                    "ledger": float(spec.get("ledger0", {}).get(a["operator"], 0.0))} for a in spec["agents"]],
        "steps": steps,
        "outcome": {"collision": final_miss < physics.HARD_BODY_RADIUS_M,
                    "dv_ms": {k: round(v, 6) for k, v in dv_used.items()},
                    "ledger_after": {}},
    }
