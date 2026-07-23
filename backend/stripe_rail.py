"""
stripe_rail.py — Phase 4.2 Stripe payment rail.

The crypto rail (donate/verify) is kept; this adds cards/subscriptions. Built
with raw httpx (the repo's precedent — see plate_art.py / ai.py) rather than
the stripe SDK, so there is no new dependency and the webhook verifier is
unit-testable end to end (a valid signature is computed in the test).

Flow:
  1. POST /api/checkout  -> create a Stripe Checkout Session, return its URL.
  2. Stripe hosts payment; on success it redirects to success_url and (server
     to server) fires a webhook.
  3. POST /api/stripe/webhook  -> verify signature, then:
        checkout.session.completed        -> mint entitlement (relink_ref)
        charge.refunded / sub.deleted      -> revoke the entitlement
  4. GET /api/checkout/{id}  -> the browser, back on success_url, retrieves its
     token. Resilient to webhook lag: if the session is paid but not yet
     minted, it mints on read (idempotent — relink supersedes + re-issues).

Env:
  AAE_STRIPE_SECRET_KEY      sk_test_.../sk_live_...  (unset => rail 503s)
  AAE_STRIPE_WEBHOOK_SECRET  whsec_...                (unset => webhook 503s)
  AAE_STRIPE_MODE            payment | subscription   (default payment)
  AAE_STRIPE_SUPPORTER_USD   default 5
  AAE_STRIPE_ORACLE_USD      default 15

Interlock note: any AAE_STRIPE_* key marks the deployment public-facing, so
the fail-closed personal-mode interlock refuses to boot Edition P with these
set (by design — Stripe means Edition Q).
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
from typing import Optional

import httpx

_API = "https://api.stripe.com/v1"
_TIMEOUT = float(os.environ.get("AAE_STRIPE_TIMEOUT", "20"))
_TOLERANCE_S = 300  # webhook timestamp tolerance (Stripe's default)


def _secret_key() -> str:
    return os.environ.get("AAE_STRIPE_SECRET_KEY", "").strip()


def _webhook_secret() -> str:
    return os.environ.get("AAE_STRIPE_WEBHOOK_SECRET", "").strip()


def stripe_available() -> bool:
    return bool(_secret_key())


def webhook_configured() -> bool:
    return bool(_webhook_secret())


def _mode() -> str:
    m = os.environ.get("AAE_STRIPE_MODE", "payment").strip().lower()
    return m if m in ("payment", "subscription") else "payment"


def price_cents(tier: str) -> int:
    usd = {
        "supporter": float(os.environ.get("AAE_STRIPE_SUPPORTER_USD", "5")),
        "oracle": float(os.environ.get("AAE_STRIPE_ORACLE_USD", "15")),
    }.get(tier)
    if usd is None:
        raise ValueError(f"no Stripe price for tier {tier!r}")
    return int(round(usd * 100))


# ---- Checkout session -----------------------------------------------------
async def create_checkout_session(tier: str, success_url: str,
                                  cancel_url: str) -> dict:
    """Create a Checkout Session with an inline price (no pre-made products
    needed) and tier in metadata. Returns {id, url}."""
    if not stripe_available():
        raise RuntimeError("Stripe not configured")
    mode = _mode()
    cents = price_cents(tier)
    form = {
        "mode": mode,
        "success_url": success_url,
        "cancel_url": cancel_url,
        "metadata[tier]": tier,
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": "usd",
        "line_items[0][price_data][product_data][name]": f"Astra {tier} access",
        "line_items[0][price_data][unit_amount]": str(cents),
    }
    if mode == "subscription":
        form["line_items[0][price_data][recurring][interval]"] = "month"
    async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
        r = await c.post(f"{_API}/checkout/sessions", data=form,
                         auth=(_secret_key(), ""))
    r.raise_for_status()
    s = r.json()
    return {"id": s["id"], "url": s["url"]}


async def retrieve_session(session_id: str) -> dict:
    if not stripe_available():
        raise RuntimeError("Stripe not configured")
    async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
        r = await c.get(f"{_API}/checkout/sessions/{session_id}",
                        auth=(_secret_key(), ""))
    r.raise_for_status()
    return r.json()


# ---- Webhook signature (Stripe scheme, hand-rolled + testable) ------------
def verify_webhook(payload: bytes, sig_header: str,
                   secret: Optional[str] = None, now: Optional[int] = None) -> dict:
    """Verify a Stripe webhook per its documented scheme and return the parsed
    event. Raises ValueError on a malformed header, timestamp outside
    tolerance, or signature mismatch.

    Stripe-Signature: 't=<unix>,v1=<hexsig>[,v1=<hexsig>...]'
    signed_payload  = f'{t}.{raw_body}'
    expected        = HMAC_SHA256(secret, signed_payload)
    """
    secret = secret if secret is not None else _webhook_secret()
    if not secret:
        raise ValueError("webhook secret not configured")
    ts: Optional[str] = None
    sigs: list[str] = []
    for part in sig_header.split(","):
        if "=" not in part:
            continue
        k, v = part.split("=", 1)
        k = k.strip()
        if k == "t":
            ts = v.strip()
        elif k == "v1":
            sigs.append(v.strip())
    if ts is None or not sigs:
        raise ValueError("malformed Stripe-Signature header")
    try:
        ts_int = int(ts)
    except ValueError as e:
        raise ValueError("bad timestamp in signature") from e
    current = int(time.time()) if now is None else now
    if abs(current - ts_int) > _TOLERANCE_S:
        raise ValueError("webhook timestamp outside tolerance (possible replay)")
    signed = f"{ts}.".encode() + payload
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    if not any(hmac.compare_digest(expected, s) for s in sigs):
        raise ValueError("signature mismatch")
    try:
        return json.loads(payload.decode())
    except Exception as e:
        raise ValueError("event body is not JSON") from e


# ---- Event -> lifecycle mapping (pure, so it is unit-testable) ------------
def ref_for_session(session: dict) -> str:
    """Stable payment reference for a completed session — the payment_intent
    (one-time) or subscription id, falling back to the session id. Refund and
    subscription-cancel events carry the same value, so the entitlement can be
    found and revoked."""
    return str(session.get("payment_intent")
               or session.get("subscription")
               or session.get("id"))


def plan_from_event(event: dict) -> Optional[dict]:
    """Translate a Stripe event into a lifecycle action, or None to ignore.
    Returns {'action': 'mint'|'revoke', 'tier': str|None, 'ref': str}."""
    etype = event.get("type", "")
    obj = event.get("data", {}).get("object", {})
    if etype == "checkout.session.completed":
        if obj.get("payment_status") not in ("paid", "no_payment_required"):
            return None
        tier = (obj.get("metadata") or {}).get("tier")
        if tier not in ("supporter", "oracle"):
            return None
        return {"action": "mint", "tier": tier, "ref": ref_for_session(obj)}
    if etype in ("charge.refunded", "customer.subscription.deleted"):
        ref = str(obj.get("payment_intent") or obj.get("id"))
        return {"action": "revoke", "tier": None, "ref": ref}
    return None
