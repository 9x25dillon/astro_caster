"""
cache.py — Phase 3.4 caching groundwork.
========================================

A small, thread-safe, bounded LRU cache with hit/miss/eviction counters, and
a process-wide registry so `/api/admin/stats` (and later a Prometheus
`aae_cache_*` family) can report hit rates — the measurement the schedule
asks for before caching is tuned or extended.

WHY a hand-rolled LRU rather than functools.lru_cache: we need (a) live
hit/miss/eviction stats per cache, exposed for observability, and (b)
copy-on-return, so a cached mutable result (a forecast is a list of dicts
that downstream code enriches) can never be aliased and corrupted across
requests. lru_cache offers neither.

Measured hot path (2026-07-20, the operator's chart): generate_forecast(90d)
= ~59 ms/call, called repeatedly by the frontend for the same chart on the
same day. calculate_chart = ~0.9 ms/call — measured NOT worth caching.

Determinism note: caching is transparent — identical inputs already produce
identical outputs, and copy-on-return hands back an independent equal object,
so parity/forecast tests are unaffected. AAE_CACHE_ENABLED=0 turns every
cache into a pass-through (for benchmarking the cold path).
"""
from __future__ import annotations

import copy
import os
import threading
from collections import OrderedDict
from typing import Callable, Hashable, TypeVar

_TRUTHY = {"1", "true", "yes", "on"}

_registry: list["LRUCache"] = []
_registry_lock = threading.Lock()

T = TypeVar("T")


def enabled() -> bool:
    """Caching is on unless explicitly disabled. Read per call so tests and
    benchmarks can toggle it without reimporting."""
    return os.environ.get("AAE_CACHE_ENABLED", "1").strip().lower() in _TRUTHY


class LRUCache:
    def __init__(self, name: str, maxsize: int = 128, copy_on_return: bool = False):
        self.name = name
        self.maxsize = maxsize
        self._copy = copy_on_return
        self._data: "OrderedDict[Hashable, object]" = OrderedDict()
        self._lock = threading.Lock()
        self.hits = 0
        self.misses = 0
        self.evictions = 0
        with _registry_lock:
            _registry.append(self)

    def _out(self, value: T) -> T:
        return copy.deepcopy(value) if self._copy else value

    def get_or_compute(self, key: Hashable, compute: Callable[[], T]) -> T:
        """Return the cached value for key, or compute-store-return it.

        The compute() runs OUTSIDE the lock, so a slow miss never blocks other
        threads' hits; two threads racing the same cold key may both compute
        (idempotent — same input, same output), and the last write wins. That
        trade (rare redundant compute) is deliberate: holding the lock across
        a 60 ms forecast would serialize all forecast traffic.
        """
        if not enabled():
            return compute()
        with self._lock:
            if key in self._data:
                self._data.move_to_end(key)
                self.hits += 1
                return self._out(self._data[key])
            self.misses += 1
        value = compute()
        with self._lock:
            self._data[key] = value
            self._data.move_to_end(key)
            while len(self._data) > self.maxsize:
                self._data.popitem(last=False)
                self.evictions += 1
        return self._out(value)

    def clear(self) -> None:
        with self._lock:
            self._data.clear()

    def stats(self) -> dict:
        with self._lock:
            total = self.hits + self.misses
            return {
                "name": self.name,
                "size": len(self._data),
                "maxsize": self.maxsize,
                "hits": self.hits,
                "misses": self.misses,
                "evictions": self.evictions,
                "hit_rate": round(self.hits / total, 4) if total else 0.0,
            }


def all_stats() -> list[dict]:
    with _registry_lock:
        caches = list(_registry)
    return [c.stats() for c in caches]


def clear_all() -> None:
    """Test hook — drop every cache's contents (counters kept)."""
    with _registry_lock:
        caches = list(_registry)
    for c in caches:
        c.clear()
