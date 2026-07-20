"""
Edition P — personal mode (PUBLIC_LAUNCH_SCHEDULE Phase 1).

The contract: AAE_PERSONAL_MODE=1 grants the whole instance oracle tier with
no tokens, no purchase gates, no rate limits and no telemetry — and the boot
guard refuses the combination of personal mode with any public-facing signal
(fail closed: the unrestricted build can never accidentally be the public one).
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import entitlements as ENT  # noqa: E402
import ratelimit as RL  # noqa: E402
import telemetry as TEL  # noqa: E402
from main import app  # noqa: E402

client = TestClient(app)

_PUBLIC_VARS = ["AAE_TREASURY_ETH", "AAE_TREASURY_BTC", "AAE_ETH_RPC",
                "AAE_ORACLE_MIN_WEI", "AAE_REPORT_MIN_WEI",
                "AAE_STRIPE_SECRET_KEY"]


def _personal(monkeypatch, clean=True):
    monkeypatch.setenv("AAE_PERSONAL_MODE", "1")
    if clean:  # a canonical Edition P environment: no public-facing signals
        for name in _PUBLIC_VARS:
            monkeypatch.delenv(name, raising=False)


# --------------------------------------------------------------------------- #
# Tier: everything unlocked, no tokens
# --------------------------------------------------------------------------- #


def test_off_by_default():
    assert not ENT.personal_mode()
    assert ENT.entitlement_status(None)["tier"] == "free"
    assert not ENT.is_operator(None)


def test_personal_mode_grants_oracle_with_no_token(monkeypatch):
    _personal(monkeypatch)
    st = ENT.entitlement_status(None)
    assert st["tier"] == "oracle"
    assert st["supporter"] is True
    assert st["verified"] is True
    assert st["exp"] is None  # never expires


def test_every_request_is_the_operator(monkeypatch):
    _personal(monkeypatch)
    assert ENT.is_operator(None)
    assert ENT.is_operator("any-random-string")


def test_entitlement_endpoint_reports_oracle_tokenless(monkeypatch):
    _personal(monkeypatch)
    r = client.get("/api/entitlement")
    assert r.status_code == 200
    assert r.json()["tier"] == "oracle"


def test_admin_stats_open_to_the_operator(monkeypatch):
    _personal(monkeypatch)
    assert client.get("/api/admin/stats").status_code == 200


def test_admin_stats_still_forbidden_outside_personal_mode():
    assert client.get("/api/admin/stats").status_code == 403


def test_health_reports_the_mode(monkeypatch):
    _personal(monkeypatch)
    assert client.get("/api/health").json()["personal_mode"] is True


# --------------------------------------------------------------------------- #
# No rate limits, no telemetry
# --------------------------------------------------------------------------- #


def test_rate_limiting_off_in_personal_mode(monkeypatch):
    _personal(monkeypatch)
    monkeypatch.delenv("AAE_RATE_LIMIT_ENABLED", raising=False)
    assert RL.enabled() is False


def test_explicit_rate_limit_env_still_wins(monkeypatch):
    _personal(monkeypatch)
    monkeypatch.setenv("AAE_RATE_LIMIT_ENABLED", "1")
    assert RL.enabled() is True


def test_telemetry_writes_nothing(tmp_path, monkeypatch):
    _personal(monkeypatch)
    monkeypatch.setattr(TEL, "_DB_PATH", tmp_path / "tel.db")

    async def probe():
        await TEL.log_feature("edition-p-probe")
        await TEL.log_tier("unlock", tier="oracle")

    asyncio.run(probe())
    assert not (tmp_path / "tel.db").exists()  # no write ever reached the DB


# --------------------------------------------------------------------------- #
# The fail-closed interlock: personal mode + public-facing signal = no boot
# --------------------------------------------------------------------------- #


def _boot_refused(match="personal"):
    with pytest.raises(RuntimeError, match=match):
        ENT.assert_safe_boot()


def test_clean_personal_boot_is_allowed(monkeypatch):
    _personal(monkeypatch)
    ENT.assert_safe_boot()  # no raise


@pytest.mark.parametrize("var,value", [
    ("AAE_TREASURY_ETH", "0xabc"),
    ("AAE_TREASURY_BTC", "bc1qabc"),
    ("AAE_ETH_RPC", "https://rpc.example"),
    ("AAE_STRIPE_SECRET_KEY", "sk_live_x"),
    ("AAE_ORACLE_MIN_WEI", "1"),
    ("AAE_REPORT_MIN_WEI", "1"),
])
def test_public_signal_refuses_boot(monkeypatch, var, value):
    _personal(monkeypatch)
    monkeypatch.setenv(var, value)
    _boot_refused()


def test_production_env_refuses_personal_boot(monkeypatch):
    _personal(monkeypatch)
    monkeypatch.setenv("AAE_ENV", "production")
    _boot_refused()


def test_refusal_names_every_conflict(monkeypatch):
    _personal(monkeypatch)
    monkeypatch.setenv("AAE_TREASURY_ETH", "0xabc")
    monkeypatch.setenv("AAE_STRIPE_SECRET_KEY", "sk_live_x")
    with pytest.raises(RuntimeError) as exc:
        ENT.assert_safe_boot()
    msg = str(exc.value)
    assert "AAE_TREASURY_ETH" in msg and "AAE_STRIPE_SECRET_KEY" in msg
