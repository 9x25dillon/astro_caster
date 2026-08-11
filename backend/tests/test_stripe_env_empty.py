"""Set-but-empty env vars must not crash the rail (or the whole app).

docker-compose passes every optional variable as `${VAR:-}`, which sets it to
an EMPTY STRING rather than leaving it unset. os.environ.get(k, default) only
falls back when the key is absent, so float("") raised at import time and
crash-looped the backend. These pin the tolerant behaviour, including that an
empty price falls back to the INTENDED price rather than to zero — a rail that
silently charges $0.00 would be worse than one that fails to boot.
"""
import importlib
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _reload_with(monkeypatch, **env):
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    import stripe_rail
    return importlib.reload(stripe_rail)


def test_empty_timeout_falls_back_instead_of_crashing(monkeypatch):
    mod = _reload_with(monkeypatch, AAE_STRIPE_TIMEOUT="")
    assert mod._TIMEOUT == 20.0


def test_empty_prices_fall_back_to_the_intended_price_not_zero(monkeypatch):
    mod = _reload_with(monkeypatch, AAE_STRIPE_SUPPORTER_USD="",
                       AAE_STRIPE_ORACLE_USD="", AAE_STRIPE_REPORT_USD="")
    assert mod.price_cents("supporter") == 325
    assert mod.price_cents("oracle") == 999
    assert mod.report_price_cents() == 550


def test_garbage_values_also_fall_back(monkeypatch):
    mod = _reload_with(monkeypatch, AAE_STRIPE_SUPPORTER_USD="not-a-number")
    assert mod.price_cents("supporter") == 325


def test_a_real_value_is_still_honoured(monkeypatch):
    mod = _reload_with(monkeypatch, AAE_STRIPE_ORACLE_USD="12.50")
    assert mod.price_cents("oracle") == 1250
