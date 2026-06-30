# ============================================================================
# DRAFT — engineered by the grok CLI (grok-composer-2.5-fast), reviewed by Claude.
# NOT wired into main.py. Roadmap item: Synastry / Composite / Davison (+ tarot).
# Imports cleanly; non-trivial paths marked # TODO. See PR description.
# ============================================================================
"""
synastry.py — DRAFT skeleton
============================
Relationship astrology module (Synastry, Composite, Davison, synastry-tarot sketch).
Non-production: non-trivial paths are marked with ``# TODO:``. Circular planet
midpoints use the short-arc rule:
(a + ((b - a + 540) % 360) - 180) % 360 (e.g. midpoint of 350° and 10° is 0°).
"""

from __future__ import annotations

import datetime as dt
import hashlib
import math
from typing import Dict, List, Optional, Tuple

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
from tarot_models import DISCLAIMER, NatalArcanaSignature

# --------------------------------------------------------------------------- #
# Requests / responses
# --------------------------------------------------------------------------- #


class SynastryRequest(BaseModel):
    person_a: ChartRequest
    person_b: ChartRequest


class HousePlanetOverlay(BaseModel):
    """A guest chart planet placed against the host chart's house cusps."""

    planet_id: str
    longitude: float
    host_house: int
    host_owner: str  # "a" or "b"


class SynastryGrid(BaseModel):
    b_in_a: List[HousePlanetOverlay] = Field(default_factory=list)
    a_in_b: List[HousePlanetOverlay] = Field(default_factory=list)


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
    """Local birth fields minus tz_offset → naive UTC datetime."""
    local = dt.datetime(
        req.year, req.month, req.day, req.hour, req.minute, req.second
    )
    return local - dt.timedelta(hours=req.tz_offset)


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
    utc = dt.datetime.utcfromtimestamp(ts)
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
    utc = dt.datetime(year, month, day, h, m, s)
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
    not a bug — the alternative is the derived-MC method, which needs a single
    reference latitude the composite does not actually have. # TODO (optional):
    offer a derived-MC variant keyed off the geographic-midpoint latitude.
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


def composite_midpoints(a: ChartResponse, b: ChartResponse) -> CompositeChart:
    """Circular midpoints of paired planets, with midpoint-composite houses."""
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

    # Midpoint-composite house cusps, then place each composite planet in them.
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
        meta={"method": "composite_midpoints", "houses": "midpoint_composite",
              "status": "draft"},
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

    # TODO: reciprocity matrix, house rulers, and weighted emphasis scores.
    return SynastryGrid(b_in_a=b_in_a, a_in_b=a_in_b)


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


def _deterministic_index(seed: str, n: int) -> int:
    if n <= 0:
        return 0
    digest = hashlib.sha256(seed.encode("utf-8")).hexdigest()
    return int(digest, 16) % n


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

    # TODO: weight bond card by synastry aspects + overlapping major_weights.
    bond_pool = shared or sorted(set(sig_a.themes) | set(sig_b.themes))
    seed = "|".join(
        sorted(p.id for p in a.planets[:3])
        + sorted(p.id for p in b.planets[:3])
        + [sig_a.dominant_element, sig_b.dominant_element]
    )
    bond_card = bond_pool[_deterministic_index(f"bond:{seed}", len(bond_pool))] if bond_pool else ""

    spread = SynastryTarotSpread(
        shared_themes=shared,
        complementary_shadows=comp_shadows[:6],
        bond_card=bond_card,
    )
    return SynastryTarotResponse(signature_a=sig_a, signature_b=sig_b, spread=spread)


# --------------------------------------------------------------------------- #
# FastAPI endpoint stubs (wire in main.py when ready)
# --------------------------------------------------------------------------- #
#
# from fastapi import HTTPException
#
# @app.post("/api/synastry", response_model=SynastryResponse)
# async def synastry_endpoint(req: SynastryRequest):
#     try:
#         return compute_synastry(req)
#     except Exception as exc:
#         raise HTTPException(status_code=400, detail=f"synastry failed: {exc}")
#
# @app.post("/api/composite", response_model=CompositeChart)
# async def composite_endpoint(req: SynastryRequest):
#     try:
#         a = E.calculate_chart(req.person_a)
#         b = E.calculate_chart(req.person_b)
#         return composite_midpoints(a, b)
#     except Exception as exc:
#         raise HTTPException(status_code=400, detail=f"composite failed: {exc}")
#
# @app.post("/api/davison", response_model=DavisonChart)
# async def davison_endpoint(req: SynastryRequest):
#     try:
#         return davison_chart(req.person_a, req.person_b)
#     except Exception as exc:
#         raise HTTPException(status_code=400, detail=f"davison failed: {exc}")
#
# @app.post("/api/synastry-tarot", response_model=SynastryTarotResponse)
# async def synastry_tarot_endpoint(req: SynastryRequest):
#     try:
#         a = E.calculate_chart(req.person_a)
#         b = E.calculate_chart(req.person_b)
#         return synastry_tarot(a, b)
#     except Exception as exc:
#         raise HTTPException(status_code=400, detail=f"synastry tarot failed: {exc}")
