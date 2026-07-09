"""
Ed25519 dual-issue spike (MOBILE_ROADMAP §4.2 / §7.5): behind
AAE_SIGN_ALGO=ed25519 the server signs with an asymmetric key so a device
holding only the PUBLIC key can verify tiers offline. Both signature schemes
must verify regardless of which one is actively minting (dual-accept), and
the report-claim path rides the same signer.
"""
import os
import sys
import time

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import entitlements as ENT  # noqa: E402

# A fixed test seed (NOT a real key): 32 bytes of 0x01.
SEED = "01" * 32


@pytest.fixture
def ed25519_env(monkeypatch):
    monkeypatch.setenv("AAE_SIGN_ALGO", "ed25519")
    monkeypatch.setenv("AAE_ED25519_SEED", SEED)


def test_hmac_remains_default(monkeypatch):
    monkeypatch.delenv("AAE_SIGN_ALGO", raising=False)
    tok = ENT.mint_entitlement("supporter", "t", True)["token"]
    sig = tok.rsplit(".", 1)[1]
    assert len(sig) == 64  # plain HMAC hexdigest
    assert ENT.verify_token(tok)["tier"] == "supporter"


def test_ed25519_mint_and_verify(ed25519_env):
    tok = ENT.mint_entitlement("oracle", "t", True)["token"]
    sig = tok.rsplit(".", 1)[1]
    assert sig.startswith("e1") and len(sig) == 130
    payload = ENT.verify_token(tok)
    assert payload and payload["tier"] == "oracle"


def test_ed25519_tampered_body_rejected(ed25519_env):
    tok = ENT.mint_entitlement("oracle", "t", True)["token"]
    body, sig = tok.rsplit(".", 1)
    forged = body[:-2] + ("AA" if not body.endswith("AA") else "BB") + "." + sig
    assert ENT.verify_token(forged) is None


def test_ed25519_wrong_key_rejected(ed25519_env, monkeypatch):
    tok = ENT.mint_entitlement("oracle", "t", True)["token"]
    monkeypatch.setenv("AAE_ED25519_SEED", "02" * 32)
    assert ENT.verify_token(tok) is None


def test_dual_accept_hmac_while_ed25519_active(ed25519_env, monkeypatch):
    # Mint under HMAC first...
    monkeypatch.setenv("AAE_SIGN_ALGO", "hmac")
    hmac_tok = ENT.mint_entitlement("supporter", "t", True)["token"]
    # ...then switch the active algo: the old token must still verify.
    monkeypatch.setenv("AAE_SIGN_ALGO", "ed25519")
    assert ENT.verify_token(hmac_tok)["tier"] == "supporter"


def test_dual_accept_ed25519_while_hmac_active(ed25519_env, monkeypatch):
    ed_tok = ENT.mint_entitlement("supporter", "t", True)["token"]
    monkeypatch.setenv("AAE_SIGN_ALGO", "hmac")
    assert ENT.verify_token(ed_tok)["tier"] == "supporter"


def test_ed25519_expiry_still_enforced(ed25519_env, monkeypatch):
    tok = ENT.mint_entitlement("oracle", "t", True)["token"]
    real_time = time.time
    monkeypatch.setattr(ENT.time, "time", lambda: real_time() + 400 * 86400)
    assert ENT.verify_token(tok) is None


def test_ed25519_sig_cannot_pass_as_hmac_and_vice_versa(ed25519_env):
    """The e1 marker routes verification; a signature of one kind must never
    be accepted by the other verifier path."""
    tok = ENT.mint_entitlement("oracle", "t", True)["token"]
    body, sig = tok.rsplit(".", 1)
    # Strip the marker: 128 hex chars no longer match either path.
    assert ENT.verify_token(f"{body}.{sig[2:]}") is None
    # Prefix an HMAC sig with the marker: length check rejects it.
    hmac_sig = "a" * 64
    assert ENT.verify_token(f"{body}.e1{hmac_sig}") is None


def test_report_claims_ride_the_same_signer(ed25519_env):
    claim = ENT.mint_report_token("seed-xyz", "t", True)["token"]
    assert claim.rsplit(".", 1)[1].startswith("e1")
    assert ENT.verify_report_token(claim, "seed-xyz")["product"] == "personal_report"
    assert ENT.verify_report_token(claim, "other-seed") is None


def test_mint_without_seed_raises(monkeypatch):
    monkeypatch.setenv("AAE_SIGN_ALGO", "ed25519")
    monkeypatch.delenv("AAE_ED25519_SEED", raising=False)
    with pytest.raises(RuntimeError, match="AAE_ED25519_SEED"):
        ENT.mint_entitlement("oracle", "t", True)


def test_prod_boot_refused_without_seed(monkeypatch):
    monkeypatch.setenv("AAE_ENV", "production")
    monkeypatch.setenv("AAE_SIGN_ALGO", "ed25519")
    monkeypatch.delenv("AAE_ED25519_SEED", raising=False)
    monkeypatch.delenv("AAE_DEV_TOKEN", raising=False)
    # Give it a strong secret so we hit the ed25519 check, not the HMAC one.
    monkeypatch.setattr(ENT, "_SECRET_INSECURE", False)
    monkeypatch.setattr(ENT, "trust_mode_enabled", lambda: False)
    with pytest.raises(RuntimeError, match="ed25519"):
        ENT.assert_safe_boot()


def test_public_key_export(ed25519_env):
    pub = ENT.ed25519_public_key_hex()
    assert pub and len(pub) == 64
    # Independent check: verify a fresh signature with ONLY the public key —
    # exactly what an on-device client will do.
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
    tok = ENT.mint_entitlement("oracle", "t", True)["token"]
    body, sig = tok.rsplit(".", 1)
    Ed25519PublicKey.from_public_bytes(bytes.fromhex(pub)).verify(
        bytes.fromhex(sig[2:]), body.encode()
    )  # raises on failure


def test_invalid_seed_shapes_are_ignored(monkeypatch):
    for bad in ("zz" * 32, "01" * 16, "not-hex"):
        monkeypatch.setenv("AAE_ED25519_SEED", bad)
        assert ENT.ed25519_public_key_hex() is None
