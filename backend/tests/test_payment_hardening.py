"""
Session 42 security pass over the payment surface. Each test is one finding.

  F1  client-supplied checkout return URLs were honoured verbatim → phishing
      amplifier that hands the attacker the cs_ id (and, via relink, the key)
  F2  a bearer entitlement was accepted from a query string → access logs
  F3  the unauthenticated money endpoints had no rate limit
  F5  a signed webhook could be replayed inside the 5-minute tolerance
"""
import json
import os
import sys
import time

from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import entitlements as ENT  # noqa: E402
import main  # noqa: E402
import ratelimit as RL  # noqa: E402
import receipts as RCPT  # noqa: E402
import stripe_rail as STRIPE  # noqa: E402

client = TestClient(main.app)


def _rail(monkeypatch, tmp_path):
    monkeypatch.setenv("AAE_STRIPE_SECRET_KEY", "sk_test_x")
    monkeypatch.setenv("AAE_PUBLIC_URL", "https://app.example.test")
    monkeypatch.setattr(RCPT, "_DB_PATH", tmp_path / "receipts.db")


# ── F1 ──────────────────────────────────────────────────────────────────────

def test_offsite_success_url_is_refused_before_stripe_is_called(monkeypatch, tmp_path):
    _rail(monkeypatch, tmp_path)

    async def _never(*a, **k):
        raise AssertionError("Stripe must not be called for a refused URL")

    monkeypatch.setattr(STRIPE, "create_checkout_session", _never)
    r = client.post("/api/checkout", json={
        "tier": "supporter", "success_url": "https://evil.example/?checkout={CHECKOUT_SESSION_ID}",
    })
    assert r.status_code == 400
    assert "origin" in r.json()["detail"]


def test_offsite_cancel_url_and_report_checkout_are_refused_too(monkeypatch, tmp_path):
    _rail(monkeypatch, tmp_path)
    r = client.post("/api/checkout", json={"tier": "oracle", "cancel_url": "http://app.example.test/"})
    assert r.status_code == 400, "scheme downgrade is a different origin"
    r = client.post("/api/personal-report/checkout", json={
        "seed": "x" * 16, "success_url": "https://app.example.test.evil.example/",
    })
    assert r.status_code in (400, 402, 403), r.text
    if r.status_code == 400:
        assert "origin" in r.json()["detail"]


def test_same_origin_return_url_is_honoured(monkeypatch, tmp_path):
    _rail(monkeypatch, tmp_path)
    seen = {}

    async def _create(tier, success, cancel):
        seen.update(success=success, cancel=cancel)
        return {"id": "cs_test_ok", "url": "https://checkout.stripe.com/x"}

    monkeypatch.setattr(STRIPE, "create_checkout_session", _create)
    r = client.post("/api/checkout", json={
        "tier": "supporter", "success_url": "https://app.example.test/library?checkout={CHECKOUT_SESSION_ID}",
    })
    assert r.status_code == 200, r.text
    assert seen["success"].startswith("https://app.example.test/library")
    assert seen["cancel"] == "https://app.example.test/?checkout=cancel"


# ── F2 ──────────────────────────────────────────────────────────────────────

def test_entitlement_in_query_string_is_ignored(tmp_path, monkeypatch):
    monkeypatch.setattr(RCPT, "_DB_PATH", tmp_path / "receipts.db")
    tok = ENT.mint_entitlement("oracle", "pi_q", True)["token"]
    assert client.get("/api/entitlement", headers={"X-AAE-Token": tok}).json()["tier"] == "oracle"
    assert client.get("/api/entitlement", params={"token": tok}).json()["tier"] == "free"


# ── F3 ──────────────────────────────────────────────────────────────────────

def test_money_endpoints_are_rate_limited(monkeypatch, tmp_path):
    _rail(monkeypatch, tmp_path)
    monkeypatch.setenv("AAE_RATE_LIMIT_ENABLED", "1")
    monkeypatch.setenv("AAE_RATE_LIMIT_AI", "3")
    RL.reset()
    try:
        async def _sess(_id):
            return {"id": _id, "payment_status": "unpaid"}
        monkeypatch.setattr(STRIPE, "retrieve_session", _sess)
        codes = [client.get("/api/checkout/cs_test_abc").status_code for _ in range(4)]
        assert codes[:3] == [200, 200, 200] and codes[3] == 429, codes

        RL.reset()
        codes = [client.post("/api/donate/verify", json={"tx_hash": "0x" + "a" * 64, "chain": "evm"}).status_code
                 for _ in range(4)]
        assert codes[3] == 429 and 429 not in codes[:3], codes

        RL.reset()
        codes = [client.post("/api/entitlement/renew", json={"entitlement": "nope"}).status_code for _ in range(4)]
        assert codes[:3] == [401, 401, 401] and codes[3] == 429, codes

        RL.reset()
        codes = [client.post("/api/billing/portal", json={"entitlement": "nope"}).status_code for _ in range(4)]
        assert codes[:3] == [401, 401, 401] and codes[3] == 429, codes
    finally:
        RL.reset()


# ── F5 ──────────────────────────────────────────────────────────────────────

def _signed(secret: str, body: dict, ts: int) -> tuple[bytes, str]:
    import hashlib
    import hmac
    raw = json.dumps(body).encode()
    sig = hmac.new(secret.encode(), f"{ts}.".encode() + raw, hashlib.sha256).hexdigest()
    return raw, f"t={ts},v1={sig}"


def test_replayed_webhook_event_is_acknowledged_but_not_reapplied(monkeypatch, tmp_path):
    _rail(monkeypatch, tmp_path)
    monkeypatch.setenv("AAE_STRIPE_WEBHOOK_SECRET", "whsec_test")
    main._SEEN_EVENTS.clear(); main._SEEN_EVENT_SET.clear()
    applied = []
    monkeypatch.setattr(ENT, "relink_ref", lambda ref, tier, verified: applied.append(ref) or
                        ENT.mint_entitlement(tier, ref, verified))
    evt = {"id": "evt_replay_1", "type": "checkout.session.completed",
           "data": {"object": {"id": "cs_r", "payment_status": "paid", "mode": "payment",
                               "payment_intent": "pi_replay", "metadata": {"tier": "supporter"}}}}
    raw, sig = _signed("whsec_test", evt, int(time.time()))
    first = client.post("/api/stripe/webhook", content=raw, headers={"stripe-signature": sig})
    second = client.post("/api/stripe/webhook", content=raw, headers={"stripe-signature": sig})
    assert first.status_code == 200 and first.json()["handled"] is True
    assert second.status_code == 200 and second.json().get("duplicate") is True
    assert applied == ["pi_replay"], "the mint must run exactly once"
