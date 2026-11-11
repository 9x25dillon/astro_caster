"""The public /api/health must not expose AI key or model details.

It is unauthenticated, so it used to hand anyone the first 6 and last 4
characters of the OpenAI key, the model each paid tier buys, and local
provider URLs. Those now live only behind the operator token at
/api/admin/ai-status.
"""
import os
import sys

from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import ai  # noqa: E402
import entitlements as ENT  # noqa: E402
import main  # noqa: E402

client = TestClient(main.app)

_FAKE_KEY = "sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789wxyz"
_FAKE_MODELS = {
    "_MODEL": "leak-check-free-model",
    "_MODEL_SUPPORTER": "leak-check-supporter-model",
    "_MODEL_ORACLE": "leak-check-oracle-model",
    "_OLLAMA_MODEL": "leak-check-ollama-model",
}
_FORBIDDEN_KEYS = {
    "key_fingerprint", "tier_models", "cloud_model", "ollama_model",
    "kgirl_url", "model",
}


def _configure(monkeypatch):
    monkeypatch.setattr(ai, "_API_KEY", _FAKE_KEY)
    for name, value in _FAKE_MODELS.items():
        monkeypatch.setattr(ai, name, value)
    # no network probes in tests
    monkeypatch.setattr(ai, "_reachable", lambda provider: False)
    monkeypatch.setattr(ENT, "personal_mode", lambda: False)


def _all_keys(obj):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield k
            yield from _all_keys(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from _all_keys(v)


def test_public_health_has_no_key_or_model_details(monkeypatch):
    _configure(monkeypatch)
    for path in ("/api/health", "/api/v1/health"):
        r = client.get(path)
        assert r.status_code == 200
        body = r.json()
        assert set(body["ai"]) == {"mode", "configured"}
        assert body["ai"]["configured"] is True
        assert not _FORBIDDEN_KEYS & set(_all_keys(body["ai"]))
        assert "key_fingerprint" not in set(_all_keys(body))
        text = r.text
        assert _FAKE_KEY[:6] not in text
        assert _FAKE_KEY[-4:] not in text
        for model in _FAKE_MODELS.values():
            assert model not in text


def test_admin_ai_status_requires_operator(monkeypatch):
    _configure(monkeypatch)
    assert client.get("/api/admin/ai-status").status_code == 403
    assert client.get(
        "/api/admin/ai-status", headers={"X-AAE-Token": "definitely-wrong"}
    ).status_code == 403


def test_admin_ai_status_returns_full_report_to_operator(monkeypatch):
    _configure(monkeypatch)
    monkeypatch.setattr(ENT, "_DEV_TOKEN", "s3cr3t-token")
    r = client.get("/api/admin/ai-status", headers={"X-AAE-Token": "s3cr3t-token"})
    assert r.status_code == 200
    body = r.json()
    assert body["key_fingerprint"] == f"{_FAKE_KEY[:6]}…{_FAKE_KEY[-4:]}"
    assert body["tier_models"]["oracle"] == "leak-check-oracle-model"
