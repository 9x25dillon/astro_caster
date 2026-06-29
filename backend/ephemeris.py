"""
ephemeris.py
============
The mathematical core. Wraps pyswisseph (Swiss Ephemeris) to produce precise,
fully-typed chart data. Everything astronomical lives here; everything symbolic
lives in astrology.py.

Design priorities, in order:
  1. Correctness of the astronomy (Julian Day, UTC handling, flags).
  2. Completeness of points (luminaries, planets, nodes, Chiron, Lilith, Part of
     Fortune, Ascendant/MC).
  3. Clean, serializable output matching models.py.

Ephemeris files:
  pyswisseph ships with the Moshier analytical fallback, accurate to a few
  arc-seconds over ~3000 BC–3000 AD, so the API works with ZERO data files.
  For arc-second-perfect results (and asteroids like Chiron over long ranges)
  drop the official .se1 files into SE_EPHE_PATH and they are used automatically.
"""

from __future__ import annotations

import datetime as dt
import os
from typing import List, Optional, Tuple

import swisseph as swe

import astrology as A
from models import (
    Angles,
    Aspect,
    ChartRequest,
    ChartResponse,
    HouseCusp,
    PlanetData,
)
from patterns import detect_patterns

# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #

_EPHE_PATH = os.environ.get("SE_EPHE_PATH", "").strip()
if _EPHE_PATH and os.path.isdir(_EPHE_PATH):
    swe.set_ephe_path(_EPHE_PATH)
    _USING_FILES = True
else:
    # No data files: Moshier mode is self-contained and needs no path.
    _USING_FILES = False

# Body id -> (swisseph constant, glyph). Order defines display order.
_PLANET_TABLE: List[Tuple[str, int, str]] = [
    ("Sun", swe.SUN, "☉"),
    ("Moon", swe.MOON, "☽"),
    ("Mercury", swe.MERCURY, "☿"),
    ("Venus", swe.VENUS, "♀"),
    ("Mars", swe.MARS, "♂"),
    ("Jupiter", swe.JUPITER, "♃"),
    ("Saturn", swe.SATURN, "♄"),
    ("Uranus", swe.URANUS, "♅"),
    ("Neptune", swe.NEPTUNE, "♆"),
    ("Pluto", swe.PLUTO, "♇"),
    ("North Node", swe.TRUE_NODE, "☊"),   # true node; South is derived (+180°)
    ("Chiron", swe.CHIRON, "⚷"),
    ("Lilith", swe.MEAN_APOG, "⚸"),       # mean lunar apogee (Black Moon Lilith)
]

# Base ecliptic flags. FLG_SWIEPH uses .se1 files when present and silently
# degrades; we add FLG_MOSEPH explicitly when no files exist so Chiron etc.
# resolve via the analytical model rather than erroring.
_FLG_LON = swe.FLG_SPEED | (swe.FLG_SWIEPH if _USING_FILES else swe.FLG_MOSEPH)
_FLG_EQ = _FLG_LON | swe.FLG_EQUATORIAL


# --------------------------------------------------------------------------- #
# Time
# --------------------------------------------------------------------------- #


def _julian_day_utc(req: ChartRequest) -> float:
    """Convert local birth time + tz offset into a UTC Julian Day (ET/UT)."""
    # Build a naive local datetime, then shift to UTC by the supplied offset.
    local = dt.datetime(
        req.year, req.month, req.day, req.hour, req.minute, req.second
    )
    utc = local - dt.timedelta(hours=req.tz_offset)
    ut_hours = utc.hour + utc.minute / 60.0 + utc.second / 3600.0
    return swe.julday(utc.year, utc.month, utc.day, ut_hours, swe.GREG_CAL)


def julian_day_from_iso(iso: str) -> float:
    """Julian Day from an ISO-8601 UTC string (trailing Z accepted)."""
    iso = iso.replace("Z", "+00:00")
    d = dt.datetime.fromisoformat(iso)
    if d.tzinfo is not None:
        d = d.astimezone(dt.timezone.utc).replace(tzinfo=None)
    ut_hours = d.hour + d.minute / 60.0 + d.second / 3600.0
    return swe.julday(d.year, d.month, d.day, ut_hours, swe.GREG_CAL)


# --------------------------------------------------------------------------- #
# Sidereal handling
# --------------------------------------------------------------------------- #


def _apply_zodiac(req: ChartRequest) -> int:
    """Configure sidereal mode if requested and return the extra calc flag."""
    if req.zodiac == "sidereal":
        swe.set_sid_mode(req.ayanamsha, 0, 0)
        return swe.FLG_SIDEREAL
    return 0


# --------------------------------------------------------------------------- #
# Houses
# --------------------------------------------------------------------------- #


def _house_of(longitude: float, cusps: List[float]) -> int:
    """
    Return the 1..12 house index for an ecliptic longitude given 12 cusp
    longitudes. Handles the 360°→0° wrap so a planet at 359° in a house that
    starts at 350° and ends at 10° is placed correctly.
    """
    lon = A.norm360(longitude)
    for i in range(12):
        start = A.norm360(cusps[i])
        end = A.norm360(cusps[(i + 1) % 12])
        span = (end - start) % 360.0
        offset = (lon - start) % 360.0
        if offset < span:
            return i + 1
    return 12  # numerical fallback; should be unreachable


# --------------------------------------------------------------------------- #
# Core calculation
# --------------------------------------------------------------------------- #


def _calc_body(
    jd: float, swe_id: int, sid_flag: int
) -> Tuple[float, float, float, float]:
    """Return (longitude, latitude, speed_lon, declination) for one body."""
    lon_res, _ = swe.calc_ut(jd, swe_id, _FLG_LON | sid_flag)
    longitude, latitude, _dist, speed_lon = lon_res[0], lon_res[1], lon_res[2], lon_res[3]
    # Declination needs an equatorial call. Sidereal flag is irrelevant to dec.
    eq_res, _ = swe.calc_ut(jd, swe_id, _FLG_EQ)
    declination = eq_res[1]
    return longitude, latitude, speed_lon, declination


def _build_planet(
    name: str, glyph: str, longitude: float, latitude: float,
    speed: float, declination: float, cusps: List[float],
) -> PlanetData:
    sign = A.sign_for(longitude)
    d, m, s = A.degree_in_sign(longitude)
    return PlanetData(
        id=name,
        glyph=glyph,
        longitude=round(A.norm360(longitude), 6),
        latitude=round(latitude, 6),
        declination=round(declination, 6),
        speed=round(speed, 6),
        sign=sign,
        sign_glyph=A.SIGN_GLYPHS[sign],
        degree=d, minute=m, second=s,
        house=_house_of(longitude, cusps),
        retrograde=speed < 0,
        dignity=A.dignity_for(name, sign),
        element=A.ELEMENTS[sign],
        modality=A.MODALITIES[sign],
    )


def calculate_chart(req: ChartRequest) -> ChartResponse:
    jd = _julian_day_utc(req)
    sid_flag = _apply_zodiac(req)

    # --- Houses + angles --------------------------------------------------- #
    # swe.houses_ex honours the sidereal flag; returns (cusps[1..12], ascmc[]).
    cusps_raw, ascmc = swe.houses_ex(
        jd, req.lat, req.lng, req.house_system.encode("ascii"), sid_flag
    )
    cusps = [A.norm360(c) for c in cusps_raw]  # 12 cusps, index 0 == house 1

    asc = A.norm360(ascmc[0])
    mc = A.norm360(ascmc[1])
    vertex = A.norm360(ascmc[3]) if len(ascmc) > 3 else None
    angles = Angles(
        ascendant=round(asc, 6),
        midheaven=round(mc, 6),
        descendant=round(A.norm360(asc + 180), 6),
        imum_coeli=round(A.norm360(mc + 180), 6),
        vertex=round(vertex, 6) if vertex is not None else None,
    )

    # --- Planets + points -------------------------------------------------- #
    planets: List[PlanetData] = []
    sun_lon = moon_lon = None
    for name, swe_id, glyph in _PLANET_TABLE:
        try:
            lon, lat, spd, dec = _calc_body(jd, swe_id, sid_flag)
        except swe.Error:
            # A body (e.g. Chiron far outside ephemeris range) may be unavailable.
            continue
        p = _build_planet(name, glyph, lon, lat, spd, dec, cusps)
        planets.append(p)
        if name == "Sun":
            sun_lon = lon
        elif name == "Moon":
            moon_lon = lon
        if name == "North Node":
            # Derive the South Node opposite the North Node.
            south = A.norm360(lon + 180)
            planets.append(
                _build_planet("South Node", "☋", south, -lat, spd, -dec, cusps)
            )

    # Part of Fortune: Asc + Moon - Sun (day formula). Reverse for night charts.
    if sun_lon is not None and moon_lon is not None:
        is_day = _is_day_chart(sun_lon, asc)
        if is_day:
            pof = A.norm360(asc + moon_lon - sun_lon)
        else:
            pof = A.norm360(asc + sun_lon - moon_lon)
        planets.append(
            _build_planet("Part of Fortune", "⊗", pof, 0.0, 0.0, 0.0, cusps)
        )

    # Ascendant + Midheaven as pseudo-points (no speed/declination).
    planets.append(_build_planet("Ascendant", "Asc", asc, 0.0, 0.0, 0.0, cusps))
    planets.append(_build_planet("Midheaven", "MC", mc, 0.0, 0.0, 0.0, cusps))

    # --- House cusp objects ------------------------------------------------ #
    houses: List[HouseCusp] = []
    for i, c in enumerate(cusps):
        d, m, _ = A.degree_in_sign(c)
        houses.append(
            HouseCusp(index=i + 1, longitude=round(c, 6), sign=A.sign_for(c),
                      degree=d, minute=m)
        )

    # --- Aspects, patterns, elements -------------------------------------- #
    aspects = calculate_aspects(planets)
    patterns = detect_patterns(planets, aspects)
    elements, modalities = _tally_elements(planets)

    return ChartResponse(
        planets=planets,
        houses=houses,
        angles=angles,
        aspects=aspects,
        patterns=patterns,
        elements=elements,
        modalities=modalities,
        meta={
            "ephemeris": "swiss-files" if _USING_FILES else "moshier",
            "zodiac": req.zodiac,
            "house_system": req.house_system,
            "julian_day": f"{jd:.6f}",
        },
    )


def _is_day_chart(sun_lon: float, asc: float) -> bool:
    """Sun above the horizon => day chart. Sun is in houses 7-12 (above Asc-Desc)."""
    # Houses above the horizon span from Descendant to Ascendant going through MC.
    # Equivalent test: Sun is within 180° counter-clockwise of the Ascendant.
    rel = A.norm360(sun_lon - asc)
    return rel >= 180.0  # 180..360 == above horizon (7th..12th houses)


def _tally_elements(planets: List[PlanetData]):
    """Weighted element/modality tallies. Luminaries + Asc/MC count double."""
    elements = {"Fire": 0, "Earth": 0, "Air": 0, "Water": 0}
    modalities = {"Cardinal": 0, "Fixed": 0, "Mutable": 0}
    heavy = {"Sun", "Moon", "Ascendant", "Midheaven"}
    counted = {"Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn",
               "Uranus", "Neptune", "Pluto", "Ascendant", "Midheaven"}
    for p in planets:
        if p.id not in counted:
            continue
        w = 2 if p.id in heavy else 1
        elements[p.element] += w
        modalities[p.modality] += w
    return elements, modalities


# --------------------------------------------------------------------------- #
# Aspects
# --------------------------------------------------------------------------- #

# Points that are mathematically derived and shouldn't aspect their own source
# (e.g. Descendant always opposes Ascendant — not an interesting "aspect").
_NON_ASPECTING = {"Descendant", "Imum Coeli", "South Node"}


def calculate_aspects(
    planets: List[PlanetData], orb_factor: float = 1.0
) -> List[Aspect]:
    """
    All pairwise aspects among the given bodies, using each aspect's default orb
    scaled by orb_factor. Determines 'applying' from relative speeds.
    """
    aspects: List[Aspect] = []
    bodies = [p for p in planets if p.id not in _NON_ASPECTING]
    for i in range(len(bodies)):
        for j in range(i + 1, len(bodies)):
            a, b = bodies[i], bodies[j]
            sep = A.angular_separation(a.longitude, b.longitude)
            for ad in A.ASPECT_DEFS:
                orb = abs(sep - ad.angle)
                if orb <= ad.default_orb * orb_factor:
                    aspects.append(
                        Aspect(
                            p1=a.id, p2=b.id, type=ad.name, angle=ad.angle,
                            orb=round(orb, 2), separation=round(sep, 2),
                            harmony=ad.harmony, color=ad.color,
                            applying=_is_applying(a, b, ad.angle),
                        )
                    )
                    break  # one body-pair satisfies at most one aspect family
    # Tightest orbs first — most significant aspects on top.
    aspects.sort(key=lambda x: x.orb)
    return aspects


def _is_applying(a: PlanetData, b: PlanetData, target_angle: float) -> bool:
    """
    An aspect is *applying* when the separation is moving toward exactness.
    We nudge time forward by the relative motion and check if orb shrinks.
    """
    sep_now = A.angular_separation(a.longitude, b.longitude)
    future_a = a.longitude + a.speed * 0.01
    future_b = b.longitude + b.speed * 0.01
    sep_next = A.angular_separation(future_a, future_b)
    return abs(sep_next - target_angle) < abs(sep_now - target_angle)


# --------------------------------------------------------------------------- #
# Transits
# --------------------------------------------------------------------------- #


def calculate_transiting_planets(jd: float, req: ChartRequest) -> List[PlanetData]:
    """Positions of transiting bodies at a moment, placed in the natal houses."""
    sid_flag = _apply_zodiac(req)
    cusps_raw, _ascmc = swe.houses_ex(
        jd, req.lat, req.lng, req.house_system.encode("ascii"), sid_flag
    )
    cusps = [A.norm360(c) for c in cusps_raw]
    out: List[PlanetData] = []
    for name, swe_id, glyph in _PLANET_TABLE:
        try:
            lon, lat, spd, dec = _calc_body(jd, swe_id, sid_flag)
        except swe.Error:
            continue
        out.append(_build_planet(name, glyph, lon, lat, spd, dec, cusps))
    return out


def aspects_between(
    natal: List[PlanetData], transiting: List[PlanetData], orb_factor: float = 0.6
) -> List[Aspect]:
    """Cross-aspects from transiting bodies to natal bodies (tighter orbs)."""
    out: List[Aspect] = []
    natal_core = [p for p in natal if p.id not in _NON_ASPECTING]
    for t in transiting:
        for n in natal_core:
            sep = A.angular_separation(t.longitude, n.longitude)
            for ad in A.ASPECT_DEFS[:5]:  # major aspects only for transits
                orb = abs(sep - ad.angle)
                if orb <= ad.default_orb * orb_factor:
                    out.append(
                        Aspect(
                            p1=f"t:{t.id}", p2=n.id, type=ad.name, angle=ad.angle,
                            orb=round(orb, 2), separation=round(sep, 2),
                            harmony=ad.harmony, color=ad.color,
                            applying=_is_applying(t, n, ad.angle),
                        )
                    )
                    break
    out.sort(key=lambda x: x.orb)
    return out
