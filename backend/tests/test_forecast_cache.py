"""
Phase 3.4 — forecast caching is correct and transparent: identical inputs
hit the cache, ANY output-affecting input change misses, the cached result
equals a fresh computation, and a hit's result is an independent copy.
"""
import datetime as dt
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import forecast as F  # noqa: E402

_NATAL = {"Sun": 100.0, "Moon": 40.0, "Mars": 210.5, "Venus": 15.25}
_START = dt.date(2026, 7, 20)


def _fresh():
    F._forecast_cache.clear()


def test_identical_call_hits_cache():
    _fresh()
    before = F._forecast_cache.stats()["misses"]
    a = F.generate_forecast(_NATAL, _START, 21, "medium")
    b = F.generate_forecast(_NATAL, _START, 21, "medium")
    stats = F._forecast_cache.stats()
    assert stats["misses"] == before + 1  # computed exactly once
    assert stats["hits"] >= 1
    assert a == b


def test_each_output_affecting_input_misses():
    _fresh()
    base = dict(natal=_NATAL, start_date=_START, days=21, min_sig="medium")
    F.generate_forecast(**base)
    misses0 = F._forecast_cache.stats()["misses"]

    variants = [
        {**base, "days": 22},
        {**base, "min_sig": "high"},
        {**base, "start_date": _START + dt.timedelta(days=1)},
        {**base, "natal": {**_NATAL, "Sun": 100.001}},
    ]
    for i, v in enumerate(variants, 1):
        F.generate_forecast(**v)
        assert F._forecast_cache.stats()["misses"] == misses0 + i, v


def test_natal_key_is_order_independent():
    _fresh()
    F.generate_forecast(_NATAL, _START, 14, "medium")
    misses = F._forecast_cache.stats()["misses"]
    reordered = dict(reversed(list(_NATAL.items())))
    F.generate_forecast(reordered, _START, 14, "medium")
    assert F._forecast_cache.stats()["misses"] == misses  # same key → hit


def test_hit_result_is_independent_copy():
    _fresh()
    a = F.generate_forecast(_NATAL, _START, 14, "medium")
    if a:
        a[0]["_tampered"] = True
        a.clear()
    b = F.generate_forecast(_NATAL, _START, 14, "medium")  # hit
    assert all("_tampered" not in ev for ev in b)


def test_cache_result_equals_uncached():
    _fresh()
    cached = F.generate_forecast(_NATAL, _START, 30, "medium")
    direct = F._generate_forecast_uncached(_NATAL, _START, 30, "medium")
    assert cached == direct
