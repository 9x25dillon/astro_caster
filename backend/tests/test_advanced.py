"""
Tests for advanced.py + endpoints: harmonics, midpoint trees, fixed stars.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient  # noqa: E402

import advanced as ADV  # noqa: E402
import astrology as A  # noqa: E402
import ephemeris as E  # noqa: E402
from main import app  # noqa: E402
from models import ChartRequest  # noqa: E402

client = TestClient(app)

_NATAL = dict(year=1879, month=3, day=14, hour=11, minute=30, second=0,  # Einstein (public)
              lat=48.4011, lng=9.9876, tz_offset=0.67)


def _natal_req():
    return ChartRequest(**_NATAL)


def test_harmonic_positions_are_longitude_times_n():
    natal = _natal_req()
    chart = E.calculate_chart(natal)
    h = ADV.harmonic_chart(natal, 5)
    natal_sun = next(p for p in chart.planets if p.id == "Sun").longitude
    h_sun = next(p for p in h.positions if p.id == "Sun").longitude
    assert abs(((natal_sun * 5) % 360.0) - h_sun) < 0.01
    # H1 is the natal chart itself
    h1 = ADV.harmonic_chart(natal, 1)
    h1_sun = next(p for p in h1.positions if p.id == "Sun").longitude
    assert abs(h1_sun - natal_sun) < 0.01


def test_midpoint_tree_contacts_are_within_orb():
    mt = ADV.midpoint_tree(_natal_req(), orb=1.0)
    assert mt.entries
    for e in mt.entries:
        for c in e.contacts:
            assert c.orb <= 1.0
            assert c.aspect in ("conjunction", "square", "opposition")


def test_fixed_star_precession_moves_forward():
    # A star's longitude in 2026 should exceed its J2000 value by ~0.36deg.
    lon2000 = ADV._FIXED_STARS["Regulus"][0]
    lon2026 = ADV._star_longitude(lon2000, 2026)
    assert 0.35 < ((lon2026 - lon2000) % 360.0) < 0.37


def test_fixed_star_hits_have_tight_orb():
    fs = ADV.fixed_star_hits(_natal_req(), orb=1.5)
    for h in fs.hits:
        assert h.orb <= 1.5
        assert h.star in ADV._FIXED_STARS


def test_advanced_endpoints():
    r1 = client.post("/api/harmonic-chart", json={"natal": _NATAL, "harmonic": 7})
    assert r1.status_code == 200, r1.text
    assert r1.json()["harmonic"] == 7 and r1.json()["positions"]

    r2 = client.post("/api/midpoint-tree", json={"natal": _NATAL, "orb": 1.0})
    assert r2.status_code == 200, r2.text
    assert "entries" in r2.json()

    r3 = client.post("/api/fixed-stars", json={"natal": _NATAL, "orb": 1.5})
    assert r3.status_code == 200, r3.text
    assert "hits" in r3.json()
