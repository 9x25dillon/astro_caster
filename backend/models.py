"""
models.py
=========
Pydantic schemas shared across the API. These map 1:1 onto the TypeScript
interfaces consumed by the Zustand store, so any change here should be mirrored
in frontend/src/types.ts.
"""

from __future__ import annotations

from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field

HouseSystem = Literal["P", "K", "O", "R", "C", "E", "W", "B"]  # Placidus default = "P"
ZodiacType = Literal["tropical", "sidereal"]


# --------------------------------------------------------------------------- #
# Requests
# --------------------------------------------------------------------------- #


class ChartRequest(BaseModel):
    """Birth (or event) data. Time is interpreted in UTC after tz offset applied."""

    year: int = Field(..., ge=-3000, le=3000)
    month: int = Field(..., ge=1, le=12)
    day: int = Field(..., ge=1, le=31)
    hour: int = Field(0, ge=0, le=23)
    minute: int = Field(0, ge=0, le=59)
    second: int = Field(0, ge=0, le=59)

    # Geographic coordinates of the birthplace.
    lat: float = Field(..., ge=-90.0, le=90.0)
    lng: float = Field(..., ge=-180.0, le=180.0)

    # Timezone offset in hours from UTC (e.g. -5.0 for US Eastern Standard).
    # The frontend resolves this from a place/timezone picker; the backend just
    # subtracts it to obtain UTC. This avoids server-side tz database drift.
    tz_offset: float = Field(0.0, ge=-14.0, le=14.0)

    house_system: HouseSystem = "P"
    zodiac: ZodiacType = "tropical"
    # Sidereal ayanamsha (only used when zodiac == "sidereal"). Lahiri = 1.
    ayanamsha: int = 1


class TransitRequest(BaseModel):
    """Natal chart context + the moment we want transiting positions for."""

    natal: ChartRequest
    # ISO-8601 UTC datetime for the transit moment, e.g. "2026-06-26T12:00:00Z".
    transit_iso: str


class AIRequest(BaseModel):
    query: str
    chart: "ChartResponse"
    # Optional currently-selected element so the model can focus its reflection.
    selected_type: Optional[Literal["planet", "house", "aspect", "pattern"]] = None
    selected_id: Optional[str] = None
    # Interpretive lens.
    lens: Literal[
        "natal", "psychological", "evolutionary", "transit", "relationship", "traditional"
    ] = "psychological"
    # "quick" uses the standard model; "deep" escalates to the in-depth model
    # (AAE_AI_MODEL_DEEP) for richer whole-chart synthesis. Deep is a supporter
    # feature — pass the entitlement token to unlock it.
    depth: Literal["quick", "deep"] = "quick"
    entitlement: Optional[str] = None


# --------------------------------------------------------------------------- #
# Responses
# --------------------------------------------------------------------------- #


class PlanetData(BaseModel):
    id: str
    glyph: str
    longitude: float          # absolute ecliptic longitude [0, 360)
    latitude: float           # ecliptic latitude
    declination: float        # equatorial declination
    speed: float              # longitude °/day; negative => retrograde
    sign: str
    sign_glyph: str
    degree: int               # whole degrees within sign
    minute: int               # arc-minutes within sign
    second: float
    house: int                # 1..12
    retrograde: bool
    dignity: str
    element: str
    modality: str


class HouseCusp(BaseModel):
    index: int                # 1..12
    longitude: float
    sign: str
    degree: int
    minute: int


class Aspect(BaseModel):
    p1: str
    p2: str
    type: str
    angle: float              # exact aspect angle (e.g. 120)
    orb: float                # |separation - angle|
    separation: float         # actual separation
    harmony: str
    color: str
    applying: bool            # is the aspect tightening (true) or separating (false)


class Pattern(BaseModel):
    type: str
    planets: List[str]
    description: str
    extra: Dict[str, str] = Field(default_factory=dict)


class Angles(BaseModel):
    ascendant: float
    midheaven: float
    descendant: float
    imum_coeli: float
    vertex: Optional[float] = None


class ChartResponse(BaseModel):
    planets: List[PlanetData]
    houses: List[HouseCusp]
    angles: Angles
    aspects: List[Aspect]
    patterns: List[Pattern]
    elements: Dict[str, int]      # Fire/Earth/Air/Water counts (weighted)
    modalities: Dict[str, int]    # Cardinal/Fixed/Mutable counts (weighted)
    meta: Dict[str, str] = Field(default_factory=dict)


class TransitResponse(BaseModel):
    transiting: List[PlanetData]
    aspects_to_natal: List[Aspect]
    transit_iso: str


# Resolve forward reference in AIRequest.
AIRequest.model_rebuild()
