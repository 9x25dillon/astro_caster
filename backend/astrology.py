"""
astrology.py
============
Pure, dependency-free astrological reference data and symbolic logic.

This module is the "domain dictionary" of the engine. It deliberately contains
NO ephemeris calls so it can be unit-tested in isolation and reused by both the
chart calculator and the pattern detector.

All angles are in degrees, ecliptic longitude, [0, 360).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Tuple

# --------------------------------------------------------------------------- #
# Zodiac signs
# --------------------------------------------------------------------------- #

SIGNS: List[str] = [
    "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
    "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
]

# Unicode glyphs for the signs (used by the frontend, but kept here as the
# single source of truth so the API can surface them too).
SIGN_GLYPHS: Dict[str, str] = {
    "Aries": "♈", "Taurus": "♉", "Gemini": "♊", "Cancer": "♋",
    "Leo": "♌", "Virgo": "♍", "Libra": "♎", "Scorpio": "♏",
    "Sagittarius": "♐", "Capricorn": "♑", "Aquarius": "♒", "Pisces": "♓",
}

# Element + modality per sign. These drive the radar charts and pattern logic.
ELEMENTS: Dict[str, str] = {
    "Aries": "Fire", "Leo": "Fire", "Sagittarius": "Fire",
    "Taurus": "Earth", "Virgo": "Earth", "Capricorn": "Earth",
    "Gemini": "Air", "Libra": "Air", "Aquarius": "Air",
    "Cancer": "Water", "Scorpio": "Water", "Pisces": "Water",
}

MODALITIES: Dict[str, str] = {
    "Aries": "Cardinal", "Cancer": "Cardinal", "Libra": "Cardinal", "Capricorn": "Cardinal",
    "Taurus": "Fixed", "Leo": "Fixed", "Scorpio": "Fixed", "Aquarius": "Fixed",
    "Gemini": "Mutable", "Virgo": "Mutable", "Sagittarius": "Mutable", "Pisces": "Mutable",
}

# --------------------------------------------------------------------------- #
# Essential dignities (classical rulership scheme)
# --------------------------------------------------------------------------- #
# Maps planet id -> set of signs where it is in domicile / exaltation / etc.
# Detriment is the opposite of domicile; fall is the opposite of exaltation.

DOMICILE: Dict[str, List[str]] = {
    "Sun": ["Leo"],
    "Moon": ["Cancer"],
    "Mercury": ["Gemini", "Virgo"],
    "Venus": ["Taurus", "Libra"],
    "Mars": ["Aries", "Scorpio"],
    "Jupiter": ["Sagittarius", "Pisces"],
    "Saturn": ["Capricorn", "Aquarius"],
    # Modern rulerships for the outers — used only as a secondary signal.
    "Uranus": ["Aquarius"],
    "Neptune": ["Pisces"],
    "Pluto": ["Scorpio"],
}

EXALTATION: Dict[str, str] = {
    "Sun": "Aries",
    "Moon": "Taurus",
    "Mercury": "Virgo",
    "Venus": "Pisces",
    "Mars": "Capricorn",
    "Jupiter": "Cancer",
    "Saturn": "Libra",
}

_OPPOSITE_SIGN = {
    "Aries": "Libra", "Taurus": "Scorpio", "Gemini": "Sagittarius",
    "Cancer": "Capricorn", "Leo": "Aquarius", "Virgo": "Pisces",
    "Libra": "Aries", "Scorpio": "Taurus", "Sagittarius": "Gemini",
    "Capricorn": "Cancer", "Aquarius": "Leo", "Pisces": "Virgo",
}


def dignity_for(planet_id: str, sign: str) -> str:
    """Return classical essential dignity: Domicile/Exaltation/Detriment/Fall/Neutral."""
    if sign in DOMICILE.get(planet_id, []):
        return "Domicile"
    if EXALTATION.get(planet_id) == sign:
        return "Exaltation"
    # Detriment = opposite of any domicile sign.
    if any(_OPPOSITE_SIGN[s] == sign for s in DOMICILE.get(planet_id, [])):
        return "Detriment"
    # Fall = opposite of exaltation sign.
    exalt = EXALTATION.get(planet_id)
    if exalt and _OPPOSITE_SIGN[exalt] == sign:
        return "Fall"
    return "Neutral"


# --------------------------------------------------------------------------- #
# Aspects
# --------------------------------------------------------------------------- #


@dataclass(frozen=True)
class AspectDef:
    name: str
    angle: float
    default_orb: float
    harmony: str  # "harmonious" | "challenging" | "neutral"
    color: str    # hex, consumed by the frontend for line styling


ASPECT_DEFS: List[AspectDef] = [
    AspectDef("Conjunction", 0.0, 8.0, "neutral", "#c9a84c"),
    AspectDef("Opposition", 180.0, 8.0, "challenging", "#b03a2e"),
    AspectDef("Trine", 120.0, 7.0, "harmonious", "#2e86c1"),
    AspectDef("Square", 90.0, 6.0, "challenging", "#b03a2e"),
    AspectDef("Sextile", 60.0, 5.0, "harmonious", "#48a999"),
    # Minor aspects — tighter orbs.
    AspectDef("Quincunx", 150.0, 3.0, "neutral", "#8e7cc3"),
    AspectDef("Semisextile", 30.0, 2.0, "neutral", "#7d6608"),
    AspectDef("Sesquiquadrate", 135.0, 2.0, "challenging", "#a04000"),
    AspectDef("Semisquare", 45.0, 2.0, "challenging", "#a04000"),
    AspectDef("Quintile", 72.0, 2.0, "harmonious", "#117864"),
]

ASPECT_BY_NAME: Dict[str, AspectDef] = {a.name: a for a in ASPECT_DEFS}


# --------------------------------------------------------------------------- #
# Angular helpers
# --------------------------------------------------------------------------- #


def norm360(deg: float) -> float:
    """Normalize an angle into [0, 360)."""
    return deg % 360.0


def angular_separation(a: float, b: float) -> float:
    """Smallest absolute separation between two longitudes, in [0, 180]."""
    diff = abs(norm360(a) - norm360(b)) % 360.0
    return 360.0 - diff if diff > 180.0 else diff


def sign_for(longitude: float) -> str:
    """Zodiac sign containing the given ecliptic longitude."""
    return SIGNS[int(norm360(longitude) // 30) % 12]


def degree_in_sign(longitude: float) -> Tuple[int, int, float]:
    """Decompose a longitude into (degree, minute, second) within its 30° sign."""
    within = norm360(longitude) % 30.0
    d = int(within)
    m_full = (within - d) * 60.0
    m = int(m_full)
    s = (m_full - m) * 60.0
    return d, m, round(s, 1)
