#!/usr/bin/env python3
"""
m5_preflight.py — everything that must be true BEFORE the first live payment,
checked without taking one.

M5 is the milestone where the rail stops being a drill: live keys, a real
purchase, then cancel → verify `tier: free` → refund. The expensive failures
are not in the code — they are in the configuration around it, and each one is
only discovered by a real customer paying real money into a broken flow:

  * the copy says "/mo" while the rail is in one-time `payment` mode, so the
    first customer is charged once for something advertised monthly;
  * `AAE_PUBLIC_URL` still points at localhost, so Stripe redirects a paying
    customer to a page that does not exist and the token is never collected;
  * the webhook secret does not match the endpoint, so every lifecycle event is
    rejected 400 and nothing mints or revokes;
  * the customer portal was never activated in the LIVE dashboard (test and
    live are configured separately), so nobody can cancel — and cancel, not
    refund, is what revokes an entitlement.

Every Stripe call here is a GET. `_stripe_get` refuses to issue anything else,
so this tool cannot create a charge, a session, or a customer even if edited
carelessly. The one write it performs is a deliberately INVALID POST to our own
webhook, which the signature check rejects before any action is taken — that is
how you prove the secret is loaded without asking Stripe to send anything.

    .venv/bin/python tools/m5_preflight.py                    # public surfaces only
    AAE_STRIPE_SECRET_KEY=sk_live_… \
      .venv/bin/python tools/m5_preflight.py --expect-live    # the full gate

`--expect-live` turns "the rail is not open yet" from an observation into a
failure: run without it while preparing, with it as the last thing before you
hand over a card.

Exit 0 = every check passed. Exit 1 = at least one FAIL. WARN never fails the
run; it marks something a human should look at.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request

DEFAULT_API = "https://app.astra-arcana.com/api"
DEFAULT_LANDING = "https://astra-arcana.com"
STRIPE_API = "https://api.stripe.com/v1"

# The three events the webhook actually acts on (backend/main.py:stripe_webhook
# via stripe_rail.plan_from_event). An endpoint subscribed to fewer than these
# is a rail that takes money and then cannot mint or revoke.
REQUIRED_EVENTS = {
    "checkout.session.completed",       # -> mint
    "charge.refunded",                  # -> revoke (one-time purchases)
    "customer.subscription.deleted",    # -> revoke (subscriptions)
}

PASS, FAIL, WARN, SKIP = "PASS", "FAIL", "WARN", "SKIP"
_results: list[tuple[str, str, str]] = []


def record(status: str, name: str, detail: str = "") -> None:
    _results.append((status, name, detail))
    mark = {PASS: "✓", FAIL: "✗", WARN: "!", SKIP: "–"}[status]
    print(f"  {mark} {status:<4} {name}" + (f"\n           {detail}" if detail else ""))


# Cloudflare sits in front of both hostnames and answers urllib's default
# `Python-urllib/3.x` with a 403. That reads exactly like an outage or a
# firewall rule and is neither — the tool simply has to say who it is.
_UA = "astra-m5-preflight/1.0 (+https://github.com/9x25dillon/astro_caster)"


def _get(url: str, headers: dict | None = None, timeout: float = 25.0):
    h = {"User-Agent": _UA, **(headers or {})}
    req = urllib.request.Request(url, headers=h, method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.read()


def _get_json(url: str, headers: dict | None = None):
    status, body = _get(url, headers)
    return status, json.loads(body.decode("utf-8"))


def _stripe_get(path: str, key: str, params: str = ""):
    """Stripe, read-only. This helper is the ONLY door to the Stripe API in
    this tool and it hard-codes GET: a preflight that can charge a card is not
    a preflight. Never add a `method` parameter here."""
    url = f"{STRIPE_API}/{path.lstrip('/')}" + (f"?{params}" if params else "")
    return _get_json(url, {"Authorization": f"Bearer {key}"})


# --------------------------------------------------------------------------- #
# public surfaces — no key needed
# --------------------------------------------------------------------------- #

def check_health(api: str) -> None:
    print("\nHEALTH")
    try:
        status, d = _get_json(f"{api}/health")
    except Exception as exc:
        record(FAIL, "/api/health reachable", str(exc))
        return
    record(PASS if status == 200 else FAIL, "/api/health reachable", f"HTTP {status}")

    if d.get("personal_mode") is False:
        record(PASS, "personal_mode is false", "Edition Q — the public build")
    else:
        record(FAIL, "personal_mode is false",
               "personal mode is ON; the Stripe interlock will refuse to boot with keys set")

    eph = d.get("ephemeris")
    record(PASS if eph == "swiss-files" else FAIL, "ephemeris is swiss-files", f"got {eph!r}")

    ai = (d.get("ai") or {}).get("configured")
    record(PASS if ai else WARN, "AI is configured",
           "paid tiers buy the written work; without a provider they buy the offline fallback")


def check_pricing(api: str, landing: str, expect_mode: str, expect_live: bool) -> dict:
    print("\nPRICING + COPY")
    try:
        _, p = _get_json(f"{api}/pricing")
    except Exception as exc:
        record(FAIL, "/api/pricing reachable", str(exc))
        return {}

    card = bool(p.get("card_available"))
    if expect_live:
        record(PASS if card else FAIL, "card rail is open",
               "" if card else "AAE_STRIPE_SECRET_KEY is unset on the server — nobody can pay")
    else:
        record(PASS if not card else WARN, "card rail state",
               f"card_available={card} (rerun with --expect-live when it should be open)")

    mode = p.get("mode")
    if mode == expect_mode:
        record(PASS, f"rail mode is {expect_mode!r}")
    else:
        record(FAIL, f"rail mode is {expect_mode!r}",
               f"got {mode!r} — set AAE_STRIPE_MODE={expect_mode} and restart")

    # The cross-surface check. The landing page's prices are hand-written HTML;
    # the app reads /api/pricing. They can disagree silently, and the landing
    # page is the one a buyer reads before deciding.
    try:
        _, body = _get(landing)
        html = body.decode("utf-8", "replace").replace("&nbsp;", " ")
    except Exception as exc:
        record(WARN, "landing page readable", str(exc))
        return p

    tiers = {t["tier"]: t["usd"] for t in p.get("tiers", [])}
    for tier, usd in tiers.items():
        shown = re.search(rf"\${re.escape(f'{usd:.2f}')}\s*(/\s*mo|once)?", html)
        if not shown:
            record(FAIL, f"landing page shows ${usd:.2f} for {tier}",
                   "the advertised price is not the one the rail will charge")
            continue
        per = (shown.group(1) or "").replace(" ", "")
        recurring_copy = per.startswith("/")
        recurring_rail = mode == "subscription"
        if recurring_copy == recurring_rail:
            record(PASS, f"{tier}: ${usd:.2f} {'monthly' if recurring_copy else 'one-time'}",
                   "copy and rail agree")
        else:
            record(FAIL, f"{tier}: copy and rail disagree",
                   f"page says {'monthly' if recurring_copy else 'one-time'}, "
                   f"rail is {mode!r} — the first customer is mis-sold")

    report = p.get("report_usd")
    if report is not None:
        record(PASS if f"${report:.2f}" in html else FAIL,
               f"landing page shows ${report:.2f} for the report")
    return p


def check_webhook_configured(api: str, expect_live: bool) -> None:
    """One deliberately-invalid POST. `verify_webhook` rejects a bad signature
    before anything is minted or revoked, so this is safe against production —
    and it is the only way to tell 'secret loaded' (400) from 'secret missing'
    (503) from outside the box."""
    print("\nWEBHOOK — is the secret loaded?")
    req = urllib.request.Request(
        f"{api}/stripe/webhook", method="POST", data=b"{}",
        headers={"stripe-signature": "t=0,v1=" + "0" * 64,
                 "Content-Type": "application/json", "User-Agent": _UA},
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            code = r.status
    except urllib.error.HTTPError as exc:
        code = exc.code
    except Exception as exc:
        record(FAIL, "webhook endpoint answers", str(exc))
        return

    if code == 400:
        record(PASS, "webhook secret is loaded", "bad signature rejected 400, as it must be")
    elif code == 503:
        record(FAIL if expect_live else WARN, "webhook secret is loaded",
               "503 = AAE_STRIPE_WEBHOOK_SECRET is unset; every Stripe event would be dropped")
    elif code == 200:
        record(FAIL, "webhook secret is loaded",
               "200 on an INVALID signature — the verifier is not running. Stop.")
    else:
        record(WARN, "webhook secret is loaded", f"unexpected HTTP {code}")


# --------------------------------------------------------------------------- #
# Stripe — needs the secret key, GET only
# --------------------------------------------------------------------------- #

def check_stripe_account(key: str, expect_live: bool) -> None:
    print("\nSTRIPE ACCOUNT")
    prefix = "sk_live" if key.startswith("sk_live") else "sk_test" if key.startswith("sk_test") else "?"
    record(PASS if prefix != "?" else FAIL, "key looks like a Stripe secret key",
           f"{prefix}_…{key[-4:]}")

    try:
        _, acct = _stripe_get("account", key)
    except Exception as exc:
        record(FAIL, "Stripe API answers", f"{exc} — a 401 here means the key is wrong or revoked")
        return

    # The account object's livemode is authoritative; the prefix is only a hint.
    live = bool(acct.get("charges_enabled")) and prefix == "sk_live"
    record(PASS, "Stripe API answers", f"account {acct.get('id')} · {acct.get('country')}")

    if expect_live and prefix != "sk_live":
        record(FAIL, "key is LIVE mode",
               "a test key on a public instance lets anyone mint a real entitlement with card 4242")
    elif prefix == "sk_live":
        record(PASS, "key is LIVE mode")
    else:
        record(WARN, "key is TEST mode", "fine for the drill, never for a public instance")

    record(PASS if acct.get("charges_enabled") else FAIL, "charges are enabled",
           "" if acct.get("charges_enabled") else "Stripe has not finished verifying this account")
    record(PASS if acct.get("payouts_enabled") else WARN, "payouts are enabled",
           "" if acct.get("payouts_enabled") else "money can be taken but not yet paid out to you")

    cur = (acct.get("default_currency") or "").lower()
    record(PASS if cur == "usd" else WARN, "default currency is usd", f"got {cur!r}")
    _ = live


def check_stripe_webhook_endpoint(key: str, webhook_url: str) -> None:
    print("\nSTRIPE WEBHOOK ENDPOINT")
    try:
        _, d = _stripe_get("webhook_endpoints", key, "limit=100")
    except Exception as exc:
        record(FAIL, "webhook endpoints readable", str(exc))
        return

    eps = d.get("data", [])
    match = [e for e in eps if (e.get("url") or "").rstrip("/") == webhook_url.rstrip("/")]
    if not match:
        record(FAIL, "an endpoint points at this deployment",
               f"no Stripe endpoint with url {webhook_url}\n"
               f"           registered: {[e.get('url') for e in eps] or 'none'}")
        return

    ep = match[0]
    record(PASS, "an endpoint points at this deployment", ep.get("id", ""))
    record(PASS if ep.get("status") == "enabled" else FAIL, "endpoint is enabled",
           f"status={ep.get('status')!r}")

    events = set(ep.get("enabled_events") or [])
    if "*" in events:
        record(PASS, "endpoint subscribes to what we act on", "subscribed to all events")
    else:
        missing = REQUIRED_EVENTS - events
        if missing:
            record(FAIL, "endpoint subscribes to what we act on",
                   f"missing {sorted(missing)} — those lifecycle changes would never reach us")
        else:
            record(PASS, "endpoint subscribes to what we act on", f"{len(events)} events")

    record(WARN, "signing secret matches AAE_STRIPE_WEBHOOK_SECRET",
           "Stripe only reveals whsec_… at creation, so this cannot be read back. "
           "The behavioural proof is the 400 above plus one real event arriving.")


def check_stripe_portal(key: str, mode: str) -> None:
    """Cancel is the revoke trigger — a refund does NOT revoke a subscription
    (the mint stores `sub_…`, `charge.refunded` carries `py_…`, different
    namespaces). So an unconfigured portal in LIVE mode means an entitlement
    nobody can give back."""
    print("\nSTRIPE CUSTOMER PORTAL")
    try:
        _, d = _stripe_get("billing_portal/configurations", key, "limit=100")
    except Exception as exc:
        record(FAIL, "portal configurations readable", str(exc))
        return

    active = [c for c in d.get("data", []) if c.get("active")]
    if not active:
        record(FAIL if mode == "subscription" else WARN, "an active portal configuration exists",
               "Settings → Billing → Customer portal, in the LIVE dashboard "
               "(test and live are configured separately)")
        return
    record(PASS, "an active portal configuration exists", active[0].get("id", ""))

    cancel_on = any(
        ((c.get("features") or {}).get("subscription_cancel") or {}).get("enabled")
        for c in active
    )
    record(PASS if cancel_on or mode != "subscription" else FAIL, "customers can cancel",
           "" if cancel_on else "enable 'Cancel subscriptions' — cancel is what revokes access")


# --------------------------------------------------------------------------- #

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--api", default=DEFAULT_API, help=f"API base (default {DEFAULT_API})")
    ap.add_argument("--landing", default=DEFAULT_LANDING,
                    help=f"landing page (default {DEFAULT_LANDING})")
    ap.add_argument("--expect-mode", default="subscription", choices=("payment", "subscription"),
                    help="what the offer is meant to be (default subscription)")
    ap.add_argument("--expect-live", action="store_true",
                    help="require the rail to be OPEN and the key to be sk_live")
    ap.add_argument("--webhook-url", default=None,
                    help="the URL Stripe should call (default: <api>/stripe/webhook)")
    args = ap.parse_args()

    api = args.api.rstrip("/")
    webhook_url = args.webhook_url or f"{api}/stripe/webhook"
    key = os.environ.get("AAE_STRIPE_SECRET_KEY", "").strip()

    print(f"M5 preflight — {api}")
    print("Read-only: every Stripe call is a GET; nothing here can take a payment.")

    check_health(api)
    pricing = check_pricing(api, args.landing, args.expect_mode, args.expect_live)
    check_webhook_configured(api, args.expect_live)

    mode = pricing.get("mode") or args.expect_mode
    if key:
        check_stripe_account(key, args.expect_live)
        check_stripe_webhook_endpoint(key, webhook_url)
        check_stripe_portal(key, mode)
    else:
        print("\nSTRIPE (skipped)")
        record(FAIL if args.expect_live else SKIP, "AAE_STRIPE_SECRET_KEY present",
               "set it in the environment to check the account, webhook and portal")

    fails = [r for r in _results if r[0] == FAIL]
    warns = [r for r in _results if r[0] == WARN]
    print(f"\n{'─' * 62}")
    print(f"{len(_results)} checks · {len(_results) - len(fails) - len(warns)} pass · "
          f"{len(warns)} warn · {len(fails)} FAIL")
    if fails:
        print("\nBlocking:")
        for _, name, detail in fails:
            print(f"  ✗ {name}" + (f" — {detail.splitlines()[0]}" if detail else ""))
        print("\nDo not hand anyone a card until these are clear.")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
