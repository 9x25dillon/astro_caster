"""
Phase 3.2 — structured logging: JSON lines, request ids, and the privacy
contract (no birth data ever enters the log stream — asserted, not assumed).
"""
import json
import logging
import os
import sys

from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import logsetup as LOG  # noqa: E402
import main  # noqa: E402

client = TestClient(main.app)

# Distinctive fake birth — these literals must never appear in any log line.
_BIRTH = {"year": 1911, "month": 7, "day": 3, "hour": 4, "minute": 56,
          "second": 0, "lat": 47.9137, "lng": -3.1415, "tz_offset": 0,
          "house_system": "P", "zodiac": "tropical", "ayanamsha": 1}
_BIRTH_MARKERS = ("1911", "47.9137", "-3.1415", "4:56", "47.91")


# ── mode selection ──────────────────────────────────────────────────────────

def test_json_mode_defaults(monkeypatch):
    monkeypatch.delenv("AAE_LOG_JSON", raising=False)
    monkeypatch.setenv("AAE_ENV", "production")
    assert LOG.use_json() is True
    monkeypatch.setenv("AAE_ENV", "development")
    assert LOG.use_json() is False
    monkeypatch.setenv("AAE_LOG_JSON", "1")
    assert LOG.use_json() is True
    monkeypatch.setenv("AAE_ENV", "production")
    monkeypatch.setenv("AAE_LOG_JSON", "0")
    assert LOG.use_json() is False


# ── JSON line shape ─────────────────────────────────────────────────────────

def test_json_formatter_emits_parseable_lines_with_request_id():
    fmt = LOG.JsonFormatter()
    LOG.request_id_var.set("rid-test-1234")
    record = logging.LogRecord("aae", logging.WARNING, __file__, 1,
                               "something %s", ("happened",), None)
    LOG.RequestIdFilter().filter(record)
    line = fmt.format(record)
    parsed = json.loads(line)
    assert parsed["level"] == "warning"
    assert parsed["logger"] == "aae"
    assert parsed["msg"] == "something happened"
    assert parsed["request_id"] == "rid-test-1234"
    assert parsed["ts"].endswith("+00:00")


def test_json_formatter_carries_access_extras():
    fmt = LOG.JsonFormatter()
    record = logging.LogRecord("aae.access", logging.INFO, __file__, 1,
                               "POST /x 200 12ms", (), None)
    record.method, record.path = "POST", "/api/v1/generate-chart"
    record.status, record.dur_ms = 200, 12.3
    parsed = json.loads(fmt.format(record))
    assert parsed["method"] == "POST"
    assert parsed["path"] == "/api/v1/generate-chart"
    assert parsed["status"] == 200
    assert parsed["dur_ms"] == 12.3


def test_access_line_has_request_id_and_no_query_string(caplog):
    with caplog.at_level(logging.INFO, logger="aae.access"):
        client.get("/api/health?entitlement=SUPERSECRETTOKEN",
                   headers={"X-Request-ID": "rid-for-access-line"})
    access = [r for r in caplog.records if r.name == "aae.access"]
    assert access, "middleware emitted no access line"
    rec = access[-1]
    assert rec.request_id == "rid-for-access-line"
    assert rec.path == "/api/health"
    assert "SUPERSECRETTOKEN" not in rec.getMessage()
    assert rec.status == 200
    assert rec.dur_ms >= 0


# ── request ids ─────────────────────────────────────────────────────────────

def test_every_response_carries_a_request_id():
    r = client.get("/api/health")
    rid = r.headers.get("x-request-id")
    assert rid and len(rid) >= 4


def test_wellformed_inbound_request_id_is_honored():
    r = client.get("/api/health", headers={"X-Request-ID": "cf-ray.1234-ABC"})
    assert r.headers["x-request-id"] == "cf-ray.1234-ABC"


def test_malformed_inbound_request_id_is_replaced():
    for bad in ("x", "a" * 65, "inj\nection", "sp ace", "<script>"):
        r = client.get("/api/health", headers={"X-Request-ID": bad})
        rid = r.headers["x-request-id"]
        assert rid != bad
        assert len(rid) == 16


def test_two_requests_get_distinct_ids():
    a = client.get("/api/health").headers["x-request-id"]
    b = client.get("/api/health").headers["x-request-id"]
    assert a != b


# ── the privacy contract ────────────────────────────────────────────────────

def test_no_birth_data_reaches_the_log_stream(caplog):
    """Drive the data-carrying endpoints with a distinctive birth and assert
    no coordinate/date literal lands in any record from any logger."""
    with caplog.at_level(logging.DEBUG):
        assert client.post("/api/v1/generate-chart", json=_BIRTH).status_code == 200
        assert client.post(
            "/api/v1/forecast", json={"natal": _BIRTH, "days": 7}
        ).status_code == 200
    for record in caplog.records:
        line = record.getMessage()
        for marker in _BIRTH_MARKERS:
            assert marker not in line, (
                f"birth marker {marker!r} leaked into log: {line[:200]}"
            )
