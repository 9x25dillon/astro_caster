"""
Phase 4.1 — entitlement lifecycle: jti-stamped mint, ledger record, revocation
(fail-open verify), renewal (supersede), device re-link (move), and the
operator lookup/revoke endpoints.
"""
import os
import sys
import time

from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import entitlements as ENT  # noqa: E402
import main  # noqa: E402
import receipts as RCPT  # noqa: E402

client = TestClient(main.app)
OP = "op-secret-token"


def _op(monkeypatch):
    monkeypatch.setattr(ENT, "_DEV_TOKEN", OP)


# ── mint / ledger / revocation ──────────────────────────────────────────────

def test_mint_stamps_jti_and_records_ledger():
    m = ENT.mint_entitlement("supporter", "0xA1", verified=True)
    assert m["jti"] and len(m["jti"]) == 16
    assert RCPT.ent_status(m["jti"]) == "active"
    assert ENT.verify_token(m["token"]) is not None


def test_revocation_makes_verify_fail():
    m = ENT.mint_entitlement("oracle", "0xB2", verified=True)
    assert ENT.verify_token(m["token"])["tier"] == "oracle"
    ok, _ = RCPT.ent_revoke(m["jti"], "refund")
    assert ok
    assert ENT.verify_token(m["token"]) is None          # revoked → rejected


def test_legacy_token_without_jti_still_verifies():
    now = int(time.time())
    legacy = ENT._sign({"tier": "supporter", "ref": "legacy",
                        "verified": True, "iat": now, "exp": now + 9999})
    assert ENT.verify_token(legacy) is not None           # fail-open


def test_revocation_fails_open_when_ledger_unreachable(monkeypatch):
    m = ENT.mint_entitlement("supporter", "0xC3", verified=True)

    def boom(_jti):
        raise RuntimeError("ledger down")
    monkeypatch.setattr(RCPT, "ent_status", boom)
    assert ENT.verify_token(m["token"]) is not None       # signature honored


# ── renewal ─────────────────────────────────────────────────────────────────

def test_renew_supersedes_old_and_issues_fresh():
    m = ENT.mint_entitlement("supporter", "0xD4", verified=True)
    fresh = ENT.renew_entitlement(m["token"])
    assert fresh is not None and fresh["jti"] != m["jti"]
    assert fresh["exp"] >= m["exp"]
    assert ENT.verify_token(m["token"]) is None           # old superseded
    assert ENT.verify_token(fresh["token"])["tier"] == "supporter"


def test_renew_rejects_invalid_token():
    assert ENT.renew_entitlement("not-a-token") is None


# ── device re-link ──────────────────────────────────────────────────────────

def test_relink_moves_entitlement_to_new_device():
    ref = "0xE5"[:18]
    first = ENT.mint_entitlement("oracle", ref, verified=True)
    moved = ENT.relink_ref(ref, "oracle", verified=True)
    assert moved["jti"] != first["jti"]
    assert ENT.verify_token(first["token"]) is None       # old device killed
    assert ENT.verify_token(moved["token"])["tier"] == "oracle"


# ── HTTP surface ────────────────────────────────────────────────────────────

def test_renew_endpoint(monkeypatch):
    m = ENT.mint_entitlement("supporter", "0xF6", verified=True)
    r = client.post("/api/entitlement/renew", json={"entitlement": m["token"]})
    assert r.status_code == 200
    body = r.json()
    assert body["granted"] and body["tier"] == "supporter"
    assert body["entitlement"]["jti"] != m["jti"]


def test_renew_endpoint_rejects_bad_token():
    r = client.post("/api/entitlement/renew", json={"entitlement": "garbage"})
    assert r.status_code == 401


def test_admin_endpoints_gated():
    assert client.get("/api/admin/entitlements").status_code == 403
    assert client.post("/api/admin/entitlement/revoke",
                       json={"jti": "x"}).status_code == 403


def test_admin_list_and_revoke(monkeypatch):
    _op(monkeypatch)
    m = ENT.mint_entitlement("oracle", "0xADMIN01", verified=True)
    rows = client.get("/api/admin/entitlements?q=0xADMIN01",
                      headers={"X-AAE-Token": OP}).json()["rows"]
    assert any(row["jti"] == m["jti"] for row in rows)

    rv = client.post("/api/admin/entitlement/revoke",
                     json={"jti": m["jti"], "note": "chargeback"},
                     headers={"X-AAE-Token": OP})
    assert rv.status_code == 200 and rv.json()["revoked"]
    assert ENT.verify_token(m["token"]) is None

    # revoking an unknown id fails CLOSED (409)
    bad = client.post("/api/admin/entitlement/revoke",
                      json={"jti": "deadbeef"}, headers={"X-AAE-Token": OP})
    assert bad.status_code == 409
