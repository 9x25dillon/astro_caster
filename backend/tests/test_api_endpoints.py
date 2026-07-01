"""
Phase 5.1 — FastAPI endpoint behavior (TestClient).

Behavioral contracts, not presence checks:
  • /api/natal-arcana        — deterministic signature, disclaimer on the wire
  • /api/tarot-reading       — offline core; tier-gated AI enrichment that FAILS
                               CLOSED (free tier never even attempts the AI call);
                               silent offline fallback; input validation
  • /api/arcana-forecast     — exactly-N guarantee incl. the no-event fallback,
                               days clamp, local-date validation
  • /api/learning-path       — contract surface + disclaimer
  • /api/entitlement         — minted vs tampered vs expired tokens

Trust-mode gating is covered in test_entitlements.py; response headers and the
admin token in test_security.py; .ics export in test_arcana_calendar.py. This
module extends that surface — it does not duplicate it.
"""
import os
import sys

from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import entitlements as ENT  # noqa: E402
import ephemeris as E  # noqa: E402
import main  # noqa: E402
from models import ChartRequest  # noqa: E402
from tarot_models import DISCLAIMER  # noqa: E402

_EINSTEIN = dict(year=1879, month=3, day=14, hour=11, minute=30, second=0,
                 lat=48.4011, lng=9.9876, tz_offset=0.67)
_CHART = E.calculate_chart(ChartRequest(**_EINSTEIN)).model_dump()

client = TestClient(main.app)


def _reading_payload(**over):
    payload = {"chart": _CHART, "spread": "three_card",
               "question": "What is asked of me?", "date": "2026-07-01"}
    payload.update(over)
    return payload


class _FakeAI:
    """Stands in for ai.interpret_arcana; records whether it was attempted."""
    def __init__(self, result):
        self.result = result
        self.calls = []

    async def __call__(self, system, user, tier):
        self.calls.append(tier)
        return self.result


# ── /api/natal-arcana ──────────────────────────────────────────────────────────

def test_natal_arcana_deterministic_with_disclaimer():
    a = client.post("/api/natal-arcana", json=_CHART)
    b = client.post("/api/natal-arcana", json=_CHART)
    assert a.status_code == 200
    assert a.json() == b.json()                      # pure function of the chart
    assert a.json()["disclaimer"] == DISCLAIMER
    assert a.json()["links"][0]["body"] == "Sun"     # canonical order


# ── /api/tarot-reading — offline core ──────────────────────────────────────────

def test_tarot_reading_offline_contract():
    r = client.post("/api/tarot-reading", json=_reading_payload())
    assert r.status_code == 200
    body = r.json()
    assert body["ai_source"] is None                 # no AI on the free path
    assert len(body["cards"]) == 3                   # three_card spread
    assert body["disclaimer"] == DISCLAIMER
    assert body["source"] == "golden_dawn"
    assert body["seed"]                              # seed disclosed for reproduction
    for c in body["cards"]:
        assert c["meaning"] and c["weight_sources"]


def test_tarot_reading_endpoint_deterministic():
    a = client.post("/api/tarot-reading", json=_reading_payload(spread="daily"))
    b = client.post("/api/tarot-reading", json=_reading_payload(spread="daily"))
    ca, cb = a.json()["cards"], b.json()["cards"]
    assert [(c["card"]["id"], c["reversed"]) for c in ca] == \
           [(c["card"]["id"], c["reversed"]) for c in cb]


def test_tarot_reading_rejects_bad_spread_and_date():
    assert client.post("/api/tarot-reading",
                       json=_reading_payload(spread="celtic_cross")).status_code == 422
    assert client.post("/api/tarot-reading",
                       json=_reading_payload(spread="daily",
                                             date="not-a-date")).status_code == 400


# ── /api/tarot-reading — tier-gated AI enrichment ─────────────────────────────

def test_free_tier_never_attempts_ai(monkeypatch):
    fake = _FakeAI({"source": "llm", "text": "enriched"})
    monkeypatch.setattr(main, "interpret_arcana", fake)
    r = client.post("/api/tarot-reading", json=_reading_payload(include_ai=True))
    assert r.status_code == 200
    assert r.json()["ai_source"] is None
    assert fake.calls == []                          # gate holds BEFORE the call


def test_supporter_gets_ai_interpretation(monkeypatch):
    fake = _FakeAI({"source": "llm", "text": "the enriched reading",
                    "provider": "test", "model": "fake"})
    monkeypatch.setattr(main, "interpret_arcana", fake)
    token = ENT.mint_entitlement("supporter", ref="test", verified=True)["token"]
    r = client.post("/api/tarot-reading",
                    json=_reading_payload(include_ai=True, entitlement=token))
    assert r.status_code == 200
    assert r.json()["ai_source"] == "llm"
    assert r.json()["interpretation"] == "the enriched reading"
    assert fake.calls == ["supporter"]               # tier threads into the AI layer


def test_oracle_tier_also_unlocks_ai(monkeypatch):
    fake = _FakeAI({"source": "llm", "text": "oracle reading",
                    "provider": "test", "model": "fake"})
    monkeypatch.setattr(main, "interpret_arcana", fake)
    token = ENT.mint_entitlement("oracle", ref="test", verified=True)["token"]
    r = client.post("/api/tarot-reading",
                    json=_reading_payload(include_ai=True, entitlement=token))
    assert r.json()["ai_source"] == "llm" and fake.calls == ["oracle"]


def test_tampered_token_is_free_tier(monkeypatch):
    fake = _FakeAI({"source": "llm", "text": "should never appear"})
    monkeypatch.setattr(main, "interpret_arcana", fake)
    token = ENT.mint_entitlement("supporter", ref="test", verified=True)["token"]
    tampered = token[:-4] + ("aaaa" if not token.endswith("aaaa") else "bbbb")
    r = client.post("/api/tarot-reading",
                    json=_reading_payload(include_ai=True, entitlement=tampered))
    assert r.status_code == 200
    assert r.json()["ai_source"] is None
    assert fake.calls == []


def test_ai_failure_falls_back_to_offline_prose(monkeypatch):
    fake = _FakeAI({"source": "offline", "text": ""})   # AI layer reports failure
    monkeypatch.setattr(main, "interpret_arcana", fake)
    token = ENT.mint_entitlement("supporter", ref="test", verified=True)["token"]
    r = client.post("/api/tarot-reading",
                    json=_reading_payload(include_ai=True, entitlement=token))
    body = r.json()
    assert body["ai_source"] == "offline"               # honest provenance flag
    assert "mirrors, not verdicts" in body["interpretation"]  # deterministic prose kept


# ── /api/entitlement — token lifecycle on the wire ─────────────────────────────

def test_entitlement_status_valid_tampered_expired():
    token = ENT.mint_entitlement("supporter", ref="t", verified=True)["token"]
    ok = client.get("/api/entitlement", params={"token": token}).json()
    assert ok["supporter"] is True and ok["tier"] == "supporter"

    bad = client.get("/api/entitlement", params={"token": token[:-2] + "zz"}).json()
    assert bad["supporter"] is False and bad["tier"] == "free"

    expired = ENT._sign({"tier": "supporter", "ref": "t", "verified": True,
                         "iat": 0, "exp": 1})           # exp in 1970
    ex = client.get("/api/entitlement", params={"token": expired}).json()
    assert ex["supporter"] is False and ex["tier"] == "free"


# ── /api/arcana-forecast ───────────────────────────────────────────────────────

def _forecast(monkeypatch, events, **over):
    monkeypatch.setattr(main, "generate_forecast",
                        lambda *a, **k: list(events))
    payload = {"chart": _CHART, "days": 7, "start_date": "2026-07-01"}
    payload.update(over)
    return client.post("/api/arcana-forecast", json=payload)


def test_forecast_no_events_still_yields_exactly_n_days(monkeypatch):
    r = _forecast(monkeypatch, [], days=7)
    assert r.status_code == 200
    body = r.json()
    assert body["days"] == 7 and len(body["cards"]) == 7
    assert [c["date"] for c in body["cards"]] == \
           [f"2026-07-{d:02d}" for d in range(1, 8)]    # contiguous local dates
    assert all("Quiet sky" in c["transit_summary"] for c in body["cards"])
    assert body["disclaimer"] == DISCLAIMER


def test_forecast_no_event_fallback_is_deterministic(monkeypatch):
    a = _forecast(monkeypatch, [], days=5).json()["cards"]
    b = _forecast(monkeypatch, [], days=5).json()["cards"]
    assert [(c["card"]["id"], c["reversed"]) for c in a] == \
           [(c["card"]["id"], c["reversed"]) for c in b]


def test_forecast_days_clamped_to_30(monkeypatch):
    r = _forecast(monkeypatch, [], days=99)
    assert r.json()["days"] == 30 and len(r.json()["cards"]) == 30


def test_forecast_rejects_bad_timezone_and_date():
    bad_tz = client.post("/api/arcana-forecast",
                         json={"chart": _CHART, "days": 3,
                               "timezone": "Mars/Olympus_Mons"})
    assert bad_tz.status_code == 400
    bad_date = client.post("/api/arcana-forecast",
                           json={"chart": _CHART, "days": 3,
                                 "start_date": "07/01/2026"})
    assert bad_date.status_code == 400


# ── /api/learning-path ─────────────────────────────────────────────────────────

def test_learning_path_endpoint_contract():
    r = client.post("/api/learning-path",
                    json={"chart": _CHART, "source": "thoth", "steps": 5})
    assert r.status_code == 200
    body = r.json()
    assert body["anchor"] and body["growth_edge"]
    assert body["lineage"] == "Thoth (Crowley-Harris)"
    assert body["steps"][0]["stage"] == "Anchor"
    assert body["disclaimer"] == DISCLAIMER
