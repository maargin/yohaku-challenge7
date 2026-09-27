"""Live mode on the server: run one two-satellite encounter through the training environment with the shipped policy.

The record has the same shape as the browser fallback (web/js/liveEnv.js) so the page renders both the same way.
"""
import torch

from .env_torch import (A, AUTO, COM, CREWED, DEADLINE_MIN, DEBRIS, MAN, NONE, PC_HIGH, PUB, RADIAL, REQUEST_YIELD,
                        SMALL_CLOSE, SMALL_OPEN, STEPS, ConjunctionEnv)

CAP = {"manoeuvrable": MAN, "autonomous": AUTO, "crewed": CREWED, "debris": DEBRIS}
PUR = {"public_good": PUB, "commercial": COM, "none": NONE}
REASONS = ("high collision probability", "a crewed vehicle is involved", "one satellite does not answer")
WHY = ("holds course: the other satellite has priority to move",
       "changed to an opening burn (closing burns are not allowed)",
       "this satellite is the one that must move",
       "deadline reached: a small opening burn is forced")


def make_env(spec, device="cpu"):
    """A one-cluster environment holding exactly the two satellites and geometry of the spec."""
    env = ConjunctionEnv(1, device=device, seed=0, stage=3)
    env.reset()
    dev = env.device
    env.n = torch.tensor([2], device=dev)
    env.mask = env.idx[None, :] < 2
    cap = torch.full((1, A), DEBRIS, dtype=torch.long, device=dev)
    pur = torch.full((1, A), NONE, dtype=torch.long, device=dev)
    fuel = torch.zeros(1, A, device=dev)
    led = torch.zeros(1, A, device=dev)
    sil = torch.zeros(1, A, dtype=torch.bool, device=dev)
    for k, a in enumerate(spec["agents"]):
        cap[0, k] = CAP[a["capability"]]
        pur[0, k] = PUR[a["purpose"]]
        fuel[0, k] = 0.0 if a["capability"] == "debris" else float(a["fuel"])
        led[0, k] = float(a["ledger"])
        sil[0, k] = a["capability"] != "debris" and bool(a["silent"])
    env.cap, env.pur, env.fuel, env.led, env.silent = cap, pur, fuel, led, sil
    e = spec["encounter"]
    m0, p0 = float(e["miss_m"]), float(e["offset_m"])
    s0 = max(30.0, float(e["sigma0_m"]))
    smin = min(s0, max(30.0, float(e["sigma_min_m"])))
    env.near.zero_()
    for i, j in ((0, 1), (1, 0)):
        env.m0[0, i, j], env.p0[0, i, j] = m0, p0
        env.sigma0[0, i, j], env.sigma_min[0, i, j] = s0, smin
        env.coup[0, i, j] = 1.0 if m0 >= 0 else -1.0
        env.near[0, i, j] = True
    env.pp = torch.tensor([[1, 0, 0, 0, 0, 0]], device=dev)
    for name in ("d", "dv_spent", "burned", "intent", "esc_used", "hard_flag", "secondary", "conflicts"):
        getattr(env, name).zero_()
    env.t_idx = 0
    env._refresh()
    env.phi = env._phi()
    return env


def _why(prop, executed, yielder, burned, t, danger, acting):
    if not acting:
        return None
    burn = SMALL_OPEN <= prop <= RADIAL
    if yielder and not burned and t >= DEADLINE_MIN and danger and executed == SMALL_OPEN and not burn:
        return WHY[3]
    if not yielder and burn:
        return WHY[0]
    if yielder and prop == SMALL_CLOSE:
        return WHY[1]
    if yielder and prop == REQUEST_YIELD:
        return WHY[2]
    return None


def run_live(spec, actor, norm, device="cpu"):
    env = make_env(spec, device)
    dev = env.device
    steps, reasons = [], []
    obs = env.obs()
    info = None
    for _ in range(STEPS):
        t = env.t_min()
        miss, sigma, pc = float(env.miss[0, 0, 1]), float(env.sigma[0, 0, 1]), float(env.pc[0, 0, 1])
        danger = bool(env.danger[0, 0])
        iy = [bool(env.i_yields[0, 0]), bool(env.i_yields[0, 1])]
        burned = [bool(env.burned[0, 0]), bool(env.burned[0, 1])]
        acting = env.acting()[0, :2].tolist()
        if pc > PC_HIGH and REASONS[0] not in reasons:
            reasons.append(REASONS[0])
        if bool((env.cap[0, :2] == CREWED).any()) and REASONS[1] not in reasons:
            reasons.append(REASONS[1])
        if bool(env.silent[0, :2].any()) and REASONS[2] not in reasons:
            reasons.append(REASONS[2])
        obs_before = obs
        with torch.no_grad():
            probs = torch.softmax(actor(norm(obs)), -1)[0, :2]
        chosen = probs.argmax(-1)
        prop = torch.zeros(1, A, dtype=torch.long, device=dev)
        prop[0, :2] = chosen
        obs, _, _, info = env.step(prop)
        executed = info["executed"][0, :2].tolist()
        dv = info["dv"][0, :2].tolist()
        chosen_l = chosen.tolist()
        steps.append({
            "t": t, "miss": miss, "sigma": sigma, "pc": pc, "danger": danger, "iYields": iy,
            "observations": [[round(x, 6) for x in row] for row in obs_before[0, :2].tolist()],
            "probs": [[round(p, 6) for p in row] for row in probs.tolist()], "chosen": chosen_l, "executed": executed,
            "dv": dv, "why": [_why(chosen_l[k], executed[k], iy[k], burned[k], t, danger, acting[k]) for k in range(2)],
            "missAfter": float(env.miss[0, 0, 1]),
        })
    return {"steps": steps, "final": {"miss": float(env.miss[0, 0, 1]), "t": env.t_min()},
            "collision": bool(info["collision"][0]), "human": bool(env.hard_flag[0]), "reasons": reasons,
            "source": "simulator"}
