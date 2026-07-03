> **Archived.** This plan was merged into [`docs/progress/COMPREHENSIVE_TASK_SCHEDULE.md`](../progress/COMPREHENSIVE_TASK_SCHEDULE.md), which is the living schedule. Kept for historical reference.

# Astra Arcana — Natal Tarot Observatory

## Purpose

Extend `astro_caster` into a natal-chart-powered tarot and archetype education app.

The goal is not fortune-telling. The goal is symbolic self-understanding, creative expression, archetype literacy, and alignment practices grounded in the user's natal chart, current transits, and tarot correspondences.

Core philosophy:

> At birth, light arrives through a living geometry of sky. The natal chart is the shape of that arrival. Tarot becomes a symbolic mirror that helps the user translate that geometry into feeling, language, action, ritual, and art.

---

## Existing Repo Strengths

The current app already includes:

- React 18 + TypeScript + Vite PWA frontend.
- FastAPI backend.
- Swiss Ephemeris natal chart calculation.
- Saved natal profiles in localStorage.
- AI interpretation endpoint.
- Transit and forecast engines.
- Chart response objects containing planets, houses, aspects, patterns, elements, and modalities.
- Offline/local fallback interpretation.
- Tiered AI model routing.

This means the tarot system should be added as a symbolic overlay, not rebuilt as a separate app.

---

## Product Name

Recommended module name:

**Astra Arcana — Natal Tarot Observatory**

Optional interface labels:

- Arcana
- Natal Tarot
- Soul Deck
- Archetype Studio
- Daily Alignment
- Arcane Classroom

---

## High-Level Feature Set

### 1. Natal Arcana Profile

Generate a permanent personalized tarot profile from the user's natal chart.

Map natal placements to archetypal cards:

- Sun card: conscious identity.
- Moon card: emotional body.
- Ascendant card: incarnation mask and life approach.
- Mercury card: voice, language, thought pattern.
- Venus card: love, beauty, attraction, aesthetic expression.
- Mars card: will, desire, anger, action.
- Jupiter card: growth, blessing, expansion.
- Saturn card: discipline, wound, structure, karmic lesson.
- Uranus card: rupture, originality, liberation.
- Neptune card: dream, vision, mysticism, illusion.
- Pluto card: shadow, death, rebirth, transformation.
- North Node card: future-growth path.
- South Node card: inherited comfort zone.
- Midheaven card: public calling.
- IC card: root-self, ancestry, inner sanctuary.

### 2. Soul Deck

Create a weighted deck specific to the user.

Inputs:

- Planet signs.
- Planet houses.
- Dominant elements.
- Dominant modalities.
- Major aspects.
- Chart patterns.
- Current transits.

Outputs:

- A personal 22-card Major Arcana emphasis map.
- A Minor Arcana suit balance.
- A list of strongest archetypal themes.
- A list of underdeveloped or shadow archetypes.

### 3. Daily Arcana Forecast

Use current transits and natal chart to generate a daily card.

Daily reading should include:

- Active transit theme.
- Matching tarot card.
- Natal placement being activated.
- Lesson of the day.
- Shadow warning.
- Best expression.
- One small alignment action.
- One journal prompt.

### 4. Archetype Lessons

Each card should have educational content:

- Mythic meaning.
- Psychological meaning.
- Astrological correspondences.
- Element and modality links.
- Shadow expression.
- Healthy expression.
- Creative practice.
- Embodiment ritual.
- Journal prompt.
- How it may appear in the user's chart.

### 5. Alignment Activities

Generate activities that help the user embody chart/card themes.

Examples:

- Express your Venus archetype through color, clothing, scent, or music.
- Work with your Moon card through emotional journaling.
- Balance your dominant element through a physical ritual.
- Write a shadow dialogue with your Saturn card.
- Compose a spell-poem from your Mercury archetype.
- Build a small altar for the current transit card.
- Draw your Ascendant mask as a sigil.

### 6. Arcane Classroom Mode

Teach tarot and astrology together.

Lesson categories:

- What are the four elements?
- What are the three modalities?
- What are houses?
- What are aspects?
- What is a ruling planet?
- How do Major Arcana archetypes work?
- How do Minor Arcana suits map to elements?
- How do archetypes differ from predictions?
- Why is symbolic interpretation useful for self-reflection?

### 7. Self-Expression Studio

Generate creative artifacts from the user's natal arcana profile:

- Personal sigils.
- Archetype poems.
- Affirmations.
- Shadow letters.
- Mythic birth story.
- Ritual playlist concepts.
- Wardrobe and color suggestions.
- Room altar layout.
- Creative writing prompts.
- Visual moodboard prompts.
- Song lyric prompts.
- Tattoo concept prompts.

### 8. Spread Engine

Support multiple spread types:

- One-card daily alignment.
- Three-card self/mirror/shadow.
- Five-card elemental balance.
- Seven-card planetary alignment.
- Twelve-house natal spread.
- Relationship archetype spread.
- Transit pressure spread.
- Shadow integration spread.
- Creative expression spread.

---

## Backend Implementation Plan

### New Backend Files

Create:

```txt
backend/tarot.py
backend/tarot_data.py
backend/tarot_models.py
backend/tarot_prompts.py
backend/tests/test_tarot.py
```

Optional later:

```txt
backend/arcana_lessons.py
backend/activity_generator.py
backend/sigil_prompt.py
```

---

## Backend Data Model

### `tarot_models.py`

Define Pydantic schemas.

```python
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

class TarotCard(BaseModel):
    id: str
    name: str
    arcana: Literal["major", "minor"]
    suit: Optional[Literal["wands", "cups", "swords", "pentacles"]] = None
    number: Optional[int] = None
    keywords: List[str] = Field(default_factory=list)
    element: Optional[str] = None
    astrology: List[str] = Field(default_factory=list)

class NatalArcanaSignature(BaseModel):
    sun_card: TarotCard
    moon_card: TarotCard
    ascendant_card: TarotCard
    mercury_card: TarotCard
    venus_card: TarotCard
    mars_card: TarotCard
    jupiter_card: TarotCard
    saturn_card: TarotCard
    uranus_card: TarotCard
    neptune_card: TarotCard
    pluto_card: TarotCard
    north_node_card: Optional[TarotCard] = None
    dominant_element: str
    dominant_modality: str
    suit_bias: Dict[str, float]
    major_weights: Dict[str, float]
    themes: List[str]
    shadows: List[str]

class TarotReadingRequest(BaseModel):
    chart: ChartResponse
    spread: SpreadType = "three_card"
    question: str = "What do I need to understand right now?"
    include_activities: bool = True
    include_lessons: bool = True
    entitlement: Optional[str] = None

class DrawnCard(BaseModel):
    position: str
    card: TarotCard
    reversed: bool = False
    natal_link: Optional[str] = None
    meaning: str
    activity: Optional[str] = None
    journal_prompt: Optional[str] = None

class TarotReadingResponse(BaseModel):
    spread: SpreadType
    question: str
    signature: NatalArcanaSignature
    cards: List[DrawnCard]
    interpretation: str
    lessons: List[Dict[str, str]] = Field(default_factory=list)
    activities: List[Dict[str, str]] = Field(default_factory=list)
```

---

## Tarot Correspondence Data

### `tarot_data.py`

Include a static tarot table.

Start with Major Arcana correspondences:

```python
MAJOR_ARCANA = [
    {
        "id": "fool",
        "name": "The Fool",
        "arcana": "major",
        "keywords": ["beginning", "risk", "innocence", "leap"],
        "element": "Air",
        "astrology": ["Uranus", "Aquarius"],
    },
    {
        "id": "magician",
        "name": "The Magician",
        "arcana": "major",
        "keywords": ["will", "language", "craft", "manifestation"],
        "element": "Air",
        "astrology": ["Mercury", "Gemini", "Virgo"],
    },
    {
        "id": "high_priestess",
        "name": "The High Priestess",
        "arcana": "major",
        "keywords": ["intuition", "mystery", "inner knowing"],
        "element": "Water",
        "astrology": ["Moon", "Cancer"],
    },
]
```

Then complete all 22 Major Arcana.

Add Minor Arcana suit correspondences:

```python
SUIT_ELEMENTS = {
    "wands": "Fire",
    "cups": "Water",
    "swords": "Air",
    "pentacles": "Earth",
}
```

Minor card meanings can be added incrementally.

---

## Core Tarot Engine

### `tarot.py`

Required functions:

```python
def build_natal_arcana_signature(chart: ChartResponse) -> NatalArcanaSignature:
    """Map natal chart placements into a reusable archetypal tarot signature."""


def weighted_draw(signature: NatalArcanaSignature, spread: SpreadType, seed: str | None = None) -> list[DrawnCard]:
    """Draw cards from a chart-weighted deck while preserving randomness."""


def lesson_for_card(card: TarotCard, chart: ChartResponse) -> dict[str, str]:
    """Return educational explanation for the card and its natal relevance."""


def activity_for_card(card: TarotCard, chart: ChartResponse, position: str) -> dict[str, str]:
    """Return a practical alignment activity."""


def generate_tarot_reading(req: TarotReadingRequest) -> TarotReadingResponse:
    """Main orchestration function."""
```

---

## Suggested Mapping Logic

### Planet to Card

Use direct planetary correspondences first:

```python
PLANET_MAJOR = {
    "sun": "sun",
    "moon": "high_priestess",
    "mercury": "magician",
    "venus": "empress",
    "mars": "tower",
    "jupiter": "wheel_of_fortune",
    "saturn": "world",
    "uranus": "fool",
    "neptune": "hanged_man",
    "pluto": "death",
}
```

### Zodiac Sign to Card

Use sign correspondences:

```python
SIGN_MAJOR = {
    "Aries": "emperor",
    "Taurus": "hierophant",
    "Gemini": "lovers",
    "Cancer": "chariot",
    "Leo": "strength",
    "Virgo": "hermit",
    "Libra": "justice",
    "Scorpio": "death",
    "Sagittarius": "temperance",
    "Capricorn": "devil",
    "Aquarius": "star",
    "Pisces": "moon",
}
```

### Element to Suit

```python
ELEMENT_SUIT = {
    "Fire": "wands",
    "Water": "cups",
    "Air": "swords",
    "Earth": "pentacles",
}
```

### Houses to Life Themes

```python
HOUSE_THEMES = {
    1: "identity and embodiment",
    2: "value, money, body, voice",
    3: "language, siblings, learning",
    4: "home, ancestry, inner root",
    5: "creativity, romance, play",
    6: "health, craft, devotion, service",
    7: "partnership and projection",
    8: "shadow, intimacy, death, shared power",
    9: "belief, travel, philosophy",
    10: "calling, visibility, public role",
    11: "community, future, networks",
    12: "dreams, isolation, spirit, unconscious",
}
```

---

## API Changes

Modify `backend/main.py`.

Add imports:

```python
from tarot import generate_tarot_reading, build_natal_arcana_signature
from tarot_models import TarotReadingRequest
```

Add endpoint:

```python
@app.post("/api/tarot-reading")
async def tarot_reading(req: TarotReadingRequest):
    try:
        return generate_tarot_reading(req)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"tarot reading failed: {exc}")
```

Optional endpoint:

```python
@app.post("/api/natal-arcana")
async def natal_arcana(req: ChartResponse):
    try:
        return build_natal_arcana_signature(req)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"natal arcana failed: {exc}")
```

---

## AI Interpretation Integration

Use existing AI engine after deterministic tarot data is created.

Recommended prompt style:

```txt
You are Astra Arcana, a symbolic guide.
You do not predict fixed future events.
You interpret tarot and astrology as archetypal mirrors for self-inquiry, emotional literacy, creative expression, and alignment.

Use the user's natal chart and drawn cards.
Explain:
1. What archetype is active.
2. How it appears in the natal profile.
3. Its gift.
4. Its shadow.
5. One practical alignment action.
6. One journal prompt.
7. One creative expression prompt.

Avoid deterministic fortune-telling.
Avoid medical, legal, or financial claims.
Keep the tone mystical, grounded, and empowering.
```

Potential new AI lens:

```python
"arcana"
```

If changing the existing `AIRequest` literal is too invasive, keep the backend tarot endpoint self-contained first.

---

## Frontend Implementation Plan

### New Frontend Files

Create:

```txt
frontend/src/features/arcana/ArcanaPage.tsx
frontend/src/features/arcana/NatalArcanaProfile.tsx
frontend/src/features/arcana/TarotSpread.tsx
frontend/src/features/arcana/ArcaneClassroom.tsx
frontend/src/features/arcana/AlignmentActivities.tsx
frontend/src/features/arcana/SelfExpressionStudio.tsx
frontend/src/features/arcana/tarotApi.ts
frontend/src/features/arcana/tarotTypes.ts
frontend/src/features/arcana/tarotCopy.ts
```

Optional:

```txt
frontend/src/features/arcana/CardGlyph.tsx
frontend/src/features/arcana/SoulDeckWheel.tsx
frontend/src/features/arcana/ArchetypeLessonCard.tsx
```

---

## Frontend User Flow

### Tab 1: Natal Arcana

Displays:

- Sun Card.
- Moon Card.
- Ascendant Card.
- Mercury Card.
- Venus Card.
- Mars Card.
- Saturn Card.
- Pluto Card.
- Dominant suit.
- Dominant element.
- Shadow archetype.
- Growth archetype.

### Tab 2: Draw

User selects spread:

- Daily card.
- Three-card mirror.
- Elemental balance.
- Twelve-house spread.
- Shadow integration.
- Creative expression.

Then asks a question.

App calls:

```txt
POST /api/tarot-reading
```

### Tab 3: Classroom

Educational lessons:

- Tarot basics.
- Astrology basics.
- Elements.
- Modalities.
- Houses.
- Planets.
- Archetypes.
- Symbol vs prediction.

### Tab 4: Alignment

Shows practical activities generated from the user's chart/cards.

### Tab 5: Expression Studio

Buttons:

- Generate archetype poem.
- Generate personal sigil prompt.
- Generate affirmation.
- Generate shadow letter.
- Generate mythic self-story.
- Generate ritual playlist concept.
- Generate room altar layout.

---

## TypeScript Types

### `tarotTypes.ts`

```ts
export type SpreadType =
  | "daily"
  | "three_card"
  | "elemental_balance"
  | "planetary_seven"
  | "twelve_house"
  | "relationship"
  | "transit_pressure"
  | "shadow_integration"
  | "creative_expression";

export interface TarotCard {
  id: string;
  name: string;
  arcana: "major" | "minor";
  suit?: "wands" | "cups" | "swords" | "pentacles";
  number?: number;
  keywords: string[];
  element?: string;
  astrology: string[];
}

export interface DrawnCard {
  position: string;
  card: TarotCard;
  reversed: boolean;
  natal_link?: string;
  meaning: string;
  activity?: string;
  journal_prompt?: string;
}

export interface TarotReadingResponse {
  spread: SpreadType;
  question: string;
  signature: Record<string, unknown>;
  cards: DrawnCard[];
  interpretation: string;
  lessons: Record<string, string>[];
  activities: Record<string, string>[];
}
```

---

## UI Copy Direction

Use language like:

- “Archetype” instead of “fate.”
- “Alignment” instead of “destiny.”
- “Mirror” instead of “prediction.”
- “Expression” instead of “outcome.”
- “Shadow” as an integration concept, not a threat.

Example header:

```txt
Your chart is the geometry of arrival.
Your cards are mirrors for translating that geometry into action, beauty, and self-knowledge.
```

---

## Arcane Activities Library

Create reusable activity templates.

Examples:

### Venus Activity

```txt
Choose one object, color, scent, sound, or texture that makes your body soften.
Place it somewhere visible. Let beauty become evidence that you are allowed to receive.
```

### Saturn Activity

```txt
Choose one small boundary that protects your future self.
Write it as a vow. Keep it for one day before expanding it.
```

### Moon Activity

```txt
Write three sentences beginning with: “My body remembers...”
Do not edit them. Let the emotional weather speak first.
```

### Mars Activity

```txt
Move your body for five minutes with intention.
Let anger become direction instead of destruction.
```

### Mercury Activity

```txt
Write a spell-poem using five words from your current emotional state.
Speak it once aloud. Notice what changes when thought becomes sound.
```

---

## Arcane Classroom Lesson Template

Each lesson should follow this format:

```txt
Title
One-sentence summary
Symbolic meaning
Astrological connection
Tarot connection
Shadow expression
Balanced expression
Practice
Journal prompt
```

Example:

```txt
Title: Fire
Summary: Fire is the principle of ignition, courage, appetite, and creative will.
Symbolic meaning: Fire begins before it explains itself.
Astrological connection: Aries, Leo, Sagittarius.
Tarot connection: Wands.
Shadow expression: Impulsiveness, burnout, domination.
Balanced expression: Courage, vitality, inspired action.
Practice: Light a candle and name one action you are ready to take.
Journal prompt: Where does my life need warmth instead of force?
```

---

## Safety and Trust Rules

The app should clearly state:

- Tarot and astrology are symbolic self-reflection tools.
- The app does not predict fixed events.
- The app does not replace professional medical, legal, financial, or mental health support.
- Activities should be gentle, optional, and user-controlled.
- Shadow work prompts should avoid coercive or destabilizing language.

Add footer copy:

```txt
Astra Arcana is a symbolic mirror for reflection and creative alignment, not a deterministic prediction engine.
```

---

## Development Phases

### Phase 1 — Deterministic Arcana Signature

Tasks:

- Add `tarot_models.py`.
- Add `tarot_data.py`.
- Add `tarot.py`.
- Implement planet/sign/element mappings.
- Add `/api/natal-arcana` endpoint.
- Add unit tests for chart-to-card mapping.

Acceptance checks:

- Given a chart response, backend returns a stable natal arcana signature.
- Dominant element maps to correct suit.
- Planet card mappings are deterministic.
- No AI call required.

### Phase 2 — Spread Engine

Tasks:

- Implement spread definitions.
- Implement weighted draw.
- Implement reversed card probability.
- Add `/api/tarot-reading` endpoint.
- Add lessons and activities to response.

Acceptance checks:

- User can request daily, three-card, and elemental spreads.
- Same seed returns same draw.
- No duplicate cards unless spread explicitly allows it.
- Every drawn card has position, meaning, natal link, and prompt.

### Phase 3 — Frontend Arcana UI

Tasks:

- Add Arcana tab/page.
- Add Natal Arcana Profile component.
- Add Tarot Spread component.
- Add tarot API client.
- Display cards and interpretation.

Acceptance checks:

- User can generate natal chart, then open Arcana tab.
- User can draw a tarot spread from the saved profile.
- UI works offline for deterministic readings.

### Phase 4 — AI Arcana Interpretation

Tasks:

- Add arcana prompt template.
- Feed chart + drawn cards into existing AI system.
- Add optional streaming reading.
- Add quick/deep support by entitlement.

Acceptance checks:

- AI reading references specific cards and chart placements.
- AI avoids deterministic future claims.
- Offline fallback still returns useful symbolic prose.

### Phase 5 — Classroom and Activities

Tasks:

- Add Arcane Classroom page.
- Add lesson library.
- Add Alignment Activities page.
- Add activity generator.

Acceptance checks:

- User can learn elements, suits, planets, houses, aspects, and archetypes.
- Each lesson includes practice and journal prompt.
- Activities are grounded in the user's chart signature.

### Phase 6 — Self-Expression Studio

Tasks:

- Add expression artifact generator.
- Add sigil prompt generator.
- Add poem/affirmation/shadow letter generation.
- Add export/copy buttons.

Acceptance checks:

- User can generate at least five creative outputs from natal arcana profile.
- Outputs include chart/card references.
- Outputs are copyable/exportable.

### Phase 7 — Transit Arcana Forecast

Tasks:

- Connect transit engine to tarot module.
- Add daily active transit card.
- Add 7-day and 90-day arcana forecast.
- Add bookmark/export support.

Acceptance checks:

- Daily forecast includes transit, natal placement, card, lesson, action.
- Forecast can be exported as text.
- Optional calendar export can be added later.

---

## Suggested Initial Git Branch

```bash
git checkout -b feature/astra-arcana
```

---

## Suggested First Commit

```bash
git add backend/tarot_models.py backend/tarot_data.py backend/tarot.py backend/tests/test_tarot.py
git commit -m "Add natal arcana tarot engine"
```

---

## AI CLI Task Prompt

Use this with an AI coding CLI:

```txt
You are modifying the repository astro_caster.

Implement the Astra Arcana module as an additive feature. Do not remove existing astrology, AI, transit, profile, entitlement, or PWA functionality.

Start with Phase 1 and Phase 2 only:

1. Add backend/tarot_models.py with Pydantic schemas for TarotCard, NatalArcanaSignature, TarotReadingRequest, DrawnCard, and TarotReadingResponse.
2. Add backend/tarot_data.py with Major Arcana data, suit-element mappings, planet-card mappings, sign-card mappings, and house theme mappings.
3. Add backend/tarot.py with deterministic natal arcana signature generation and a chart-weighted spread draw engine.
4. Add POST /api/natal-arcana and POST /api/tarot-reading endpoints in backend/main.py.
5. Add backend/tests/test_tarot.py covering planet mappings, sign mappings, element-to-suit logic, deterministic seeded draw, and no duplicate cards in normal spreads.

Important constraints:

- Tarot and astrology must be framed as symbolic self-reflection, not deterministic prediction.
- Keep offline functionality. The first implementation must not require an external AI API.
- Preserve existing API endpoints.
- Do not introduce large new dependencies.
- Mirror backend schema changes in frontend TypeScript only after backend tests pass.

After Phase 1 and Phase 2 pass, stop and summarize changed files, test results, and next recommended frontend work.
```

---

## Future Enhancements

- Custom deck art generation prompts.
- User-created deck meanings.
- Audio-guided daily ritual.
- Moon-phase card pulls.
- Synastry tarot for relationships.
- Dream journal tied to Moon/Neptune cards.
- Shadow archive for recurring cards.
- Elemental balance dashboard.
- Ritual calendar export.
- Printable natal arcana report.

---

## Definition of Done

The first complete version is done when:

- The user can create or load a natal profile.
- The app generates a Natal Arcana Profile.
- The user can draw at least three spread types.
- Each card explains its tarot meaning, chart connection, shadow, gift, activity, and journal prompt.
- The user can access at least one Arcane Classroom lesson.
- The experience remains symbolic, reflective, educational, and creative.
