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

import logging
import os
import threading
from datetime import datetime, timezone

_log = logging.getLogger("aae")
_lock = threading.Lock()

# (utc_date, user_key) -> usd ; utc_date -> usd
_user_spend: dict[tuple[str, str], float] = {}
_global_spend: dict[str, float] = {}
_alarm_fired: dict[str, bool] = {}          # one alarm log per day
_TRUTHY = {"1", "true", "yes", "on"}


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


# nominal pre-call output size (chars) used before the true size is known
_NOMINAL_CHARS = {"oracle": 13000, "deluxe": 40000, "course": 24000,
                  "tarot": 1200, "ask": 3000, "tts": 2000, "plate": 0}


def estimate_cost(kind: str, chars: int) -> float:
    if kind == "plate":
        return _f("AAE_COST_PER_IMAGE", 0.02)
    if kind == "tts":
        return chars / 1000.0 * _f("AAE_COST_PER_KTTS", 0.03)
    per_mtok = _f("AAE_COST_PER_MTOK_OUTPUT", 50.0)
    char_cost = chars / 4.0 / 1e6 * per_mtok
    if kind == "ask":
        return char_cost * 0.2         # usually a local/cheap model
    return char_cost                   # oracle / course / deluxe / tarot


def user_key(token: str | None) -> str:
    """A stable per-user id from an entitlement token: its jti (or payment ref)
    if decodable, else a hash of the token, else 'anon'. Never the token
    itself (would leak into any structure that logs the key)."""
    if not token:
        return "anon"
    try:
        import entitlements as _ENT
        p = _ENT.verify_token(token)
        if p:
            return p.get("jti") or p.get("ref") or "tok"
    except Exception:
        pass
    import hashlib
    return "h:" + hashlib.sha256(token.encode()).hexdigest()[:16]


def allow_call(token: str | None, kind: str) -> tuple[bool, str]:
    """(allowed, reason). A conservative PRE-call check using a nominal output
    size for `kind`. reason is '' | 'user' | 'global' — the caller degrades to
    offline (or refuses, for image-only paths) when not allowed."""
    if not enabled():
        return True, ""
    est = estimate_cost(kind, _NOMINAL_CHARS.get(kind, 8000))
    uk = user_key(token)
    day = _today()
    with _lock:
        u = _user_spend.get((day, uk), 0.0)
        g = _global_spend.get(day, 0.0)
    if g + est > global_daily_cap():
        return False, "global"
    if u + est > user_daily_cap():
        return False, "user"
    return True, ""


def record(token: str | None, kind: str, chars: int) -> float:
    """Record the ACTUAL spend of a completed provider call (post-call, real
    output size). Fires the global alarm once per day when crossed."""
    if not enabled():
        return 0.0
    cost = estimate_cost(kind, chars)
    uk = user_key(token)
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
