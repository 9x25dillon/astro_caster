"""
Tests for the synastry module + endpoints (relationship astrology).
Asserts the maths that must be right (circular + geographic midpoints) and that
the four endpoints return well-formed payloads.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient  # noqa: E402

import synastry as S  # noqa: E402
from main import app  # noqa: E402

client = TestClient(app)

_A = dict(year=1987, month=11, day=11, hour=10, minute=23, second=0,
          lat=34.935, lng=-117.199, tz_offset=-8.0)
_B = dict(year=1990, month=6, day=20, hour=14, minute=0, second=0,
          lat=40.71, lng=-74.0, tz_offset=-4.0)


# --- maths -------------------------------------------------------------------

def test_circular_midpoint_wraps():
    assert abs(S.circular_midpoint(350, 10) - 0.0) < 1e-9
    assert abs(S.circular_midpoint(10, 50) - 30.0) < 1e-9
    # 0/180 is ambiguous; both 90 and 270 are valid midpoints
    assert abs(S.circular_midpoint(0, 180) % 90) < 1e-9


def test_geographic_midpoint_antimeridian():
    lat, lng = S._geographic_midpoint(0, 170, 0, -170)
    assert abs(lat) < 1e-6
    assert abs(abs(lng) - 180.0) < 1e-6        # 180 or -180, same point
    # simple equatorial case
    lat2, lng2 = S._geographic_midpoint(0, 0, 0, 90)
    assert abs(lat2) < 1e-6 and abs(lng2 - 45.0) < 1e-6


# --- endpoints ---------------------------------------------------------------

def test_synastry_endpoint():
    r = client.post("/api/synastry", json={"person_a": _A, "person_b": _B})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["inter_aspects"] and d["grid"]["b_in_a"] and d["grid"]["a_in_b"]
    assert "disclaimer" in d


def test_composite_endpoint_has_houses_and_aspects():
    r = client.post("/api/composite", json={"person_a": _A, "person_b": _B})
    assert r.status_code == 200, r.text
    d = r.json()
    assert len(d["houses"]) == 12
    # 1st composite cusp equals composite Ascendant (midpoint-composite consistency)
    assert abs(d["houses"][0]["longitude"] - d["angles"]["ascendant"]) < 0.01
    assert d["aspects"]                        # internal composite aspects present
    assert all(p["house"] for p in d["planets"])  # every planet placed (no house 0)


def test_davison_endpoint():
    r = client.post("/api/davison", json={"person_a": _A, "person_b": _B})
    assert r.status_code == 200, r.text
    d = r.json()
    assert len(d["planets"]) > 5 and d["meta"]["method"] == "davison"


def test_synastry_tarot_endpoint_deterministic():
    body = {"person_a": _A, "person_b": _B}
    r1 = client.post("/api/synastry-tarot", json=body)
    r2 = client.post("/api/synastry-tarot", json=body)
    assert r1.status_code == 200, r1.text
    d1, d2 = r1.json(), r2.json()
    assert d1["spread"]["bond_card"]
    assert d1["spread"]["bond_card"] == d2["spread"]["bond_card"]  # deterministic
