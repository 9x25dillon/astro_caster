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

SourceSystem = Literal["golden_dawn", "rws", "thoth", "jungian"]

DISCLAIMER = (
    "Astra Arcana is a symbolic mirror for reflection and creative alignment, "
    "not a deterministic prediction engine. It does not foretell fixed events and "
    "does not replace professional medical, legal, financial, or mental-health support."
)


class WeightSource(BaseModel):
    """One explainable contribution to a card's draw weight, derived from the
    ACTUAL natal signature (never a plausible-sounding post-hoc reconstruction).
    The sum of a card's weight_sources equals the weight that fed the draw."""
    label: str
    weight: float


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
    # major card id -> the natal contributions that built its weight. Generated
    # from the same accumulation that feeds the draw, so the panel and the seed
    # can never disagree (verified by test).
    weight_sources: Dict[str, List[WeightSource]] = Field(default_factory=dict)
    themes: List[str]                      # strongest archetypal themes
    shadows: List[str]                     # underdeveloped / shadow archetypes
    disclaimer: str = DISCLAIMER


class TarotReadingRequest(BaseModel):
    chart: ChartResponse
    spread: SpreadType = "three_card"
    # Interpretive lineage (Phase 2.2). Part of the determinism seed and the
    # interpretation framing. Default reproduces the current doctrine's seeds.
    source: SourceSystem = "golden_dawn"
    question: str = "What do I need to understand right now?"
    # ISO local date "YYYY-MM-DD" for the 'daily' spread. When set, the daily
    # seed is a pure function of this local date (independent of the server clock).
    date: Optional[str] = None
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
    # Why this card was likely — derived from the actual draw weights (Phase 2.1).
    weight_sources: List[WeightSource] = Field(default_factory=list)


class TarotReadingResponse(BaseModel):
    spread: SpreadType
    source: SourceSystem = "golden_dawn"    # lineage the reading was cast in
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
    source: SourceSystem = "golden_dawn"   # interpretive lineage (Phase 2.2)
    # The querent's local day is the unit of meaning. start_date (ISO
    # "YYYY-MM-DD") pins the first day explicitly; otherwise timezone (IANA, e.g.
    # "America/New_York") resolves "today" in the querent's zone. Both omitted =>
    # server-local today (legacy behavior).
    start_date: Optional[str] = None
    timezone: Optional[str] = None
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


# --------------------------------------------------------------------------- #
# Phase 3.1 — Classroom as a generated learning path
# --------------------------------------------------------------------------- #


class LearningStep(BaseModel):
    order: int
    stage: str                 # e.g. "Anchor", "Bridge", "Growth edge"
    card: TarotCard
    focus: str                 # why this archetype sits here in *this* chart's path
    practice: str
    journal: str


class LearningPathRequest(BaseModel):
    chart: ChartResponse
    source: SourceSystem = "golden_dawn"
    steps: int = 5             # 3..8
    entitlement: Optional[str] = None


class LearningPathResponse(BaseModel):
    source: SourceSystem
    anchor: str                # strongest archetype (trump name) the path departs from
    growth_edge: str           # weakest / shadow archetype the path moves toward
    lineage: str               # human-readable source-system name
    steps: List[LearningStep]
    disclaimer: str = DISCLAIMER


# --------------------------------------------------------------------------- #
# Phase 4 — Deck-Art Prompt Studio (image PROMPTS only, no image generation)
# --------------------------------------------------------------------------- #


class DeckArtRequest(BaseModel):
    chart: ChartResponse
    # One card id (major or minor) for a single prompt; omit for the "soul deck" —
    # a prompt for every trump in the querent's natal signature.
    card_id: Optional[str] = None
    source: SourceSystem = "golden_dawn"   # lineage shapes the imagery
    entitlement: Optional[str] = None


class DeckArtPrompt(BaseModel):
    """A deterministic art-direction brief for one card. Pure function of
    (natal signature, card, source system) — identical inputs, identical prompt."""
    card: TarotCard
    title: str
    prompt: str                            # the image-generation brief
    negative_prompt: str
    motifs: List[str]                      # keywords + astrological correspondences
    palette: str                           # element-derived color direction
    natal_context: Optional[str] = None    # where this trump lives in the chart


class DeckArtResponse(BaseModel):
    source: SourceSystem
    lineage: str                           # human-readable source-system name
    prompts: List[DeckArtPrompt]
    disclaimer: str = DISCLAIMER


# --------------------------------------------------------------------------- #
# Oracle Report — paid Fable 5 enriched synthesis (oracle tier)
# --------------------------------------------------------------------------- #


class OracleReportRequest(BaseModel):
    chart: ChartResponse
    spread: SpreadType = "three_card"
    source: SourceSystem = "golden_dawn"
    question: str = "What do I need to understand right now?"
    date: Optional[str] = None             # ISO local date for the 'daily' spread
    steps: int = 5                         # learning-path depth woven into the report
    entitlement: Optional[str] = None      # REQUIRED in practice: oracle tier only


class OracleReportResponse(BaseModel):
    spread: SpreadType
    source: SourceSystem
    question: str
    seed: str                              # the deterministic draw is reproducible
    lineage: str
    report: str                            # markdown; enriched (llm) or deterministic (offline)
    ai_source: Literal["llm", "offline"]   # honest provenance — the client must show it
    model: Optional[str] = None            # serving model when ai_source == "llm"
    disclaimer: str = DISCLAIMER


# --------------------------------------------------------------------------- #
# Personal Report — deluxe compiled edition (optional post-Oracle product)
# --------------------------------------------------------------------------- #


class OracleSessionRef(BaseModel):
    """The triggering Oracle session the deluxe edition is compiled from.

    The server RE-DERIVES the deterministic seed from (chart, spread, question,
    date, source) and rejects the request if it doesn't match `seed` — the
    Personal Report is only available for a genuine Oracle session on this chart
    (post-Oracle gating, fail closed, stateless)."""
    seed: str
    spread: SpreadType
    source: SourceSystem
    question: str
    date: Optional[str] = None             # local date passed on the oracle call
    report: str                            # the Oracle report text the user received
    generated_at: Optional[str] = None     # ISO date shown on the cover
    ai_source: Optional[Literal["llm", "offline"]] = None
    model: Optional[str] = None


class PersonalReportRequest(BaseModel):
    chart: ChartResponse
    oracle: OracleSessionRef
    # Cover personalization. display_name may reach the AI prompt (a name is not
    # birth data); birth_summary NEVER does — the markdown cover carries a
    # {{BIRTH_INFO}} placeholder the client/renderer fills after generation, so
    # raw birth details stay out of prompts (privacy invariant).
    display_name: Optional[str] = None
    birth_summary: Optional[str] = None
    sigil_notes: Optional[str] = None      # client-side sigil formation notes (chaos/kamea)
    predictive_summary: Optional[str] = None  # optional predictive highlights insert
    steps: int = 5                         # learning-path depth
    entitlement: Optional[str] = None      # oracle tier only
    # PDF-2: the deluxe edition is a SEPARATE purchase — a report token minted
    # by /api/personal-report/purchase, bound to this exact oracle session seed.
    # Required unless the caller holds the dev/admin token.
    report_token: Optional[str] = None


class PersonalReportResponse(BaseModel):
    seed: str                              # verified Oracle session seed
    oracle_date: str                       # session date shown on the cover
    spread: SpreadType
    source: SourceSystem
    lineage: str
    report_markdown: str                   # the full deluxe edition (PDF-ready markdown)
    ai_source: Literal["llm", "offline"]
    model: Optional[str] = None
    disclaimer: str = DISCLAIMER


# --------------------------------------------------------------------------- #
# Phase 3.2 — Arcana calendar (.ics) export
# --------------------------------------------------------------------------- #


class ArcanaCalendarRequest(BaseModel):
    chart: ChartResponse
    days: int = 7
    min_sig: str = "medium"
    source: SourceSystem = "golden_dawn"
    start_date: Optional[str] = None
    timezone: Optional[str] = None
    kind: Literal["ritual", "journal"] = "ritual"   # which prompt anchors each day
    entitlement: Optional[str] = None
