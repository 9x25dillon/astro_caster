"""
An offline reading must say WHY it is offline.

Chosen and rationed offline readings were indistinguishable on the wire: a
subscriber past the daily spend cap simply started receiving a different engine,
silently, with nothing in the response saying so. `source: "offline"` was the
only signal and it carries no reason, while `note` is set exclusively by ai.py's
exception path and therefore cannot speak for the other cases.

An offline reading is a good product when it was asked for and a broken promise
when it was not. These tests pin the four roads apart, on both the streamed and
non-streamed paths, because two handlers telling a reader different stories about
the same event is how this drifts back.
"""
import json
import os
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import budget as BUDGET  # noqa: E402
import main as M  # noqa: E402

client = TestClient(M.app)

CHART_REQ = {
    "year": 1990, "month": 7, "day": 4, "hour": 14, "minute": 30, "second": 0,
    "lat": 40.7128, "lng": -74.0060, "tz_offset": -4,
}


@pytest.fixture()
def chart():
    r = client.post("/api/generate-chart", json=CHART_REQ)
    assert r.status_code == 200
    return r.json()


@pytest.fixture(autouse=True)
def _clean_budget():
    BUDGET.reset()
    yield
    BUDGET.reset()


def _ask(chart, **extra):
    body = {"query": "What is my chart telling me?", "chart": chart,
            "lens": "psychological", **extra}
    r = client.post("/api/ai-ask", json=body)
    assert r.status_code == 200, r.text
    return r.json()


# --------------------------------------------------------------------------- #
# the reader chose it
# --------------------------------------------------------------------------- #
def test_prefer_offline_returns_the_deterministic_engine(chart):
    out = _ask(chart, prefer_offline=True)
    assert out["source"] == "offline"
    assert out["offline_reason"] == "chosen"
    assert out["interpretation"].strip(), "a chosen offline reading must be a real reading"


def test_prefer_offline_never_reaches_a_provider(chart, monkeypatch):
    """The point of choosing offline is that it costs nothing and waits for nothing."""
    called = []

    async def _boom(*a, **kw):
        called.append(1)
        raise AssertionError("provider called despite prefer_offline")

    monkeypatch.setattr(M, "interpret", M.interpret)  # keep the real orchestrator
    import ai as AI
    monkeypatch.setattr(AI, "_chat_openai_compat", _boom)
    monkeypatch.setattr(AI, "_chat_kgirl", _boom)

    out = _ask(chart, prefer_offline=True)
    assert out["offline_reason"] == "chosen"
    assert not called


def test_prefer_offline_spends_nothing(chart):
    before = BUDGET.snapshot()
    _ask(chart, prefer_offline=True)
    after = BUDGET.snapshot()
    assert after["global_today_usd"] == before["global_today_usd"] == 0.0


# --------------------------------------------------------------------------- #
# the cap forced it
# --------------------------------------------------------------------------- #
def test_capped_is_reported_as_capped_not_chosen(chart, monkeypatch):
    """The failure this whole field exists for: a silent downgrade."""
    monkeypatch.setattr(M.BUDGET, "allow_call", lambda *a, **kw: (False, "user"))
    out = _ask(chart)
    assert out["source"] == "offline"
    assert out["offline_reason"] == "capped"


def test_capped_and_chosen_are_distinguishable(chart, monkeypatch):
    monkeypatch.setattr(M.BUDGET, "allow_call", lambda *a, **kw: (False, "user"))
    forced = _ask(chart)
    monkeypatch.setattr(M.BUDGET, "allow_call", lambda *a, **kw: (True, None))
    picked = _ask(chart, prefer_offline=True)
    assert forced["offline_reason"] != picked["offline_reason"]


# --------------------------------------------------------------------------- #
# the reason ladder itself
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("chose,within,note,expected", [
    (True, True, None, "chosen"),
    (True, False, None, "chosen"),        # a choice outranks a cap
    (False, False, None, "capped"),
    (False, True, "boom", "degraded"),
    (False, True, None, "unconfigured"),
])
def test_reason_ladder(chose, within, note, expected):
    assert M._offline_reason(chose, within, note) == expected


# --------------------------------------------------------------------------- #
# streamed path tells the same story
# --------------------------------------------------------------------------- #
def _stream_done(chart, **extra):
    body = {"query": "What is my chart telling me?", "chart": chart,
            "lens": "psychological", **extra}
    with client.stream("POST", "/api/ai-ask-stream", json=body) as r:
        assert r.status_code == 200
        event = None
        for line in r.iter_lines():
            if line.startswith("event:"):
                event = line.split(":", 1)[1].strip()
            elif line.startswith("data:") and event == "done":
                return json.loads(line.split(":", 1)[1].strip())
    raise AssertionError("no done event")


def test_stream_reports_chosen(chart):
    done = _stream_done(chart, prefer_offline=True)
    assert done["source"] == "offline"
    assert done["offline_reason"] == "chosen"


def test_stream_reports_capped(chart, monkeypatch):
    monkeypatch.setattr(M.BUDGET, "allow_call", lambda *a, **kw: (False, "user"))
    done = _stream_done(chart)
    assert done["offline_reason"] == "capped"


def test_both_paths_agree(chart, monkeypatch):
    """Two handlers, one story."""
    monkeypatch.setattr(M.BUDGET, "allow_call", lambda *a, **kw: (False, "user"))
    assert _ask(chart)["offline_reason"] == _stream_done(chart)["offline_reason"]
