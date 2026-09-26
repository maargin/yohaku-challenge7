"""Data contracts (B1): one JSON Schema per web data file; validate on every write and read."""
import json
from pathlib import Path

from jsonschema import Draft202012Validator

SCHEMA_DIR = Path(__file__).resolve().parent.parent / "schema"
KINDS = ("objects", "episodes", "socrates_top", "policy", "testvec", "explanations", "results")


class ContractError(ValueError):
    """Raised when data does not match its contract. Callers must not use the data (fail closed)."""


_validators = {}


def _validator(kind):
    if kind not in KINDS:
        raise ContractError(f"unknown data kind: {kind}")
    if kind not in _validators:
        schema = json.loads((SCHEMA_DIR / f"{kind}.schema.json").read_text(encoding="utf-8"))
        Draft202012Validator.check_schema(schema)
        _validators[kind] = Draft202012Validator(schema)
    return _validators[kind]


def validate(kind, obj):
    errors = sorted(_validator(kind).iter_errors(obj), key=lambda e: list(e.path))
    if errors:
        first = errors[0]
        where = "/".join(str(p) for p in first.path) or "<root>"
        raise ContractError(f"{kind}: {len(errors)} error(s); first at {where}: {first.message}")


def dumps(kind, obj):
    validate(kind, obj)
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def loads(kind, text):
    obj = json.loads(text)
    validate(kind, obj)
    return obj


def write_json(kind, obj, path):
    text = dumps(kind, obj)
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    try:
        tmp.write_text(text, encoding="utf-8")
        tmp.replace(path)
    finally:
        if tmp.exists():
            tmp.unlink()


def read_json(kind, path):
    return loads(kind, Path(path).read_text(encoding="utf-8"))
