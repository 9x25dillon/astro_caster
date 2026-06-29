"""
Verification tests for the math core. These assert against independently-known
astronomical facts, not against our own output, so they catch real regressions.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import astrology as A  # noqa: E402
import ephemeris as E  # noqa: E402
from models import ChartRequest  # noqa: E402


def _chart(**kw):
    base = dict(year=2000, month=1, day=1, hour=12, minute=0, second=0,
                lat=51.4769, lng=0.0, tz_offset=0.0)  # Greenwich, noon UTC
    base.update(kw)
    return E.calculate_chart(ChartRequest(**base))


def test_sun_position_j2000():
    """At 2000-01-01 12:00 UTC the Sun is ~280.4° (≈10°25' Capricorn)."""
    c = _chart()
    sun = next(p for p in c.planets if p.id == "Sun")
    assert sun.sign == "Capricorn", sun.sign
    assert abs(sun.longitude - 280.4) < 0.6, sun.longitude
    assert 9 <= sun.degree <= 11


def test_angular_separation_wraps():
    assert abs(A.angular_separation(350, 10) - 20) < 1e-9
    assert abs(A.angular_separation(10, 350) - 20) < 1e-9
    assert abs(A.angular_separation(0, 180) - 180) < 1e-9


def test_house_wrap_zero_cusp():
    # Cusps crossing 0° Aries: house 1 = 350°..20°.
    cusps = [350, 20, 50, 80, 110, 140, 170, 200, 230, 260, 290, 320]
    assert E._house_of(355, cusps) == 1
    assert E._house_of(5, cusps) == 1
    assert E._house_of(25, cusps) == 2


def test_retrograde_flag_matches_speed():
    c = _chart()
    for p in c.planets:
        if p.id in {"Ascendant", "Midheaven", "Part of Fortune", "South Node"}:
            continue
        assert p.retrograde == (p.speed < 0), p.id


def test_twelve_houses_and_angles_consistent():
    c = _chart()
    assert len(c.houses) == 12
    # Descendant is exactly opposite the Ascendant.
    assert abs(A.angular_separation(c.angles.ascendant, c.angles.descendant) - 180) < 1e-6
    assert abs(A.angular_separation(c.angles.midheaven, c.angles.imum_coeli) - 180) < 1e-6


def test_dignity_sun_in_leo_is_domicile():
    assert A.dignity_for("Sun", "Leo") == "Domicile"
    assert A.dignity_for("Sun", "Aquarius") == "Detriment"
    assert A.dignity_for("Sun", "Aries") == "Exaltation"
    assert A.dignity_for("Saturn", "Aries") == "Fall"


def test_sidereal_offset_from_tropical():
    """Lahiri sidereal Sun should sit ~24° earlier than tropical in 2000."""
    trop = _chart(zodiac="tropical")
    sid = _chart(zodiac="sidereal", ayanamsha=1)
    st = next(p for p in trop.planets if p.id == "Sun").longitude
    ss = next(p for p in sid.planets if p.id == "Sun").longitude
    diff = (st - ss) % 360
    assert 23 < diff < 25, diff


if __name__ == "__main__":
    # Allow running without pytest for a quick smoke check.
    import traceback
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    passed = 0
    for fn in fns:
        try:
            fn()
            print(f"  PASS {fn.__name__}")
            passed += 1
        except Exception:
            print(f"  FAIL {fn.__name__}")
            traceback.print_exc()
    print(f"\n{passed}/{len(fns)} passed")
