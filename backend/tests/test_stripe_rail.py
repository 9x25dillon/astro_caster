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
import entitlements as ENT  # noqa: E402
import receipts as RCPT  # noqa: E402
import stripe_rail as S  # noqa: E402

client = TestClient(main.app)
WHSEC = "whsec_test_secret"


def _otoken() -> str:
    return ENT.mint_entitlement("oracle", ref="test", verified=True)["token"]


def _paid_report_session(seed: str, ref: str = "pi_report") -> dict:
    return {"id": "cs_report", "payment_intent": ref, "payment_status": "paid",
            "metadata": {"product": S._REPORT_PRODUCT, "seed_hash": S.seed_hash(seed)}}


def _patch_retrieve(monkeypatch, session: dict) -> None:
    async def _r(_session_id):
        return session
    monkeypatch.setattr(S, "retrieve_session", _r)


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


# ── Phase 4.3 — deluxe personal report on the Stripe rail ────────────────────

def test_report_price_cents(monkeypatch):
    monkeypatch.setenv("AAE_STRIPE_REPORT_USD", "9")
    assert S.report_price_cents() == 900
    monkeypatch.setenv("AAE_STRIPE_REPORT_USD", "12.50")
    assert S.report_price_cents() == 1250


def test_report_session_only_the_hash_leaves(monkeypatch):
    # create_report_checkout_session must put the seed HASH (never the raw seed,
    # which ends with the user's question) in Stripe metadata.
    seed = "oracle-seed::what is my path?"
    captured = {}

    async def _fake_post(form):
        captured.update(form)
        return {"id": "cs_report_1", "url": "https://stripe.test/cs_report_1"}

    monkeypatch.setenv("AAE_STRIPE_SECRET_KEY", "sk_test_x")
    monkeypatch.setattr(S, "_post_session", _fake_post)
    import asyncio
    out = asyncio.run(S.create_report_checkout_session(seed, "s://ok", "s://no"))
    assert out["url"].endswith("cs_report_1")
    assert captured["metadata[product]"] == "personal_report"
    assert captured["metadata[seed_hash]"] == S.seed_hash(seed)
    assert seed not in json.dumps(captured)                     # raw seed never sent
    assert captured["mode"] == "payment"                        # never a subscription


def test_plan_ignores_report_completed():
    # A completed report checkout is NOT minted by the webhook (the claim is
    # bound to the raw seed, which never reached Stripe) — plan is None.
    obj = {"id": "cs_r", "payment_intent": "pi_r", "payment_status": "paid",
           "metadata": {"product": "personal_report", "seed_hash": "abc"}}
    assert S.plan_from_event({"type": "checkout.session.completed",
                              "data": {"object": obj}}) is None


def test_seed_hash_matches_is_constant_time_and_correct():
    s = _paid_report_session("seedA")
    assert S.is_report_session(s) is True
    assert S.seed_hash_matches(s, "seedA") is True
    assert S.seed_hash_matches(s, "seedB") is False


def test_report_checkout_503_when_unconfigured(monkeypatch):
    monkeypatch.delenv("AAE_STRIPE_SECRET_KEY", raising=False)
    r = client.post("/api/personal-report/checkout",
                    json={"seed": "s", "entitlement": _otoken()})
    assert r.status_code == 503


def test_report_checkout_requires_oracle_tier(monkeypatch):
    monkeypatch.setenv("AAE_STRIPE_SECRET_KEY", "sk_test_x")
    r = client.post("/api/personal-report/checkout", json={"seed": "s"})  # no tier
    assert r.status_code == 402


def test_report_checkout_returns_url(monkeypatch):
    monkeypatch.setenv("AAE_STRIPE_SECRET_KEY", "sk_test_x")

    async def _fake(seed, success, cancel):
        assert "report_checkout=" in success
        return {"id": "cs_report_2", "url": "https://stripe.test/pay"}

    monkeypatch.setattr(S, "create_report_checkout_session", _fake)
    r = client.post("/api/personal-report/checkout",
                    json={"seed": "seedX", "entitlement": _otoken()})
    assert r.status_code == 200, r.text[:200]
    assert r.json() == {"url": "https://stripe.test/pay", "session_id": "cs_report_2"}


def test_report_claim_mints_token_for_matching_seed(monkeypatch):
    monkeypatch.setenv("AAE_STRIPE_SECRET_KEY", "sk_test_x")
    seed = "seed-claim-ok"
    _patch_retrieve(monkeypatch, _paid_report_session(seed, ref="pi_claim_ok"))
    r = client.post("/api/personal-report/checkout/claim",
                    json={"session_id": "cs_report", "seed": seed,
                          "entitlement": _otoken()})
    assert r.status_code == 200, r.text[:200]
    body = r.json()
    assert body["product"] == "personal_report"
    assert body["report_token"]["verified"] is True
    # the minted token unlocks the compile gate for THIS seed
    assert ENT.verify_report_token(body["report_token"]["token"], seed) is not None


def test_report_claim_rejects_different_seed(monkeypatch):
    monkeypatch.setenv("AAE_STRIPE_SECRET_KEY", "sk_test_x")
    # session was paid for seedA; claimant presents seedB → 409, no token
    _patch_retrieve(monkeypatch, _paid_report_session("seedA", ref="pi_claim_x"))
    r = client.post("/api/personal-report/checkout/claim",
                    json={"session_id": "cs_report", "seed": "seedB",
                          "entitlement": _otoken()})
    assert r.status_code == 409


def test_report_claim_402_when_unpaid(monkeypatch):
    monkeypatch.setenv("AAE_STRIPE_SECRET_KEY", "sk_test_x")
    unpaid = _paid_report_session("seedU", ref="pi_unpaid")
    unpaid["payment_status"] = "unpaid"
    _patch_retrieve(monkeypatch, unpaid)
    r = client.post("/api/personal-report/checkout/claim",
                    json={"session_id": "cs_report", "seed": "seedU",
                          "entitlement": _otoken()})
    assert r.status_code == 402


def test_report_claim_is_idempotent_for_same_seed(monkeypatch):
    monkeypatch.setenv("AAE_STRIPE_SECRET_KEY", "sk_test_x")
    seed = "seed-idem"
    _patch_retrieve(monkeypatch, _paid_report_session(seed, ref="pi_idem"))
    j = {"session_id": "cs_report", "seed": seed, "entitlement": _otoken()}
    assert client.post("/api/personal-report/checkout/claim", json=j).status_code == 200
    # a second return (browser reload) re-mints rather than erroring
    assert client.post("/api/personal-report/checkout/claim", json=j).status_code == 200


def test_get_checkout_rejects_report_session(monkeypatch):
    monkeypatch.setenv("AAE_STRIPE_SECRET_KEY", "sk_test_x")
    _patch_retrieve(monkeypatch, _paid_report_session("seedG", ref="pi_get"))
    r = client.get("/api/checkout/cs_report")
    assert r.status_code == 409
    assert "claim" in r.json()["detail"]
