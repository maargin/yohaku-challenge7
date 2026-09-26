"""Plain-English explanations (B15) from a local open-weight LLM behind an OpenAI-compatible endpoint.

Only structured episode fields go into prompts (no secrets, no infrastructure details).
Output is length-limited, schema-validated, and any failure falls back to a template.
Keys: "<episodeId>.<variant>:<stepIndex>".
Usage: python -m sim.explain --episodes web/data/episodes.json --endpoint http://127.0.0.1:8011/v1 --model <name>
"""
import argparse
import json
import logging
import urllib.request
from pathlib import Path

from . import contracts
from .log import get_logger, log

logger = get_logger("explain")
MAX_CHARS = 600
SYSTEM = ("You explain satellite collision-avoidance decisions to a satellite operator in plain English. "
          "Use 1 to 3 short sentences. Only use the facts given. Do not invent numbers. "
          "Say collision probabilities are illustrative when you mention them.")


def interesting(ep):
    """Step indices worth explaining: first verdict, escalations, burns and narrative notes."""
    out, seen_verdict = [], False
    for i, s in enumerate(ep["steps"]):
        burn = any(a["action"] in (1, 2, 4) for a in s["actions"].values())
        if (s.get("verdict") and not seen_verdict) or s["escalation"] or burn or s.get("note"):
            out.append(i)
        seen_verdict = seen_verdict or bool(s.get("verdict"))
    return out


def facts(ep, i):
    s = ep["steps"][i]
    names = {a["id"]: f'{a["name"]} ({a["class"]}, fuel {round(a["fuel"] * 100)}%)' for a in ep["agents"]}
    v = s.get("verdict") or {}
    return {
        "scenario": ep["title"], "variant": ep["variant"], "minutes_before_closest_approach": -s["t_min"],
        "illustrative_collision_probability": f'{s["pc"]:.1e}', "agents": list(names.values()),
        "who_yields": names.get(v.get("yielder"), "nobody") if v else "not decided yet",
        "rule": v.get("rule"), "rule_reason": v.get("reason"),
        "messages": [f'{m["type"]} from {m["from"]}: {m["text"]}' for m in s["messages"]][:6],
        "escalation": s["escalation"], "note": s.get("note"),
    }


def template(ep, i):
    f = facts(ep, i)
    parts = []
    if f["rule"]:
        parts.append(f'{f["who_yields"]} moves under rule {f["rule"]}: {f["rule_reason"]}.')
    if f["escalation"]:
        parts.append(f'Escalated ({f["escalation"]["trigger"]}, level {f["escalation"]["level"]}): {f["escalation"]["reason"]}.')
    if f["note"]:
        parts.append(f["note"])
    return " ".join(parts)[:MAX_CHARS] or "No decision needed at this step."


def ask(endpoint, model, prompt, timeout=60):
    body = {"model": model, "temperature": 0.2, "max_tokens": 160,
            "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": prompt}],
            "chat_template_kwargs": {"enable_thinking": False}}
    req = urllib.request.Request(endpoint.rstrip("/") + "/chat/completions", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        text = json.loads(r.read())["choices"][0]["message"]["content"]
    text = " ".join(text.replace("<think>", "").replace("</think>", "").split())
    return text[:MAX_CHARS]


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--episodes", default="web/data/episodes.json")
    ap.add_argument("--out", default="web/data/explanations.json")
    ap.add_argument("--endpoint", default=None)
    ap.add_argument("--model", default=None)
    args = ap.parse_args(argv)
    episodes = contracts.read_json("episodes", args.episodes)
    out, llm_ok, fallback = {}, 0, 0
    for ep in episodes:
        for i in interesting(ep):
            key = f'{ep["id"]}.{ep.get("variant", "rules")}:{i}'
            text = None
            if args.endpoint and args.model:
                try:
                    prompt = "Explain this decision:\n" + json.dumps(facts(ep, i), ensure_ascii=False)
                    text = ask(args.endpoint, args.model, prompt) or None
                    llm_ok += text is not None
                except Exception as exc:  # fail closed to the template, never to partial output
                    log(logger, logging.WARNING, "llm call failed; using template", key=key, error=type(exc).__name__)
            if text is None:
                text = template(ep, i)
                fallback += 1
            out[key] = text
    contracts.write_json("explanations", out, Path(args.out))
    log(logger, logging.INFO, "wrote explanations", count=len(out), llm=llm_ok, template=fallback)


if __name__ == "__main__":
    main()
