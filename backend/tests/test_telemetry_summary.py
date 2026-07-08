"""The admin summary's report_purchases split — deluxe purchases surfaced
explicitly (verified rail vs trust-mode mint), not buried in tier_events."""
import asyncio
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import telemetry as TEL  # noqa: E402


@pytest.fixture()
def isolated_db(tmp_path, monkeypatch):
    monkeypatch.setattr(TEL, "_DB_PATH", tmp_path / "telemetry.db")


def test_report_purchases_split(isolated_db):
    async def seed():
        await TEL.log_tier("donate", tier="supporter", verified=True, ref="0xd")
        await TEL.log_tier("report_purchase", tier="oracle", verified=True, ref="0xa")
        await TEL.log_tier("report_purchase", tier="oracle", verified=True, ref="0xb")
        await TEL.log_tier("report_purchase", tier="oracle", verified=False, ref="trust")

    asyncio.run(seed())
    s = TEL.summary()
    assert s["report_purchases"] == {"total": 3, "verified": 2, "trust": 1}
    # Still present in the generic action tally too.
    assert s["tier_events"]["report_purchase"] == 3


def test_report_purchases_empty(isolated_db):
    s = TEL.summary()
    assert s["report_purchases"] == {"total": 0, "verified": 0, "trust": 0}
