"""
tarot_prompts.py
================
Prompt scaffolding for AI-enriched Astra Arcana readings. Inherits the same
anti-deterministic stance as ai.py's Astra system prompt: tarot + astrology are
symbolic mirrors, never fortune-telling.
"""

from __future__ import annotations

from typing import Dict, List, Optional

ARCANA_SYSTEM = """You are Astra Arcana, a symbolic guide who reads tarot through \
the lens of a person's natal chart. You do NOT predict fixed future events. You \
interpret tarot and astrology as archetypal mirrors for self-inquiry, emotional \
literacy, creative expression, and gentle alignment.

Hard rules:
- Never say "you will", "you are destined to", or forecast concrete events.
- No medical, legal, financial, or mental-health claims or advice.
- Treat the shadow as material for integration, never as a threat. Keep shadow \
language gentle and non-destabilising.
- Ground every claim in the SPECIFIC cards drawn and the SPECIFIC chart placements \
provided. Cite them ("The Tower reversed in your Shadow position echoes your natal \
Mars...").

For the reading, weave the drawn cards and the chart together and cover:
1. What archetype is active right now.
2. How it already appears in the natal signature.
3. Its gift (healthy expression).
4. Its shadow (integration edge).
5. One small, optional alignment action.
6. One journal prompt.
7. One creative-expression prompt.

Tone: mystical, grounded, warm, and empowering — a mentor in an observatory, not \
an oracle of fate."""


# Appended ONLY on the tarot-reading path (main.py's /api/tarot-reading).
#
# It deliberately does NOT live in ARCANA_SYSTEM. oracle_report.py and course.py
# both extend that prefix with a structure of their own ("exactly these
# sections"), so a second, differently-shaped structure sitting in the shared
# text would be arguing with theirs inside the same prompt. What those two want
# to inherit is the voice and the hard rules; the shape of a spread reading is
# this path's business alone.
#
# The old brief — the seven-item "cover:" list still in ARCANA_SYSTEM above —
# described a reading of no particular size. It reads the same for a one-card
# daily draw and a twelve-card house spread, which is why a large spread used to
# produce a wall of text that ran into the ceiling: nothing ever told the writer
# how much room each position was owed, or that arriving at the end mattered.
ARCANA_READING_STRUCTURE = """

Structure the reading this way. The middle part is the one that grows with the \
spread; the rest stay the same size whether one card was drawn or twelve:

OPENING — name the pattern the whole spread makes, in two or three sentences.

THE POSITIONS — take the drawn cards IN ORDER, one passage each, under the \
position's own name as a heading. Every position gets its passage: a ten-card \
spread that discusses six of them has failed the reader who laid out ten. Give \
each what the length brief allows — the archetype active there, and how it \
already appears in the natal signature.

CLOSING — then, once, for the reading as a whole: its gift (healthy expression), \
its shadow (integration edge), one small optional alignment action, one journal \
prompt, and one creative-expression prompt.

Write to the length asked for and then stop. Arriving at the closing sections \
matters more than any single passage — a reading that never reaches its ending \
is worth less to the reader than a shorter one that lands."""


# Words asked for, per tier: a fixed allowance for the opening and the closing
# sections, plus an allowance for every card on the cloth.
#
# WHY THE PROMPT AND NOT THE CEILING. A reading is long because the spread is
# big, not because the reader paid more. Until now the brief was size-blind and
# the only thing that moved with tier was the token ceiling — so every spread was
# asked for an unbounded reading and then cut off at whatever number the tier
# carried. Session 30 reached this same conclusion for the chart readings:
# the tier ladder belongs in what is ASKED FOR, and in the model that writes it.
# The ceiling's only job is to sit comfortably above what the brief costs.
#
# Oracle is asked for more per card than supporter because opus-5 is the writer
# and the tier is what the subscriber bought. Free never arrives here — the
# endpoint gates AI enrichment to the paid tiers — but it resolves to the
# supporter brief rather than raising if that gate ever moves.
_LENGTH_BRIEF = {
    #             opening+closing   per card
    "supporter": (220, 90),
    "oracle": (320, 130),
}


def arcana_target_words(tier: str, card_count: int) -> int:
    """The word count the brief asks for, rounded to 50 so it reads as an
    instruction to a writer rather than a quota from an accountant."""
    fixed, per_card = _LENGTH_BRIEF.get(tier, _LENGTH_BRIEF["supporter"])
    return int(round((fixed + per_card * max(1, card_count)) / 50.0) * 50)


def build_arcana_user_prompt(
    question: str,
    spread: str,
    dominant_element: str,
    dominant_modality: str,
    themes: List[str],
    shadows: List[str],
    signature_lines: List[str],
    drawn: List[Dict[str, str]],
    source_lens: str = "",
    tier: str = "supporter",
    aspect_lines: Optional[List[str]] = None,
    further_points: Optional[List[str]] = None,
) -> str:
    """Compose the user message: chart signature + drawn cards + question.

    The length brief is derived from how many cards were actually dealt, so a
    Celtic Cross is asked for a Celtic Cross's worth of words and a daily draw
    is not padded out to match it.

    `aspect_lines` and `further_points` come from tarot.aspect_prompt_lines and
    tarot.unsigned_body_lines. Both are optional and both default to nothing,
    because they are prompt material only: no caller is obliged to supply them
    and nothing deterministic depends on them.
    """
    sig = "\n".join(f"- {line}" for line in signature_lines)
    cards = "\n".join(
        f"- {d['position']}: {d['name']} ({d['orientation']})"
        f"{' — natal echo: ' + d['natal_link'] if d.get('natal_link') else ''}"
        for d in drawn
    )
    lens_line = f"INTERPRETIVE LINEAGE (read the cards through this tradition): {source_lens}\n" if source_lens else ""
    # The two blocks below are GROUNDING MATERIAL. The instruction attached to the
    # aspects matters as much as the aspects: handed a list, a model will happily
    # recite it, and a reading that inventories a chart instead of reading the
    # cards is worse than one that never saw the aspects at all.
    aspect_block = ""
    if aspect_lines:
        aspect_block = (
            "\nASPECTS IN THIS CHART (the most exact ones, tightest first for the "
            "orb each aspect is allowed). Use these to GROUND what you say about "
            "the cards — cite one when it explains why a card lands the way it "
            "does. Do not list them, do not work through them in order, and do "
            "not mention an aspect that is not written here:\n"
            + "\n".join(f"- {line}" for line in aspect_lines) + "\n"
        )
    points_block = ""
    if further_points:
        points_block = (
            "\nFURTHER POINTS (these carry an archetype but do not weight the "
            "draw):\n" + "\n".join(f"- {line}" for line in further_points) + "\n"
        )

    n = len(drawn)
    target = arcana_target_words(tier, n)
    per_card = _LENGTH_BRIEF.get(tier, _LENGTH_BRIEF["supporter"])[1]
    # A one-card draw has nothing to apportion, and "each of the 1 positions"
    # reads like a mail-merge that misfired.
    length_line = (
        f"about {target} words in total."
        if n == 1 else
        f"about {target} words in total — roughly {per_card} words on each of "
        f"the {n} positions, plus the opening and the closing sections."
    )
    return (
        f"NATAL ARCANA SIGNATURE (do not contradict):\n"
        f"{lens_line}"
        f"Dominant element: {dominant_element}. Dominant modality: {dominant_modality}.\n"
        f"Strongest archetypes: {', '.join(themes)}.\n"
        f"Growth-ward / quieter archetypes: {', '.join(shadows) or 'in balance'}.\n"
        f"Body-to-card map:\n{sig}\n"
        f"{points_block}{aspect_block}\n"
        f"SPREAD: {spread} — {n} card{'' if n == 1 else 's'}\n"
        f"CARDS DRAWN:\n{cards}\n\n"
        f"QUESTION: {question}\n\n"
        f"LENGTH: {length_line} Reach the closing sections.\n\n"
        f"Give the reading now, following the required structure."
    )
