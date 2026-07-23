"""
Phase 4.4 — AI cost controls: cost estimation, per-user and global daily caps,
the spend alarm, and the endpoint gates (report degrades to offline; image
refuses with 429 since it has no offline compiler).
"""
import os
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import budget as B  # noqa: E402
import entitlements as ENT  # noqa: E402
import main  # noqa: E402
import oracle_report as OR  # noqa: E402
import plate_art as PLATE  # noqa: E402

client = TestClient(main.app)


@pytest.fixture(autouse=True)
def _clean():
    B.reset()
    yield
    B.reset()


# ── cost model + user key ───────────────────────────────────────────────────

def test_estimate_cost(monkeypatch):
    monkeypatch.setenv("AAE_COST_PER_MTOK_OUTPUT", "50")
    monkeypatch.setenv("AAE_COST_PER_IMAGE", "0.02")
    # 40k chars ≈ 10k tokens · $50/Mtok = $0.50
    assert abs(B.estimate_cost("deluxe", 40000) - 0.50) < 1e-9
    assert B.estimate_cost("plate", 0) == 0.02
    assert B.estimate_cost("ask", 40000) < B.estimate_cost("oracle", 40000)


def test_user_key_prefers_jti():
    m = ENT.mint_entitlement("oracle", "0xREF", verified=True)
    assert B.user_key(m["token"]) == m["jti"]
    assert B.user_key(None) == "anon"
    assert B.user_key("opaque-token").startswith("h:")


# ── caps ────────────────────────────────────────────────────────────────────

def test_under_cap_allows(monkeypatch):
    monkeypatch.setenv("AAE_USER_DAILY_USD", "5")
    monkeypatch.setenv("AAE_GLOBAL_DAILY_USD", "100")
    allowed, why = B.allow_call("u1", "oracle")
    assert allowed and why == ""


def test_user_cap_blocks_and_degrades(monkeypatch):
    monkeypatch.setenv("AAE_USER_DAILY_USD", "0.30")   # allows one ~$0.16 oracle
    monkeypatch.setenv("AAE_GLOBAL_DAILY_USD", "100")
    # one deluxe (~$0.50 est) blows u1's $0.30 daily cap
    B.record("u1", "deluxe", 40000)
    allowed, why = B.allow_call("u1", "oracle")
    assert not allowed and why == "user"
    # a DIFFERENT user with no spend is unaffected (per-user, not global)
    allowed2, _ = B.allow_call("u2", "oracle")
    assert allowed2


def test_global_cap_blocks_everyone(monkeypatch):
    monkeypatch.setenv("AAE_USER_DAILY_USD", "1000")
    monkeypatch.setenv("AAE_GLOBAL_DAILY_USD", "0.10")
    B.record("u1", "deluxe", 40000)              # ~$0.50 > $0.10 global
    allowed, why = B.allow_call("u2", "oracle")  # unrelated user still blocked
    assert not allowed and why == "global"


def test_disabled_always_allows(monkeypatch):
    monkeypatch.setenv("AAE_BUDGET_ENABLED", "0")
    monkeypatch.setenv("AAE_GLOBAL_DAILY_USD", "0")
    assert B.allow_call("u1", "deluxe")[0]


def test_alarm_fires_once(monkeypatch, caplog):
    import logging
    monkeypatch.setenv("AAE_GLOBAL_DAILY_USD", "1.0")
    monkeypatch.setenv("AAE_SPEND_ALARM_FRAC", "0.5")   # alarm at $0.50
    with caplog.at_level(logging.WARNING, logger="aae"):
        B.record("u1", "deluxe", 40000)                 # ~$0.50 -> alarm
        B.record("u2", "deluxe", 40000)                 # already fired
    alarms = [r for r in caplog.records if "SPEND ALARM" in r.getMessage()]
    assert len(alarms) == 1
    assert B.snapshot()["alarm_fired"] is True


# ── endpoint gates ──────────────────────────────────────────────────────────

_BIRTH = {"year": 1990, "month": 1, "day": 1, "hour": 12, "minute": 0,
          "second": 0, "lat": 40.0, "lng": -74.0, "tz_offset": -5,
          "house_system": "P", "zodiac": "tropical", "ayanamsha": 1}


def _chart():
    import ephemeris as E
    from models import ChartRequest
    return E.calculate_chart(ChartRequest(**_BIRTH))


def test_report_generator_skips_provider_when_disallowed(monkeypatch):
    called = {"n": 0}

    async def fake_fable(*a, **k):
        called["n"] += 1
        return {"text": "a synthesized reading", "model": "m"}
    monkeypatch.setattr(OR, "_call_fable", fake_fable)

    from tarot_models import OracleReportRequest
    req = OracleReportRequest(chart=_chart(), spread="daily", question="q")

    import asyncio
    r_off = asyncio.run(OR.generate_oracle_report(req, allow_ai=False))
    assert called["n"] == 0 and r_off.ai_source == "offline"   # provider skipped
    r_on = asyncio.run(OR.generate_oracle_report(req, allow_ai=True))
    assert called["n"] == 1 and r_on.ai_source == "llm"        # provider used


def test_plate_429_when_over_budget(monkeypatch):
    monkeypatch.setattr(ENT, "_DEV_TOKEN", "op")
    monkeypatch.setattr(PLATE, "plates_available", lambda: True)
    monkeypatch.setattr(B, "allow_call", lambda tok, kind: (False, "user"))
    chart = client.post("/api/generate-chart", json=_BIRTH).json()
    r = client.post("/api/deck-art-image",
                    json={"chart": chart, "card_id": "the_star", "entitlement": "op"})
    assert r.status_code == 429
    assert "Retry-After" in r.headers
