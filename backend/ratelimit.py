"""
ratelimit.py
============
R1 — in-process sliding-window rate limiting for the expensive AI paths.

Why in-process (not slowapi/Redis): the app is dependency-light by design and
entitlements are stateless; a per-worker sliding window is enough to cap cost
exposure on the paid Fable endpoints today. R2 (Redis) upgrades this to a
shared budget across workers when/if the app scales horizontally — the call
sites won't change.

Philosophy mirrors the trust-mode gate: env-driven, protective by default in
PRODUCTION, frictionless in dev/test, explicitly overridable both ways.

  AAE_RATE_LIMIT_ENABLED   "1"/"true" force ON, "0"/"false" force OFF,
                           unset/"auto" => ON in production, OFF in non-prod
                           (so local dev and the test suite are unaffected).
  AAE_RATE_LIMIT_AI        requests per window for the AI paths (default 20)
  AAE_RATE_LIMIT_ORACLE    requests per window for the paid Fable report paths
                           (oracle-report + personal-report; default 5)
  AAE_RATE_LIMIT_WINDOW_S  window length in seconds (default 60)

Keying: client IP plus (when present) a short digest of the entitlement token,
so one abusive token cannot dodge the limit by rotating IPs, and one shared IP
(office NAT) is not starved by a single hot token.
"""

from __future__ import annotations

import hashlib
import os
import time
from collections import deque
from typing import Deque, Dict, Optional, Tuple

from fastapi import HTTPException, Request

import entitlements as ENT

_TRUTHY = {"1", "true", "yes", "on"}
_FALSY = {"0", "false", "no", "off"}


def _int_env(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, str(default)))
    except ValueError:
        return default


def enabled() -> bool:
    """Explicit env wins; otherwise off in personal mode (Edition P — the
    operator never throttles themself), protective in production, off in
    non-prod."""
    raw = os.environ.get("AAE_RATE_LIMIT_ENABLED", "").strip().lower()
    if raw in _TRUTHY:
        return True
    if raw in _FALSY:
        return False
    if ENT.personal_mode():
        return False
    return ENT.is_production()


def _window_s() -> int:
    return max(1, _int_env("AAE_RATE_LIMIT_WINDOW_S", 60))


def limit_for(bucket: str) -> int:
    """Requests allowed per window for a bucket ('ai' or 'oracle')."""
    if bucket == "oracle":
        return max(1, _int_env("AAE_RATE_LIMIT_ORACLE", 5))
    return max(1, _int_env("AAE_RATE_LIMIT_AI", 20))


# (bucket, key) -> deque of request monotonic timestamps within the window.
# Single event loop => no lock needed (no await between read and append).
_hits: Dict[Tuple[str, str], Deque[float]] = {}

# Bound total tracked keys so a spray of spoofed IPs can't grow memory forever.
_MAX_KEYS = 10_000


def _key(request: Optional[Request], entitlement: Optional[str]) -> str:
    ip = "unknown"
    if request is not None and request.client is not None:
        ip = request.client.host or "unknown"
    tok = ""
    if entitlement:
        tok = ":" + hashlib.sha256(entitlement.encode()).hexdigest()[:12]
    return f"{ip}{tok}"


def check(request: Optional[Request], bucket: str,
          entitlement: Optional[str] = None) -> None:
    """Sliding-window check. Raises HTTPException 429 (with Retry-After) when
    the caller has exhausted the bucket's budget for the current window."""
    if not enabled():
        return
    now = time.monotonic()
    window = _window_s()
    limit = limit_for(bucket)
    k = (bucket, _key(request, entitlement))

    q = _hits.get(k)
    if q is None:
        if len(_hits) >= _MAX_KEYS:      # cheap global pressure valve
            _hits.clear()
        q = _hits[k] = deque()
    while q and now - q[0] > window:
        q.popleft()
    if len(q) >= limit:
        retry_after = max(1, int(window - (now - q[0])) + 1)
        raise HTTPException(
            status_code=429,
            detail=f"rate limit exceeded for this path — retry in ~{retry_after}s",
            headers={"Retry-After": str(retry_after)},
        )
    q.append(now)


def reset() -> None:
    """Clear all counters (tests)."""
    _hits.clear()
