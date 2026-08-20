"""
budget.py — Phase 4.4 AI cost controls.

Three jobs:
  1. Per-user daily budget: cap each user's provider spend per UTC day; over
     the cap, the caller degrades to the deterministic OFFLINE compiler (the
     app already does this honestly, keeping ai_source provenance).
  2. Global daily budget + spend alarm: cap total provider spend; log a loud
     alarm at a fraction of the cap; over the global cap, everyone degrades.
  3. Observability: a snapshot for /api/admin/stats and Prometheus.

Cost is ESTIMATED, not billed — a soft guard, not accounting. Output tokens
dominate long-form generation, so cost ≈ chars/4/1e6 · $per_Mtok (≈4 chars per
token). Images and TTS use their own per-unit estimates. Everything is
env-tunable; the point is a spend ceiling and an alarm, not the exact cent.

In-memory, keyed by (utc_date, user) — a process restart resets the day's
counters, which is acceptable for a soft cap (the global alarm is the real
backstop, and a persistent ledger can replace the dict later without touching
callers). AAE_BUDGET_ENABLED=0 disables all gating.

Env:
  AAE_BUDGET_ENABLED        default 1
  AAE_USER_DAILY_USD        per-user daily ceiling      default 2.00
  AAE_GLOBAL_DAILY_USD      global daily ceiling         default 100.00
  AAE_SPEND_ALARM_FRAC      alarm at this fraction of global  default 0.80
  AAE_COST_PER_MTOK_OUTPUT  $ per 1e6 output tokens      default 50 (Fable 5)
  AAE_COST_PER_IMAGE        $ per rendered plate          default 0.02
  AAE_COST_PER_KTTS         $ per 1000 TTS chars          default 0.03
"""
from __future__ import annotations

import hashlib
import logging
import os
import secrets
import threading
from datetime import datetime, timezone

_log = logging.getLogger("aae")
_lock = threading.Lock()

# (utc_date, user_key) -> usd ; utc_date -> usd
_user_spend: dict[tuple[str, str], float] = {}
_global_spend: dict[str, float] = {}
_alarm_fired: dict[str, bool] = {}          # one alarm log per day
_TRUTHY = {"1", "true", "yes", "on"}

# {utc_date: salt} — holds exactly one day's salt, ever.
_anon_salt: dict[str, bytes] = {}


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _f(env: str, default: float) -> float:
    try:
        return float(os.environ.get(env, default))
    except (ValueError, TypeError):
        return float(default)


def enabled() -> bool:
    return os.environ.get("AAE_BUDGET_ENABLED", "1").strip().lower() in _TRUTHY


def user_daily_cap() -> float:
    return _f("AAE_USER_DAILY_USD", 2.0)


def global_daily_cap() -> float:
    return _f("AAE_GLOBAL_DAILY_USD", 100.0)


def alarm_threshold() -> float:
    return _f("AAE_SPEND_ALARM_FRAC", 0.80) * global_daily_cap()


# Nominal pre-call output size (chars), used to decide whether a call may
# START. `record()` then books the TRUE size, so a low guess crosses the cap
# slightly late rather than never — the failure is soft, which is exactly why
# these numbers had gone unexamined.
#
# MEASURED 2026-08-19, twelve live arcana readings across both paid tiers and
# six spreads: 1,999 to 11,340 chars, median 5,856 (supporter 5,268, oracle
# 7,852). "tarot" had been 1,200 — under a fifth of a typical reading and under
# a ninth of the largest. Set to the median rather than the max: this is the
# expected size of the NEXT call, and guessing the worst case here would refuse
# readers with room left in their budget.
_NOMINAL_CHARS = {"oracle": 13000, "deluxe": 40000, "course": 24000,
                  "tarot": 5800, "ask": 3000, "tts": 2000, "plate": 0}


# Output $ per 1e6 tokens, Anthropic list prices (2026-06-24 catalogue). Matched
# on the bare model name so an OpenRouter route prefix ("anthropic/claude-opus-5")
# resolves the same as a first-party id.
#
# WHY A TABLE. This used to be one flat rate with a `kind == "ask"` multiplier of
# 0.2, commented "usually a local/cheap model". An oracle-tier ask is answered by
# opus-5, so the cap counted that call at a fifth of its price and the ceiling sat
# five times higher than the number in the config said. Cost follows the model
# that actually answered, never the shape of the request.
_MTOK_OUTPUT = {
    "claude-fable-5": 50.0,
    "claude-opus-5": 25.0,
    "claude-opus-4-8": 25.0,
    "claude-sonnet-5": 15.0,
    "claude-haiku-4-5": 5.0,
}


def output_price(model: str | None) -> float:
    """$ per 1e6 output tokens for `model`.

    An unrecognised model bills at AAE_COST_PER_MTOK_OUTPUT (default 50, the
    dearest rate in the catalogue). Guessing HIGH on an unknown model degrades a
    reader early; guessing low overspends silently, and only one of those is
    recoverable.
    """
    name = (model or "").rsplit("/", 1)[-1]
    for known, price in _MTOK_OUTPUT.items():
        if name.startswith(known):
            return price
    return _f("AAE_COST_PER_MTOK_OUTPUT", 50.0)


def estimate_cost(kind: str, chars: int, model: str | None = None) -> float:
    if kind == "plate":
        return _f("AAE_COST_PER_IMAGE", 0.02)
    if kind == "tts":
        return chars / 1000.0 * _f("AAE_COST_PER_KTTS", 0.03)
    return chars / 4.0 / 1e6 * output_price(model)


def _anon_bucket(client_ip: str) -> str:
    """A per-visitor budget bucket for anonymous traffic, derived from the IP.

    WHY THIS IS NOT JUST 'anon'. Every tokenless caller used to share a single
    bucket, so the per-user daily cap behaved as one collective allowance for
    the entire internet. That bounds the bill, but it means ONE abuser clearing
    local storage in a loop drains the day's allowance and every honest free
    visitor is served the offline compiler instead of the product. The cap was
    protecting the wallet and not the users.

    WHY IT IS SAFE TO DO THIS HERE. The salt is random per process and holds
    for one UTC day only, so the same visitor keys differently tomorrow and
    differently after a restart — the value cannot be used to recognise anyone
    over time, which is the property that would make it tracking. It stays in
    memory, is never written to a log, a database or a response, and the raw IP
    is hashed immediately rather than stored. `ratelimit.py` already keys its
    sliding window on the client IP, so this processes nothing the server was
    not already handling; it only widens the window from a minute to a day.

    NOT a security boundary. Anyone with many addresses gets many buckets —
    the global cap is what makes that bounded, and it is the real ceiling.
    This makes abuse *expensive and self-limiting* rather than impossible,
    which is the correct goal for a product with no accounts to police.
    """
    day = _today()
    with _lock:
        salt = _anon_salt.get(day)
        if salt is None:
            salt = secrets.token_bytes(32)
            _anon_salt.clear()      # yesterday's salt is unrecoverable by design
            _anon_salt[day] = salt
    return "ip:" + hashlib.blake2s(
        client_ip.encode("utf-8", "replace"), key=salt, digest_size=8
    ).hexdigest()


def user_key(token: str | None, client_ip: str | None = None) -> str:
    """A stable per-user id from an entitlement token: its jti (or payment ref)
    if decodable, else a hash of the token, else a per-IP anonymous bucket (or
    'anon' when no address is available). Never the token itself (would leak
    into any structure that logs the key)."""
    if not token:
        return _anon_bucket(client_ip) if client_ip else "anon"
    try:
        import entitlements as _ENT
        p = _ENT.verify_token(token)
        if p:
            return p.get("jti") or p.get("ref") or "tok"
    except Exception:
        pass
    import hashlib
    return "h:" + hashlib.sha256(token.encode()).hexdigest()[:16]


def is_subscriber(token: str | None) -> bool:
    """True for a paid, unexpired entitlement (supporter or oracle).

    Deliberately fail-CLOSED on any error: an unreadable token is treated as a
    non-subscriber and stays capped. The opposite default would turn a malformed
    token into an uncapped one.
    """
    if not token:
        return False
    try:
        import entitlements as _ENT
        return _ENT.entitlement_status(token).get("tier") in ("supporter", "oracle")
    except Exception:
        return False


def allow_call(token: str | None, kind: str,
               client_ip: str | None = None,
               model: str | None = None) -> tuple[bool, str]:
    """(allowed, reason). A conservative PRE-call check using a nominal output
    size for `kind`. reason is '' | 'user' | 'global' — the caller degrades to
    offline (or refuses, for image-only paths) when not allowed.

    Pass `client_ip` for anonymous callers so they get their own daily bucket
    instead of sharing one with every other tokenless visitor — see
    `_anon_bucket`. Omitting it is safe but collapses them back into 'anon'.

    Pass `model` so the estimate is priced for the model that will answer; see
    `output_price`.

    SUBSCRIBERS ARE EXEMPT FROM THE PER-USER CAP. A subscription is sold as
    unlimited readings, and a daily ceiling that silently swaps the writer they
    pay for is not that. Their spend is still RECORDED, so the global cap, the
    alarm, and /api/admin/stats all still see it — what is removed is the
    per-user refusal, not the accounting.

    The exposure this accepts: one subscriber can now consume the global daily
    cap alone, which degrades every other reader. The remaining controls are the
    global ceiling, the spend alarm at 80% of it, and ratelimit.py's sliding
    window (20 requests/60s on the ask path). If a single account ever walks the
    global cap down on its own, the answer is a high per-subscriber sanity
    ceiling that ALARMS rather than degrades — not a return to this cap.
    """
    if not enabled():
        return True, ""
    est = estimate_cost(kind, _NOMINAL_CHARS.get(kind, 8000), model)
    uk = user_key(token, client_ip)
    day = _today()
    with _lock:
        u = _user_spend.get((day, uk), 0.0)
        g = _global_spend.get(day, 0.0)
    # The global ceiling binds everyone, subscribers included — it is the only
    # thing standing between one runaway account and the provider bill.
    if g + est > global_daily_cap():
        return False, "global"
    if not is_subscriber(token) and u + est > user_daily_cap():
        return False, "user"
    return True, ""


def record(token: str | None, kind: str, chars: int,
           client_ip: str | None = None,
           model: str | None = None) -> float:
    """Record the ACTUAL spend of a completed provider call (post-call, real
    output size). Fires the global alarm once per day when crossed.

    `client_ip` must match whatever was passed to `allow_call` for the same
    request, or the pre-check and the record land in different buckets.

    `model` is the model that ACTUALLY answered — post-call this is known
    exactly, so it is the more accurate of the two pricing points. Subscriber
    spend is recorded here like everyone else's, exemption or not.
    """
    if not enabled():
        return 0.0
    cost = estimate_cost(kind, chars, model)
    uk = user_key(token, client_ip)
    day = _today()
    with _lock:
        _user_spend[(day, uk)] = _user_spend.get((day, uk), 0.0) + cost
        g = _global_spend.get(day, 0.0) + cost
        _global_spend[day] = g
        fire = g >= alarm_threshold() and not _alarm_fired.get(day)
        if fire:
            _alarm_fired[day] = True
    if fire:
        _log.warning("AI SPEND ALARM: global daily spend $%.2f crossed the "
                     "$%.2f alarm threshold (cap $%.2f)",
                     g, alarm_threshold(), global_daily_cap())
    return cost


def snapshot() -> dict:
    day = _today()
    with _lock:
        g = _global_spend.get(day, 0.0)
        users = {k[1]: round(v, 4) for k, v in _user_spend.items() if k[0] == day}
    top = dict(sorted(users.items(), key=lambda kv: -kv[1])[:10])
    return {
        "date": day,
        "global_today_usd": round(g, 4),
        "global_cap_usd": global_daily_cap(),
        "user_cap_usd": user_daily_cap(),
        "alarm_threshold_usd": round(alarm_threshold(), 4),
        "alarm_fired": bool(_alarm_fired.get(day)),
        "active_users_today": len(users),
        "top_users_usd": top,
    }


def reset() -> None:
    with _lock:
        _user_spend.clear()
        _global_spend.clear()
        _alarm_fired.clear()
