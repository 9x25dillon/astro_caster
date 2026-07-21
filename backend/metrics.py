"""
metrics.py — Phase 3.3 observability.
=====================================

A dependency-free Prometheus text-format registry: counters and a
sum/count duration pair per (method, path, status class), an AI-call
counter per kind (the spend-bearing paths), and process uptime.

Deliberately hand-rolled rather than prometheus_client: the needs are
four metric families, every route in this app is a static path (no
/foo/{id} templates), so label cardinality is bounded by the route table
— the client library's registry, multiprocess modes and content-type
negotiation buy nothing here.

Served by GET /metrics in main.py — operator-gated AND outside /api/*,
which is the only prefix the public nginx edge proxies, so the endpoint
is unreachable from the public origin by construction; a Prometheus
scraper on the compose network reaches the backend directly with the
token in a header.

Alert RULES (error-rate, AI-spend, uptime) ship with the staging deploy
(Phase 3.6) — they live in the scraper's config, not the app.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict
from typing import Dict, Tuple

_START = time.time()
_lock = threading.Lock()

# {(method, path, status_class): count}
_requests: Dict[Tuple[str, str, str], int] = defaultdict(int)
# {(method, path): [total_seconds, count]}
_durations: Dict[Tuple[str, str], list] = defaultdict(lambda: [0.0, 0])
# {kind: count} — one increment per successful AI-provider call
_ai_calls: Dict[str, int] = defaultdict(int)
# {kind: chars} — response size proxy for spend tracking
_ai_chars: Dict[str, int] = defaultdict(int)

# Bound label cardinality: only paths that exist in the route table get
# their own series; everything else (scans, typos, /api/v2 probes) folds
# into one bucket. Populated by main.py at import time.
known_paths: set[str] = set()
_OTHER = "(other)"


def observe_request(method: str, path: str, status: int, seconds: float) -> None:
    if path.startswith("/api/v1/") or path == "/api/v1":
        path = "/api" + path[len("/api/v1"):]  # one series per logical route
    if path not in known_paths:
        path = _OTHER
    klass = f"{status // 100}xx" if 100 <= status <= 599 else "other"
    with _lock:
        _requests[(method, path, klass)] += 1
        d = _durations[(method, path)]
        d[0] += seconds
        d[1] += 1


def observe_ai_call(kind: str, chars: int = 0) -> None:
    """One successful provider-backed call (oracle, course, deluxe, ask,
    plate, tts). Offline-compiler fallbacks are deliberately NOT counted —
    the point is spend."""
    with _lock:
        _ai_calls[kind] += 1
        _ai_chars[kind] += max(chars, 0)


def reset() -> None:
    """Test hook."""
    with _lock:
        _requests.clear()
        _durations.clear()
        _ai_calls.clear()
        _ai_chars.clear()


def _esc(v: str) -> str:
    return v.replace("\\", "\\\\").replace('"', '\\"')


def render() -> str:
    """The Prometheus text exposition format (0.0.4)."""
    lines = [
        "# HELP aae_uptime_seconds Seconds since process start.",
        "# TYPE aae_uptime_seconds gauge",
        f"aae_uptime_seconds {time.time() - _START:.1f}",
        "# HELP aae_requests_total HTTP requests served.",
        "# TYPE aae_requests_total counter",
    ]
    with _lock:
        for (method, path, klass), n in sorted(_requests.items()):
            lines.append(
                f'aae_requests_total{{method="{_esc(method)}",path="{_esc(path)}",'
                f'class="{klass}"}} {n}'
            )
        lines += [
            "# HELP aae_request_duration_seconds Wall time per route.",
            "# TYPE aae_request_duration_seconds summary",
        ]
        for (method, path), (total, count) in sorted(_durations.items()):
            base = f'method="{_esc(method)}",path="{_esc(path)}"'
            lines.append(f"aae_request_duration_seconds_sum{{{base}}} {total:.4f}")
            lines.append(f"aae_request_duration_seconds_count{{{base}}} {count}")
        lines += [
            "# HELP aae_ai_calls_total Successful AI-provider calls (spend-bearing).",
            "# TYPE aae_ai_calls_total counter",
        ]
        for kind, n in sorted(_ai_calls.items()):
            lines.append(f'aae_ai_calls_total{{kind="{_esc(kind)}"}} {n}')
        lines += [
            "# HELP aae_ai_response_chars_total Characters returned by AI calls (spend proxy).",
            "# TYPE aae_ai_response_chars_total counter",
        ]
        for kind, n in sorted(_ai_chars.items()):
            lines.append(f'aae_ai_response_chars_total{{kind="{_esc(kind)}"}} {n}')
    return "\n".join(lines) + "\n"
