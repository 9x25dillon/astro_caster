"""
Compose passes optional vars as `${VAR:-}`, which SETS them to empty.

`os.environ.get(k, default)` falls back only when a key is ABSENT, so a
set-but-empty var is "" — and `int("")` raises at import time, taking the whole
process down. This has bitten the project twice: AAE_STRIPE_TIMEOUT crash-looped
the backend (see stripe_rail._f), and on 2026-08-15 the treasury/crypto block was
added to docker-compose.yml, which would have done it again on the next deploy —
plus flipped `configured` to True for an EMPTY treasury address, advertising a
rail that could take a payment and mint nothing.

These tests reload the modules under exactly the environment compose produces.
Import-time constants are the point, so `importlib.reload` is load-bearing here:
patching os.environ after import would test nothing.
"""
import importlib
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import entitlements as ENT  # noqa: E402

# Every var docker-compose.yml passes through as `${VAR:-}` that is read into an
# import-time constant. Keep this list in step with the compose environment block.
COMPOSE_EMPTIES = (
    "AAE_ENT_DAYS", "AAE_REPORT_TOKEN_DAYS", "AAE_SIGN_ALGO", "AAE_ED25519_SEED",
)


@pytest.fixture
def composed(monkeypatch):
    """The modules as a container started by docker compose actually sees them."""
    for var in COMPOSE_EMPTIES:
        monkeypatch.setenv(var, "")
    entitlements = importlib.reload(ENT)
    yield entitlements
    # Restore module state for the rest of the session: monkeypatch rewinds the
    # environment, but the reloaded constants would otherwise keep the empties.
    monkeypatch.undo()
    importlib.reload(ENT)


def test_backend_boots_with_every_optional_var_empty(composed):
    """The crash-loop guard. Without _i() this raises ValueError on reload."""
    entitlements = composed
    assert entitlements._ENT_DAYS == 365
    assert entitlements._REPORT_TOKEN_DAYS == 30


def test_helpers_ignore_malformed_values_too():
    """A typo'd number must not be able to take the process down either."""
    os.environ["AAE_TEST_BOGUS_INT"] = "not-a-number"
    try:
        assert ENT._i("AAE_TEST_BOGUS_INT", 7) == 7
    finally:
        del os.environ["AAE_TEST_BOGUS_INT"]
