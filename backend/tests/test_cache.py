"""
Phase 3.4 — the caching primitive. Hit/miss/eviction accounting, LRU order,
copy-on-return isolation, and the enable toggle.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import cache as C  # noqa: E402


def test_computes_on_miss_and_serves_on_hit():
    calls = {"n": 0}

    def compute():
        calls["n"] += 1
        return calls["n"] * 10

    c = C.LRUCache("t-hit", maxsize=8)
    assert c.get_or_compute("k", compute) == 10
    assert c.get_or_compute("k", compute) == 10  # served from cache
    assert calls["n"] == 1
    s = c.stats()
    assert s["hits"] == 1 and s["misses"] == 1 and s["hit_rate"] == 0.5


def test_lru_eviction_bounds_size_and_evicts_oldest():
    c = C.LRUCache("t-evict", maxsize=2)
    c.get_or_compute("a", lambda: "A")
    c.get_or_compute("b", lambda: "B")
    c.get_or_compute("a", lambda: "A")   # touch a → b is now oldest
    c.get_or_compute("c", lambda: "C")   # evicts b
    seen = {"n": 0}

    def recompute_b():
        seen["n"] += 1
        return "B2"

    assert c.get_or_compute("b", recompute_b) == "B2"  # b was evicted → recompute
    assert seen["n"] == 1
    assert c.stats()["evictions"] >= 1
    assert c.stats()["size"] == 2


def test_copy_on_return_isolates_mutable_results():
    c = C.LRUCache("t-copy", maxsize=4, copy_on_return=True)
    first = c.get_or_compute("k", lambda: [{"x": 1}])
    first.append({"x": 2})          # mutate the returned value
    first[0]["x"] = 999
    second = c.get_or_compute("k", lambda: [{"x": 1}])  # a hit
    assert second == [{"x": 1}]     # cache entry untouched by the mutation


def test_without_copy_returns_shared_reference():
    c = C.LRUCache("t-nocopy", maxsize=4, copy_on_return=False)
    a = c.get_or_compute("k", lambda: [1])
    b = c.get_or_compute("k", lambda: [1])
    assert a is b


def test_disabled_is_passthrough(monkeypatch):
    monkeypatch.setenv("AAE_CACHE_ENABLED", "0")
    calls = {"n": 0}

    def compute():
        calls["n"] += 1
        return "v"

    c = C.LRUCache("t-off", maxsize=4)
    c.get_or_compute("k", compute)
    c.get_or_compute("k", compute)
    assert calls["n"] == 2           # every call recomputes
    assert c.stats()["size"] == 0    # nothing stored


def test_clear_drops_contents_keeps_counters():
    c = C.LRUCache("t-clear", maxsize=4)
    c.get_or_compute("k", lambda: 1)
    c.clear()
    assert c.stats()["size"] == 0
    assert c.stats()["misses"] == 1  # counter survives clear


def test_registered_in_global_stats():
    c = C.LRUCache("t-registry-unique", maxsize=1)
    names = [s["name"] for s in C.all_stats()]
    assert c.name in names
