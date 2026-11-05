"""
entitlements.py
===============
The "open paywall" unlock layer. Premium features are never hard-walled; a
supporter who contributes any amount receives a signed entitlement token that
unlocks the deep features for a generous period.

Token = base64(payload).signature — stateless, so no DB is required; the
client stores it in localStorage and sends it with requests. Two signature
schemes coexist (MOBILE_ROADMAP §4.2 — dual-issue during the mobile
migration):
  • HMAC-SHA256 hexdigest (64 hex chars) — the default; verification requires
    the server secret.
  • Ed25519, marked with an "e1" prefix (e1 + 128 hex chars) — enabled with
    AAE_SIGN_ALGO=ed25519; anything holding the PUBLIC key can verify, which
    is what lets a device check tiers offline without shipping a secret.
verify_token() accepts BOTH kinds whenever the respective key material is
configured, so flipping AAE_SIGN_ALGO never strands outstanding tokens.

Payments arrive only through Stripe (stripe_rail.py). The crypto rail was
removed on 2026-11-05; tokens it minted earlier still verify until they expire.

Env:
    AAE_SECRET        HMAC secret (REQUIRED in production; boot refused otherwise)
    AAE_ENV           deployment environment; recognized non-prod values:
                      development/dev/local/test/testing. Anything unset or
                      unrecognized is treated as production (fail closed).
    AAE_TRUST_MODE    "1"/"true"/"yes"/"on" to allow unverified acceptance — takes
                      effect only in a non-production environment.
    AAE_ENT_DAYS      entitlement lifetime in days (default 365)
    AAE_SIGN_ALGO     "hmac" (default) or "ed25519" — which scheme SIGNS new
                      tokens; verification always accepts both when possible
    AAE_ED25519_SEED  64 hex chars (32-byte private seed) — required whenever
                      AAE_SIGN_ALGO=ed25519 (boot refused in production
                      otherwise); generate with tools/gen_ed25519_key.py
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import secrets
import time
from typing import Optional



_DEFAULT_SECRET = "aae-dev-secret-change-me"
_SECRET_RAW = os.environ.get("AAE_SECRET", _DEFAULT_SECRET)
_SECRET = _SECRET_RAW.encode()
# Captured at import: the signing secret must be stable for the process lifetime.
# "Insecure" = the built-in default, or empty/blank (an empty HMAC key is weak
# and must not be used to sign entitlement tokens in production).
_SECRET_INSECURE = (_SECRET_RAW == _DEFAULT_SECRET) or (not _SECRET_RAW.strip())


def _i(env: str, default: int) -> int:
    """Read an integer env var, tolerating SET-BUT-EMPTY.

    os.environ.get(k, default) only falls back when the key is ABSENT. A key
    present with an empty value returns "", and int("") raises — at import
    time, so the whole app fails to boot. Compose passes every optional var as
    `${VAR:-}`, which SETS it to empty rather than leaving it unset, so simply
    listing one of these in docker-compose.yml is enough to crash-loop the
    backend. That is not hypothetical: AAE_STRIPE_TIMEOUT did exactly this once
    (see stripe_rail._f), and every var below was added to compose on
    2026-08-15, which would have repeated it.
    """
    try:
        return int(os.environ.get(env, default) or default)
    except (ValueError, TypeError):
        return int(default)


_ENT_DAYS = _i("AAE_ENT_DAYS", 365)
_DEV_TOKEN = os.environ.get("AAE_DEV_TOKEN", "").strip()


# --------------------------------------------------------------------------- #
# Environment & trust-mode gating (fail closed)
# --------------------------------------------------------------------------- #
# Trust mode once accepted a crypto tx hash WITHOUT on-chain verification. The
# crypto rail is gone (2026-11-05), so it grants nothing now; the boot refusal
# below stays so a stale AAE_TRUST_MODE in a production env still fails loudly.
# Rule: trust mode is allowed only when (a) explicitly enabled AND (b) the
# environment is a recognized non-production value. Anything unset or malformed
# fails closed — treated as production, trust mode denied.
_NONPROD_ENVS = {"development", "dev", "local", "test", "testing"}
_TRUTHY = {"1", "true", "yes", "on"}


def is_production() -> bool:
    """Fail-closed: only an explicit, recognized non-production AAE_ENV is non-prod.

    An unset or unrecognized AAE_ENV is treated as production.
    """
    return os.environ.get("AAE_ENV", "").strip().lower() not in _NONPROD_ENVS


def personal_mode() -> bool:
    """Edition P — the operator's own observatory, everything unlocked.

    When AAE_PERSONAL_MODE is truthy the instance grants oracle tier to every
    request with no tokens, no purchase gates, no rate limits and no
    telemetry. assert_safe_boot() refuses to start in this mode if any
    public-facing signal is configured (production env, treasury, payment
    rails), so the unrestricted build can never accidentally be the public
    one. Read per call, like trust mode, so tests and reconfiguration don't
    fight module state.
    """
    return os.environ.get("AAE_PERSONAL_MODE", "").strip().lower() in _TRUTHY


# Env vars whose mere presence marks this deployment as public-facing. The
# personal-mode interlock refuses to boot when any is set: Edition P must be
# unreachable by paying strangers by construction, not by discipline.
# Stripe vars are matched by prefix so a newly added key can never drift out
# of the interlock's coverage. The ETH/treasury names belong to the removed
# crypto rail; they stay here because an old .env may still set them, and any
# leftover payment config is a reason to refuse a personal boot.
_PUBLIC_SIGNALS = ("AAE_ETH_RPC",)
_PUBLIC_SIGNAL_PREFIXES = ("AAE_TREASURY_", "AAE_STRIPE_")
_PUBLIC_THRESHOLDS = ("AAE_ORACLE_MIN_WEI", "AAE_REPORT_MIN_WEI")


def _personal_mode_conflicts() -> list[str]:
    """Public-facing signals present while personal mode is on (empty = safe)."""
    conflicts = [
        "AAE_ENV is production (personal mode is a private, non-production build)"
    ] if is_production() else []
    conflicts += [
        f"{name} is set" for name in _PUBLIC_SIGNALS
        if os.environ.get(name, "").strip()
    ]
    conflicts += [
        f"{name} is set" for name in sorted(os.environ)
        if name.startswith(_PUBLIC_SIGNAL_PREFIXES)
        and os.environ.get(name, "").strip()
    ]
    for name in _PUBLIC_THRESHOLDS:
        raw = os.environ.get(name, "").strip()
        try:
            if raw and int(raw) > 0:
                conflicts.append(f"{name} is configured")
        except ValueError:
            conflicts.append(f"{name} is malformed")
    return conflicts


def trust_mode_enabled() -> bool:
    """Whether the operator explicitly turned trust mode on (AAE_TRUST_MODE)."""
    return os.environ.get("AAE_TRUST_MODE", "").strip().lower() in _TRUTHY


def trust_mode_allowed() -> bool:
    """Trust mode is allowed only when explicitly enabled AND non-production."""
    return trust_mode_enabled() and not is_production()


def assert_safe_boot() -> None:
    """Refuse to boot on an insecure production configuration. Fail closed.

    Called at process startup (main.py import time). Raises RuntimeError — which
    prevents the ASGI app from loading — if the process is in production with
    either trust mode enabled or the built-in default HMAC secret still in use.
    """
    if personal_mode():
        conflicts = _personal_mode_conflicts()
        if conflicts:
            raise RuntimeError(
                "Refusing to boot: AAE_PERSONAL_MODE is on but this "
                "configuration looks public-facing — " + "; ".join(conflicts) +
                ". Edition P (the unrestricted personal build) must never "
                "serve the public: unset AAE_PERSONAL_MODE for a public "
                "deployment, or remove the conflicting variables for a "
                "personal one."
            )
        return  # a clean personal boot needs no further production checks
    if not is_production():
        return
    if trust_mode_enabled():
        raise RuntimeError(
            "Refusing to boot: AAE_TRUST_MODE is enabled in a production "
            "environment. Trust mode grants entitlements without on-chain "
            "verification and must never run in production. Unset AAE_TRUST_MODE, "
            "or set AAE_ENV to a non-production value (development/test/local)."
        )
    if _SECRET_INSECURE:
        raise RuntimeError(
            "Refusing to boot: AAE_SECRET is unset, blank, or the built-in dev "
            "default in production. Entitlement tokens would be forgeable. Set a "
            "strong random AAE_SECRET."
        )
    if os.environ.get("AAE_DEV_TOKEN", "").strip():
        raise RuntimeError(
            "Refusing to boot: AAE_DEV_TOKEN is set in a production "
            "environment. The dev token is a full oracle-tier bypass (free "
            "personal reports included) — a leak grants everything. Unset it "
            "in production; mint real entitlements instead."
        )
    if _sign_algo() == "ed25519":
        try:
            configured = _ed25519_private() is not None
        except Exception:
            configured = False
        if not configured:
            raise RuntimeError(
                "Refusing to boot: AAE_SIGN_ALGO=ed25519 in production but "
                "AAE_ED25519_SEED is unset/invalid (need 64 hex chars) or the "
                "cryptography package is unavailable. Tokens could not be "
                "minted. Generate a keypair with tools/gen_ed25519_key.py."
            )
    cors = [o.strip() for o in os.environ.get("AAE_CORS", "*").split(",") if o.strip()]
    if not cors or "*" in cors:
        raise RuntimeError(
            "Refusing to boot: AAE_CORS must pin the public origin(s) in "
            "production (e.g. AAE_CORS=https://astra.example — comma-separated, "
            "no '*'). The wildcard default would let any website drive this "
            "API from its visitors' browsers."
        )


# --------------------------------------------------------------------------- #
# Token mint / verify
# --------------------------------------------------------------------------- #
# Ed25519 dual-issue (MOBILE_ROADMAP §4.2 / §7.5 spike). The signature scheme
# is chosen per-mint by AAE_SIGN_ALGO; verification is scheme-detecting via
# the "e1" marker (an HMAC digest is exactly 64 hex chars, an Ed25519 sig is
# e1 + 128 hex chars — the marker makes the distinction explicit rather than
# inferred). Key material is read per call, not at import, so tests and key
# rotation don't fight module state.

_ED25519_MARK = "e1"


def _sign_algo() -> str:
    return os.environ.get("AAE_SIGN_ALGO", "hmac").strip().lower()


def _ed25519_private():
    """The configured Ed25519 private key, or None if unset/invalid.
    Raises only if the cryptography package itself is missing."""
    raw = os.environ.get("AAE_ED25519_SEED", "").strip()
    if not raw:
        return None
    try:
        seed = bytes.fromhex(raw)
    except ValueError:
        return None
    if len(seed) != 32:
        return None
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    return Ed25519PrivateKey.from_private_bytes(seed)


def ed25519_public_key_hex() -> Optional[str]:
    """Hex public key for embedding in clients (verify-only, roadmap §4.2),
    or None when no valid seed is configured."""
    from cryptography.hazmat.primitives import serialization
    key = _ed25519_private()
    if key is None:
        return None
    return key.public_key().public_bytes(
        serialization.Encoding.Raw, serialization.PublicFormat.Raw
    ).hex()


def _sign(payload: dict) -> str:
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    body = base64.urlsafe_b64encode(raw).decode().rstrip("=")
    if _sign_algo() == "ed25519":
        key = _ed25519_private()
        if key is None:
            raise RuntimeError(
                "AAE_SIGN_ALGO=ed25519 but AAE_ED25519_SEED is unset or invalid "
                "(need 64 hex chars — generate with tools/gen_ed25519_key.py)"
            )
        sig = _ED25519_MARK + key.sign(body.encode()).hex()
    else:
        sig = hmac.new(_SECRET, body.encode(), hashlib.sha256).hexdigest()
    return f"{body}.{sig}"


def mint_entitlement(tier: str, ref: str, verified: bool) -> dict:
    """Mint a signed tier token.

    Phase 4.1: the payload carries a `jti` (token id) and the mint is recorded
    on the entitlement ledger so the token can later be revoked (a refund must
    kill it before its exp), renewed (superseded by a fresh exp), or re-linked
    on a new device from the payment ref. Recording is best-effort BY DESIGN
    (see receipts.py posture note): the signature is what grants access, so a
    ledger hiccup must never block a paying user's mint — an unrecorded token
    simply cannot be individually revoked (secret rotation remains the blunt
    fallback)."""
    now = int(time.time())
    payload = {
        "tier": tier,
        "ref": ref,
        "verified": verified,
        "iat": now,
        "exp": now + _ENT_DAYS * 86400,
        # Phase 4.1: a token id makes the stateless token individually
        # revocable/renewable via the entitlement ledger.
        "jti": secrets.token_hex(8),
    }
    try:
        import receipts as _rcpt
        _rcpt.ent_record(payload)
    except Exception:  # best-effort: never block a mint on ledger bookkeeping
        logging.getLogger("aae").debug("entitlement ledger record skipped", exc_info=True)
    return {"token": _sign(payload), **payload}


def renew_entitlement(token: Optional[str]) -> Optional[dict]:
    """Phase 4.1 renewal. Given a still-valid token, mint a fresh one with the
    same tier/ref and a new expiry, and mark the old id superseded. Returns
    the new token dict, or None when the presented token is invalid/expired/
    revoked (renew a lapsed token by re-presenting payment via relink instead).
    The client swaps to the returned token; the old one stops verifying."""
    payload = verify_token(token)
    if payload is None:
        return None
    fresh = mint_entitlement(payload["tier"], payload.get("ref", ""),
                             bool(payload.get("verified")))
    old = payload.get("jti")
    if old:
        try:
            import receipts as _rcpt
            _rcpt.ent_mark_renewed(old)
        except Exception:
            logging.getLogger("aae").debug("renew supersede skipped", exc_info=True)
    return fresh


def relink_ref(ref: str, tier: str, verified: bool) -> dict:
    """Phase 4.1 device re-link (rail-agnostic core). Supersede any active
    token for this payment reference, then mint a fresh one — so the
    entitlement MOVES to the requesting device and other devices' tokens for
    the same payment stop verifying. The CALLER must have re-proved the
    payment (a Stripe session or reference) before calling this; the ledger
    lookup alone is not proof."""
    try:
        import receipts as _rcpt
        prior = _rcpt.ent_find_active_ref(ref)
        if prior and prior.get("jti"):
            _rcpt.ent_mark_renewed(prior["jti"])
    except Exception:
        logging.getLogger("aae").debug("relink supersede skipped", exc_info=True)
    return mint_entitlement(tier, ref=ref, verified=verified)


_TIER_RANK = {"supporter": 1, "oracle": 2}


def ensure_ref(ref: str, tier: str, verified: bool) -> Optional[dict]:
    """Make sure a payment reference has a live entitlement of at least `tier`,
    WITHOUT superseding one that already does. Returns the freshly minted token
    dict, or None when an adequate entitlement was already active.

    This is the Stripe webhook's verb, and it is deliberately not `relink_ref`.
    A card purchase reaches the server twice, concurrently and in no fixed
    order: the browser's return (GET /api/checkout/{id}, which relinks and
    hands the key to the customer) and `checkout.session.completed`. When the
    webhook relinked too and arrived second — the usual order — it superseded
    the key the browser had just stored, so the web page lost its unlock on the
    next launch and every unlock link handed to the APK carried a dead key. The
    webhook is a backstop that records the purchase for restore and the billing
    portal; it must never take a key away from the customer who paid.

    An unreadable ledger reads as "nothing active" and mints — the same
    fail-open posture as `mint_entitlement`: a paying customer's purchase is
    recorded rather than dropped, and nobody's key is superseded by a mint."""
    try:
        import receipts as _rcpt
        prior = _rcpt.ent_find_active_ref(ref)
    except Exception:
        prior = None
    if prior and _TIER_RANK.get(str(prior.get("tier")), 0) >= _TIER_RANK.get(tier, 0):
        return None
    if prior:
        # Below what Stripe says was bought — move up, never leave them short.
        return relink_ref(ref, tier, verified)
    return mint_entitlement(tier, ref=ref, verified=verified)


def verify_token(token: Optional[str]) -> Optional[dict]:
    """Return the decoded payload if the token is valid & unexpired, else None.

    Accepts both signature schemes regardless of the active AAE_SIGN_ALGO
    (dual-accept), so a migration in either direction never strands
    outstanding tokens.
    """
    if not token or "." not in token:
        return None
    body, sig = token.rsplit(".", 1)
    if sig.startswith(_ED25519_MARK) and len(sig) == len(_ED25519_MARK) + 128:
        try:
            key = _ed25519_private()
            if key is None:
                return None
            from cryptography.exceptions import InvalidSignature
            try:
                key.public_key().verify(bytes.fromhex(sig[len(_ED25519_MARK):]), body.encode())
            except (InvalidSignature, ValueError):
                return None
        except ImportError:
            return None
    else:
        expected = hmac.new(_SECRET, body.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return None
    try:
        pad = "=" * (-len(body) % 4)
        payload = json.loads(base64.urlsafe_b64decode(body + pad))
    except Exception:
        return None
    if int(payload.get("exp", 0)) < int(time.time()):
        return None
    # Phase 4.1 revocation check. A revoked or superseded token is rejected
    # even though its signature is valid and it is unexpired. Fails OPEN: an
    # unreachable ledger (status None) or a pre-ledger token (no jti / unknown
    # id) is honored on its signature alone — locking out every paying user
    # because a local SQLite file hiccuped would invert the harm (see the
    # posture note in receipts.py). Revocation is defense-in-depth, not the
    # primary gate.
    jti = payload.get("jti")
    if jti:
        try:
            import receipts as _rcpt
            if _rcpt.ent_status(jti) in ("revoked", "renewed"):
                return None
        except Exception:
            logging.getLogger("aae").debug("revocation check skipped", exc_info=True)
    return payload


# Which features the supporter tier unlocks. The frontend mirrors this list.
PREMIUM_FEATURES = [
    "deep_reading",      # in-depth 9B / cloud synthesis
    "premium_voice",     # ElevenLabs TTS
    "daily_horoscope",
    "save_charts",
    "pdf_poster",
    "synastry",
]


_PAID_TIERS = {"supporter", "oracle"}


def check_dev_token(token: Optional[str]) -> bool:
    """Constant-time comparison against the configured dev/admin token."""
    return bool(_DEV_TOKEN) and token is not None and hmac.compare_digest(token, _DEV_TOKEN)


def is_operator(token: Optional[str]) -> bool:
    """Whether this request is the instance's own operator: every request in
    personal mode, or the bearer of the dev token. Gates the operator-only
    surfaces (admin stats, deluxe purchase exemption)."""
    return personal_mode() or check_dev_token(token)


def entitlement_status(token: Optional[str]) -> dict:
    # Edition P — the whole instance is the operator's; everything unlocked.
    # Dev bypass — oracle tier, never expires.
    if personal_mode() or check_dev_token(token):
        return {
            "supporter": True,
            "tier": "oracle",
            "verified": True,
            "exp": None,
            "premium_features": PREMIUM_FEATURES,
        }
    payload = verify_token(token)
    tier = payload.get("tier") if payload else "free"
    return {
        "supporter": tier in _PAID_TIERS,
        "tier": tier,
        "verified": bool(payload and payload.get("verified")),
        "exp": payload.get("exp") if payload else None,
        "premium_features": PREMIUM_FEATURES,
    }


# --------------------------------------------------------------------------- #
# PDF-2 — Personal Report purchase (separate product beyond oracle tier)
# --------------------------------------------------------------------------- #
# The deluxe compiled edition is a SEPARATE purchase: an oracle-tier
# entitlement alone must not unlock it. A purchase mints a report token BOUND
# to exactly one Oracle session seed — a stateless one-shot claim. Recompiles
# of that same session stay allowed (same seed, same product); any other
# session requires a new purchase. Purchases arrive only through Stripe
# (/api/personal-report/checkout).
#
# Env:
#     AAE_REPORT_TOKEN_DAYS   claim lifetime in days (default 30)

_REPORT_PRODUCT = "personal_report"
_REPORT_TOKEN_DAYS = _i("AAE_REPORT_TOKEN_DAYS", 30)


def mint_report_token(seed: str, ref: str, verified: bool) -> dict:
    """Mint the one-shot claim for one Oracle session's deluxe edition."""
    now = int(time.time())
    payload = {
        "product": _REPORT_PRODUCT,
        "seed": seed,
        "ref": ref,
        "verified": verified,
        "iat": now,
        "exp": now + _REPORT_TOKEN_DAYS * 86400,
    }
    return {"token": _sign(payload), **payload}


def verify_report_token(token: Optional[str], seed: str) -> Optional[dict]:
    """Payload if `token` is a valid, unexpired report claim bound to `seed`,
    else None. A tier entitlement token never passes (no `product` field), and
    a claim for a different Oracle session never passes (seed mismatch)."""
    payload = verify_token(token)
    if not payload or payload.get("product") != _REPORT_PRODUCT:
        return None
    if not hmac.compare_digest(str(payload.get("seed", "")), seed):
        return None
    return payload
