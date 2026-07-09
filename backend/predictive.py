"""
predictive.py
=============
Time-based techniques layered on the natal chart:

  * Secondary progressions — "a day for a year": advance the birth moment one day
    per year of life, recompute, and read the progressed planets (and their
    aspects back to the natal chart) as inner symbolic development.
  * Solar return — the chart for the exact moment each year that the transiting
    Sun returns to its natal ecliptic longitude; read as that year's theme.
  * Eclipse timeline — upcoming solar/lunar eclipses and which natal points they
    activate (conjunction / opposition within orb).

All symbolic, never deterministic prediction. Uses Swiss Ephemeris directly for
the Sun-longitude root-find and the eclipse search, and reuses ephemeris.py to
build the derived charts.
"""

from __future__ import annotations

import datetime as dt
from typing import List, Optional

import swisseph as swe
from pydantic import BaseModel, Field

import astrology as A
import ephemeris as E
from models import Angles, Aspect, ChartRequest, HouseCusp, PlanetData

# Reuse whatever ephemeris mode is active (Swiss files when SE_EPHE_PATH is set,
# Moshier otherwise) so results match the rest of the app.
_FLAGS = E._FLG_LON
_FLAGS_ECL = swe.FLG_SWIEPH | swe.FLG_MOSEPH

_TROPICAL_YEAR = 365.24219  # mean tropical year, days
_SUN_DEG_PER_DAY = 0.9856473
_SKIP = {"Descendant", "Imum Coeli", "Part of Fortune", "Lilith", "South Node"}

DISCLAIMER = (
    "Progressions, returns, and eclipses are symbolic timing mirrors for reflection, "
    "not deterministic predictions of fixed events."
)


# --------------------------------------------------------------------------- #
# Time helpers (timezone-aware UTC throughout)
# --------------------------------------------------------------------------- #


def _natal_utc(req: ChartRequest) -> dt.datetime:
    local = dt.datetime(req.year, req.month, req.day, req.hour, req.minute, req.second)
    return (local - dt.timedelta(hours=req.tz_offset)).replace(tzinfo=dt.timezone.utc)


def _parse_iso(s: str) -> dt.datetime:
    d = dt.datetime.fromisoformat(s.replace("Z", "+00:00"))
    return d if d.tzinfo else d.replace(tzinfo=dt.timezone.utc)


def _utc_to_request(d: dt.datetime, lat: float, lng: float, *,
                    house_system: str = "P", zodiac: str = "tropical",
                    ayanamsha: int = 1) -> ChartRequest:
    return ChartRequest(
        year=d.year, month=d.month, day=d.day, hour=d.hour, minute=d.minute,
        second=d.second, lat=lat, lng=lng, tz_offset=0.0,
        house_system=house_system, zodiac=zodiac, ayanamsha=ayanamsha,
    )


def _jd(d: dt.datetime) -> float:
    ut = d.hour + d.minute / 60.0 + d.second / 3600.0
    return swe.julday(d.year, d.month, d.day, ut, swe.GREG_CAL)


def _jd_to_utc(jd: float) -> dt.datetime:
    y, m, day, ut = swe.revjul(jd, swe.GREG_CAL)
    # timedelta normalizes the carry when rounding reaches :60 (a plain
    # min(s, 59) clamp silently loses up to a second).
    base = dt.datetime(y, m, day, tzinfo=dt.timezone.utc)
    return base + dt.timedelta(seconds=round(ut * 3600.0))


def _signed_delta(target: float, current: float) -> float:
    """Signed shortest angular distance target-current in (-180, 180]."""
    return ((target - current + 540.0) % 360.0) - 180.0


# --------------------------------------------------------------------------- #
# Models
# --------------------------------------------------------------------------- #


class ProgressedRequest(BaseModel):
    natal: ChartRequest
    target_iso: str = Field(..., description="Date to progress to, ISO-8601")


class ProgressedChart(BaseModel):
    age_years: float
    progressed_iso: str
    planets: List[PlanetData]
    aspects_to_natal: List[Aspect]
    disclaimer: str = DISCLAIMER
    meta: dict = Field(default_factory=dict)


class SolarReturnRequest(BaseModel):
    natal: ChartRequest
    year: int = Field(..., ge=-3000, le=3000)
    # Optional relocation; defaults to the birthplace.
    lat: Optional[float] = None
    lng: Optional[float] = None


class SolarReturnChart(BaseModel):
    year: int
    return_iso: str
    planets: List[PlanetData]
    houses: List[HouseCusp]
    angles: Angles
    aspects: List[Aspect]
    elements: dict
    modalities: dict
    disclaimer: str = DISCLAIMER
    meta: dict = Field(default_factory=dict)


class EclipseRequest(BaseModel):
    natal: ChartRequest
    start_iso: Optional[str] = None     # default: today
    count: int = Field(8, ge=1, le=40)  # number of eclipses to return


class EclipseContact(BaseModel):
    natal_body: str
    aspect: str          # "conjunction" | "opposition"
    orb: float


class EclipseEvent(BaseModel):
    date: str
    kind: str            # "solar" | "lunar"
    nature: str          # "total" | "annular" | "partial" | "penumbral" | ...
    longitude: float
    sign: str
    degree: int
    activations: List[EclipseContact] = Field(default_factory=list)


class EclipseTimelineResponse(BaseModel):
    start: str
    eclipses: List[EclipseEvent]
    disclaimer: str = DISCLAIMER


# --------------------------------------------------------------------------- #
# Secondary progressions
# --------------------------------------------------------------------------- #


def progressed_chart(natal: ChartRequest, target_iso: str) -> ProgressedChart:
    """Day-for-a-year secondary progression to `target_iso`."""
    natal_utc = _natal_utc(natal)
    target = _parse_iso(target_iso)
    age_years = (target - natal_utc).total_seconds() / (_TROPICAL_YEAR * 86400.0)

    # One day of ephemeris time per year of life.
    progressed_utc = natal_utc + dt.timedelta(days=age_years)
    prog_req = _utc_to_request(
        progressed_utc, natal.lat, natal.lng,
        house_system=natal.house_system, zodiac=natal.zodiac, ayanamsha=natal.ayanamsha,
    )
    prog = E.calculate_chart(prog_req)
    natal_chart = E.calculate_chart(natal)

    # Aspects from progressed planets back to the natal chart.
    aspects = E.aspects_between(natal_chart.planets, prog.planets)
    return ProgressedChart(
        age_years=round(age_years, 2),
        progressed_iso=progressed_utc.replace(microsecond=0).isoformat(),
        planets=prog.planets,
        aspects_to_natal=aspects,
        meta={"method": "secondary_progression", "ephem_iso": progressed_utc.date().isoformat()},
    )


# --------------------------------------------------------------------------- #
# Solar return
# --------------------------------------------------------------------------- #


def _sun_longitude(jd: float, flags: int = _FLAGS) -> float:
    return float(swe.calc_ut(jd, swe.SUN, flags)[0][0])


def solar_return_jd(natal_sun_lon: float, year: int, month: int, day: int,
                    flags: int = _FLAGS) -> float:
    """JD nearest the birthday in `year` when the Sun is at `natal_sun_lon`.

    `flags` must put the transiting Sun in the SAME zodiac frame as
    `natal_sun_lon` — comparing a sidereal natal longitude against tropical
    positions offsets the root-find by the ayanamsha (~24 days of Sun motion).
    """
    jd = swe.julday(year, month, day, 12.0, swe.GREG_CAL)
    for _ in range(10):
        delta = _signed_delta(natal_sun_lon, _sun_longitude(jd, flags))
        jd += delta / _SUN_DEG_PER_DAY
        if abs(delta) < 1e-7:
            break
    return jd


def solar_return(natal: ChartRequest, year: int,
                 lat: Optional[float] = None, lng: Optional[float] = None) -> SolarReturnChart:
    natal_chart = E.calculate_chart(natal)
    natal_sun = next(p for p in natal_chart.planets if p.id == "Sun")
    with E.swe_lock:
        # Root-find in the chart's own frame (sidereal natal Sun ⇒ sidereal
        # transiting Sun); the lock keeps the sid-mode set for the whole search.
        sid_flag = E._apply_zodiac(natal)
        jd = solar_return_jd(natal_sun.longitude, year, natal.month, natal.day,
                             _FLAGS | sid_flag)
    ret_utc = _jd_to_utc(jd)
    req = _utc_to_request(
        ret_utc,
        natal.lat if lat is None else lat,
        natal.lng if lng is None else lng,
        house_system=natal.house_system, zodiac=natal.zodiac, ayanamsha=natal.ayanamsha,
    )
    chart = E.calculate_chart(req)
    return SolarReturnChart(
        year=year,
        return_iso=ret_utc.replace(microsecond=0).isoformat(),
        planets=chart.planets, houses=chart.houses, angles=chart.angles,
        aspects=chart.aspects, elements=chart.elements, modalities=chart.modalities,
        meta={"method": "solar_return",
              "relocated": str(lat is not None or lng is not None)},
    )


# --------------------------------------------------------------------------- #
# Eclipse timeline
# --------------------------------------------------------------------------- #

_ECLIPSE_NATURE = [
    ("total", getattr(swe, "SE_ECL_TOTAL", 4)),
    ("annular_total", getattr(swe, "SE_ECL_ANNULAR_TOTAL", 32)),
    ("annular", getattr(swe, "SE_ECL_ANNULAR", 8)),
    ("partial", getattr(swe, "SE_ECL_PARTIAL", 16)),
    ("penumbral", getattr(swe, "SE_ECL_PENUMBRAL", 64)),
]
_ECLIPSE_ORB = 3.0


def _eclipse_nature(retflag: int) -> str:
    for name, bit in _ECLIPSE_NATURE:
        if retflag & bit:
            return name
    return "unknown"


def _eclipse_activations(eclipse_lon: float, natal_planets: List[PlanetData]) -> List[EclipseContact]:
    contacts: List[EclipseContact] = []
    for p in natal_planets:
        if p.id in _SKIP:
            continue
        sep = A.angular_separation(p.longitude, eclipse_lon)
        if sep <= _ECLIPSE_ORB:
            contacts.append(EclipseContact(natal_body=p.id, aspect="conjunction", orb=round(sep, 2)))
        elif abs(sep - 180.0) <= _ECLIPSE_ORB:
            contacts.append(EclipseContact(natal_body=p.id, aspect="opposition", orb=round(abs(sep - 180.0), 2)))
    contacts.sort(key=lambda c: c.orb)
    return contacts


def eclipse_timeline(natal: ChartRequest, start_iso: Optional[str] = None,
                     count: int = 8) -> EclipseTimelineResponse:
    natal_chart = E.calculate_chart(natal)
    start = _parse_iso(start_iso) if start_iso else dt.datetime.now(dt.timezone.utc)
    jd0 = _jd(start)

    found: List[tuple] = []   # (jd, retflag, kind)
    # Solar eclipses
    cur = jd0
    for _ in range(count):
        retflag, tret = swe.sol_eclipse_when_glob(cur, _FLAGS_ECL, 0, False)
        found.append((tret[0], retflag, "solar"))
        cur = tret[0] + 1.0
    # Lunar eclipses
    cur = jd0
    for _ in range(count):
        retflag, tret = swe.lun_eclipse_when(cur, _FLAGS_ECL, 0, False)
        found.append((tret[0], retflag, "lunar"))
        cur = tret[0] + 1.0

    found.sort(key=lambda t: t[0])
    events: List[EclipseEvent] = []
    with E.swe_lock:
        # The eclipse longitude is compared against (and displayed beside) the
        # natal chart's positions — compute it in the chart's zodiac frame.
        sid_flag = E._apply_zodiac(natal)
        lums = {jd_e: float(swe.calc_ut(jd_e, swe.SUN if kind == "solar" else swe.MOON,
                                        _FLAGS | sid_flag)[0][0])
                for jd_e, _retflag, kind in found[:count]}
    for jd_e, retflag, kind in found[:count]:
        lon = lums[jd_e]
        deg, _minute, _sec = A.degree_in_sign(lon)
        events.append(EclipseEvent(
            date=_jd_to_utc(jd_e).date().isoformat(),
            kind=kind, nature=_eclipse_nature(retflag),
            longitude=round(lon, 4), sign=A.sign_for(lon), degree=deg,
            activations=_eclipse_activations(lon, natal_chart.planets),
        ))
    return EclipseTimelineResponse(
        start=start.date().isoformat(), eclipses=events,
    )
