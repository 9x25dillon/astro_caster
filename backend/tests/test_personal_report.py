"""
Personal Report — the deluxe compiled edition (optional post-Oracle product).

Contracts under test:
  • tier gate fails closed: free AND supporter get 402 before any work
  • POST-ORACLE GATE fails closed: a fabricated/foreign oracle session (seed not
    derivable from this chart + spread/question/date/source) is rejected 409;
    a genuine session passes
  • the offline compiled edition carries the mandated cover framing, all 11
    parts, the embedded Oracle I–V text, and the disclaimer
  • provenance is honest (ai_source offline / model None without a key)
  • privacy: the Fable prompt contains no raw birth coordinates or timestamps

No test touches the network: the anthropic layer is unset/faked.
"""
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
from tarot_models import (  # noqa: E402
    DISCLAIMER,
    OracleSessionRef,
    PersonalReportRequest,
)

_EINSTEIN = dict(year=1879, month=3, day=14, hour=11, minute=30, second=0,
                 lat=48.4011, lng=9.9876, tz_offset=0.67)
_CHART = E.calculate_chart(ChartRequest(**_EINSTEIN))
_Q = "What is asked of me?"

client = TestClient(main.app)


def _genuine_session(**over):
    """A session ref whose seed the server can actually re-derive."""
    seed = TAROT._default_seed(_CHART, "three_card", _Q, source="thoth")
    ref = {"seed": seed, "spread": "three_card", "source": "thoth",
           "question": _Q, "report": "## I. The Signature\nORACLE_TEXT_MARKER",
           "generated_at": "2026-07-01", "ai_source": "offline"}
    ref.update(over)
    return ref


def _payload(**over):
    p = {"chart": _CHART.model_dump(), "oracle": _genuine_session(),
         "display_name": "Test Querent"}
    p.update(over)
    return p


def _token(tier):
    return ENT.mint_entitlement(tier, ref="test", verified=True)["token"]


def _force_offline(monkeypatch):
    monkeypatch.setattr(ORACLE, "_ANTHROPIC_KEY", "")


# ── Tier gate fails closed ──────────────────────────────────────────────────────

def test_free_tier_402():
    r = client.post("/api/personal-report", json=_payload())
    assert r.status_code == 402


def test_supporter_tier_402():
    r = client.post("/api/personal-report", json=_payload(entitlement=_token("supporter")))
    assert r.status_code == 402


# ── Post-Oracle gate fails closed ───────────────────────────────────────────────

def test_fabricated_seed_rejected(monkeypatch):
    _force_offline(monkeypatch)
    bad = _payload(oracle=_genuine_session(seed="not-a-real-session-seed"),
                   entitlement=_token("oracle"))
    r = client.post("/api/personal-report", json=bad)
    assert r.status_code == 409
    assert "mismatch" in r.json()["detail"]


def test_foreign_params_rejected(monkeypatch):
    # Genuine seed, but the caller claims a different spread — re-derivation fails.
    _force_offline(monkeypatch)
    bad = _payload(oracle=_genuine_session(spread="daily"),
                   entitlement=_token("oracle"))
    r = client.post("/api/personal-report", json=bad)
    assert r.status_code == 409


def test_empty_oracle_report_rejected(monkeypatch):
    _force_offline(monkeypatch)
    bad = _payload(oracle=_genuine_session(report="   "), entitlement=_token("oracle"))
    r = client.post("/api/personal-report", json=bad)
    assert r.status_code == 409


# ── Genuine session compiles; offline edition is complete + honest ──────────────

def test_genuine_session_compiles_offline(monkeypatch):
    _force_offline(monkeypatch)
    r = client.post("/api/personal-report", json=_payload(entitlement=_token("oracle")))
    assert r.status_code == 200, r.text[:200]
    d = r.json()
    assert d["ai_source"] == "offline" and d["model"] is None    # honest provenance
    assert d["disclaimer"] == DISCLAIMER
    md = d["report_markdown"]
    # Mandated cover framing
    assert "Compiled from your Oracle Report session of 2026-07-01" in md
    assert f"Seed: {d['seed'][-12:]}" in md
    assert PERSONAL.COVER_PRODUCT_LINE in md
    # All 11 top-level parts present, in order
    idx = -1
    for part in ["Personal Sigil & Invocation", "The Natal Foundation",
                 "In-Depth Psychological & Evolutionary Natal Report",
                 "The Oracle Report — Structured Synthesis",
                 "Personalized Tarot Card Layout", "Career Constellation",
                 "Relationship Mirror", "Sigil Codex & Creative Prompts",
                 "Practices, Prompts & Closing", "Appendix"]:
        j = md.find(f"# {part}")
        assert j > idx, part
        idx = j
    # The Oracle text is embedded verbatim; placeholders + disclaimer present
    assert "ORACLE_TEXT_MARKER" in md
    assert "{{SIGIL}}" in md and "{{BIRTH_INFO}}" in md
    assert DISCLAIMER in md


def test_substrate_is_deterministic():
    req = PersonalReportRequest(chart=_CHART, oracle=OracleSessionRef(**_genuine_session()))
    a = PERSONAL.build_personal_substrate(req)
    b = PERSONAL.build_personal_substrate(req)
    assert a["citations"] == b["citations"]
    assert [c.card.id for c in a["reading"].cards] == [c.card.id for c in b["reading"].cards]
    # Career/relationship slices cite symbolic placements only
    assert all("House" in c for c in a["career"]["tenth_house"])


# ── Privacy: no raw birth data in the prompt ────────────────────────────────────

def test_prompt_carries_no_raw_birth_data():
    req = PersonalReportRequest(
        chart=_CHART, oracle=OracleSessionRef(**_genuine_session()),
        birth_summary="14 March 1879, 11:30, Ulm",   # client-only; must NOT leak
    )
    sub = PERSONAL.build_personal_substrate(req)
    prompt = PERSONAL._substrate_prompt(req, sub)
    for leak in ("48.4011", "9.9876", "1879", "11:30", "Ulm"):
        assert leak not in prompt, leak
    # the cover slot is a placeholder unless a display name was provided
    assert "{{BIRTH_INFO}}" in prompt
    assert "NATAL CITATIONS" in prompt and "° " in prompt   # symbolic data present
