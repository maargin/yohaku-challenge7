"""Local server for live mode: the simulator decides, the language model explains, the page only displays.

Serves web/ (with the security headers from web/_headers) and adds same-origin endpoints:
  GET  /api/health        -> {"explain": bool, "run": bool, "episodes": bool}
  GET  /api/episodes      -> the Mission Control scenarios, rebuilt by the simulator on every request
  POST /api/run           -> one two-satellite encounter run through the training environment with the shipped policy
  POST /api/explain       -> plain-language explanation of a live-mode run
  POST /api/explain-step  -> plain-language explanation of one scenario step
Explanations come from a local open-weight model behind a chat-completions endpoint (see sim/explain.py); any failure
falls back to a template built from the same validated facts, never to an error page. Only structured, range-checked
fields reach the prompt. Request bodies are never logged.

Usage: python -m sim.live_server --web web [--bind 127.0.0.1] [--port 8080]
         [--endpoint http://127.0.0.1:8011/v1 --model NAME] [--policy runs/<run>]
"""
import argparse
import json
import re
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from collections import OrderedDict

from . import contracts, explain, live_episode

CAPABILITIES = ("debris", "manoeuvrable", "autonomous", "crewed")
PURPOSES = ("public_good", "commercial", "none")
VARIANTS = ("ai", "rules", "scripted")
REASONS = ("high collision probability", "a crewed vehicle is involved", "one satellite does not answer")
INTERVENTIONS = ("holds course: the other satellite has priority to move",
                 "changed to an opening burn (closing burns are not allowed)",
                 "this satellite is the one that must move",
                 "deadline reached: a small opening burn is forced")
MAX_BODY = 16 * 1024
MAX_LIST = 24
NAME_MAX = 24
NAME_STRIP = re.compile(r"[^\w .'\-]")
RULE_WORD = re.compile(r"\brules?\b", re.IGNORECASE)
RULE_CODE = re.compile(r"\bR[0-9]+[a-z]?\b")
SYSTEM = explain.SYSTEM + " Call the fixed priority check 'the safety layer'; never use the word rule or any rule code."
TYPES = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
         ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8",
         ".svg": "image/svg+xml", ".wasm": "application/wasm"}


class Invalid(ValueError):
    pass


def _num(x, lo, hi):
    if isinstance(x, bool) or not isinstance(x, (int, float)) or not (lo <= x <= hi):
        raise Invalid("number out of range")
    return float(x)


def _bool(x):
    if not isinstance(x, bool):
        raise Invalid("expected a boolean")
    return x


def _choice(x, options):
    if isinstance(x, bool) or x not in options:
        raise Invalid("unknown value")
    return x


def _name(x, default):
    if not isinstance(x, str):
        raise Invalid("expected a string")
    cleaned = NAME_STRIP.sub("", x).strip()[:NAME_MAX]
    return cleaned or default


def _list(x, limit=MAX_LIST):
    if not isinstance(x, list) or len(x) > limit:
        raise Invalid("bad list")
    return x


def validate_spec(payload):
    """Two satellites and the encounter geometry, every field range-checked. Raises Invalid otherwise."""
    if not isinstance(payload, dict):
        raise Invalid("expected an object")
    agents_in = _list(payload.get("agents"), 2)
    if len(agents_in) != 2:
        raise Invalid("two agents required")
    agents = []
    for k, a in enumerate(agents_in):
        if not isinstance(a, dict):
            raise Invalid("bad agent")
        agents.append({
            "name": _name(a.get("name"), f"Satellite {k + 1}"),
            "capability": _choice(a.get("capability"), CAPABILITIES),
            "purpose": _choice(a.get("purpose"), PURPOSES),
            "fuel": _num(a.get("fuel"), 0.0, 1.0),
            "ledger": _num(a.get("ledger"), -5.0, 5.0),
            "silent": _bool(a.get("silent")),
        })
    e = payload.get("encounter")
    if not isinstance(e, dict):
        raise Invalid("bad encounter")
    encounter = {
        "miss_m": _num(e.get("miss_m"), -3000.0, 3000.0),
        "offset_m": _num(e.get("offset_m"), 0.0, 500.0),
        "sigma0_m": _num(e.get("sigma0_m"), 30.0, 5000.0),
        "sigma_min_m": _num(e.get("sigma_min_m"), 30.0, 5000.0),
    }
    return {"agents": agents, "encounter": encounter}


def validate(payload):
    """A live-mode summary (spec plus outcome) for /api/explain. Raises Invalid on anything unexpected."""
    v = validate_spec(payload)
    o = payload.get("outcome")
    if not isinstance(o, dict):
        raise Invalid("bad outcome")
    yielder = o.get("yielder")
    if yielder is not None and (isinstance(yielder, bool) or yielder not in (0, 1)):
        raise Invalid("bad yielder")
    burns = []
    for b in _list(o.get("burns", [])):
        if not isinstance(b, dict):
            raise Invalid("bad burn")
        burns.append({"agent": _choice(b.get("agent"), (0, 1)), "t_min": _num(b.get("t_min"), -240.0, 0.0),
                      "dv_ms": _num(b.get("dv_ms"), 0.0, 1.0)})
    interventions = []
    for w in _list(o.get("interventions", [])):
        if not isinstance(w, dict):
            raise Invalid("bad intervention")
        interventions.append({"agent": _choice(w.get("agent"), (0, 1)), "t_min": _num(w.get("t_min"), -240.0, 0.0),
                              "text": _choice(w.get("text"), INTERVENTIONS)})
    v["outcome"] = {
        "collision": _bool(o.get("collision")),
        "final_miss_m": _num(o.get("final_miss_m"), 0.0, 1e5),
        "yielder": yielder,
        "human": _bool(o.get("human")),
        "reasons": [_choice(r, REASONS) for r in _list(o.get("reasons", []), len(REASONS))],
        "burns": burns,
        "interventions": interventions,
    }
    return v


def facts(v):
    """Structured facts for the prompt, in safety-layer wording only."""
    names = [f'{a["name"]} ({a["capability"]}, {a["purpose"]}, fuel {round(a["fuel"] * 100)}%, ledger {a["ledger"]:+.1f}'
             f'{", does not answer messages" if a["silent"] else ""})' for a in v["agents"]]
    o, e = v["outcome"], v["encounter"]
    y = o["yielder"]
    return {
        "satellites": names,
        "predicted_miss_distance_m": round(e["miss_m"]),
        "tracking_uncertainty_m_first_to_last": [round(e["sigma0_m"]), round(e["sigma_min_m"])],
        "safety_layer_priority": (f'{v["agents"][y]["name"]} must move, {v["agents"][1 - y]["name"]} holds course' if y is not None
                                  else "neither object can move"),
        "burns": [f'{v["agents"][b["agent"]]["name"]} burned {b["dv_ms"]:.2f} m/s at {-round(b["t_min"])} min before closest approach'
                  for b in o["burns"]],
        "safety_layer_interventions": [f'{v["agents"][w["agent"]]["name"]} at {-round(w["t_min"])} min: {w["text"]}'
                                       for w in o["interventions"]][:6],
        "human_asked_to_confirm": o["reasons"] if o["human"] else False,
        "outcome": f'{"collision" if o["collision"] else "safe"}, closest approach {round(o["final_miss_m"])} m (hard-body radius 20 m)',
    }


def step_facts(ep, i):
    """Facts for one scenario step, from sim.explain but without priority codes."""
    f = explain.facts(ep, i)
    f.pop("rule", None)
    f["safety_layer_reason"] = f.pop("rule_reason", None)
    return f


def step_template(ep, i):
    """Template for one scenario step (mirrors sim.explain.template without priority codes)."""
    f = step_facts(ep, i)
    parts = []
    if f["safety_layer_reason"]:
        parts.append(f'{f["who_yields"]} moves: {f["safety_layer_reason"]}.')
    if f["escalation"]:
        parts.append(f'Escalated ({f["escalation"]["trigger"]}, level {f["escalation"]["level"]}): {f["escalation"]["reason"]}.')
    if f["note"]:
        parts.append(f["note"])
    return " ".join(parts)[:explain.MAX_CHARS] or "No decision needed at this step."


def template(f):
    parts = [f'Outcome: {f["outcome"]}.', f'Safety layer: {f["safety_layer_priority"]}.']
    parts.append(("Burns: " + "; ".join(f["burns"]) + ".") if f["burns"] else "No burn was executed.")
    if f["human_asked_to_confirm"]:
        parts.append("A human would be asked to confirm: " + ", ".join(f["human_asked_to_confirm"]) + ".")
    return " ".join(parts)[:explain.MAX_CHARS]


def ask_model(f, endpoint, model):
    """Model text in safety-layer wording, or None on any failure."""
    if not (endpoint and model):
        return None
    try:
        text = explain.ask(endpoint, model, "Explain this decision:\n" + json.dumps(f, ensure_ascii=False), system=SYSTEM)
    except Exception:  # fail closed to the caller's template; nothing about the request is logged
        return None
    text = RULE_CODE.sub("the safety layer", RULE_WORD.sub("safety layer", text)).strip()
    return text[:explain.MAX_CHARS] or None


def explanation(v, endpoint, model):
    """(text, source) for a live-mode run."""
    f = facts(v)
    text = ask_model(f, endpoint, model)
    return (text, "model") if text else (template(f), "template")


def load_headers(web):
    headers = {}
    try:
        for line in (web / "_headers").read_text(encoding="utf-8").splitlines():
            m = re.match(r"^\s+([A-Za-z-]+):\s*(.+)$", line)
            if m:
                headers[m.group(1)] = m.group(2).strip()
    except OSError:
        pass
    return headers


class Services:
    """Simulator and model access shared by request threads."""

    def __init__(self, web, endpoint=None, model=None, policy_dir=None):
        self.web, self.endpoint, self.model = web, endpoint, model
        self.lock = threading.Lock()
        self.policy_json = None
        self.actor = self.norm = None
        self.episodes = []
        self.live_eps = OrderedDict()   # live pair scenarios, newest last, so their steps can be explained
        try:
            self.policy_json = contracts.read_json("policy", web / "data" / "policy.json")
        except Exception:
            self.policy_json = None
        try:
            self.objects = live_episode.load_objects(web / "data" / "objects.json")
        except Exception:
            self.objects = {}
        if policy_dir:
            from .evaluate import load_policy
            self.actor, self.norm, _ = load_policy(policy_dir, "cpu")

    @property
    def can_explain(self):
        return bool(self.endpoint and self.model)

    def build_episodes(self):
        from .make_web_data import build_episodes, load_specs
        with self.lock:
            self.episodes = build_episodes(load_specs(), self.policy_json)
            return self.episodes

    def run(self, spec):
        from .live_run import run_live
        with self.lock:
            return run_live(spec, self.actor, self.norm)

    def pair(self, a, b, geometry, fuel):
        """A live scenario for two catalogue objects, run by the episode simulator with the shipped policy."""
        if self.policy_json is None or a not in self.objects or b not in self.objects or a == b:
            raise Invalid("unknown objects")
        spec = live_episode.build_spec(self.objects[a], self.objects[b], fuel=fuel, **geometry)
        with self.lock:
            ep = live_episode.run_pair(spec, self.policy_json)
            self.live_eps[ep["id"]] = ep
            while len(self.live_eps) > 32:
                self.live_eps.popitem(last=False)
        return ep

    def explain_step(self, ep_id, variant, i):
        with self.lock:
            eps = list(self.episodes) + list(self.live_eps.values())
        ep = next((e for e in eps if e["id"] == ep_id and e.get("variant", "rules") == variant), None)
        if ep is None or not (0 <= i < len(ep["steps"])):
            raise Invalid("unknown step")
        f = step_facts(ep, i)
        text = ask_model(f, self.endpoint, self.model)
        return (text, "model") if text else (step_template(ep, i), "template")


def make_handler(web, headers, svc):
    web = web.resolve()

    class Handler(BaseHTTPRequestHandler):
        server_version = "live/1"
        sys_version = ""

        def log_message(self, fmt, *args):  # method, path and status only; no client address, no bodies
            sys.stderr.write(f'{self.command} {self.path.split("?")[0][:120]} {args[1] if len(args) > 1 else ""}\n')

        def _send(self, status, body, ctype="application/json", extra=None):
            self.send_response(status)
            for k, val in headers.items():
                self.send_header(k, val)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            for k, val in (extra or {}).items():
                self.send_header(k, val)
            self.end_headers()
            self.wfile.write(body)

        def _json(self, status, obj):
            self._send(status, json.dumps(obj).encode(), extra={"Cache-Control": "no-store"})

        def _body(self):
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                raise Invalid("bad length")
            if length <= 0 or length > MAX_BODY:
                raise Invalid("bad length")
            return json.loads(self.rfile.read(length).decode("utf-8"))

        def do_GET(self):
            path = self.path.split("?")[0]
            if path == "/api/health":
                return self._json(200, {"explain": svc.can_explain, "run": svc.actor is not None,
                                        "episodes": svc.policy_json is not None,
                                        "pair": bool(svc.objects) and svc.policy_json is not None})
            if path == "/api/episodes":
                if svc.policy_json is None:
                    return self._json(404, {"error": "not found"})
                return self._json(200, svc.build_episodes())
            if path.startswith("/api/"):
                return self._json(404, {"error": "not found"})
            target = (web / path.lstrip("/")).resolve()
            if target != web and web not in target.parents:
                return self._send(403, b"Forbidden", "text/plain; charset=utf-8")
            if target.is_dir():
                target = target / "index.html"
            if not target.is_file():
                return self._send(404, b"Not found", "text/plain; charset=utf-8")
            self._send(200, target.read_bytes(), TYPES.get(target.suffix, "application/octet-stream"))

        def do_POST(self):
            path = self.path.split("?")[0]
            try:
                if path == "/api/run":
                    if svc.actor is None:
                        return self._json(404, {"error": "not found"})
                    return self._json(200, svc.run(validate_spec(self._body())))
                if path == "/api/explain":
                    text, source = explanation(validate(self._body()), svc.endpoint, svc.model)
                    return self._json(200, {"text": text, "source": source})
                if path == "/api/episode":
                    p = self._body()
                    if not isinstance(p, dict):
                        raise Invalid("expected an object")
                    ids = []
                    for k in ("a", "b"):
                        v = p.get(k)
                        if isinstance(v, bool) or not isinstance(v, int) or not (0 < v < 10 ** 9):
                            raise Invalid("bad object id")
                        ids.append(v)
                    geometry = {"miss_m": _num(p.get("miss_m", 80.0), 0.0, 3000.0),
                                "sigma0_m": _num(p.get("sigma0_m", 1200.0), 30.0, 5000.0),
                                "sigma_min_m": _num(p.get("sigma_min_m", 100.0), 30.0, 5000.0)}
                    fuel = {}
                    for k, oid in (("fuel_a", ids[0]), ("fuel_b", ids[1])):
                        if p.get(k) is not None:
                            fuel[oid] = _num(p.get(k), 0.0, 1.0)
                    return self._json(200, svc.pair(ids[0], ids[1], geometry, fuel))
                if path == "/api/explain-step":
                    p = self._body()
                    if not isinstance(p, dict):
                        raise Invalid("expected an object")
                    ep_id = p.get("id")
                    if not isinstance(ep_id, str) or not re.fullmatch(r"[a-z0-9-]{1,40}", ep_id):
                        raise Invalid("bad id")
                    step = p.get("step")
                    if isinstance(step, bool) or not isinstance(step, int) or not (0 <= step < 64):
                        raise Invalid("bad step")
                    text, source = svc.explain_step(ep_id, _choice(p.get("variant"), VARIANTS), step)
                    return self._json(200, {"text": text, "source": source})
            except (ValueError, UnicodeDecodeError):
                return self._json(400, {"error": "bad request"})
            self._json(404, {"error": "not found"})

    return Handler


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--web", default="web")
    ap.add_argument("--bind", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8080)
    ap.add_argument("--endpoint", default=None)
    ap.add_argument("--model", default=None)
    ap.add_argument("--policy", default=None, help="training run directory (final.pt) for /api/run")
    args = ap.parse_args(argv)
    web = Path(args.web)
    svc = Services(web, args.endpoint, args.model, args.policy)
    if svc.policy_json is not None:
        svc.build_episodes()
    server = ThreadingHTTPServer((args.bind, args.port), make_handler(web, load_headers(web), svc))
    server.daemon_threads = True
    print(f"serving {web} on port {args.port} (explain: {svc.can_explain}, run: {svc.actor is not None}, "
          f"episodes: {svc.policy_json is not None})", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
