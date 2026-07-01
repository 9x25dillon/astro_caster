"""
R1 — rate limiting on the expensive AI paths.

Contracts under test:
  • DISABLED by default in non-production (AAE_ENV=test) — the suite and local
    dev are unaffected; ENABLED by default in production; explicit env wins both ways
  • when enabled: requests beyond the bucket budget get 429 with a Retry-After
    header; the window slides (old hits expire); keys separate by entitlement
    digest so one hot token can't starve a shared IP (and vice versa)
  • endpoint wiring: /api/oracle-report (bucket "oracle") and /api/ai-ask
    (bucket "ai") return 429 under a tiny forced budget; the deterministic
    /api/tarot-reading WITHOUT include_ai is never throttled
"""
import os
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import entitlements as ENT  # noqa: E402
import ephemeris as E  # noqa: E402
import main  # noqa: E402
from models import ChartRequest  # noqa: E402
import ratelimit as RL  # noqa: E402

_EINSTEIN = dict(year=1879, month=3, day=14, hour=11, minute=30, second=0,
                 lat=48.4011, lng=9.9876, tz_offset=0.67)
_CHART = E.calculate_chart(ChartRequest(**_EINSTEIN))

client = TestClient(main.app)


@pytest.fixture(autouse=True)
def _clean():
    RL.reset()
    yield
    RL.reset()


def _enable(monkeypatch, oracle=2, ai=3, window=60):
    monkeypatch.setenv("AAE_RATE_LIMIT_ENABLED", "1")
    monkeypatch.setenv("AAE_RATE_LIMIT_ORACLE", str(oracle))
    monkeypatch.setenv("AAE_RATE_LIMIT_AI", str(ai))
    monkeypatch.setenv("AAE_RATE_LIMIT_WINDOW_S", str(window))


# ── Enablement semantics (mirror the trust-mode philosophy) ─────────────────────

def test_disabled_by_default_in_nonprod(monkeypatch):
    monkeypatch.delenv("AAE_RATE_LIMIT_ENABLED", raising=False)
    monkeypatch.setenv("AAE_ENV", "test")
    assert RL.enabled() is False


def test_enabled_by_default_in_production(monkeypatch):
    monkeypatch.delenv("AAE_RATE_LIMIT_ENABLED", raising=False)
    monkeypatch.setenv("AAE_ENV", "production")
    assert RL.enabled() is True


def test_explicit_env_wins_both_ways(monkeypatch):
    monkeypatch.setenv("AAE_ENV", "production")
    monkeypatch.setenv("AAE_RATE_LIMIT_ENABLED", "0")
    assert RL.enabled() is False
    monkeypatch.setenv("AAE_ENV", "test")
    monkeypatch.setenv("AAE_RATE_LIMIT_ENABLED", "1")
    assert RL.enabled() is True


# ── Window + keying mechanics (unit level, no network) ──────────────────────────

def test_budget_exhaustion_and_retry_after(monkeypatch):
    _enable(monkeypatch, oracle=2)
    from fastapi import HTTPException
    RL.check(None, "oracle")
    RL.check(None, "oracle")
    with pytest.raises(HTTPException) as exc:
        RL.check(None, "oracle")
    assert exc.value.status_code == 429
    assert "Retry-After" in exc.value.headers
    assert int(exc.value.headers["Retry-After"]) >= 1


def test_window_slides(monkeypatch):
    _enable(monkeypatch, oracle=1, window=60)
    from fastapi import HTTPException
    t = [1000.0]
    monkeypatch.setattr(RL.time, "monotonic", lambda: t[0])
    RL.check(None, "oracle")
    with pytest.raises(HTTPException):
        RL.check(None, "oracle")
    t[0] += 61.0                       # old hit falls out of the window
    RL.check(None, "oracle")           # must not raise


def test_keys_separate_by_entitlement(monkeypatch):
    _enable(monkeypatch, oracle=1)
    from fastapi import HTTPException
    RL.check(None, "oracle", entitlement="token-A")
    RL.check(None, "oracle", entitlement="token-B")   # different budget — ok
    with pytest.raises(HTTPException):
        RL.check(None, "oracle", entitlement="token-A")


# ── Endpoint wiring ─────────────────────────────────────────────────────────────

def _oracle_payload():
    tok = ENT.mint_entitlement("oracle", ref="rl", verified=True)["token"]
    return {"chart": _CHART.model_dump(), "spread": "three_card",
            "question": "q", "source": "golden_dawn", "entitlement": tok}


def test_oracle_report_429_after_budget(monkeypatch):
    import oracle_report as ORACLE
    monkeypatch.setattr(ORACLE, "_ANTHROPIC_KEY", "")   # offline, no network
    _enable(monkeypatch, oracle=2)
    body = _oracle_payload()
    assert client.post("/api/oracle-report", json=body).status_code == 200
    assert client.post("/api/oracle-report", json=body).status_code == 200
    r = client.post("/api/oracle-report", json=body)
    assert r.status_code == 429
    assert "retry-after" in r.headers
    assert "rate limit" in r.json()["detail"]


def test_ai_ask_429_after_budget(monkeypatch):
    # Fake the interpretation layer: no network, no cost, instant return —
    # this test proves the 429 wiring, not the AI provider.
    async def _fake_interpret(**kw):
        return {"interpretation": "ok", "source": "offline",
                "provider": "offline", "model": ""}
    monkeypatch.setattr(main, "interpret", _fake_interpret)
    _enable(monkeypatch, ai=1, window=600)
    body = {"query": "hi", "chart": _CHART.model_dump()}
    first = client.post("/api/ai-ask", json=body)
    assert first.status_code == 200
    r = client.post("/api/ai-ask", json=body)
    assert r.status_code == 429
    assert "retry-after" in r.headers


def test_deterministic_tarot_reading_never_throttled(monkeypatch):
    _enable(monkeypatch, ai=1)
    body = {"chart": _CHART.model_dump(), "spread": "three_card",
            "question": "q", "include_ai": False}
    for _ in range(4):                                  # well past the ai budget
        assert client.post("/api/tarot-reading", json=body).status_code == 200


def test_suite_default_untouched():
    # No env forcing: AAE_ENV=test (conftest) => limiter off, storms are fine.
    body = {"chart": _CHART.model_dump(), "spread": "three_card",
            "question": "q", "include_ai": False}
    codes = {client.post("/api/tarot-reading", json=body).status_code for _ in range(3)}
    assert codes == {200}
