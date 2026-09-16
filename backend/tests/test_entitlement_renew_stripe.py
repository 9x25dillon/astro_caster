"""
Renewal of a SUBSCRIPTION key is gated on Stripe, not on the old key alone.

Session 42 made renewal automatic: the client re-mints any key inside its last
45 days on launch. `renew_entitlement` re-mints from the old token's claims and
never consults Stripe, so without the check in /api/entitlement/renew a plan
cancelled at Stripe (with the webhook missed) would renew itself for another
year. One-time (pi_/cs_) keys and crypto keys are unaffected — there is no
subscription behind them to have lapsed.
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


def _setup(tmp_path, monkeypatch, *, sub=None, raise_exc=None):
    monkeypatch.setattr(RCPT, "_DB_PATH", tmp_path / "receipts.db")
    monkeypatch.setenv("AAE_STRIPE_SECRET_KEY", "sk_test_x")

    async def _sub(_id):
        if raise_exc is not None:
            raise raise_exc
        assert sub is not None, "subscription should not have been fetched"
        return sub

    monkeypatch.setattr(STRIPE, "retrieve_subscription", _sub)


def test_live_subscription_renews(tmp_path, monkeypatch):
    _setup(tmp_path, monkeypatch, sub={"id": "sub_live", "status": "active"})
    old = ENT.mint_entitlement("supporter", "sub_live", True)
    r = client.post("/api/entitlement/renew", json={"entitlement": old["token"]})
    assert r.status_code == 200, r.text
    fresh = r.json()["entitlement"]
    assert fresh["token"] != old["token"]
    assert fresh["exp"] > old["exp"] - 1
    assert ENT.verify_token(old["token"]) is None, "old key must be superseded"
    assert ENT.verify_token(fresh["token"])["ref"] == "sub_live"


def test_past_due_still_renews(tmp_path, monkeypatch):
    # Stripe's dunning decides when a past_due plan ends, not us.
    _setup(tmp_path, monkeypatch, sub={"id": "sub_pd", "status": "past_due"})
    old = ENT.mint_entitlement("supporter", "sub_pd", True)
    r = client.post("/api/entitlement/renew", json={"entitlement": old["token"]})
    assert r.status_code == 200, r.text


def test_cancelled_subscription_is_refused_and_old_key_untouched(tmp_path, monkeypatch):
    _setup(tmp_path, monkeypatch, sub={"id": "sub_gone", "status": "canceled"})
    old = ENT.mint_entitlement("supporter", "sub_gone", True)
    r = client.post("/api/entitlement/renew", json={"entitlement": old["token"]})
    assert r.status_code == 402, r.text
    assert "sub_gone" in r.json()["detail"]
    assert "canceled" in r.json()["detail"]
    # Not renewed, but not revoked either: the paid period is still the
    # webhook's to end. The key verifies exactly as before.
    assert ENT.verify_token(old["token"]) is not None


def test_stripe_unreachable_is_503_not_a_renewal(tmp_path, monkeypatch):
    _setup(tmp_path, monkeypatch, raise_exc=RuntimeError("stripe down"))
    old = ENT.mint_entitlement("supporter", "sub_x", True)
    r = client.post("/api/entitlement/renew", json={"entitlement": old["token"]})
    assert r.status_code == 503, r.text
    assert ENT.verify_token(old["token"]) is not None


def test_subscription_missing_at_stripe_is_402(tmp_path, monkeypatch):
    class _Resp:
        status_code = 404

    class _NotFound(Exception):
        response = _Resp()

    _setup(tmp_path, monkeypatch, raise_exc=_NotFound())
    old = ENT.mint_entitlement("supporter", "sub_missing", True)
    r = client.post("/api/entitlement/renew", json={"entitlement": old["token"]})
    assert r.status_code == 402, r.text


def test_one_time_key_never_asks_stripe(tmp_path, monkeypatch):
    _setup(tmp_path, monkeypatch, sub=None)   # any fetch would assert
    old = ENT.mint_entitlement("supporter", "pi_once", True)
    r = client.post("/api/entitlement/renew", json={"entitlement": old["token"]})
    assert r.status_code == 200, r.text


def test_no_card_rail_renews_on_the_key_alone(tmp_path, monkeypatch):
    monkeypatch.setattr(RCPT, "_DB_PATH", tmp_path / "receipts.db")
    monkeypatch.delenv("AAE_STRIPE_SECRET_KEY", raising=False)
    old = ENT.mint_entitlement("supporter", "sub_offline", True)
    r = client.post("/api/entitlement/renew", json={"entitlement": old["token"]})
    assert r.status_code == 200, r.text


def test_invalid_key_is_401(tmp_path, monkeypatch):
    _setup(tmp_path, monkeypatch, sub=None)
    r = client.post("/api/entitlement/renew", json={"entitlement": "not.a.key"})
    assert r.status_code == 401
