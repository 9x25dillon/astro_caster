"""
Tests for the predictive module + endpoints: secondary progressions, solar
returns, and the eclipse timeline. Asserts the astronomy that must be right
(progressed Sun ~1deg/year, solar-return Sun == natal Sun, real eclipse search).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient  # noqa: E402

import astrology as A  # noqa: E402
import predictive as P  # noqa: E402
from main import app  # noqa: E402
from models import ChartRequest, PlanetData  # noqa: E402

client = TestClient(app)

_NATAL = dict(year=1987, month=11, day=11, hour=10, minute=23, second=0,
              lat=34.935, lng=-117.199, tz_offset=-8.0)


def _natal_req():
    return ChartRequest(**_NATAL)


# --- secondary progressions --------------------------------------------------

def test_progressed_sun_advances_about_one_degree_per_year():
    natal = _natal_req()
    import ephemeris as E
    natal_sun = next(p for p in E.calculate_chart(natal).planets if p.id == "Sun").longitude
    pg = P.progressed_chart(natal, "2026-06-30")
    prog_sun = next(p for p in pg.planets if p.id == "Sun").longitude
    advanced = A.angular_separation(natal_sun, prog_sun)
    # ~38.6 years -> Sun should have moved ~37-40 degrees (~1 deg/year)
    assert 35.0 < advanced < 42.0, advanced
    assert 38.0 < pg.age_years < 39.0


# --- solar return ------------------------------------------------------------

def test_solar_return_sun_equals_natal_sun():
    natal = _natal_req()
    import ephemeris as E
    natal_sun = next(p for p in E.calculate_chart(natal).planets if p.id == "Sun").longitude
    sr = P.solar_return(natal, 2026)
    sr_sun = next(p for p in sr.planets if p.id == "Sun").longitude
    assert A.angular_separation(natal_sun, sr_sun) < 0.05   # within 3 arcmin
    assert sr.return_iso.startswith("2026-11")              # near the birthday


# --- eclipse timeline --------------------------------------------------------

def test_eclipse_timeline_finds_ordered_real_eclipses():
    ec = P.eclipse_timeline(_natal_req(), "2026-01-01", count=6)
    assert len(ec.eclipses) == 6
    dates = [e.date for e in ec.eclipses]
    assert dates == sorted(dates)                            # chronological
    assert {e.kind for e in ec.eclipses} <= {"solar", "lunar"}
    assert all(e.nature != "unknown" for e in ec.eclipses)


def test_eclipse_activation_fires_on_conjunction():
    # Synthetic: an eclipse exactly on a natal planet must register a contact.
    p = PlanetData(id="Sun", glyph="☉", longitude=228.0, latitude=0, declination=0,
                   speed=1.0, sign="Scorpio", sign_glyph="♏", degree=18, minute=0,
                   second=0, house=10, retrograde=False, dignity="Detriment",
                   element="Water", modality="Fixed")
    contacts = P._eclipse_activations(228.5, [p])
    assert contacts and contacts[0].natal_body == "Sun"
    assert contacts[0].aspect == "conjunction" and contacts[0].orb <= 0.6


# --- endpoints ---------------------------------------------------------------

def test_predictive_endpoints():
    r1 = client.post("/api/progressed-chart", json={"natal": _NATAL, "target_iso": "2026-06-30"})
    assert r1.status_code == 200, r1.text
    assert r1.json()["planets"] and r1.json()["age_years"] > 0

    r2 = client.post("/api/solar-return", json={"natal": _NATAL, "year": 2026})
    assert r2.status_code == 200, r2.text
    assert len(r2.json()["houses"]) == 12

    r3 = client.post("/api/eclipse-timeline", json={"natal": _NATAL, "start_iso": "2026-01-01", "count": 4})
    assert r3.status_code == 200, r3.text
    assert len(r3.json()["eclipses"]) == 4
