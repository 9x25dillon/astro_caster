"""
Oracle Report — the paid Fable 5 enriched reading.

Contracts under test:
  • the endpoint FAILS CLOSED: anything below oracle tier gets 402 and the AI
    layer is never even attempted (recording fake proves it)
  • oracle tier gets the report; ai_source honestly flags llm vs offline
  • a safety refusal / missing key degrades to the deterministic offline report
    (never a 500, never a silent empty response)
  • the deterministic substrate is reproducible and the offline report carries
    the drawn cards, the learning path, and the disclaimer
  • oracle minting: paid_tier requires on-chain verification AND an explicitly
    configured AAE_ORACLE_MIN_WEI — trust mode (value 0) can never mint oracle

No test touches the network: the anthropic client is always faked.
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
from tarot_models import DISCLAIMER, OracleReportRequest  # noqa: E402

_EINSTEIN = dict(year=1879, month=3, day=14, hour=11, minute=30, second=0,
                 lat=48.4011, lng=9.9876, tz_offset=0.67)
_CHART = E.calculate_chart(ChartRequest(**_EINSTEIN))

client = TestClient(main.app)


def _payload(**over):
    p = {"chart": _CHART.model_dump(), "spread": "three_card",
         "question": "What is asked of me?", "source": "thoth"}
    p.update(over)
    return p


def _token(tier):
    return ENT.mint_entitlement(tier, ref="test", verified=True)["token"]


class _FakeFable:
    def __init__(self, result):
        self.result = result
        self.calls = 0

    async def __call__(self, system, user):
        self.calls += 1
        return self.result


# ── The paywall fails closed ───────────────────────────────────────────────────

def test_free_tier_gets_402_and_ai_never_attempted(monkeypatch):
    fake = _FakeFable({"text": "paid content", "model": "claude-fable-5"})
    monkeypatch.setattr(ORACLE, "_call_fable", fake)
    r = client.post("/api/oracle-report", json=_payload())
    assert r.status_code == 402
    assert fake.calls == 0                       # gate holds BEFORE any work


def test_supporter_tier_is_not_enough(monkeypatch):
    fake = _FakeFable({"text": "paid content", "model": "claude-fable-5"})
    monkeypatch.setattr(ORACLE, "_call_fable", fake)
    r = client.post("/api/oracle-report",
                    json=_payload(entitlement=_token("supporter")))
    assert r.status_code == 402 and fake.calls == 0


def test_tampered_oracle_token_is_402(monkeypatch):
    fake = _FakeFable({"text": "x", "model": "m"})
    monkeypatch.setattr(ORACLE, "_call_fable", fake)
    token = _token("oracle")
    bad = token[:-4] + ("aaaa" if not token.endswith("aaaa") else "bbbb")
    r = client.post("/api/oracle-report", json=_payload(entitlement=bad))
    assert r.status_code == 402 and fake.calls == 0


# ── Oracle tier gets the enriched report ──────────────────────────────────────

def test_oracle_tier_gets_fable_report(monkeypatch):
    fake = _FakeFable({"text": "## I. The Signature\nthe enriched report",
                       "model": "claude-fable-5"})
    monkeypatch.setattr(ORACLE, "_call_fable", fake)
    r = client.post("/api/oracle-report",
                    json=_payload(entitlement=_token("oracle")))
    assert r.status_code == 200
    body = r.json()
    assert body["ai_source"] == "llm"
    assert body["model"] == "claude-fable-5"
    assert "enriched report" in body["report"]
    assert body["seed"]                          # draw remains reproducible
    assert body["lineage"] == "Thoth (Crowley-Harris)"
    assert body["disclaimer"] == DISCLAIMER
    assert fake.calls == 1


def test_refusal_or_missing_key_degrades_to_offline(monkeypatch):
    # _call_fable returns None on: no key, network failure, whole-chain refusal.
    monkeypatch.setattr(ORACLE, "_call_fable", _FakeFable(None))
    r = client.post("/api/oracle-report",
                    json=_payload(entitlement=_token("oracle")))
    assert r.status_code == 200
    body = r.json()
    assert body["ai_source"] == "offline"        # honest provenance
    assert body["model"] is None
    # The offline report is the full deterministic composite, not a stub.
    for heading in ("## I. The Signature", "## II. The Spread",
                    "## III. The Path", "## IV. Practices", "## V. Synthesis"):
        assert heading in body["report"]
    assert body["disclaimer"] == DISCLAIMER


def test_offline_report_is_deterministic_and_grounded(monkeypatch):
    monkeypatch.setattr(ORACLE, "_call_fable", _FakeFable(None))
    req = OracleReportRequest(chart=_CHART, spread="three_card",
                              question="q", source="golden_dawn")
    import asyncio
    a = asyncio.run(ORACLE.generate_oracle_report(req))
    b = asyncio.run(ORACLE.generate_oracle_report(req))
    assert a.report == b.report and a.seed == b.seed
    # Grounded: every drawn card's name appears in the report.
    sub = ORACLE.build_report_substrate(req)
    for c in sub["reading"].cards:
        assert c.card.name in a.report


def test_substrate_prompt_carries_symbols_not_birth_data():
    req = OracleReportRequest(chart=_CHART, question="q")
    sub = ORACLE.build_report_substrate(req)
    prompt = ORACLE._substrate_prompt(sub, req.question)
    assert "NATAL ARCANA SIGNATURE" in prompt and "THE SPREAD" in prompt
    # Privacy: raw coordinates must never reach the model.
    assert "48.4011" not in prompt and "9.9876" not in prompt


# ── Oracle minting: paid_tier fails closed ─────────────────────────────────────

def test_paid_tier_disabled_without_threshold(monkeypatch):
    monkeypatch.setattr(ENT, "_ORACLE_MIN_WEI", 0)
    assert ENT.paid_tier(True, 10**20) == "supporter"   # verified, huge value


def test_paid_tier_requires_verification_and_value(monkeypatch):
    monkeypatch.setattr(ENT, "_ORACLE_MIN_WEI", 10**17)
    assert ENT.paid_tier(False, 10**18) == "supporter"  # unverified (trust mode)
    assert ENT.paid_tier(True, 10**16) == "supporter"   # verified but below
    assert ENT.paid_tier(True, 10**17) == "oracle"      # verified at threshold


def test_donate_verify_mints_oracle_for_verified_big_value(monkeypatch):
    monkeypatch.setattr(ENT, "_ORACLE_MIN_WEI", 10**17)

    async def fake_details(tx_hash):
        return True, True, "verified on-chain", 10**18

    monkeypatch.setattr(main.ENT, "verify_eth_payment_details", fake_details)
    r = client.post("/api/donate/verify", json={"tx_hash": "0xabc", "chain": "evm"})
    assert r.status_code == 200
    body = r.json()
    assert body["tier"] == "oracle"
    status = ENT.entitlement_status(body["entitlement"]["token"])
    assert status["tier"] == "oracle" and status["supporter"] is True


def test_donate_verify_trust_mode_never_mints_oracle(monkeypatch):
    monkeypatch.setattr(ENT, "_ORACLE_MIN_WEI", 1)      # threshold as low as possible
    monkeypatch.setenv("AAE_ENV", "development")
    monkeypatch.setenv("AAE_TRUST_MODE", "1")
    monkeypatch.setattr(ENT, "_ETH_RPC", "")            # no on-chain verification
    r = client.post("/api/donate/verify", json={"tx_hash": "0xabc", "chain": "evm"})
    assert r.status_code == 200
    assert r.json()["tier"] == "supporter"              # unverified => never oracle
