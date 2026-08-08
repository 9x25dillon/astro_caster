"""
clientip.py
===========
Resolve the address a request actually came from.

WHY THIS EXISTS. Both abuse defences in this app — `ratelimit.py`'s sliding
window and `budget.py`'s anonymous daily buckets — key on the client address.
Behind the shipped nginx that address is wrong by default, and wrong in the
worst possible direction: `request.client.host` is the address of the *proxy*,
identical for every visitor on earth. A per-IP limit then behaves as one shared
limit for the entire internet — the first busy minute locks everyone out, and a
Sybil attacker is indistinguishable from the crowd because everyone already
shares one bucket.

This is not hypothetical for this stack. `frontend/nginx.conf` sets
`X-Forwarded-For`, but the backend is started as a bare
`uvicorn main:app --host 0.0.0.0`, and uvicorn only honours forwarding headers
from `127.0.0.1` unless told otherwise. Under docker-compose nginx connects from
the bridge network, so the header is present, correct, and ignored.

WHY NOT JUST TRUST THE HEADER. Because `X-Forwarded-For` is client-writable. Any
caller that can reach the app directly can claim any address, which turns a
per-IP limit into no limit at all — strictly worse than the shared bucket,
because it fails silently while looking like it works. So trust is OPT-IN and
explicit:

    AAE_TRUST_PROXY   unset/"0"  → use the socket peer. Correct when the app is
                                   directly reachable, which is the dev default.
                      "1"        → honour forwarding headers. Set this ONLY when
                                   the app is unreachable except through your
                                   proxy (compose `expose:` rather than
                                   `ports:`, or a firewall that enforces it).

Getting this backwards is a real outage in one direction and a real bypass in
the other, so it fails toward the safe one: unset means trust nothing.

HEADER ORDER. `X-Forwarded-For` is a chain, "client, proxy1, proxy2", appended
left to right, so the ORIGINAL client is the left-most entry. Cloudflare's
`CF-Connecting-IP` carries the same value as a single address and is preferred
when present because it cannot be confused by a chain length that changes with
your topology.
"""
from __future__ import annotations

import os
from typing import Optional

_TRUTHY = {"1", "true", "yes", "on"}


def trust_proxy() -> bool:
    """Whether forwarding headers may be believed. Read per-call so tests and
    a restart-free config change both take effect."""
    return os.environ.get("AAE_TRUST_PROXY", "").strip().lower() in _TRUTHY


def client_ip(request) -> Optional[str]:
    """The caller's address, or None when it cannot be determined.

    None is returned rather than a placeholder so callers can decide what an
    unknown address means. `budget.user_key` treats it as "no per-IP bucket"
    and falls back to the shared anonymous one — degraded, but never a bucket
    that many unrelated visitors silently share under a name that looks
    specific.
    """
    if request is None:
        return None

    if trust_proxy():
        # Cloudflare first: a single address, immune to chain-length surprises.
        cf = _header(request, "cf-connecting-ip")
        if cf:
            return cf.strip() or None
        xff = _header(request, "x-forwarded-for")
        if xff:
            # Left-most = the original client. Everything after it is proxies.
            first = xff.split(",")[0].strip()
            if first:
                return first
        real = _header(request, "x-real-ip")
        if real:
            return real.strip() or None

    client = getattr(request, "client", None)
    if client is None:
        return None
    return getattr(client, "host", None) or None


def _header(request, name: str) -> Optional[str]:
    headers = getattr(request, "headers", None)
    if headers is None:
        return None
    try:
        return headers.get(name)
    except Exception:
        return None
