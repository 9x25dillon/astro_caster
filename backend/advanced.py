"""
advanced.py
===========
Specialist chart techniques layered on the natal chart:

  * Harmonic charts — multiply every position by N (mod 360) to surface the Nth
    harmonic's hidden resonance (5th = creativity, 7th = inspiration, 9th = joy…).
  * Midpoint trees — the Ebertin 90°-dial network: for each planetary midpoint,
    which bodies sit on it (conjunction / square / opposition within orb).
  * Fixed stars — conjunctions of natal bodies to major fixed stars, using a
    self-contained precession-adjusted catalogue (no external star file needed).

All symbolic, never deterministic prediction.
"""

from __future__ import annotations

from typing import Dict, List

import swisseph as swe
from pydantic import BaseModel, Field

import astrology as A
import ephemeris as E
from models import ChartRequest

# Bodies excluded from these techniques (derived / non-physical points).
_SKIP = {"Descendant", "Imum Coeli", "Part of Fortune", "Lilith", "South Node"}
_DIAL_BODIES_SKIP = {"Descendant", "Imum Coeli", "Part of Fortune"}

DISCLAIMER = (
    "Harmonics, midpoints, and fixed-star contacts are symbolic lenses for "
    "reflection, not deterministic predictions."
)


def _circular_midpoint(a: float, b: float) -> float:
    a, b = a % 360.0, b % 360.0
    delta = ((b - a + 540.0) % 360.0) - 180.0
    return (a + delta / 2.0) % 360.0


# --------------------------------------------------------------------------- #
# Models
# --------------------------------------------------------------------------- #


class HarmonicRequest(BaseModel):
    natal: ChartRequest
    harmonic: int = Field(5, ge=1, le=64)


class HarmonicPosition(BaseModel):
    id: str
    glyph: str
    longitude: float
    sign: str
    sign_glyph: str
    degree: int
    minute: int


class HarmonicChart(BaseModel):
    harmonic: int
    positions: List[HarmonicPosition]
    aspects: List[dict] = Field(default_factory=list)  # conjunctions in the harmonic
    disclaimer: str = DISCLAIMER


class MidpointRequest(BaseModel):
    natal: ChartRequest
    orb: float = Field(1.0, ge=0.1, le=3.0)


class MidpointContact(BaseModel):
    body: str
    angle: int          # 0 / 90 / 180 / 270 — position on the 90° dial
    aspect: str         # "conjunction" | "square" | "opposition"
    orb: float


class MidpointTreeEntry(BaseModel):
    pair: str           # "Sun/Moon"
    midpoint: float
    sign: str
    degree: int
    contacts: List[MidpointContact]


class MidpointTreeResponse(BaseModel):
    orb: float
    entries: List[MidpointTreeEntry]
    disclaimer: str = DISCLAIMER


class FixedStarRequest(BaseModel):
    natal: ChartRequest
    orb: float = Field(1.5, ge=0.1, le=3.0)


class FixedStarHit(BaseModel):
    star: str
    star_longitude: float
    sign: str
    degree: int
    nature: str
    natal_body: str
    orb: float


class FixedStarResponse(BaseModel):
    orb: float
    hits: List[FixedStarHit]
    disclaimer: str = DISCLAIMER


# --------------------------------------------------------------------------- #
# Harmonic charts
# --------------------------------------------------------------------------- #


def harmonic_chart(natal: ChartRequest, harmonic: int) -> HarmonicChart:
    chart = E.calculate_chart(natal)
    positions: List[HarmonicPosition] = []
    for p in chart.planets:
        if p.id in _SKIP:
            continue
        lon = (p.longitude * harmonic) % 360.0
        deg, minute, _ = A.degree_in_sign(lon)
        sign = A.sign_for(lon)
        positions.append(HarmonicPosition(
            id=p.id, glyph=p.glyph, longitude=round(lon, 4),
            sign=sign, sign_glyph=A.SIGN_GLYPHS[sign], degree=deg, minute=minute,
        ))
    # Conjunctions in the harmonic chart (where bodies cluster = the resonance).
    aspects: List[dict] = []
    for i in range(len(positions)):
        for j in range(i + 1, len(positions)):
            sep = A.angular_separation(positions[i].longitude, positions[j].longitude)
            if sep <= 2.0:
                aspects.append({"p1": positions[i].id, "p2": positions[j].id,
                                "type": "Conjunction", "orb": round(sep, 2)})
    return HarmonicChart(harmonic=harmonic, positions=positions, aspects=aspects)


# --------------------------------------------------------------------------- #
# Midpoint trees (90° dial)
# --------------------------------------------------------------------------- #

# 0/90/180 cover the whole 90° dial: angular_separation lives in [0, 180], so a
# 270° contact is indistinguishable from 90° and needs no entry of its own.
_DIAL_ANGLES = [(0, "conjunction"), (90, "square"), (180, "opposition")]


def midpoint_tree(natal: ChartRequest, orb: float = 1.0) -> MidpointTreeResponse:
    chart = E.calculate_chart(natal)
    bodies = [p for p in chart.planets if p.id not in _DIAL_BODIES_SKIP]
    entries: List[MidpointTreeEntry] = []

    for i in range(len(bodies)):
        for j in range(i + 1, len(bodies)):
            a, b = bodies[i], bodies[j]
            mid = _circular_midpoint(a.longitude, b.longitude)
            contacts: List[MidpointContact] = []
            for c in bodies:
                if c.id in (a.id, b.id):
                    continue
                sep = A.angular_separation(c.longitude, mid)   # 0..180
                for target, name in _DIAL_ANGLES:
                    if abs(sep - target) <= orb:
                        contacts.append(MidpointContact(
                            body=c.id, angle=target, aspect=name,
                            orb=round(abs(sep - target), 2),
                        ))
                        break
            if contacts:
                deg, _m, _s = A.degree_in_sign(mid)
                contacts.sort(key=lambda x: x.orb)
                entries.append(MidpointTreeEntry(
                    pair=f"{a.id}/{b.id}", midpoint=round(mid, 3),
                    sign=A.sign_for(mid), degree=deg, contacts=contacts,
                ))
    entries.sort(key=lambda e: e.contacts[0].orb if e.contacts else 99)
    return MidpointTreeResponse(orb=orb, entries=entries)


# --------------------------------------------------------------------------- #
# Fixed stars — precession-adjusted catalogue (J2000 ecliptic longitudes)
# --------------------------------------------------------------------------- #
# lon at year = lon2000 + 50.29"/yr * (year - 2000). 50.29" = 0.0139694°.

_PRECESSION_PER_YEAR = 0.0139694

# name: (J2000 ecliptic longitude, short Ptolemaic nature)
_FIXED_STARS: Dict[str, tuple] = {
    "Algol":      (56.167, "intensity, the unflinching gaze; passion that must be owned"),
    "Pleiades":   (60.000, "vision and grief; 'something to weep about', sight beyond sight"),
    "Aldebaran":  (69.783, "the Watcher of the East; integrity, courage, honour-through-trial"),
    "Rigel":      (76.833, "teaching, ascent, the bringer of knowledge"),
    "Bellatrix":  (80.767, "swift success, the warrior-woman; quick wit"),
    "Capella":    (81.850, "curiosity, freedom, an inquisitive mind"),
    "Betelgeuse": (88.750, "martial honour, enduring fortune"),
    "Sirius":     (104.083, "the brilliant one; ambition, the sacred fire, renown"),
    "Castor":     (110.150, "the mind sharpened; sudden fame or sudden loss"),
    "Pollux":     (113.217, "the artful, competitive spirit; martial intensity"),
    "Procyon":    (115.783, "rapid rise then fall; act, don't drift"),
    "Regulus":    (149.833, "the Heart of the Lion; royalty, success that pride can undo"),
    "Spica":      (203.833, "the gift; brilliance, blessing, protected talent"),
    "Arcturus":   (204.233, "the guardian; new paths, pathfinding prosperity"),
    "Antares":    (249.767, "the Watcher of the West; obsessive intensity, all-or-nothing"),
    "Vega":       (285.317, "charisma and artistry; the magical, fleeting gift"),
    "Fomalhaut":  (333.867, "the visionary; idealism that can purify or intoxicate"),
    "Markab":     (353.483, "steadiness under pressure; the return, things made firm"),
}


def _star_longitude(lon2000: float, year: int) -> float:
    return (lon2000 + _PRECESSION_PER_YEAR * (year - 2000)) % 360.0


def fixed_star_hits(natal: ChartRequest, orb: float = 1.5) -> FixedStarResponse:
    chart = E.calculate_chart(natal)
    year = natal.year
    # The catalogue precesses in the TROPICAL frame; a sidereal chart's planet
    # longitudes sit an ayanamsha (~24°) away. Shift each star into the chart's
    # frame before comparing (and report it there, beside the chart). The
    # offset is derived from the Sun's tropical−sidereal difference — the SAME
    # transformation the chart's planets got — rather than get_ayanamsa_ut,
    # which differs by nutation (~17″) and would sit inconsistently beside
    # the chart's own longitudes.
    ayanamsha = 0.0
    if natal.zodiac == "sidereal":
        with E.swe_lock:
            sid_flag = E._apply_zodiac(natal)
            jd = E._julian_day_utc(natal)
            sid_sun = float(swe.calc_ut(jd, swe.SUN, E._FLG_LON | sid_flag)[0][0])
            ayanamsha = (E.tropical_longitude(jd, "Sun") - sid_sun) % 360.0
    hits: List[FixedStarHit] = []
    for star, (lon2000, nature) in _FIXED_STARS.items():
        star_lon = (_star_longitude(lon2000, year) - ayanamsha) % 360.0
        deg, _m, _s = A.degree_in_sign(star_lon)
        sign = A.sign_for(star_lon)
        for p in chart.planets:
            if p.id in _SKIP:
                continue
            sep = A.angular_separation(p.longitude, star_lon)
            if sep <= orb:
                hits.append(FixedStarHit(
                    star=star, star_longitude=round(star_lon, 3), sign=sign,
                    degree=deg, nature=nature, natal_body=p.id, orb=round(sep, 2),
                ))
    hits.sort(key=lambda h: h.orb)
    return FixedStarResponse(orb=orb, hits=hits)
