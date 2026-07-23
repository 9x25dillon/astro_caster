"""
Phase 4.2 — Stripe rail: webhook signature verification (the security-critical
piece, tested end to end), event->lifecycle mapping, and the endpoints wired
to the 4.1 lifecycle functions. No live Stripe calls — checkout/retrieve need
real keys and are exercised on staging with the Stripe CLI.
"""
import hashlib
import hmac
import json
import os
import sys
import time

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import main  # noqa: E402
import receipts as RCPT  # noqa: E402
import stripe_rail as S  # noqa: E402

client = TestClient(main.app)
WHSEC = "whsec_test_secret"


def _sign(body: bytes, secret: str = WHSEC, t: int | None = None) -> str:
    t = int(time.time()) if t is None else t
    sig = hmac.new(secret.encode(), f"{t}.".encode() + body, hashlib.sha256).hexdigest()
    return f"t={t},v1={sig}"


def _event(etype: str, obj: dict) -> bytes:
    return json.dumps({"type": etype, "data": {"object": obj}}).encode()


# ── webhook signature verification ──────────────────────────────────────────

def test_valid_signature_parses():
    body = _event("checkout.session.completed", {"id": "cs_1"})
    ev = S.verify_webhook(body, _sign(body), secret=WHSEC)
    assert ev["type"] == "checkout.session.completed"


def test_tampered_body_rejected():
    body = _event("checkout.session.completed", {"id": "cs_1"})
    header = _sign(body, secret=WHSEC)
    with pytest.raises(ValueError, match="signature mismatch"):
        S.verify_webhook(body + b" ", header, secret=WHSEC)


def test_wrong_secret_rejected():
    body = _event("charge.refunded", {"id": "ch_1"})
    with pytest.raises(ValueError, match="signature mismatch"):
        S.verify_webhook(body, _sign(body, secret="whsec_other"), secret=WHSEC)


def test_stale_timestamp_rejected():
    body = _event("checkout.session.completed", {"id": "cs_1"})
    old = _sign(body, secret=WHSEC, t=int(time.time()) - 10_000)
    with pytest.raises(ValueError, match="tolerance"):
        S.verify_webhook(body, old, secret=WHSEC)


def test_malformed_header_rejected():
    body = _event("x", {})
    with pytest.raises(ValueError, match="malformed"):
        S.verify_webhook(body, "garbage", secret=WHSEC)


# ── pricing + event mapping (pure) ──────────────────────────────────────────

def test_price_cents(monkeypatch):
    monkeypatch.setenv("AAE_STRIPE_SUPPORTER_USD", "5")
    monkeypatch.setenv("AAE_STRIPE_ORACLE_USD", "15")
    assert S.price_cents("supporter") == 500
    assert S.price_cents("oracle") == 1500
    with pytest.raises(ValueError):
        S.price_cents("free")


def test_plan_mint_on_paid_session():
    obj = {"id": "cs_1", "payment_intent": "pi_9", "payment_status": "paid",
           "metadata": {"tier": "oracle"}}
    plan = S.plan_from_event({"type": "checkout.session.completed",
                              "data": {"object": obj}})
    assert plan == {"action": "mint", "tier": "oracle", "ref": "pi_9"}


def test_plan_ignores_unpaid_and_unknown():
    assert S.plan_from_event({"type": "checkout.session.completed", "data":
        {"object": {"payment_status": "unpaid", "metadata": {"tier": "oracle"}}}}) is None
    assert S.plan_from_event({"type": "invoice.created", "data": {"object": {}}}) is None


def test_plan_revoke_on_refund():
    plan = S.plan_from_event({"type": "charge.refunded",
                              "data": {"object": {"payment_intent": "pi_9"}}})
    assert plan == {"action": "revoke", "tier": None, "ref": "pi_9"}


# ── endpoints ───────────────────────────────────────────────────────────────

def test_checkout_503_when_unconfigured(monkeypatch):
    monkeypatch.delenv("AAE_STRIPE_SECRET_KEY", raising=False)
    assert client.post("/api/checkout", json={"tier": "oracle"}).status_code == 503


def test_webhook_503_when_unconfigured(monkeypatch):
    monkeypatch.delenv("AAE_STRIPE_WEBHOOK_SECRET", raising=False)
    assert client.post("/api/stripe/webhook", content=b"{}").status_code == 503


def test_webhook_mint_then_refund_round_trip(monkeypatch):
    monkeypatch.setenv("AAE_STRIPE_WEBHOOK_SECRET", WHSEC)
    ref = "pi_roundtrip"

    completed = _event("checkout.session.completed",
                       {"id": "cs_x", "payment_intent": ref,
                        "payment_status": "paid", "metadata": {"tier": "supporter"}})
    r = client.post("/api/stripe/webhook", content=completed,
                    headers={"stripe-signature": _sign(completed)})
    assert r.status_code == 200 and r.json()["action"] == "mint"
    assert RCPT.ent_find_active_ref(ref) is not None       # entitlement live

    refund = _event("charge.refunded", {"id": "ch_x", "payment_intent": ref})
    r = client.post("/api/stripe/webhook", content=refund,
                    headers={"stripe-signature": _sign(refund)})
    assert r.status_code == 200 and r.json()["action"] == "revoke"
    assert RCPT.ent_find_active_ref(ref) is None            # revoked by refund


def test_webhook_bad_signature_400(monkeypatch):
    monkeypatch.setenv("AAE_STRIPE_WEBHOOK_SECRET", WHSEC)
    body = _event("checkout.session.completed", {"id": "cs_1"})
    r = client.post("/api/stripe/webhook", content=body,
                    headers={"stripe-signature": _sign(body, secret="whsec_wrong")})
    assert r.status_code == 400
