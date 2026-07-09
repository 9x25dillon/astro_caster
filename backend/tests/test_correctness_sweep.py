"""
Regression tests for the issue-#54 correctness sweep. Each test pins a bug
that was verified live before the fix:

  2.1  sidereal solar returns landed ~24 days late (tropical root-find fed a
       sidereal natal longitude)
  2.4  eclipse longitudes / fixed-star positions compared across frames
  2.5  lunations never appeared in forecasts (Moon block skipped the Sun)
  2.6  Placidus beyond the polar circle raised instead of degrading
  2.7  cross-aspect 'applying' moved the natal point at its birth speed
  2.8  _jd_to_utc clamped the second instead of carrying it
"""
import datetime as dt
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import astrology as A  # noqa: E402
import advanced as ADV  # noqa: E402
import ephemeris as E  # noqa: E402
import forecast as F  # noqa: E402
import predictive as P  # noqa: E402
import swisseph as swe  # noqa: E402
from models import ChartRequest, PlanetData  # noqa: E402

_NATAL = dict(year=1879, month=3, day=14, hour=11, minute=30, second=0,
              lat=48.4011, lng=9.9876, tz_offset=0.67)


def _sidereal_req():
    return ChartRequest(**_NATAL, zodiac="sidereal", ayanamsha=1)


# --- 2.1 sidereal solar return ------------------------------------------------

def test_sidereal_solar_return_lands_near_birthday():
    sr = P.solar_return(_sidereal_req(), 2026)
    # Sidereal returns trail the birthday by a few days (the ayanamsha bug
    # pushed them ~24 days out).
    assert sr.return_iso.startswith("2026-03"), sr.return_iso
    d = dt.date.fromisoformat(sr.return_iso[:10])
    assert abs((d - dt.date(2026, 3, 14)).days) <= 4, sr.return_iso


def test_sidereal_solar_return_sun_equals_sidereal_natal_sun():
    natal = _sidereal_req()
    natal_sun = next(p for p in E.calculate_chart(natal).planets if p.id == "Sun")
    sr = P.solar_return(natal, 2026)
    sr_sun = next(p for p in sr.planets if p.id == "Sun")
    assert A.angular_separation(natal_sun.longitude, sr_sun.longitude) < 0.05


# --- 2.4 eclipse longitudes in the chart's frame -------------------------------

def test_sidereal_eclipse_longitude_shifted_by_ayanamsha():
    trop = P.eclipse_timeline(ChartRequest(**_NATAL), "2026-01-01", count=1)
    sid = P.eclipse_timeline(_sidereal_req(), "2026-01-01", count=1)
    diff = A.angular_separation(trop.eclipses[0].longitude, sid.eclipses[0].longitude)
    assert 20.0 < diff < 28.0, diff  # ~24° Lahiri ayanamsha


def test_sidereal_fixed_stars_shifted_into_chart_frame():
    trop = ADV.fixed_star_hits(ChartRequest(**_NATAL))
    sid = ADV.fixed_star_hits(_sidereal_req())
    # The same physical contacts must survive the frame change: hits are
    # against the same chart, so star|body pairs match between frames.
    assert {(h.star, h.natal_body) for h in trop.hits} == \
           {(h.star, h.natal_body) for h in sid.hits}
    # ... while the reported star longitudes move by the ayanamsha.
    t0 = trop.hits[0]
    s0 = next(h for h in sid.hits if (h.star, h.natal_body) == (t0.star, t0.natal_body))
    diff = A.angular_separation(t0.star_longitude, s0.star_longitude)
    assert 20.0 < diff < 28.0, diff


# --- 2.5 lunations ------------------------------------------------------------

def test_lunations_appear_in_forecast():
    events = F.generate_forecast({}, dt.date(2026, 1, 1), days=35, min_sig="medium")
    luna = [(e["date"], e["aspect"]) for e in events
            if {e["planet"], e.get("target")} == {"Moon", "Sun"}]
    kinds = {a for _, a in luna}
    assert "Conjunction" in kinds, luna   # new moon (2026-01-19 ± 1)
    assert "Opposition" in kinds, luna    # full moon (2026-01-03 ± 1)
    new_moon = next(d for d, a in luna if a == "Conjunction")
    assert abs((dt.date.fromisoformat(new_moon) - dt.date(2026, 1, 19)).days) <= 1


# --- 2.6 polar-latitude house fallback -----------------------------------------

def test_polar_placidus_falls_back_to_whole_sign():
    c = E.calculate_chart(ChartRequest(year=2000, month=6, day=1, hour=12,
                                       minute=0, second=0, lat=70.0, lng=25.0,
                                       tz_offset=0.0, house_system="P"))
    assert c.meta["house_system"] == "W"
    assert "whole-sign" in c.meta["house_fallback"]
    # Whole-sign cusps land on sign boundaries and bodies spread over houses.
    assert all(h.longitude % 30.0 == 0 for h in c.houses)
    assert len({p.house for p in c.planets}) > 1


# --- 2.7 / 2.8 applying -------------------------------------------------------

def _pd(pid, lon, speed):
    sign = A.sign_for(lon)
    d, m, s = A.degree_in_sign(lon)
    return PlanetData(id=pid, glyph="x", longitude=lon, latitude=0.0,
                      declination=0.0, speed=speed, sign=sign,
                      sign_glyph=A.SIGN_GLYPHS[sign], degree=d, minute=m,
                      second=s, house=1, retrograde=speed < 0,
                      dignity="", element=A.ELEMENTS[sign],
                      modality=A.MODALITIES[sign])


def test_applying_freezes_the_natal_side():
    # Transiting body at 10°, separating in the shared frame ONLY if the natal
    # point were (wrongly) allowed to run at its birth speed. Frozen natal:
    # transiting +1°/day toward natal 12° ⇒ applying.
    t = _pd("Mars", 10.0, 1.0)
    n = _pd("Sun", 12.0, 2.0)  # birth-epoch speed faster than the transit
    assert E._is_applying(t, n, 0.0, freeze_b=True) is True
    # The unfrozen (natal-moves) reading disagrees — the old bug.
    assert E._is_applying(t, n, 0.0) is False


def test_applying_none_when_both_points_static():
    a = _pd("Ascendant", 100.0, 0.0)
    b = _pd("Midheaven", 190.0, 0.0)
    assert E._is_applying(a, b, 90.0) is None


# --- 2.8 _jd_to_utc second carry ------------------------------------------------

def test_jd_to_utc_carries_the_rounded_second():
    # 1987-11-11 23:59:59.7 UTC — rounding the second must carry to the next
    # day, not clamp to :59.
    jd = swe.julday(1987, 11, 11, 23 + 59 / 60.0 + 59.7 / 3600.0, swe.GREG_CAL)
    out = P._jd_to_utc(jd)
    assert out == dt.datetime(1987, 11, 12, 0, 0, 0, tzinfo=dt.timezone.utc), out
