"""
The key a paying customer carries home must survive the webhook.

A Stripe card purchase reaches this server TWICE, concurrently and in no fixed
order: the browser returns to `?checkout=<cs_…>` and calls GET
/api/checkout/{id}, and Stripe fires `checkout.session.completed` at the
webhook. Both used to call `relink_ref`, which SUPERSEDES whatever is active for
the payment reference and mints a fresh token.

When the browser won the race — the usual case, since the redirect is
instantaneous and the webhook is queued — the webhook then superseded the key
the browser had just stored. The page showed "Unlocked", the next launch said
"That key is no longer valid", and every unlock link / QR the Library handed to
the APK carried a dead key. The only live token was the webhook's, which no
device ever saw. Stripe's own retries (hours later, after a 5xx) did it again.

The webhook is a BACKSTOP: it guarantees the ledger records the purchase (so
restore and the billing portal work even if the browser never returns). It must
never take a key away from the customer who paid.
"""
import hashlib
import hmac
import json
import os
import sys
import time

from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import main  # noqa: E402
import entitlements as ENT  # noqa: E402
import receipts as RCPT  # noqa: E402
import stripe_rail as S  # noqa: E402

client = TestClient(main.app)
WHSEC = "whsec_test_secret"


def _sign(body: bytes) -> str:
    t = int(time.time())
    sig = hmac.new(WHSEC.encode(), f"{t}.".encode() + body, hashlib.sha256).hexdigest()
    return f"t={t},v1={sig}"


def _session(cs: str, sub: str, tier: str = "oracle") -> dict:
    return {"id": cs, "subscription": sub, "customer": "cus_race",
            "payment_status": "paid", "metadata": {"tier": tier}}


def _rail(monkeypatch, session: dict) -> None:
    monkeypatch.setenv("AAE_STRIPE_SECRET_KEY", "sk_test_race")
    monkeypatch.setenv("AAE_STRIPE_WEBHOOK_SECRET", WHSEC)

    async def _r(_sid):
        return session
    monkeypatch.setattr(S, "retrieve_session", _r)


def _webhook(session: dict, event_id: str):
    body = json.dumps({"id": event_id, "type": "checkout.session.completed",
                       "data": {"object": session}}).encode()
    return client.post("/api/stripe/webhook", content=body,
                       headers={"stripe-signature": _sign(body)})


def _browser_return(cs: str) -> str:
    r = client.get(f"/api/checkout/{cs}")
    assert r.status_code == 200 and r.json()["granted"] is True
    return r.json()["entitlement"]["token"]


def test_browser_first_key_survives_the_webhook(monkeypatch):
    session = _session("cs_race_browser_first", "sub_race_browser_first")
    _rail(monkeypatch, session)

    key = _browser_return(session["id"])
    assert ENT.verify_token(key) is not None

    r = _webhook(session, "evt_race_1")
    assert r.status_code == 200

    # The customer's key — the one in their browser and in every unlock link
    # the Library hands to the app — is still the live one.
    assert ENT.verify_token(key) is not None
    assert ENT.entitlement_status(key)["tier"] == "oracle"


def test_late_webhook_retry_does_not_kill_the_key(monkeypatch):
    session = _session("cs_race_retry", "sub_race_retry")
    _rail(monkeypatch, session)

    key = _browser_return(session["id"])
    # Stripe retries with the same event id after a failed delivery, and a
    # second distinct delivery can arrive too; neither may supersede the key.
    assert _webhook(session, "evt_race_retry_a").status_code == 200
    assert _webhook(session, "evt_race_retry_b").status_code == 200
    assert ENT.verify_token(key) is not None


def test_webhook_first_then_browser_still_unlocks(monkeypatch):
    session = _session("cs_race_webhook_first", "sub_race_webhook_first")
    _rail(monkeypatch, session)

    assert _webhook(session, "evt_race_wf").status_code == 200
    # Nobody holds the webhook's token; the ledger records the purchase.
    assert RCPT.ent_find_active_ref("sub_race_webhook_first") is not None

    key = _browser_return(session["id"])
    assert ENT.verify_token(key) is not None


def test_webhook_alone_records_the_purchase_for_restore(monkeypatch):
    # The browser never came back (tab closed on Stripe's page). The webhook
    # must still leave an active row, or restore has nothing to find.
    session = _session("cs_race_lonely", "sub_race_lonely", tier="supporter")
    _rail(monkeypatch, session)
    assert _webhook(session, "evt_race_lonely").status_code == 200
    row = RCPT.ent_find_active_ref("sub_race_lonely")
    assert row is not None and row["tier"] == "supporter"


def test_refund_still_revokes_the_browser_key(monkeypatch):
    session = _session("cs_race_refund", "sub_race_refund")
    _rail(monkeypatch, session)
    key = _browser_return(session["id"])
    _webhook(session, "evt_race_refund_mint")

    body = json.dumps({"id": "evt_race_refund_del", "type": "customer.subscription.deleted",
                       "data": {"object": {"id": "sub_race_refund"}}}).encode()
    r = client.post("/api/stripe/webhook", content=body,
                    headers={"stripe-signature": _sign(body)})
    assert r.status_code == 200 and r.json()["action"] == "revoke"
    assert ENT.verify_token(key) is None


def test_ensure_ref_upgrades_a_lower_tier(monkeypatch):
    # Not a race path today (one session = one tier), but the helper must never
    # leave a customer BELOW what Stripe says they bought.
    ENT.mint_entitlement("supporter", ref="sub_race_upgrade", verified=True)
    out = ENT.ensure_ref("sub_race_upgrade", "oracle", verified=True)
    assert out is not None and out["tier"] == "oracle"
    assert RCPT.ent_find_active_ref("sub_race_upgrade")["tier"] == "oracle"
