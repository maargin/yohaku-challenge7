"""AI-variant episodes validate and stay behind the shield, even with an untrained policy (E4/E5)."""
import torch

from sim import contracts
from sim.ai_proposer import make_proposer, observation
from sim.env_torch import OBS_DIM
from sim.episodes import run_episode
from sim.export_policy import forward_json, to_json
from sim.make_web_data import build_episodes, load_specs
from sim.train_mappo import Actor

SPECS = {s["id"]: s for s in load_specs()}


def random_policy(seed=0):
    torch.manual_seed(seed)
    return to_json(Actor(), torch.zeros(OBS_DIM), torch.ones(OBS_DIM))


def test_policy_json_validates_and_round_trips():
    torch.manual_seed(1)
    actor = Actor()
    pol = to_json(actor, torch.zeros(OBS_DIM), torch.ones(OBS_DIM))
    contracts.validate("policy", pol)
    x = torch.rand(OBS_DIM)
    with torch.no_grad():
        ref = actor(x[None])[0].tolist()
    assert max(abs(a - b) for a, b in zip(forward_json(pol, x.tolist()), ref)) < 1e-5


def test_ai_episodes_validate():
    eps = build_episodes(list(SPECS.values()), random_policy())
    contracts.validate("episodes", eps)
    assert {e["variant"] for e in eps} == {"scripted", "rules", "ai"}


def test_ai_never_changes_who_yields():
    for sid, spec in SPECS.items():
        rules_ep = run_episode(spec, "rules")
        ai_ep = run_episode(spec, "ai", proposer=make_proposer(random_policy(3)))
        r = next(s["verdict"]["yielder"] for s in rules_ep["steps"] if s.get("verdict"))
        a = next(s["verdict"]["yielder"] for s in ai_ep["steps"] if s.get("verdict"))
        assert r == a, sid
        movers = [k for k, v in ai_ep["outcome"]["dv_ms"].items() if v > 0]
        assert movers in ([], [a]) or (a is None and not movers), sid


def test_observation_has_24_features():
    ctx = {"t_min": -120, "pc": 1e-4, "miss_m": 100.0, "sigma_m": 300.0, "sigma0_m": 1000.0, "yielder": "a",
           "agents": {"a": {"capability": "autonomous", "fuel": 0.5, "ledger": 0.0, "silent": False, "intent": "hold",
                            "offset_m": 0.0},
                      "b": {"capability": "debris", "fuel": 0.0, "ledger": 0.0, "silent": False, "intent": "hold",
                            "offset_m": 0.0}}}
    assert len(observation(ctx, "a", "b")) == OBS_DIM
