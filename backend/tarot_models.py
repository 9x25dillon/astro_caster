"""
tarot_models.py
===============
Pydantic schemas for Astra Arcana. Mirror any change here in
frontend/src/types.ts (the tarot* interfaces).

Framing: tarot + astrology are symbolic mirrors for self-reflection, never
deterministic prediction. The response objects carry a `disclaimer` so that
framing travels with the data and cannot be styled away on the client.
"""

from __future__ import annotations

from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field

from models import ChartResponse

SpreadType = Literal[
    "daily",
    "three_card",
    "elemental_balance",
    "planetary_seven",
    "twelve_house",
    "relationship",
    "transit_pressure",
    "shadow_integration",
    "creative_expression",
]

DISCLAIMER = (
    "Astra Arcana is a symbolic mirror for reflection and creative alignment, "
    "not a deterministic prediction engine. It does not foretell fixed events and "
    "does not replace professional medical, legal, financial, or mental-health support."
)


class TarotCard(BaseModel):
    id: str
    name: str
    arcana: Literal["major", "minor"]
    number: Optional[int] = None
    suit: Optional[Literal["wands", "cups", "swords", "pentacles"]] = None
    keywords: List[str] = Field(default_factory=list)
    element: Optional[str] = None
    astrology: List[str] = Field(default_factory=list)
    upright: Optional[str] = None
    reversed_meaning: Optional[str] = None


class ArcanaCardLink(BaseModel):
    """A natal body resolved to its archetypal trump."""
    body: str                 # e.g. "Sun", "Moon", "Ascendant"
    sign: Optional[str] = None
    house: Optional[int] = None
    card: TarotCard
    note: str                 # one-line natal-relevance line


class NatalArcanaSignature(BaseModel):
    links: List[ArcanaCardLink]            # body -> card, in canonical order
    dominant_element: str
    dominant_modality: str
    suit_bias: Dict[str, float]            # wands/cups/swords/pentacles -> weight
    major_weights: Dict[str, float]        # card id -> emphasis weight
    themes: List[str]                      # strongest archetypal themes
    shadows: List[str]                     # underdeveloped / shadow archetypes
    disclaimer: str = DISCLAIMER


class TarotReadingRequest(BaseModel):
    chart: ChartResponse
    spread: SpreadType = "three_card"
    question: str = "What do I need to understand right now?"
    include_activities: bool = True
    include_lessons: bool = True
    include_ai: bool = False               # opt-in AI enrichment (tier-gated)
    seed: Optional[str] = None             # override deterministic seed (testing)
    entitlement: Optional[str] = None


class DrawnCard(BaseModel):
    position: str
    card: TarotCard
    reversed: bool = False
    natal_link: Optional[str] = None       # which natal body this position echoes
    meaning: str
    activity: Optional[str] = None
    journal_prompt: Optional[str] = None


class TarotReadingResponse(BaseModel):
    spread: SpreadType
    question: str
    seed: str
    signature: NatalArcanaSignature
    cards: List[DrawnCard]
    interpretation: str
    ai_source: Optional[str] = None        # "llm" | "offline" | None
    lessons: List[Dict[str, str]] = Field(default_factory=list)
    activities: List[Dict[str, str]] = Field(default_factory=list)
    disclaimer: str = DISCLAIMER


class ArcanaForecastRequest(BaseModel):
    chart: ChartResponse
    days: int = 7
    min_sig: str = "medium"
    entitlement: Optional[str] = None


class ArcanaDay(BaseModel):
    date: str
    transit_summary: str                   # e.g. "Saturn squares natal Sun"
    natal_link: Optional[str] = None
    card: TarotCard
    reversed: bool = False
    lesson: str
    shadow: str
    best_expression: str
    alignment_action: str
    journal_prompt: str


class ArcanaForecastResponse(BaseModel):
    start: str
    days: int
    cards: List[ArcanaDay]
    disclaimer: str = DISCLAIMER
