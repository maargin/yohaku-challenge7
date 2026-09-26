"""Explainer falls back to templates and always produces schema-valid output (E6)."""
import json

from sim import contracts, explain
from sim.make_web_data import build_episodes, load_specs


def test_template_fallback_is_valid(tmp_path):
    eps = build_episodes(load_specs())
    p = tmp_path / "episodes.json"
    p.write_text(json.dumps(eps), encoding="utf-8")
    out = tmp_path / "explanations.json"
    explain.main(["--episodes", str(p), "--out", str(out), "--endpoint", "http://127.0.0.1:9/v1", "--model", "x"])
    data = contracts.read_json("explanations", out)
    assert data and all(0 < len(v) <= explain.MAX_CHARS for v in data.values())
    assert any(k.startswith("crewed-vs-commercial.rules:") for k in data)


def test_template_mentions_rule_and_escalation():
    ep = next(e for e in build_episodes(load_specs()) if e["id"] == "crewed-vs-commercial")
    i = next(k for k, s in enumerate(ep["steps"]) if s["escalation"])
    text = explain.template(ep, i)
    assert "R3" in text and "CREWED" in text
