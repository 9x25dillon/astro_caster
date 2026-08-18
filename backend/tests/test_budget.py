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
    # WAS: assert estimate_cost("ask", ...) < estimate_cost("oracle", ...).
    # That asserted the defect. `ask` was cheaper only because estimate_cost
    # multiplied that one kind by 0.2 on the assumption it ran on a cheap model —
    # but an oracle-tier ask runs on opus-5, so the cap under-counted it fivefold.
    # Price now follows the MODEL, so kind must not change it.
    assert B.estimate_cost("ask", 40000, "claude-opus-5") == \
        B.estimate_cost("oracle", 40000, "claude-opus-5")
    assert B.estimate_cost("ask", 40000, "claude-haiku-4-5") < \
        B.estimate_cost("ask", 40000, "claude-opus-5")


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
    monkeypatch.setattr(B, "allow_call",
                        lambda tok, kind, client_ip=None, model=None: (False, "user"))
    chart = client.post("/api/generate-chart", json=_BIRTH).json()
    r = client.post("/api/deck-art-image",
                    json={"chart": chart, "card_id": "the_star", "entitlement": "op"})
    assert r.status_code == 429
    assert "Retry-After" in r.headers


# ── anonymous bucketing + the free-tier gate (Sybil defence) ────────────────


def test_anonymous_visitors_do_not_share_one_bucket(monkeypatch):
    """The bug this exists to prevent.

    Every tokenless caller used to key to the literal string 'anon', so the
    PER-USER daily cap behaved as a single collective allowance for the whole
    internet. That bounds the bill but not the damage: one abuser clearing
    local storage in a loop drains the day and every honest free visitor is
    served the offline compiler instead of the product.
    """
    B.reset()
    # 0.10, not the 0.02 this used to use: estimate_cost no longer discounts an
    # "ask" by 0.2, so one nominal call is now ~$0.0375 and a $0.02 ceiling
    # refused the very first request — the loop below never ran and the test
    # passed for the wrong reason. The scenario is unchanged; only the ceiling
    # moved to stay above a single call.
    monkeypatch.setenv("AAE_USER_DAILY_USD", "0.10")

    # One address burns its own allowance...
    while B.allow_call(None, "ask", "203.0.113.7")[0]:
        B.record(None, "ask", 3000, "203.0.113.7")
    assert B.allow_call(None, "ask", "203.0.113.7")[0] is False

    # ...and a different visitor is untouched by it.
    assert B.allow_call(None, "ask", "198.51.100.4")[0] is True


def test_the_anon_bucket_is_not_the_raw_address():
    """The key is salted and hashed, so nothing that could re-identify a
    visitor is held even in memory. A raw IP sitting in a dict is one
    accidental log line away from being retention."""
    k = B.user_key(None, "203.0.113.7")
    assert "203.0.113.7" not in k
    assert k.startswith("ip:")


def test_the_same_visitor_keys_differently_after_the_salt_rotates():
    """The salt is per-process and per-UTC-day, so the bucket cannot be used
    to recognise anyone across days — which is the property that separates
    abuse control from tracking."""
    first = B.user_key(None, "203.0.113.7")
    B._anon_salt.clear()          # simulate the day turning over
    assert B.user_key(None, "203.0.113.7") != first


def test_a_missing_address_never_invents_a_specific_bucket():
    """Unknown address falls back to the shared bucket rather than to a name
    that LOOKS per-user while quietly pooling strangers together."""
    assert B.user_key(None, None) == "anon"


def test_the_free_ask_path_is_actually_capped(monkeypatch):
    """The gap this closes.

    PRICING_MODEL §6 named budget.py's global cap "the actual ceiling and it
    already exists" for the free tier. It did not cover it: /api/ai-ask never
    consulted budget.py at all, so the cheapest, highest-volume caller — the
    only one with no revenue against it — was the single path the ceiling
    missed. budget.py even defined the "ask" kind; nothing ever asked it.
    """
    seen = {"provider_reached": False}

    async def fake_interpret(*a, allow_ai=True, **k):
        seen["provider_reached"] = allow_ai
        return {"interpretation": "offline reflection", "source": "offline",
                "model": "aae-reflective-fallback", "provider": "offline"}

    monkeypatch.setattr(main, "interpret", fake_interpret)
    monkeypatch.setattr(B, "allow_call",
                        lambda tok, kind, client_ip=None, model=None: (False, "global"))

    chart = client.post("/api/generate-chart", json=_BIRTH).json()
    r = client.post("/api/ai-ask",
                    json={"query": "what now?", "chart": chart, "lens": "psychological"})

    assert r.status_code == 200
    assert r.json()["source"] == "offline"      # degraded, never an error
    assert seen["provider_reached"] is False    # and the provider was not reached
