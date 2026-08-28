"""
Restoring a deluxe claim that was already paid for.

A report token is stateless and lives in the browser; the PURCHASE lives in the
receipt ledger. Clear site data, switch browsers, or buy on a phone and read on
a laptop, and the payment is intact while everything the app can see is gone.

Measured 2026-08-28 on production: a $5.50 edition was bought at 03:07:59, its
verified receipt sat on the ledger bound to one seed, `personal_report`
generations stood at 0, and the customer had no route back to the product they
owned. This endpoint is that route.

The tests that matter here are the REFUSALS. A restore mints proof of payment,
so every way it could mint without one is a way to give away a paid product.
"""
import os
import sys

from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import entitlements as ENT  # noqa: E402
import main  # noqa: E402
import receipts as RCPT  # noqa: E402

client = TestClient(main.app)

_SEED = "Sun:228.94|Moon:141.02#elemental_balance#what guides me#src:rws"
_OTHER_SEED = "Sun:11.11|Moon:22.22#three_card#a different question"


def _oracle_token():
    return ENT.mint_entitlement("oracle", ref="test-oracle", verified=True)["token"]


def _supporter_token():
    return ENT.mint_entitlement("supporter", ref="test-supp", verified=True)["token"]


def _isolate_ledger(tmp_path, monkeypatch):
    """Point the receipts ledger at a scratch file, so a test never reads or
    writes the operator's real purchases."""
    monkeypatch.setattr(RCPT, "_DB_PATH", tmp_path / "receipts.db")


def _record_purchase(seed=_SEED, verified=True):
    ok, _note = RCPT.claim_tx("pi_test_payment_intent", seed, verified=verified,
                              wei=550)
    assert ok
def _restore(seed=_SEED, entitlement=None):
    return client.post("/api/personal-report/claim/restore",
                       json={"seed": seed, "entitlement": entitlement})


# ------------------------------------------------------------------ the grant

def test_a_paid_session_gets_its_claim_back(tmp_path, monkeypatch):
    _isolate_ledger(tmp_path, monkeypatch)
    _record_purchase()
    r = _restore(entitlement=_oracle_token())
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["granted"] is True
    assert body["product"] == "personal_report"
    # The restored token must actually unlock THIS session and no other.
    tok = body["report_token"]["token"]
    assert ENT.verify_report_token(tok, _SEED) is not None
    assert ENT.verify_report_token(tok, _OTHER_SEED) is None


def test_the_restored_token_carries_the_original_payment_reference(tmp_path, monkeypatch):
    # A re-mint must be traceable to the PAYMENT, not to the act of restoring
    # it — otherwise the ledger cannot answer "what was this token issued for?"
    _isolate_ledger(tmp_path, monkeypatch)
    _record_purchase()
    body = _restore(entitlement=_oracle_token()).json()
    # Derived, not transcribed: the ledger stores `ref` already truncated to
    # 18 chars, and hand-counting it into a literal is how a test asserts its
    # author's arithmetic instead of the system's behaviour.
    assert body["report_token"]["ref"] == RCPT.receipt_for_seed(_SEED)["ref"]
    assert body["report_token"]["ref"].startswith("pi_test_payment")


def test_restoring_twice_is_allowed(tmp_path, monkeypatch):
    # Recovery is not a one-shot: someone restoring on a laptop must not lock
    # themselves out of restoring on a phone. The product is per SESSION, and
    # generation stays capped by the deluxe budget either way.
    _isolate_ledger(tmp_path, monkeypatch)
    _record_purchase()
    tok = _oracle_token()
    assert _restore(entitlement=tok).status_code == 200
    assert _restore(entitlement=tok).status_code == 200


# -------------------------------------------------------------- the refusals

def test_an_unpaid_session_is_refused(tmp_path, monkeypatch):
    # The whole point: no receipt, no claim. This is the case that would give
    # the product away.
    _isolate_ledger(tmp_path, monkeypatch)
    r = _restore(entitlement=_oracle_token())
    assert r.status_code == 404
    assert "not been paid for" in r.json()["detail"]


def test_a_purchase_for_a_DIFFERENT_session_does_not_unlock_this_one(tmp_path, monkeypatch):
    # One purchase covers one Oracle sitting. Paying for a daily spread must
    # not restore a claim on a twelve-house reading.
    _isolate_ledger(tmp_path, monkeypatch)
    _record_purchase(seed=_OTHER_SEED)
    assert _restore(seed=_SEED, entitlement=_oracle_token()).status_code == 404


def test_an_unverified_receipt_is_not_proof_of_payment(tmp_path, monkeypatch):
    _isolate_ledger(tmp_path, monkeypatch)
    _record_purchase(verified=False)
    assert _restore(entitlement=_oracle_token()).status_code == 404


def test_below_oracle_tier_is_refused_before_the_ledger_is_read(tmp_path, monkeypatch):
    _isolate_ledger(tmp_path, monkeypatch)
    _record_purchase()
    assert _restore(entitlement=_supporter_token()).status_code == 402
    assert _restore(entitlement=None).status_code == 402
    assert _restore(entitlement="not-a-real-token").status_code == 402


def test_an_empty_seed_is_rejected(tmp_path, monkeypatch):
    # Guards the shape of the lookup: a blank seed must never match a row.
    _isolate_ledger(tmp_path, monkeypatch)
    assert _restore(seed="   ", entitlement=_oracle_token()).status_code == 400


def test_a_broken_ledger_fails_closed(tmp_path, monkeypatch):
    # No ledger means no proof, which must mean no mint — never an open door.
    _isolate_ledger(tmp_path, monkeypatch)
    _record_purchase()
    monkeypatch.setattr(RCPT, "_connect", lambda: (_ for _ in ()).throw(OSError("gone")))
    assert _restore(entitlement=_oracle_token()).status_code == 404


def test_the_lookup_itself_only_returns_verified_rows(tmp_path, monkeypatch):
    _isolate_ledger(tmp_path, monkeypatch)
    assert RCPT.receipt_for_seed(_SEED) is None
    _record_purchase()
    row = RCPT.receipt_for_seed(_SEED)
    assert row and row["seed"] == _SEED and row["verified"] is True
    assert row["tx_hash"] == "pi_test_payment_intent"   # normalized, lowercase
