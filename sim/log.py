"""Structured JSON-line logging for every script (SECURITY-03).

Each record carries a timestamp, run id, level and message. Field names that look
like secrets are redacted before anything is written.
"""
import json
import logging
import sys
import time
import uuid

RUN_ID = uuid.uuid4().hex[:12]
_SECRET_HINTS = ("secret", "token", "password", "passwd", "api_key", "apikey", "credential")


def _redact(fields):
    return {
        k: ("[REDACTED]" if any(h in k.lower() for h in _SECRET_HINTS) else v)
        for k, v in fields.items()
    }


class _JsonFormatter(logging.Formatter):
    def format(self, record):
        payload = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(record.created)),
            "run_id": RUN_ID,
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        payload.update(_redact(getattr(record, "fields", {})))
        return json.dumps(payload, default=str)


def get_logger(name="sim"):
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stderr)
        handler.setFormatter(_JsonFormatter())
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
        logger.propagate = False
    return logger


def log(logger, level, msg, **fields):
    logger.log(level, msg, extra={"fields": fields})
