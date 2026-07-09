"""
Phase 1.1 — trust-mode entitlement gate.

Trust mode (accepting an unverified tx hash without an on-chain check) must be
DENIED unless it is (a) explicitly enabled AND (b) in a non-production
environment. Missing/malformed flags fail closed. The process must refuse to
boot in production with trust mode enabled or the default HMAC secret.

These would all fail against the pre-fix code, where any non-empty tx hash was
accepted whenever AAE_ETH_RPC was unset (no gating, no boot guard).
"""
import asyncio
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import entitlements as ENT  # noqa: E402


def _clear(monkeypatch):
    for var in ("AAE_ENV", "AAE_TRUST_MODE", "AAE_ETH_RPC", "AAE_DEV_TOKEN"):
        monkeypatch.delenv(var, raising=False)


# --- environment / gate logic --------------------------------------------- #

def test_is_production_fails_closed(monkeypatch):
    _clear(monkeypatch)
    assert ENT.is_production() is True                 # unset -> production
    monkeypatch.setenv("AAE_ENV", "banana")
    assert ENT.is_production() is True                 # unrecognized -> production
    monkeypatch.setenv("AAE_ENV", "development")
    assert ENT.is_production() is False


def test_trust_mode_requires_enabled_and_nonprod(monkeypatch):
    _clear(monkeypatch)
    monkeypatch.setenv("AAE_TRUST_MODE", "1")
    monkeypatch.setenv("AAE_ENV", "production")
    assert ENT.trust_mode_allowed() is False           # enabled but prod
    monkeypatch.setenv("AAE_ENV", "development")
    monkeypatch.delenv("AAE_TRUST_MODE", raising=False)
    assert ENT.trust_mode_allowed() is False           # non-prod but not enabled
    monkeypatch.setenv("AAE_TRUST_MODE", "true")
    assert ENT.trust_mode_allowed() is True            # both


# --- payment acceptance ---------------------------------------------------- #

def _verify(monkeypatch, tx):
    monkeypatch.setattr(ENT, "_ETH_RPC", "")           # no on-chain verification
    return asyncio.run(ENT.verify_eth_payment(tx))


def test_offchain_denied_in_production(monkeypatch):
    _clear(monkeypatch)
    monkeypatch.setenv("AAE_ENV", "production")
    ok, verified, _ = _verify(monkeypatch, "0xdeadbeef")
    assert ok is False and verified is False
    ok2, _, _ = ENT.accept_offchain_payment("0xdeadbeef")
    assert ok2 is False


def test_offchain_denied_when_trust_mode_off(monkeypatch):
    _clear(monkeypatch)
    monkeypatch.setenv("AAE_ENV", "development")       # non-prod but trust mode unset
    ok, _, _ = _verify(monkeypatch, "0xdeadbeef")
    assert ok is False


def test_offchain_granted_only_in_dev_trust_mode(monkeypatch):
    _clear(monkeypatch)
    monkeypatch.setenv("AAE_ENV", "development")
    monkeypatch.setenv("AAE_TRUST_MODE", "1")
    ok, verified, _ = _verify(monkeypatch, "0xdeadbeef")
    assert ok is True and verified is False            # granted, flagged unverified
    ok2, verified2, _ = ENT.accept_offchain_payment("0xdeadbeef")
    assert ok2 is True and verified2 is False


def test_offchain_missing_hash_denied(monkeypatch):
    _clear(monkeypatch)
    monkeypatch.setenv("AAE_ENV", "development")
    monkeypatch.setenv("AAE_TRUST_MODE", "1")
    ok, _, _ = ENT.accept_offchain_payment("   ")
    assert ok is False


# --- boot assertion -------------------------------------------------------- #

def test_boot_refuses_prod_trust_mode(monkeypatch):
    _clear(monkeypatch)
    monkeypatch.setenv("AAE_ENV", "production")
    monkeypatch.setenv("AAE_TRUST_MODE", "1")
    with pytest.raises(RuntimeError, match="TRUST_MODE"):
        ENT.assert_safe_boot()


def test_boot_refuses_prod_default_secret(monkeypatch):
    _clear(monkeypatch)
    monkeypatch.setenv("AAE_ENV", "production")
    monkeypatch.setattr(ENT, "_SECRET_INSECURE", True)
    with pytest.raises(RuntimeError, match="AAE_SECRET"):
        ENT.assert_safe_boot()


def test_boot_ok_in_dev(monkeypatch):
    _clear(monkeypatch)
    monkeypatch.setenv("AAE_ENV", "development")
    monkeypatch.setenv("AAE_TRUST_MODE", "1")
    ENT.assert_safe_boot()                             # must not raise


def test_boot_ok_in_prod_with_real_secret(monkeypatch):
    _clear(monkeypatch)
    monkeypatch.setenv("AAE_ENV", "production")
    monkeypatch.setattr(ENT, "_SECRET_INSECURE", False)
    ENT.assert_safe_boot()                             # must not raise


def test_boot_refused_in_prod_with_dev_token(monkeypatch):
    # The dev token is a full oracle-tier bypass — a leaked value grants
    # everything, so a production boot must refuse it (issue #54 §3.4).
    _clear(monkeypatch)
    monkeypatch.setenv("AAE_ENV", "production")
    monkeypatch.setattr(ENT, "_SECRET_INSECURE", False)
    monkeypatch.setenv("AAE_DEV_TOKEN", "f" * 64)
    with pytest.raises(RuntimeError, match="AAE_DEV_TOKEN"):
        ENT.assert_safe_boot()
