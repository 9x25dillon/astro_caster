"""
Phase 3.3 — metrics. The registry counts what it should, folds unknown
paths so label cardinality stays bounded, renders valid Prometheus text,
and /metrics is operator-gated and outside /api/*.
"""
import os
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import entitlements as ENT  # noqa: E402
import main  # noqa: E402
import metrics as MET  # noqa: E402

client = TestClient(main.app)

_BIRTH = {"year": 1879, "month": 3, "day": 14, "hour": 11, "minute": 30,
          "second": 0, "lat": 48.4, "lng": 10.0, "tz_offset": 0.67,
          "house_system": "P", "zodiac": "tropical", "ayanamsha": 1}


@pytest.fixture(autouse=True)
def _clean_registry():
    # Snapshot known_paths — unit tests below reassign the module global to
    # a tiny set; the real route table (set at import) must survive for the
    # integration test.
    saved = MET.known_paths
    MET.reset()
    yield
    MET.reset()
    MET.known_paths = saved


# ── registry unit behavior ──────────────────────────────────────────────────

def test_observe_request_counts_and_buckets_status():
    MET.known_paths = {"/api/generate-chart"}
    MET.observe_request("POST", "/api/generate-chart", 200, 0.01)
    MET.observe_request("POST", "/api/generate-chart", 200, 0.02)
    MET.observe_request("POST", "/api/generate-chart", 422, 0.001)
    out = MET.render()
    assert 'aae_requests_total{method="POST",path="/api/generate-chart",class="2xx"} 2' in out
    assert 'aae_requests_total{method="POST",path="/api/generate-chart",class="4xx"} 1' in out
    # duration summary sum+count for the route
    assert 'aae_request_duration_seconds_count{method="POST",path="/api/generate-chart"} 3' in out


def test_unknown_paths_fold_into_other():
    MET.known_paths = {"/api/generate-chart"}
    MET.observe_request("GET", "/wp-admin.php", 404, 0.0)
    MET.observe_request("GET", "/../../etc/passwd", 404, 0.0)
    out = MET.render()
    assert 'path="(other)"' in out
    assert "wp-admin" not in out and "passwd" not in out  # cardinality bounded


def test_v1_alias_normalizes_to_bare_route():
    MET.known_paths = {"/api/health"}
    MET.observe_request("GET", "/api/v1/health", 200, 0.0)
    MET.observe_request("GET", "/api/health", 200, 0.0)
    out = MET.render()
    # both land on the same series, not two
    assert 'aae_requests_total{method="GET",path="/api/health",class="2xx"} 2' in out
    assert "/api/v1/health" not in out


def test_observe_ai_call_accumulates_calls_and_chars():
    MET.observe_ai_call("oracle", 13000)
    MET.observe_ai_call("oracle", 12000)
    MET.observe_ai_call("plate", 0)
    out = MET.render()
    assert 'aae_ai_calls_total{kind="oracle"} 2' in out
    assert 'aae_ai_response_chars_total{kind="oracle"} 25000' in out
    assert 'aae_ai_calls_total{kind="plate"} 1' in out


def test_render_is_valid_exposition_text():
    MET.observe_request("GET", "/api/health", 200, 0.005)
    out = MET.render()
    assert "# TYPE aae_requests_total counter" in out
    assert "# TYPE aae_uptime_seconds gauge" in out
    assert out.endswith("\n")
    # every non-comment, non-blank line is "name value" or "name{labels} value"
    for line in out.splitlines():
        if line.startswith("#") or not line:
            continue
        assert line.rsplit(" ", 1)[1].replace(".", "").replace("-", "").isdigit() \
            or line.rsplit(" ", 1)[1].replace(".", "").isdigit()


# ── the endpoint ────────────────────────────────────────────────────────────

def test_metrics_endpoint_requires_operator_token():
    assert client.get("/metrics").status_code == 403
    assert client.get("/metrics",
                      headers={"X-AAE-Token": "wrong"}).status_code == 403


def test_metrics_endpoint_serves_prometheus_with_operator_token(monkeypatch):
    monkeypatch.setattr(ENT, "_DEV_TOKEN", "op-secret")
    r = client.get("/metrics", headers={"X-AAE-Token": "op-secret"})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/plain")
    assert "aae_uptime_seconds" in r.text


def test_metrics_endpoint_is_outside_api_prefix():
    # It must NOT be reachable under the versioned/public API prefix — the
    # nginx edge only proxies /api/*, so /metrics staying bare keeps it off
    # the public origin by construction.
    assert client.get("/api/metrics").status_code == 404
    assert client.get("/api/v1/metrics").status_code == 404


def test_a_real_request_shows_up_in_metrics(monkeypatch):
    monkeypatch.setattr(ENT, "_DEV_TOKEN", "op-secret")
    client.post("/api/v1/generate-chart", json=_BIRTH)
    body = client.get("/metrics", headers={"X-AAE-Token": "op-secret"}).text
    assert 'path="/api/generate-chart"' in body
