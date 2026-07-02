"""
entitlements.py
===============
The "open paywall" unlock layer. Premium features are never hard-walled; a
supporter who contributes any amount receives a signed entitlement token that
unlocks the deep features for a generous period.

Token = base64(payload).hex(HMAC-SHA256(payload, secret)). Stateless, so no DB
is required; the client stores it in localStorage and sends it with requests.

On-chain verification is pluggable:
  • If AAE_ETH_RPC is set, a tx hash is checked against the treasury address and
    a minimum value — real verification.
  • Otherwise "trust" mode may accept a non-empty tx hash unverified — but ONLY
    when explicitly enabled (AAE_TRUST_MODE) in a non-production environment
    (AAE_ENV). It fails closed everywhere else, and the process refuses to boot
    in production with trust mode enabled or a default secret (assert_safe_boot).

Env:
    AAE_SECRET        HMAC secret (REQUIRED in production; boot refused otherwise)
    AAE_ENV           deployment environment; recognized non-prod values:
                      development/dev/local/test/testing. Anything unset or
                      unrecognized is treated as production (fail closed).
    AAE_TRUST_MODE    "1"/"true"/"yes"/"on" to allow unverified acceptance — takes
                      effect only in a non-production environment.
    AAE_ENT_DAYS      entitlement lifetime in days (default 365)
    AAE_ETH_RPC       optional EVM JSON-RPC URL for real verification
    AAE_MIN_WEI       minimum accepted value in wei (default 0 = any)
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from typing import Optional, Tuple

import httpx

import treasury as TR

_DEFAULT_SECRET = "aae-dev-secret-change-me"
_SECRET_RAW = os.environ.get("AAE_SECRET", _DEFAULT_SECRET)
_SECRET = _SECRET_RAW.encode()
# Captured at import: the signing secret must be stable for the process lifetime.
# "Insecure" = the built-in default, or empty/blank (an empty HMAC key is weak
# and must not be used to sign entitlement tokens in production).
_SECRET_INSECURE = (_SECRET_RAW == _DEFAULT_SECRET) or (not _SECRET_RAW.strip())
_ENT_DAYS = int(os.environ.get("AAE_ENT_DAYS", "365"))
_ETH_RPC = os.environ.get("AAE_ETH_RPC", "").strip()
_MIN_WEI = int(os.environ.get("AAE_MIN_WEI", "0"))
_DEV_TOKEN = os.environ.get("AAE_DEV_TOKEN", "").strip()


# --------------------------------------------------------------------------- #
# Environment & trust-mode gating (fail closed)
# --------------------------------------------------------------------------- #
# Trust mode accepts a contribution's tx hash WITHOUT on-chain verification. It
# is a local/dev convenience and must never grant entitlements in production.
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


# --------------------------------------------------------------------------- #
# Token mint / verify
# --------------------------------------------------------------------------- #


def _sign(payload: dict) -> str:
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    body = base64.urlsafe_b64encode(raw).decode().rstrip("=")
    sig = hmac.new(_SECRET, body.encode(), hashlib.sha256).hexdigest()
    return f"{body}.{sig}"


def mint_entitlement(tier: str, ref: str, verified: bool) -> dict:
    now = int(time.time())
    payload = {
        "tier": tier,
        "ref": ref,
        "verified": verified,
        "iat": now,
        "exp": now + _ENT_DAYS * 86400,
    }
    return {"token": _sign(payload), **payload}


def verify_token(token: Optional[str]) -> Optional[dict]:
    """Return the decoded payload if the token is valid & unexpired, else None."""
    if not token or "." not in token:
        return None
    body, sig = token.rsplit(".", 1)
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


def entitlement_status(token: Optional[str]) -> dict:
    # Dev bypass — oracle tier, never expires.
    if check_dev_token(token):
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
# On-chain verification (optional)
# --------------------------------------------------------------------------- #


async def verify_eth_payment_details(tx_hash: str) -> Tuple[bool, bool, str, int]:
    """
    Verify an EVM tx pays the treasury at least the minimum.
    Returns (ok, verified_on_chain, note, value_wei). In trust mode (no RPC) any
    non-empty hash is accepted (ok=True) but flagged verified_on_chain=False and
    carries value_wei=0 — trust mode can therefore never satisfy an on-chain
    value threshold (see paid_tier).
    """
    tx_hash = tx_hash.strip()
    if not tx_hash:
        return False, False, "missing tx hash", 0
    if not _ETH_RPC:
        # No on-chain verification configured. Accept ONLY in explicit dev trust
        # mode; otherwise fail closed and deny the entitlement.
        if trust_mode_allowed():
            return True, False, "accepted in trust mode (dev only; unverified)", 0
        return False, False, (
            "on-chain verification unavailable and trust mode is disabled — set "
            "AAE_ETH_RPC to verify, or enable AAE_TRUST_MODE in a non-production "
            "environment"
        ), 0

    info = TR.treasury_info()
    treasury_addr = next(
        (c["address"].lower() for c in info["chains"] if c["id"] == "evm"), None
    )
    if not treasury_addr:
        return False, False, "no EVM treasury configured", 0
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(_ETH_RPC, json={
                "jsonrpc": "2.0", "id": 1, "method": "eth_getTransactionByHash",
                "params": [tx_hash],
            })
            r.raise_for_status()
            tx = r.json().get("result")
    except Exception as exc:
        return False, False, f"rpc error: {type(exc).__name__}", 0
    if not tx:
        return False, False, "transaction not found (still pending?)", 0
    to_addr = (tx.get("to") or "").lower()
    value_wei = int(tx.get("value", "0x0"), 16)
    if to_addr != treasury_addr:
        return False, False, "transaction recipient is not the treasury", 0
    if value_wei < _MIN_WEI:
        return False, False, "amount below minimum", 0
    return True, True, "verified on-chain", value_wei


async def verify_eth_payment(tx_hash: str) -> Tuple[bool, bool, str]:
    """Back-compat 3-tuple wrapper over verify_eth_payment_details."""
    ok, verified, note, _ = await verify_eth_payment_details(tx_hash)
    return ok, verified, note


# Oracle tier is minted only for on-chain-VERIFIED contributions at/above an
# explicitly configured threshold. Unset/zero threshold disables oracle minting
# entirely (fail closed) — trust-mode grants carry value 0 and can never reach it.
_ORACLE_MIN_WEI = int(os.environ.get("AAE_ORACLE_MIN_WEI", "0"))


def paid_tier(verified: bool, value_wei: int) -> str:
    """Tier for an accepted contribution: 'oracle' only when the payment was
    verified on-chain AND AAE_ORACLE_MIN_WEI is configured (>0) AND the value
    meets it; 'supporter' in every other case."""
    if verified and _ORACLE_MIN_WEI > 0 and value_wei >= _ORACLE_MIN_WEI:
        return "oracle"
    return "supporter"


def accept_offchain_payment(tx_hash: str) -> Tuple[bool, bool, str]:
    """Honour-system acceptance for chains with no on-chain check wired up here
    (e.g. non-EVM). Gated behind dev trust mode — fails closed in production."""
    tx_hash = (tx_hash or "").strip()
    if not tx_hash:
        return False, False, "missing tx hash"
    if trust_mode_allowed():
        return True, False, "accepted in trust mode (dev only; unverified)"
    return False, False, "off-chain verification unavailable and trust mode is disabled"


# --------------------------------------------------------------------------- #
# PDF-2 — Personal Report purchase (separate product beyond oracle tier)
# --------------------------------------------------------------------------- #
# The deluxe compiled edition is a SEPARATE purchase: an oracle-tier
# entitlement alone must not unlock it. A purchase mints a report token BOUND
# to exactly one Oracle session seed — a stateless one-shot claim. Recompiles
# of that same session stay allowed (same seed, same product); any other
# session requires a new purchase. Same fail-closed posture as oracle-tier
# minting: on-chain purchases qualify only above an explicitly configured
# threshold, and unverified acceptance exists only in dev trust mode (which
# assert_safe_boot makes impossible in production).
#
# Env:
#     AAE_REPORT_MIN_WEI      product price in wei; unset/0 DISABLES on-chain
#                             purchases entirely (fail closed)
#     AAE_REPORT_TOKEN_DAYS   claim lifetime in days (default 30)

_REPORT_PRODUCT = "personal_report"
_REPORT_MIN_WEI = int(os.environ.get("AAE_REPORT_MIN_WEI", "0"))
_REPORT_TOKEN_DAYS = int(os.environ.get("AAE_REPORT_TOKEN_DAYS", "30"))


def report_purchase_allowed(verified: bool, value_wei: int) -> Tuple[bool, str]:
    """Fail-closed purchase policy for the deluxe edition.

    A payment that arrives here already passed verify_eth_payment_details /
    accept_offchain_payment, so `verified=False` can only mean dev trust mode
    — allowed (unverified, dev only). A verified on-chain payment qualifies
    only when AAE_REPORT_MIN_WEI is explicitly configured (>0) and met.
    """
    if verified:
        if _REPORT_MIN_WEI <= 0:
            return False, (
                "personal-report purchases are not enabled — the operator must "
                "set AAE_REPORT_MIN_WEI to the product price"
            )
        if value_wei < _REPORT_MIN_WEI:
            return False, "amount below the personal-report price"
        return True, "verified on-chain"
    return True, "accepted in trust mode (dev only; unverified)"


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
