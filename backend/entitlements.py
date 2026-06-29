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
  • Otherwise the app runs in "trust" mode: any non-empty tx hash grants an
    entitlement flagged unverified (fine for local/dev or honour-system support).

Env:
    AAE_SECRET        HMAC secret (set a stable random value in production!)
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

_SECRET = os.environ.get("AAE_SECRET", "aae-dev-secret-change-me").encode()
_ENT_DAYS = int(os.environ.get("AAE_ENT_DAYS", "365"))
_ETH_RPC = os.environ.get("AAE_ETH_RPC", "").strip()
_MIN_WEI = int(os.environ.get("AAE_MIN_WEI", "0"))
_DEV_TOKEN = os.environ.get("AAE_DEV_TOKEN", "").strip()


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


def entitlement_status(token: Optional[str]) -> dict:
    # Dev bypass — oracle tier, never expires.
    if _DEV_TOKEN and token == _DEV_TOKEN:
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


async def verify_eth_payment(tx_hash: str) -> Tuple[bool, bool, str]:
    """
    Verify an EVM tx pays the treasury at least the minimum.
    Returns (ok, verified_on_chain, note). In trust mode (no RPC) any non-empty
    hash is accepted (ok=True) but flagged verified_on_chain=False.
    """
    tx_hash = tx_hash.strip()
    if not tx_hash:
        return False, False, "missing tx hash"
    if not _ETH_RPC:
        return True, False, "accepted in trust mode (no RPC configured)"

    info = TR.treasury_info()
    treasury_addr = next(
        (c["address"].lower() for c in info["chains"] if c["id"] == "evm"), None
    )
    if not treasury_addr:
        return False, False, "no EVM treasury configured"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(_ETH_RPC, json={
                "jsonrpc": "2.0", "id": 1, "method": "eth_getTransactionByHash",
                "params": [tx_hash],
            })
            r.raise_for_status()
            tx = r.json().get("result")
    except Exception as exc:
        return False, False, f"rpc error: {type(exc).__name__}"
    if not tx:
        return False, False, "transaction not found (still pending?)"
    to_addr = (tx.get("to") or "").lower()
    value_wei = int(tx.get("value", "0x0"), 16)
    if to_addr != treasury_addr:
        return False, False, "transaction recipient is not the treasury"
    if value_wei < _MIN_WEI:
        return False, False, "amount below minimum"
    return True, True, "verified on-chain"
