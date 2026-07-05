"""
Receipt ledger (closes AUDIT_REGRESSION §6): one paid tx must mint deluxe
claims for exactly ONE Oracle session. Same-seed redemptions stay idempotent
(recompiles, lost-claim recovery); cross-seed replay is rejected; a broken
ledger fails closed on this paid surface.
"""
import os
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import entitlements as ENT  # noqa: E402
import receipts as RCPT  # noqa: E402
from main import app  # noqa: E402

client = TestClient(app)


@pytest.fixture(autouse=True)
def fresh_ledger(tmp_path, monkeypatch):
    monkeypatch.setattr(RCPT, "_DB_PATH", tmp_path / "receipts.db")


def _token(tier: str) -> str:
    return ENT.mint_entitlement(tier, "test", True)["token"]


# ── Unit: the ledger itself ─────────────────────────────────────────────────────

def test_first_claim_recorded():
    ok, note = RCPT.claim_tx("0xAAA", "seed-1", verified=True, wei=10**18)
    assert ok and "recorded" in note


def test_same_seed_idempotent():
    RCPT.claim_tx("0xAAA", "seed-1", verified=True)
    ok, note = RCPT.claim_tx("0xAAA", "seed-1", verified=True)
    assert ok and "already on ledger" in note


def test_cross_seed_replay_rejected():
    RCPT.claim_tx("0xAAA", "seed-1", verified=True)
    ok, note = RCPT.claim_tx("0xAAA", "seed-2", verified=True)
    assert not ok and "different" in note


def test_tx_hash_normalized():
    RCPT.claim_tx("  0xAbCd  ", "seed-1", verified=True)
    ok, _ = RCPT.claim_tx("0xabcd", "seed-2", verified=True)
    assert not ok  # case/whitespace variants are the same receipt


def test_ledger_persists_across_connections():
    RCPT.claim_tx("0xAAA", "seed-1", verified=True)
    # A second call opens a fresh connection to the same file.
    ok, _ = RCPT.claim_tx("0xAAA", "seed-2", verified=True)
    assert not ok


def test_broken_ledger_fails_closed(monkeypatch, tmp_path):
    # Point the ledger at an unopenable path: the claim must be DENIED,
    # never silently granted.
    monkeypatch.setattr(RCPT, "_DB_PATH", tmp_path)  # a directory, not a file
    ok, note = RCPT.claim_tx("0xAAA", "seed-1", verified=True)
    assert not ok and "unavailable" in note


# ── Endpoint: the purchase rail enforces the ledger ─────────────────────────────

@pytest.fixture
def trust_purchase_env(monkeypatch):
    monkeypatch.setattr(ENT, "_ETH_RPC", "")
    monkeypatch.setenv("AAE_TRUST_MODE", "1")


def _purchase(tx: str, seed: str):
    return client.post("/api/personal-report/purchase", json={
        "tx_hash": tx, "seed": seed, "entitlement": _token("oracle")})


def test_endpoint_cross_seed_replay_402(trust_purchase_env):
    assert _purchase("0xledger1", "seed-A").status_code == 200
    r = _purchase("0xledger1", "seed-B")
    assert r.status_code == 402
    assert "already redeemed" in r.json()["detail"]


def test_endpoint_same_seed_remint_allowed(trust_purchase_env):
    assert _purchase("0xledger2", "seed-A").status_code == 200
    r = _purchase("0xledger2", "seed-A")   # lost claim / recompile path
    assert r.status_code == 200
    assert r.json()["granted"] is True


def test_endpoint_fresh_tx_fresh_seed_ok(trust_purchase_env):
    assert _purchase("0xledger3", "seed-A").status_code == 200
    assert _purchase("0xledger4", "seed-B").status_code == 200
