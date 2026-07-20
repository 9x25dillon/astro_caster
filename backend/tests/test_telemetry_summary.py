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


def test_log_chart_stores_no_birth_data(isolated_db):
    """Issue #54 §3.3: exact birth date/time + rough location is an identifying
    set — the server must not retain it. Only casting preferences persist."""
    birth = dict(year=1879, month=3, day=14, hour=11, minute=30,
                 lat=48.4, lng=10.0, house_system="P", zodiac="tropical")
    asyncio.run(TEL.log_chart(birth, tier="oracle"))
    conn = TEL._get_conn()
    try:
        row = conn.execute(
            "SELECT year, month, day, hour, minute, lat, lng, house_sys, zodiac, tier "
            "FROM chart_events").fetchone()
    finally:
        conn.close()
    assert row[:7] == (None,) * 7          # nothing identifying stored
    assert row[7:] == ("P", "tropical", "oracle")


def test_log_chart_survives_null_lat(isolated_db):
    # A lat of None used to raise TypeError on the request path (float(None)).
    asyncio.run(TEL.log_chart({"lat": None, "lng": None}, tier="free"))
    s = TEL.summary()
    assert s["charts"]["total"] == 1


def test_log_ai_stores_no_question_text(isolated_db):
    asyncio.run(TEL.log_ai(tier="free", lens="natal", depth="quick",
                           query="my very personal question about love",
                           provider="p", model="m", response_len=10))
    conn = TEL._get_conn()
    try:
        row = conn.execute(
            "SELECT query_len, query_preview FROM ai_events").fetchone()
    finally:
        conn.close()
    assert row[0] == len("my very personal question about love")
    assert row[1] is None
