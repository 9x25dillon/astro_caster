"""
Phase 1.6 — security sweep assertions.

Defensive response headers are present on every response; the admin endpoint
rejects missing/incorrect dev tokens; the dev-token check is constant-time and
fails closed when unset.
"""
import os
import sys

from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import entitlements as ENT  # noqa: E402
import main  # noqa: E402

client = TestClient(main.app)


def test_security_headers_present_on_responses():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-frame-options"] == "DENY"
    assert "default-src 'none'" in r.headers["content-security-policy"]
    assert "frame-ancestors 'none'" in r.headers["content-security-policy"]
    assert "max-age" in r.headers["strict-transport-security"]
    assert r.headers["referrer-policy"] == "no-referrer"


def test_admin_stats_rejects_missing_or_wrong_token():
    assert client.get("/api/admin/stats").status_code == 403
    assert client.get("/api/admin/stats", params={"token": "definitely-wrong"}).status_code == 403


def test_check_dev_token_semantics(monkeypatch):
    monkeypatch.setattr(ENT, "_DEV_TOKEN", "s3cr3t-token")
    assert ENT.check_dev_token("s3cr3t-token") is True
    assert ENT.check_dev_token("s3cr3t-toke") is False   # near-miss
    assert ENT.check_dev_token("") is False
    assert ENT.check_dev_token(None) is False
    # fail closed when no dev token is configured
    monkeypatch.setattr(ENT, "_DEV_TOKEN", "")
    assert ENT.check_dev_token("anything") is False
    assert ENT.check_dev_token("") is False
