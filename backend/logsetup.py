"""
logsetup.py — Phase 3.2 structured logging.
===========================================

JSON log lines in production (or when AAE_LOG_JSON=1), the human format in
dev. Every record carries the request id bound by main.py's request-context
middleware (a contextvar, so it survives async hops), and responses echo it
as X-Request-ID for cross-referencing client reports with server lines.

Privacy contract (asserted in tests/test_structured_logging.py): nothing in
the log stream may contain birth data. Access lines log method + path only —
bodies are never logged — and app logs must not interpolate request payloads.

Env:
    AAE_LOG_JSON   "1" forces JSON lines anywhere, "0" forces the human
                   format anywhere; unset → JSON in production, human in dev.
"""

from __future__ import annotations

import contextvars
import json
import logging
import os
import sys
from datetime import datetime, timezone

# Bound per-request by main.py's middleware; empty outside a request.
request_id_var: contextvars.ContextVar[str] = contextvars.ContextVar(
    "request_id", default=""
)

_TRUTHY = {"1", "true", "yes", "on"}


def use_json() -> bool:
    raw = os.environ.get("AAE_LOG_JSON", "").strip().lower()
    if raw:
        return raw in _TRUTHY
    return os.environ.get("AAE_ENV", "").strip().lower() == "production"


class RequestIdFilter(logging.Filter):
    """Stamp every record with the current request id (or '')."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        return True


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        out = {
            "ts": datetime.fromtimestamp(record.created, tz=timezone.utc)
            .isoformat(timespec="milliseconds"),
            "level": record.levelname.lower(),
            "logger": record.name,
            "msg": record.getMessage(),
            "request_id": getattr(record, "request_id", ""),
        }
        # aae.access records carry structured extras from the middleware.
        for field in ("method", "path", "status", "dur_ms"):
            if hasattr(record, field):
                out[field] = getattr(record, field)
        if record.exc_info:
            out["exc"] = self.formatException(record.exc_info)
        return json.dumps(out, ensure_ascii=False)


class HumanFormatter(logging.Formatter):
    def __init__(self) -> None:
        super().__init__("%(levelname)s: %(rid)s%(message)s")

    def format(self, record: logging.LogRecord) -> str:
        rid = getattr(record, "request_id", "")
        record.rid = f"[{rid}] " if rid else ""
        return super().format(record)


def configure() -> None:
    """Route aae.* and uvicorn.* through one stderr handler.

    Called at main.py import time — uvicorn configures its own logging
    BEFORE importing the app, so replacing handlers here deterministically
    wins. Idempotent (reload-safe).

    uvicorn's own access line is silenced: it logs from outside the app's
    async context (measured — the request-id contextvar is invisible to
    it), so main.py's middleware emits the access line instead, with the
    id, a duration, and the path stripped of its query string (a query may
    carry ?entitlement= — tokens must never reach logs).
    """
    handler = logging.StreamHandler(sys.stderr)
    handler.addFilter(RequestIdFilter())
    handler.setFormatter(JsonFormatter() if use_json() else HumanFormatter())

    for name in ("aae", "uvicorn", "uvicorn.error"):
        logger = logging.getLogger(name)
        logger.handlers = [handler]
        logger.propagate = False
    access = logging.getLogger("uvicorn.access")
    access.handlers = [logging.NullHandler()]
    access.propagate = False
    logging.getLogger("aae").setLevel(logging.INFO)
