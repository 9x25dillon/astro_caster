"""
The two paid reports must reach the reader, not just the origin.

The Course was streamed after production logged `POST /api/v1/course 200
125534ms` — composed, billed, and then a Cloudflare 524 in the browser, because
Cloudflare gives an origin 100 seconds to finish a buffered response. The
Oracle Report (16k tokens, high effort) and the deluxe Personal Report (32k
tokens, high effort — the $5.50 product) were left buffered and run as long or
longer. The customer pays, presses the button, and receives nothing while the
server finishes and bills a report nobody sees.

Contracts:
  • refusals (402 tier / 402 no claim / 409 forged session) arrive as HTTP
    STATUSES before the stream opens — the client branches on them;
  • a stream is chunk… then exactly one authoritative `done`;
  • `done` REPLACES partial text: an AI failure part-way still ends in the
    complete deterministic edition, never a half-written page;
  • the streamed edition equals the buffered one (same substrate, same seed).

No test touches the network: the Fable layer is faked.
"""
import asyncio
import json
import os
import sys

from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import entitlements as ENT  # noqa: E402
import ephemeris as E  # noqa: E402
import main  # noqa: E402
from models import ChartRequest  # noqa: E402
import oracle_report as ORACLE  # noqa: E402
import personal_report as PERSONAL  # noqa: E402
import tarot as TAROT  # noqa: E402
from tarot_models import OracleReportRequest, PersonalReportRequest  # noqa: E402

_CHART = E.calculate_chart(ChartRequest(
    year=1879, month=3, day=14, hour=11, minute=30, second=0,
    lat=48.4011, lng=9.9876, tz_offset=0.67))
_Q = "What is asked of me?"

client = TestClient(main.app)


def _token(tier):
    return ENT.mint_entitlement(tier, ref="test", verified=True)["token"]


def _events(text: str):
    """Parse an SSE body into [(event, data)]."""
    out = []
    for block in (b for b in text.split("\n\n") if b.strip()):
        lines = block.split("\n")
        out.append((lines[0].removeprefix("event: "),
                    json.loads(lines[1].removeprefix("data: "))))
    return out


def _fake_stream(chunks, final):
    async def _gen(system, user, **_kw):
        for c in chunks:
            yield ("chunk", c)
        yield ("done", final)
    return _gen


def _failing_stream(chunks):
    """Writes part of a report, then the AI layer gives up (done None)."""
    return _fake_stream(chunks, None)


# ── Oracle Report ───────────────────────────────────────────────────────────

def _oracle_payload(**over):
    p = {"chart": _CHART.model_dump(), "spread": "three_card",
         "question": _Q, "source": "thoth"}
    p.update(over)
    return p


def test_oracle_stream_refuses_below_oracle_as_a_status():
    r = client.post("/api/oracle-report-stream", json=_oracle_payload())
    assert r.status_code == 402
    r = client.post("/api/oracle-report-stream",
                    json=_oracle_payload(entitlement=_token("supporter")))
    assert r.status_code == 402


def test_oracle_stream_chunks_then_authoritative_done(monkeypatch):
    monkeypatch.setattr(ORACLE, "_call_fable_stream", _fake_stream(
        ["## I. The Signature\n", 'the "enriched" report & more'],
        {"text": "## I. The Signature\nthe \"enriched\" report & more",
         "model": "claude-fable-5"}))
    r = client.post("/api/oracle-report-stream",
                    json=_oracle_payload(entitlement=_token("oracle")))
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/event-stream")
    assert r.headers.get("x-accel-buffering") == "no"
    ev = _events(r.text)
    assert [e for e, _ in ev] == ["chunk", "chunk", "done"]
    done = ev[-1][1]
    assert done["ai_source"] == "llm" and done["model"] == "claude-fable-5"
    assert done["report"].endswith('the "enriched" report & more')
    # Same seed the buffered route discloses: the deluxe claim binds to it.
    buffered = asyncio.run(ORACLE.generate_oracle_report(
        OracleReportRequest(**_oracle_payload()), allow_ai=False))
    assert done["seed"] == buffered.seed


def test_oracle_stream_failure_mid_way_ends_in_the_offline_edition(monkeypatch):
    monkeypatch.setattr(ORACLE, "_call_fable_stream",
                        _failing_stream(["## I. The Sig"]))
    r = client.post("/api/oracle-report-stream",
                    json=_oracle_payload(entitlement=_token("oracle")))
    ev = _events(r.text)
    assert ev[-1][0] == "done"
    done = ev[-1][1]
    assert done["ai_source"] == "offline" and done["model"] is None
    for heading in ("## I. The Signature", "## II. The Spread",
                    "## III. The Path", "## IV. Practices", "## V. Synthesis"):
        assert heading in done["report"]


# ── Personal Report (the $5.50 deluxe edition) ──────────────────────────────

def _session(**over):
    seed = TAROT._default_seed(_CHART, "three_card", _Q, source="thoth")
    ref = {"seed": seed, "spread": "three_card", "source": "thoth",
           "question": _Q, "report": "## I. The Signature\nORACLE_TEXT_MARKER",
           "generated_at": "2026-07-01", "ai_source": "offline"}
    ref.update(over)
    return ref


def _claim(seed=None):
    seed = seed or _session()["seed"]
    return ENT.mint_report_token(seed=seed, ref="test-tx", verified=True)["token"]


def _personal_payload(**over):
    p = {"chart": _CHART.model_dump(), "oracle": _session(),
         "display_name": "Test Querent"}
    p.update(over)
    return p


def test_personal_stream_gates_are_statuses_in_the_buffered_order():
    # free → 402 (tier)
    assert client.post("/api/personal-report-stream",
                       json=_personal_payload()).status_code == 402
    # oracle without a claim → 402 naming the purchase (the client branches on it)
    r = client.post("/api/personal-report-stream",
                    json=_personal_payload(entitlement=_token("oracle")))
    assert r.status_code == 402 and "purchase" in r.json()["detail"]
    # a claim for a forged session passes the purchase gate and is a 409
    bad = _personal_payload(oracle=_session(seed="not-a-real-session-seed"),
                            entitlement=_token("oracle"),
                            report_token=_claim("not-a-real-session-seed"))
    r = client.post("/api/personal-report-stream", json=bad)
    assert r.status_code == 409 and "mismatch" in r.json()["detail"]


def test_personal_stream_delivers_the_edition(monkeypatch):
    monkeypatch.setattr(PERSONAL, "_call_fable_stream", _fake_stream(
        ["# Cover\n", "the deluxe edition"],
        {"text": "# Cover\nthe deluxe edition", "model": "claude-fable-5"}))
    r = client.post("/api/personal-report-stream", json=_personal_payload(
        entitlement=_token("oracle"), report_token=_claim()))
    assert r.status_code == 200, r.text[:300]
    ev = _events(r.text)
    assert [e for e, _ in ev] == ["chunk", "chunk", "done"]
    done = ev[-1][1]
    assert done["ai_source"] == "llm"
    assert done["report_markdown"] == "# Cover\nthe deluxe edition"
    assert done["seed"] == _session()["seed"]


def test_personal_stream_failure_still_delivers_a_complete_edition(monkeypatch):
    monkeypatch.setattr(PERSONAL, "_call_fable_stream",
                        _failing_stream(["# Cover\nhalf a"]))
    r = client.post("/api/personal-report-stream", json=_personal_payload(
        entitlement=_token("oracle"), report_token=_claim()))
    done = _events(r.text)[-1]
    assert done[0] == "done"
    md = done[1]["report_markdown"]
    assert done[1]["ai_source"] == "offline"
    assert PERSONAL.COVER_PRODUCT_LINE in md and "ORACLE_TEXT_MARKER" in md


def test_streamed_offline_edition_equals_the_buffered_one():
    req = PersonalReportRequest(**_personal_payload())

    async def _collect():
        final = None
        async for event, payload in PERSONAL.generate_personal_report_stream(
                req, allow_ai=False):
            if event == "done":
                final = payload
        return final

    streamed = asyncio.run(_collect())
    buffered = asyncio.run(PERSONAL.generate_personal_report(req, allow_ai=False))
    assert streamed.model_dump() == buffered.model_dump()
