"""
Restoring a paid TIER whose browser copy is gone.

The mirror of test_report_claim_restore.py, one layer up. An entitlement token
is stateless and lives in localStorage; the subscription lives at Stripe and on
the entitlement ledger. Clearing site data therefore strands an active,
paid-for subscription with nothing on the device to prove it — and until this
endpoint the only field in the app that accepted a payment reference was the
CRYPTO one, which answers a Stripe id with "on-chain verification unavailable
and trust mode is disabled". A customer met exactly that on 2026-08-28.

The tests that matter are the REFUSALS. A restore hands back paid access, so
every path that mints without a live payment behind it is a way to give the
product away — and the sharpest of those is a REFUND, because Stripe goes on
describing a refunded charge perfectly happily.
"""
import os
import sys

from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import entitlements as ENT  # noqa: E402
import main  # noqa: E402
import receipts as RCPT  # noqa: E402
import stripe_rail as STRIPE  # noqa: E402

client = TestClient(main.app)


def _isolate_ledger(tmp_path, monkeypatch):
    """Point the ledger at a scratch file so a test never reads or writes the
    operator's real purchases."""
    monkeypatch.setattr(RCPT, "_DB_PATH", tmp_path / "receipts.db")


def _rail_open(monkeypatch):
    monkeypatch.setenv("AAE_STRIPE_SECRET_KEY", "sk_test_x")


def _stripe_returns(monkeypatch, *, session=None, intent=None, sub=None):
    """Stand in for the three Stripe lookups a restore can make."""
    async def _session(_id):
        if session is None:
            raise AssertionError("checkout session should not have been fetched")
        return session

    async def _intent(_id):
        if intent is None:
            raise AssertionError("payment intent should not have been fetched")
        return intent

    async def _sub(_id):
        if sub is None:
            raise AssertionError("subscription should not have been fetched")
        return sub

    monkeypatch.setattr(STRIPE, "retrieve_session", _session)
    monkeypatch.setattr(STRIPE, "retrieve_payment_intent", _intent)
    monkeypatch.setattr(STRIPE, "retrieve_subscription", _sub)


def _restore(reference):
    return client.post("/api/entitlement/restore", json={"reference": reference})


def _grant(ref, tier="oracle"):
    """Put a live entitlement on the ledger, the way a webhook mint does."""
    return ENT.relink_ref(ref, tier, verified=True)


_LIVE_SUB = {"id": "sub_live", "status": "active", "customer": "cus_abc"}
_PAID_PI = {"id": "pi_paid", "status": "succeeded", "customer": "cus_abc"}


# ----------------------------------------------------------------- the grant

def test_a_cleared_browser_gets_its_subscription_back(tmp_path, monkeypatch):
    _isolate_ledger(tmp_path, monkeypatch)
    _rail_open(monkeypatch)
    _grant("sub_live", "oracle")
    _stripe_returns(monkeypatch, sub=_LIVE_SUB)

    r = _restore("sub_live")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["granted"] is True
    assert body["tier"] == "oracle"
    # The token that comes back must actually verify at that tier.
    payload = ENT.verify_token(body["entitlement"]["token"])
    assert payload is not None
    assert payload["tier"] == "oracle"
    assert payload["ref"] == "sub_live"


def test_a_checkout_reference_carries_its_own_tier(tmp_path, monkeypatch):
    # The escape hatch when the ledger row itself is gone: a cs_ session states
    # the tier in its metadata, so it can restore with nothing on the ledger.
    _isolate_ledger(tmp_path, monkeypatch)
    _rail_open(monkeypatch)
    _stripe_returns(monkeypatch, session={
        "id": "cs_x", "payment_status": "paid", "subscription": "sub_fresh",
        "metadata": {"tier": "supporter"}, "customer": "cus_x",
    })
    r = _restore("cs_x")
    assert r.status_code == 200, r.text
    assert r.json()["tier"] == "supporter"
    # It is minted against the PAYMENT's reference, not the session id, so a
    # later refund event — which carries the subscription — can still revoke it.
    assert r.json()["entitlement"]["ref"] == "sub_fresh"


def test_a_one_time_payment_intent_restores_from_the_ledger(tmp_path, monkeypatch):
    _isolate_ledger(tmp_path, monkeypatch)
    _rail_open(monkeypatch)
    _grant("pi_paid", "supporter")
    _stripe_returns(monkeypatch, intent=_PAID_PI)
    r = _restore("pi_paid")
    assert r.status_code == 200, r.text
    assert r.json()["tier"] == "supporter"


def test_restoring_twice_is_allowed(tmp_path, monkeypatch):
    # Recovery is not a one-shot: restoring on a laptop must not lock you out
    # of restoring on a phone.
    _isolate_ledger(tmp_path, monkeypatch)
    _rail_open(monkeypatch)
    _grant("sub_live")
    _stripe_returns(monkeypatch, sub=_LIVE_SUB)
    assert _restore("sub_live").status_code == 200
    assert _restore("sub_live").status_code == 200


def test_the_restore_supersedes_the_previous_device(tmp_path, monkeypatch):
    # relink semantics: the entitlement MOVES. The old device's token stops
    # verifying, which is what keeps a restore from being a way to mint copies.
    _isolate_ledger(tmp_path, monkeypatch)
    _rail_open(monkeypatch)
    first = _grant("sub_live")
    _stripe_returns(monkeypatch, sub=_LIVE_SUB)
    second = _restore("sub_live").json()["entitlement"]

    assert second["jti"] != first["jti"]
    assert RCPT.ent_status(first["jti"]) == "renewed"
    assert RCPT.ent_status(second["jti"]) == "active"


def test_the_billing_portal_link_is_re_recorded(tmp_path, monkeypatch):
    # A restore is also the moment to repair the customer map: without it, a
    # recovered subscriber can log back in and still not reach "cancel".
    _isolate_ledger(tmp_path, monkeypatch)
    _rail_open(monkeypatch)
    _grant("sub_live")
    _stripe_returns(monkeypatch, sub=_LIVE_SUB)
    assert _restore("sub_live").status_code == 200
    assert RCPT.stripe_customer_get("sub_live") == "cus_abc"


# --------------------------------------------------------------- the refusals

def test_a_refunded_purchase_cannot_be_restored(tmp_path, monkeypatch):
    # THE test. Stripe still describes a refunded charge as a succeeded
    # payment intent, so Stripe alone can never answer this — only the ledger
    # knows the entitlement was revoked. Without this check, "restore" is a
    # button that undoes every refund we ever issued.
    _isolate_ledger(tmp_path, monkeypatch)
    _rail_open(monkeypatch)
    _grant("pi_paid", "oracle")
    RCPT.ent_revoke_ref("pi_paid", note="stripe refund/cancel")
    _stripe_returns(monkeypatch, intent=_PAID_PI)

    r = _restore("pi_paid")
    assert r.status_code == 409, r.text
    assert "refunded" in r.json()["detail"]


def test_a_cancelled_subscription_cannot_be_restored(tmp_path, monkeypatch):
    _isolate_ledger(tmp_path, monkeypatch)
    _rail_open(monkeypatch)
    _grant("sub_dead")
    _stripe_returns(monkeypatch, sub={"id": "sub_dead", "status": "canceled"})
    r = _restore("sub_dead")
    assert r.status_code == 402, r.text


def test_a_past_due_subscription_still_restores(tmp_path, monkeypatch):
    # The period already paid for has not ended; Stripe's dunning decides when
    # access stops, not a lost browser.
    _isolate_ledger(tmp_path, monkeypatch)
    _rail_open(monkeypatch)
    _grant("sub_late", "oracle")
    _stripe_returns(monkeypatch, sub={"id": "sub_late", "status": "past_due"})
    assert _restore("sub_late").status_code == 200


def test_an_abandoned_checkout_grants_nothing(tmp_path, monkeypatch):
    _isolate_ledger(tmp_path, monkeypatch)
    _rail_open(monkeypatch)
    _stripe_returns(monkeypatch, session={
        "id": "cs_unpaid", "payment_status": "unpaid",
        "metadata": {"tier": "oracle"},
    })
    r = _restore("cs_unpaid")
    assert r.status_code == 402, r.text


def test_an_uncompleted_payment_intent_grants_nothing(tmp_path, monkeypatch):
    _isolate_ledger(tmp_path, monkeypatch)
    _rail_open(monkeypatch)
    _grant("pi_pending", "oracle")            # a ledger row is NOT the proof
    _stripe_returns(monkeypatch, intent={"id": "pi_pending",
                                         "status": "requires_payment_method"})
    r = _restore("pi_pending")
    assert r.status_code == 402, r.text


def test_a_real_payment_with_no_tier_on_record_is_404_not_a_grant(tmp_path, monkeypatch):
    _isolate_ledger(tmp_path, monkeypatch)
    _rail_open(monkeypatch)
    _stripe_returns(monkeypatch, intent={"id": "pi_orphan", "status": "succeeded"})
    r = _restore("pi_orphan")
    assert r.status_code == 404, r.text


def test_an_unknown_reference_is_404_not_502(tmp_path, monkeypatch):
    # A typo must read as "we don't know that", not as "our server broke".
    _isolate_ledger(tmp_path, monkeypatch)
    _rail_open(monkeypatch)

    class _Resp:
        status_code = 404

    class _Boom(Exception):
        response = _Resp()

    async def _raise(_id):
        raise _Boom("no such payment_intent")

    monkeypatch.setattr(STRIPE, "retrieve_payment_intent", _raise)
    r = _restore("pi_typo")
    assert r.status_code == 404, r.text
    assert "no record" in r.json()["detail"]


def test_an_unreadable_ledger_refuses_rather_than_guessing(tmp_path, monkeypatch):
    # The sharpest judgment in this endpoint, and a deliberate break with the
    # fail-OPEN posture the per-request revocation check uses. Only the ledger
    # knows about a refund; Stripe describes a refunded charge as a succeeded
    # payment forever. A restore that shrugged at an unreadable ledger would
    # hand back access on exactly the reference it most needed to check — and
    # a `cs_` reference, which carries its own tier, would not even need a row
    # to fall back on. A retry costs a customer seconds; this cannot be undone.
    _isolate_ledger(tmp_path, monkeypatch)
    _rail_open(monkeypatch)
    monkeypatch.setattr(RCPT, "ent_ref_state", lambda _ref: "unknown")
    _stripe_returns(monkeypatch, session={
        "id": "cs_x", "payment_status": "paid", "subscription": "sub_fresh",
        "metadata": {"tier": "oracle"},
    })
    r = _restore("cs_x")
    assert r.status_code == 503, r.text
    assert "ledger" in r.json()["detail"]


def test_ent_ref_state_says_unknown_when_the_ledger_cannot_be_opened(tmp_path, monkeypatch):
    _isolate_ledger(tmp_path, monkeypatch)

    def _boom():
        raise OSError("disk gone")

    monkeypatch.setattr(RCPT, "_connect", _boom)
    # Not "none": the caller must be able to tell "never seen" from "cannot
    # see", because it grants on one and must refuse on the other.
    assert RCPT.ent_ref_state("sub_anything") == "unknown"


# ------------------------------------------------- the wrong door, named right

def test_a_crypto_tx_hash_is_told_it_is_the_wrong_rail(tmp_path, monkeypatch):
    _isolate_ledger(tmp_path, monkeypatch)
    _rail_open(monkeypatch)
    r = _restore("0x" + "ab" * 32)
    assert r.status_code == 400, r.text
    assert "Stripe" in r.json()["detail"]


def test_a_deluxe_report_payment_is_pointed_at_its_own_door(tmp_path, monkeypatch):
    # The literal 2026-08-28 mistake, inverted. `pi_3u9g90…` was the payment
    # intent behind a $5.50 deluxe edition, and the customer was told to paste
    # it into the crypto field, which answered "on-chain verification
    # unavailable" — denying a payment that was entirely real. A deluxe
    # reference reaching the tier rail must name the right door instead.
    _isolate_ledger(tmp_path, monkeypatch)
    _rail_open(monkeypatch)
    ok, _ = RCPT.claim_tx("pi_deluxe", "some-oracle-seed", verified=True, wei=550)
    assert ok
    _stripe_returns(monkeypatch, intent={"id": "pi_deluxe", "status": "succeeded"})

    r = _restore("pi_deluxe")
    assert r.status_code == 409, r.text
    detail = r.json()["detail"]
    assert "deluxe" in detail and "Oracle session" in detail


def test_a_deluxe_checkout_session_is_pointed_at_its_own_door(tmp_path, monkeypatch):
    _isolate_ledger(tmp_path, monkeypatch)
    _rail_open(monkeypatch)
    _stripe_returns(monkeypatch, session={
        "id": "cs_deluxe", "payment_status": "paid", "payment_intent": "pi_d",
        "metadata": {"product": "personal_report", "seed_hash": "abc"},
    })
    r = _restore("cs_deluxe")
    assert r.status_code == 409, r.text
    assert "deluxe" in r.json()["detail"]


# ------------------------------------------------------------ rail unavailable

def test_no_card_rail_says_so_instead_of_failing_obscurely(tmp_path, monkeypatch):
    _isolate_ledger(tmp_path, monkeypatch)
    monkeypatch.delenv("AAE_STRIPE_SECRET_KEY", raising=False)
    r = _restore("sub_live")
    assert r.status_code == 503, r.text
    assert "crypto" in r.json()["detail"]


# ------------------------------------------------------------- ledger helpers

def test_ent_ref_state_separates_revoked_from_never_seen(tmp_path, monkeypatch):
    # The distinction the endpoint rests on. `ent_find_active_ref` returns None
    # for both, and treating them alike re-issues access to a refunded payment.
    _isolate_ledger(tmp_path, monkeypatch)
    assert RCPT.ent_ref_state("sub_never") == "none"

    _grant("sub_a")
    assert RCPT.ent_ref_state("sub_a") == "active"

    RCPT.ent_revoke_ref("sub_a")
    assert RCPT.ent_ref_state("sub_a") == "revoked"


def test_superseding_a_token_does_not_look_like_a_revocation(tmp_path, monkeypatch):
    # A device move marks the old row `renewed`. If that read as revoked, the
    # second restore from any device would refuse.
    _isolate_ledger(tmp_path, monkeypatch)
    _grant("sub_b")
    _grant("sub_b")                       # relink: supersedes, then re-mints
    assert RCPT.ent_ref_state("sub_b") == "active"
