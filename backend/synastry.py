"""
synastry.py
===========
Relationship astrology: Synastry (inter-aspects + house grid), Composite (midpoint
method, with houses + internal aspects/patterns), Davison (great-circle geographic
+ temporal midpoint, real ephemeris), and a chart-weighted synastry-tarot bond.

Originally drafted with the grok CLI, then completed + reviewed. Circular planet
midpoints use the short-arc rule: (a + (((b - a + 540) % 360) - 180) / 2) % 360
(e.g. midpoint of 350° and 10° is 0°). Symbolic, not deterministic prediction.

Remaining optional enhancements are marked ``# TODO (optional)``.
"""

from __future__ import annotations

import datetime as dt
import math
from typing import Dict, List, Literal, Optional, Tuple

import swisseph as swe
from pydantic import BaseModel, Field

import astrology as A
import ephemeris as E
from models import (
    Angles,
    Aspect,
    ChartRequest,
    ChartResponse,
    HouseCusp,
    Pattern,
    PlanetData,
)
from patterns import detect_patterns
from tarot import build_natal_arcana_signature
from tarot_data import MAJOR_BY_ID, PLANET_MAJOR
from tarot_models import DISCLAIMER, NatalArcanaSignature

# --------------------------------------------------------------------------- #
# Requests / responses
# --------------------------------------------------------------------------- #


class SynastryRequest(BaseModel):
    person_a: ChartRequest
    person_b: ChartRequest
    # Composite house convention: "midpoint" (default) or "derived" (derived-MC
    # at the geographic-midpoint latitude). Only affects /api/composite.
    house_method: Literal["midpoint", "derived"] = "midpoint"


class HousePlanetOverlay(BaseModel):
    """A guest chart planet placed against the host chart's house cusps."""

    planet_id: str
    longitude: float
    host_house: int
    host_owner: str  # "a" or "b"


class HouseEmphasis(BaseModel):
    """How many of the guest's planets land in a given host house."""
    host_owner: str          # "a" or "b" — whose houses
    house: int
    count: int
    planets: List[str] = Field(default_factory=list)


class RulerLink(BaseModel):
    """A host house's traditional ruler, and which of the OTHER chart's houses
    that ruling planet falls into — a house-rulership synastry contact."""
    host_owner: str          # whose house
    house: int
    cusp_sign: str
    ruler: str               # ruling planet of the cusp sign
    lands_in_other_house: int


class SynastryGrid(BaseModel):
    b_in_a: List[HousePlanetOverlay] = Field(default_factory=list)
    a_in_b: List[HousePlanetOverlay] = Field(default_factory=list)
    emphasis: List[HouseEmphasis] = Field(default_factory=list)
    rulers: List[RulerLink] = Field(default_factory=list)


class CompositeChart(BaseModel):
    planets: List[PlanetData]
    houses: List[HouseCusp] = Field(default_factory=list)
    angles: Optional[Angles] = None
    aspects: List[Aspect] = Field(default_factory=list)
    patterns: List[Pattern] = Field(default_factory=list)
    elements: Dict[str, int] = Field(default_factory=dict)
    modalities: Dict[str, int] = Field(default_factory=dict)
    disclaimer: str = DISCLAIMER
    meta: Dict[str, str] = Field(default_factory=dict)


class DavisonChart(BaseModel):
    planets: List[PlanetData]
    houses: List[HouseCusp]
    angles: Angles
    aspects: List[Aspect]
    elements: Dict[str, int]
    modalities: Dict[str, int]
    disclaimer: str = DISCLAIMER
    meta: Dict[str, str] = Field(default_factory=dict)


class SynastryResponse(BaseModel):
    chart_a: ChartResponse
    chart_b: ChartResponse
    inter_aspects: List[Aspect]
    grid: SynastryGrid
    disclaimer: str = DISCLAIMER


class SynastryTarotSpread(BaseModel):
    shared_themes: List[str] = Field(default_factory=list)
    complementary_shadows: List[str] = Field(default_factory=list)
    bond_card: str = ""


class SynastryTarotResponse(BaseModel):
    signature_a: NatalArcanaSignature
    signature_b: NatalArcanaSignature
    spread: SynastryTarotSpread
    disclaimer: str = DISCLAIMER


# --------------------------------------------------------------------------- #
# Circular midpoints
# --------------------------------------------------------------------------- #


def circular_midpoint(lon_a: float, lon_b: float) -> float:
    """Short-arc circular midpoint on the ecliptic, in [0, 360).

    NOTE: the formula originally handed to the drafting agent was wrong — it
    computed ``a + full_delta`` (which lands on ``b``) instead of ``a + delta/2``.
    Fixed here: take the SIGNED short arc a->b in (-180, 180], then halve it.
    The opposite midpoint (this + 180) is equally valid; composite convention
    keeps the one nearer the two points.
    """
    a = A.norm360(lon_a)
    b = A.norm360(lon_b)
    delta = ((b - a + 540.0) % 360.0) - 180.0   # signed short arc, (-180, 180]
    return (a + delta / 2.0) % 360.0


# --------------------------------------------------------------------------- #
# ChartRequest <-> time helpers (Davison)
# --------------------------------------------------------------------------- #


def chart_request_to_utc_datetime(req: ChartRequest) -> dt.datetime:
    """Local birth fields minus tz_offset → timezone-aware UTC datetime.

    Aware (not naive) so .timestamp() is a true UTC epoch regardless of the
    server's local timezone — important so the Davison time-midpoint is stable.
    """
    local = dt.datetime(
        req.year, req.month, req.day, req.hour, req.minute, req.second
    )
    return (local - dt.timedelta(hours=req.tz_offset)).replace(tzinfo=dt.timezone.utc)


def chart_request_to_timestamp(req: ChartRequest) -> float:
    """UTC Unix timestamp for the instant described by ``req``."""
    return chart_request_to_utc_datetime(req).timestamp()


def timestamp_to_chart_request_utc(
    ts: float,
    lat: float,
    lng: float,
    *,
    house_system: str = "P",
    zodiac: str = "tropical",
    ayanamsha: int = 1,
) -> ChartRequest:
    """Build a ``ChartRequest`` whose fields are UTC civil time (tz_offset=0)."""
    utc = dt.datetime.fromtimestamp(ts, dt.timezone.utc)
    return ChartRequest(
        year=utc.year,
        month=utc.month,
        day=utc.day,
        hour=utc.hour,
        minute=utc.minute,
        second=utc.second,
        lat=lat,
        lng=lng,
        tz_offset=0.0,
        house_system=house_system,
        zodiac=zodiac,
        ayanamsha=ayanamsha,
    )


def chart_request_to_julian_day(req: ChartRequest) -> float:
    utc = chart_request_to_utc_datetime(req)
    ut_hours = utc.hour + utc.minute / 60.0 + utc.second / 3600.0
    return swe.julday(utc.year, utc.month, utc.day, ut_hours, swe.GREG_CAL)


def julian_day_to_timestamp(jd: float) -> float:
    year, month, day, ut_hours = swe.revjul(jd, swe.GREG_CAL)
    h = int(ut_hours)
    rem = (ut_hours - h) * 60.0
    m = int(rem)
    s = int((rem - m) * 60.0)
    utc = dt.datetime(year, month, day, h, m, s, tzinfo=dt.timezone.utc)
    return utc.timestamp()


# --------------------------------------------------------------------------- #
# House overlay helpers
# --------------------------------------------------------------------------- #

_ANGLE_IDS = {"Ascendant", "Midheaven", "Descendant", "Imum Coeli"}


def _house_cusps(chart: ChartResponse) -> List[float]:
    return [h.longitude for h in chart.houses]


def _house_of_longitude(longitude: float, cusps: List[float]) -> int:
    lon = A.norm360(longitude)
    for i in range(12):
        start = A.norm360(cusps[i])
        end = A.norm360(cusps[(i + 1) % 12])
        span = (end - start) % 360.0
        offset = (lon - start) % 360.0
        if offset < span:
            return i + 1
    return 12


def _planet_index(chart: ChartResponse) -> Dict[str, PlanetData]:
    return {p.id: p for p in chart.planets}


def _build_midpoint_planet(base: PlanetData, longitude: float, house: int = 0) -> PlanetData:
    sign = A.sign_for(longitude)
    d, m, s = A.degree_in_sign(longitude)
    return PlanetData(
        id=base.id,
        glyph=base.glyph,
        longitude=round(A.norm360(longitude), 6),
        latitude=round(base.latitude / 2.0, 6),
        declination=round(base.declination, 6),
        speed=0.0,
        sign=sign,
        sign_glyph=A.SIGN_GLYPHS[sign],
        degree=d,
        minute=m,
        second=s,
        house=house,
        retrograde=False,
        dignity=A.dignity_for(base.id, sign),
        element=A.ELEMENTS[sign],
        modality=A.MODALITIES[sign],
    )


def _tally_elements_modalities(planets: List[PlanetData]) -> Tuple[Dict[str, int], Dict[str, int]]:
    elements = {"Fire": 0, "Earth": 0, "Air": 0, "Water": 0}
    modalities = {"Cardinal": 0, "Fixed": 0, "Mutable": 0}
    heavy = {"Sun", "Moon", "Ascendant", "Midheaven"}
    for p in planets:
        if p.id in _ANGLE_IDS and p.id not in {"Ascendant", "Midheaven"}:
            continue
        w = 2 if p.id in heavy else 1
        elements[p.element] = elements.get(p.element, 0) + w
        modalities[p.modality] = modalities.get(p.modality, 0) + w
    return elements, modalities


# --------------------------------------------------------------------------- #
# Composite (midpoint method)
# --------------------------------------------------------------------------- #


def composite_house_cusps(a: ChartResponse, b: ChartResponse) -> List[HouseCusp]:
    """
    Midpoint-composite house cusps: the circular midpoint of each paired cusp
    from the two natal charts (cusp i of A with cusp i of B). This is consistent
    with the midpoint planets and with the composite Asc/MC, since a natal 1st
    cusp == Ascendant and 10th cusp == MC.

    Known property: independently midpointing each cusp can occasionally yield
    slightly non-monotonic or unevenly-sized houses (the houses may not increase
    strictly around the wheel). That is inherent to the midpoint-composite method,
    not a bug — the alternative is the derived-MC method (see
    ``derived_composite_houses``), which keys off the geographic-midpoint latitude.
    """
    if not a.houses or not b.houses:
        return []
    by_index_b = {h.index: h for h in b.houses}
    cusps: List[HouseCusp] = []
    for ha in sorted(a.houses, key=lambda h: h.index):
        hb = by_index_b.get(ha.index)
        if hb is None:
            continue
        lon = circular_midpoint(ha.longitude, hb.longitude)
        d, m, _s = A.degree_in_sign(lon)
        cusps.append(HouseCusp(index=ha.index, longitude=round(lon, 6),
                               sign=A.sign_for(lon), degree=d, minute=m))
    return cusps


# Mean obliquity of the ecliptic at J2000 (degrees); changes < 0.01°/century, so
# a fixed value is plenty for deriving composite houses.
_OBLIQUITY_J2000 = 23.4392911


def derived_composite_houses(
    mc_lon: float, geo_lat: float, house_system: str = "P"
) -> Tuple[List[HouseCusp], float]:
    """
    Derived-MC composite houses: take the composite MC, convert it to a Right
    Ascension of the Midheaven (RAMC), then build a real house framework at the
    geographic-midpoint latitude. Unlike the midpoint method this guarantees
    monotonic, properly-shaped houses and a geometrically-derived Ascendant.

    Returns (12 cusps, derived_ascendant_longitude).
    """
    eps = math.radians(_OBLIQUITY_J2000)
    lam = math.radians(mc_lon % 360.0)
    # RA of an ecliptic point at zero latitude (the MC).
    armc = math.degrees(math.atan2(math.sin(lam) * math.cos(eps), math.cos(lam))) % 360.0
    cusps_raw, ascmc = swe.houses_armc(
        armc, geo_lat, _OBLIQUITY_J2000, house_system.encode("ascii")
    )
    cusps: List[HouseCusp] = []
    for i in range(12):
        lon = A.norm360(cusps_raw[i])
        d, m, _s = A.degree_in_sign(lon)
        cusps.append(HouseCusp(index=i + 1, longitude=round(lon, 6),
                               sign=A.sign_for(lon), degree=d, minute=m))
    return cusps, A.norm360(ascmc[0])


def composite_midpoints(
    a: ChartResponse, b: ChartResponse,
    house_method: str = "midpoint", geo_lat: Optional[float] = None,
) -> CompositeChart:
    """
    Circular midpoints of paired planets. Houses by one of two conventions:
      * "midpoint" (default) — circular midpoint of each paired natal cusp.
      * "derived"  — derived-MC method at `geo_lat` (falls back to midpoint when
        geo_lat or the composite MC is unavailable).
    """
    idx_a = _planet_index(a)
    idx_b = _planet_index(b)
    shared_ids = sorted(set(idx_a) & set(idx_b) - _ANGLE_IDS)

    composite_planets: List[PlanetData] = []
    for pid in shared_ids:
        pa, pb = idx_a[pid], idx_b[pid]
        mid_lon = circular_midpoint(pa.longitude, pb.longitude)
        composite_planets.append(_build_midpoint_planet(pa, mid_lon, house=0))

    comp_angles: Optional[Angles] = None
    if a.angles and b.angles:
        asc = circular_midpoint(a.angles.ascendant, b.angles.ascendant)
        mc = circular_midpoint(a.angles.midheaven, b.angles.midheaven)
        comp_angles = Angles(
            ascendant=round(asc, 6),
            midheaven=round(mc, 6),
            descendant=round(A.norm360(asc + 180.0), 6),
            imum_coeli=round(A.norm360(mc + 180.0), 6),
            vertex=None,
        )

    # House cusps by the chosen method, then place each composite planet in them.
    houses_kind = "midpoint_composite"
    if (house_method == "derived" and comp_angles is not None and geo_lat is not None):
        houses, derived_asc = derived_composite_houses(comp_angles.midheaven, geo_lat)
        houses_kind = "derived_mc"
        # The derived Ascendant supersedes the midpoint Ascendant in this method.
        comp_angles = Angles(
            ascendant=round(derived_asc, 6),
            midheaven=comp_angles.midheaven,
            descendant=round(A.norm360(derived_asc + 180.0), 6),
            imum_coeli=comp_angles.imum_coeli,
            vertex=None,
        )
    else:
        houses = composite_house_cusps(a, b)
    if houses:
        cusp_lons = [h.longitude for h in sorted(houses, key=lambda h: h.index)]
        for p in composite_planets:
            p.house = _house_of_longitude(p.longitude, cusp_lons)

    # Internal composite aspects + classical patterns, reusing the chart engine
    # (composite planets carry speed=0, so 'applying' is reported as separating).
    comp_aspects = E.calculate_aspects(composite_planets)
    comp_patterns = detect_patterns(composite_planets, comp_aspects)

    elements, modalities = _tally_elements_modalities(composite_planets)
    return CompositeChart(
        planets=composite_planets,
        houses=houses,
        angles=comp_angles,
        aspects=comp_aspects,
        patterns=comp_patterns,
        elements=elements,
        modalities=modalities,
        meta={"method": "composite_midpoints", "houses": houses_kind},
    )


# --------------------------------------------------------------------------- #
# Davison (midpoint in time and space)
# --------------------------------------------------------------------------- #


def _geographic_midpoint(
    lat_a: float, lng_a: float, lat_b: float, lng_b: float
) -> Tuple[float, float]:
    """
    Great-circle (spherical) midpoint of two birth coordinates, returned as
    (lat, lng) in degrees with lng normalised to [-180, 180].

    This is the correct Davison geographic midpoint: the naive arithmetic mean of
    latitudes/longitudes is wrong on a sphere and breaks across the antimeridian
    (e.g. +179° and -179° should average to 180°, not 0°). Uses the standard
    unit-vector method.
    """
    la1, lo1, la2, lo2 = map(math.radians, (lat_a, lng_a, lat_b, lng_b))
    d_lon = lo2 - lo1
    bx = math.cos(la2) * math.cos(d_lon)
    by = math.cos(la2) * math.sin(d_lon)
    lat_mid = math.atan2(
        math.sin(la1) + math.sin(la2),
        math.sqrt((math.cos(la1) + bx) ** 2 + by ** 2),
    )
    lon_mid = lo1 + math.atan2(by, math.cos(la1) + bx)
    lon_deg = (math.degrees(lon_mid) + 540.0) % 360.0 - 180.0
    return round(math.degrees(lat_mid), 6), round(lon_deg, 6)


def davison_chart(a: ChartRequest, b: ChartRequest) -> DavisonChart:
    """Midpoint birth instant (UTC) and geographic midpoint, then real ephemeris."""
    ts_a = chart_request_to_timestamp(a)
    ts_b = chart_request_to_timestamp(b)
    ts_mid = (ts_a + ts_b) / 2.0

    lat_mid, lng_mid = _geographic_midpoint(a.lat, a.lng, b.lat, b.lng)

    mid_req = timestamp_to_chart_request_utc(
        ts_mid,
        lat_mid,
        lng_mid,
        house_system=a.house_system,
        zodiac=a.zodiac,
        ayanamsha=a.ayanamsha,
    )
    chart = E.calculate_chart(mid_req)
    return DavisonChart(
        planets=chart.planets,
        houses=chart.houses,
        angles=chart.angles,
        aspects=chart.aspects,
        elements=chart.elements,
        modalities=chart.modalities,
        meta={**chart.meta, "method": "davison", "status": "draft"},
    )


# --------------------------------------------------------------------------- #
# Synastry inter-aspects and house grid
# --------------------------------------------------------------------------- #


def synastry_aspects(a: ChartResponse, b: ChartResponse) -> List[Aspect]:
    return E.aspects_between(a.planets, b.planets)


def synastry_grid(a: ChartResponse, b: ChartResponse) -> SynastryGrid:
    cusps_a = _house_cusps(a)
    cusps_b = _house_cusps(b)

    b_in_a: List[HousePlanetOverlay] = []
    for p in b.planets:
        if p.id in _ANGLE_IDS:
            continue
        b_in_a.append(
            HousePlanetOverlay(
                planet_id=p.id,
                longitude=p.longitude,
                host_house=_house_of_longitude(p.longitude, cusps_a),
                host_owner="a",
            )
        )

    a_in_b: List[HousePlanetOverlay] = []
    for p in a.planets:
        if p.id in _ANGLE_IDS:
            continue
        a_in_b.append(
            HousePlanetOverlay(
                planet_id=p.id,
                longitude=p.longitude,
                host_house=_house_of_longitude(p.longitude, cusps_b),
                host_owner="b",
            )
        )

    emphasis = _house_emphasis(b_in_a, "a") + _house_emphasis(a_in_b, "b")
    rulers = _ruler_links(a, b, cusps_b, "a") + _ruler_links(b, a, cusps_a, "b")
    return SynastryGrid(b_in_a=b_in_a, a_in_b=a_in_b, emphasis=emphasis, rulers=rulers)


# Traditional (seven-planet) rulers of each sign.
_SIGN_RULER: Dict[str, str] = {
    "Aries": "Mars", "Taurus": "Venus", "Gemini": "Mercury", "Cancer": "Moon",
    "Leo": "Sun", "Virgo": "Mercury", "Libra": "Venus", "Scorpio": "Mars",
    "Sagittarius": "Jupiter", "Capricorn": "Saturn", "Aquarius": "Saturn",
    "Pisces": "Jupiter",
}


def _house_emphasis(overlays: List[HousePlanetOverlay], host_owner: str) -> List[HouseEmphasis]:
    """Reciprocity summary: how many guest planets land in each host house."""
    buckets: Dict[int, List[str]] = {}
    for o in overlays:
        buckets.setdefault(o.host_house, []).append(o.planet_id)
    out = [HouseEmphasis(host_owner=host_owner, house=h, count=len(ps), planets=ps)
           for h, ps in buckets.items()]
    out.sort(key=lambda e: (-e.count, e.house))
    return out


def _ruler_links(host: ChartResponse, other: ChartResponse,
                 other_cusps: List[float], host_owner: str) -> List[RulerLink]:
    """For each host house, its cusp-sign ruler and which OTHER-chart house that
    ruling planet falls into (a house-rulership synastry contact)."""
    host_planets = _planet_index(host)
    links: List[RulerLink] = []
    for h in sorted(host.houses, key=lambda x: x.index):
        ruler = _SIGN_RULER.get(h.sign)
        rp = host_planets.get(ruler) if ruler else None
        if rp is None:
            continue
        links.append(RulerLink(
            host_owner=host_owner, house=h.index, cusp_sign=h.sign, ruler=ruler,
            lands_in_other_house=_house_of_longitude(rp.longitude, other_cusps),
        ))
    return links


def compute_synastry(req: SynastryRequest) -> SynastryResponse:
    chart_a = E.calculate_chart(req.person_a)
    chart_b = E.calculate_chart(req.person_b)
    return SynastryResponse(
        chart_a=chart_a,
        chart_b=chart_b,
        inter_aspects=synastry_aspects(chart_a, chart_b),
        grid=synastry_grid(chart_a, chart_b),
    )


# --------------------------------------------------------------------------- #
# Synastry tarot (deterministic sketch)
# --------------------------------------------------------------------------- #


def _bond_weights(
    sig_a: NatalArcanaSignature,
    sig_b: NatalArcanaSignature,
    inter_aspects: List[Aspect],
) -> Dict[str, float]:
    """
    Per-trump weight for the relationship's 'bond' card. Two ingredients:
      1. Combined natal emphasis — a card both charts already weight scores high
         (sig_a.major_weights + sig_b.major_weights).
      2. Synastry-aspect density — each inter-aspect touching a planet adds weight
         to that planet's trump, so the bond reflects where the two charts actually
         make contact, not just static emphasis.
    """
    weights: Dict[str, float] = {}
    for cid, w in sig_a.major_weights.items():
        weights[cid] = weights.get(cid, 0.0) + w
    for cid, w in sig_b.major_weights.items():
        weights[cid] = weights.get(cid, 0.0) + w

    touches: Dict[str, int] = {}
    for asp in inter_aspects:
        for pid in (asp.p1, asp.p2):
            name = pid[2:] if pid.startswith("t:") else pid  # strip synastry tag
            touches[name] = touches.get(name, 0) + 1
    for planet, cid in PLANET_MAJOR.items():
        if planet in touches:
            weights[cid] = weights.get(cid, 0.0) + 0.5 * touches[planet]
    return weights


def synastry_tarot(a: ChartResponse, b: ChartResponse) -> SynastryTarotResponse:
    sig_a = build_natal_arcana_signature(a)
    sig_b = build_natal_arcana_signature(b)

    shared = sorted(set(sig_a.themes) & set(sig_b.themes))

    comp_shadows: List[str] = []
    for sa in sig_a.shadows:
        for sb in sig_b.shadows:
            if sa != sb:
                comp_shadows.append(f"{sa} ↔ {sb}")
    comp_shadows = sorted(set(comp_shadows))

    # Bond card: the highest-weighted trump (combined emphasis + synastry contact),
    # preferring a shared theme when the two charts have one. Deterministic — ties
    # break by card id, no RNG.
    weights = _bond_weights(sig_a, sig_b, synastry_aspects(a, b))
    shared_ids = {cid for cid, c in MAJOR_BY_ID.items() if c["name"] in shared}
    pool = shared_ids or set(weights)
    bond_id = max(pool, key=lambda cid: (weights.get(cid, 0.0), cid),
                  default="") if pool else ""
    bond_card = MAJOR_BY_ID[bond_id]["name"] if bond_id in MAJOR_BY_ID else ""

    spread = SynastryTarotSpread(
        shared_themes=shared,
        complementary_shadows=comp_shadows[:6],
        bond_card=bond_card,
    )
    return SynastryTarotResponse(signature_a=sig_a, signature_b=sig_b, spread=spread)


# Endpoints live in main.py: /api/synastry, /api/composite, /api/davison,
# /api/synastry-tarot — all POST a SynastryRequest{person_a, person_b}.
