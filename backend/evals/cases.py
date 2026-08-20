"""
cases.py — the eval scenarios.

The chart is FIXED and synthetic (1990-07-04, New York) — never the operator's
own birth data. Evals get recorded into cassettes that live in the repo, and a
cassette holds the full generated text; a reading of a real person's chart would
put their placements and their question into version control forever.

Section headers and word ranges below are transcribed from the prompts in
`ai.py`. When a prompt changes, these change with it — that coupling is the
point, because a prompt that quietly stops asking for a section is exactly the
drift this suite is here to catch.
"""
from __future__ import annotations

from typing import Dict, List, Optional

from .checks import Case

# The chart every case is cast against. Kept in one place so a re-record does
# not silently change what the grounding check compares to.
CHART_REQUEST = {
    "year": 1990, "month": 7, "day": 4, "hour": 14, "minute": 30, "second": 0,
    "lat": 40.7128, "lng": -74.0060, "tz_offset": -4,
    "house_system": "P", "zodiac": "tropical", "ayanamsha": 1,
}

# Transcribed from ai.py SYSTEM_PROMPT / ORACLE_EXTENSION.
_ORACLE_SECTIONS = [
    "The Living Myth",
    "Gifts Written in Light",
    "The Shadow's Teaching",
    "Reflective Questions",
    "Growth Invitation",
]

QUERIES = {
    "whole-chart": "What does my chart say about my inner life?",
    "angles": "What is my rising sign, and what does it mean for me?",
    "pluto-8th": "Tell me about Pluto and the 8th house — what am I meant to transform?",
}


def build_cases(placements: Dict[str, str],
                aspects: Optional[Dict[str, str]] = None) -> List[Case]:
    """Cases for every tier, sharing one chart.

    `placements` comes from the real engine at record time (planet id -> sign) so
    the grounding check compares prose against computed truth rather than against
    a hand-typed table that can rot.

    The "angles" case is deliberately pointed at the Ascendant: a model asked
    about a rising sign it was never told is the exact shape of the most
    convincing possible wrong answer.
    """
    cases: List[Case] = []
    for tier, words in (("free", (250, 900)),
                        ("supporter", (700, 1600)),
                        ("oracle", (700, 1600))):
        for qid, query in QUERIES.items():
            cases.append(Case(
                id=f"{tier}:{qid}",
                tier=tier,
                lens="psychological",
                query=query,
                placements=placements,
                # Only the paid tiers are handed ORACLE_EXTENSION's headers.
                required_sections=_ORACLE_SECTIONS if tier != "free" else [],
                words_min=words[0],
                words_max=words[1],
                # The ask path has always sent the chart's aspects (ai.py's
                # _build_context), so a fabricated aspect was always possible
                # here — it simply had no check looking for it until the arcana
                # work needed one. Costs nothing to point it at these too.
                aspects=aspects or {},
            ))
    cases.extend(_arcana_cases(placements, aspects or {}))
    return cases


# --------------------------------------------------------------------------- #
# Arcana — the tarot-spread readings
#
# MEASURED 2026-08-19: every arcana reading the product had ever served was
# truncated, at both paid tiers and at every spread size including the one-card
# daily draw, because the ceiling was a flat per-tier number that never knew how
# many cards were on the cloth. The unit suite could not see it (it mocks the
# provider) and this suite could not see it either (it only ever covered the
# chart-reading path). These cases close that second gap.
#
# The two spreads chosen are the largest, because a big spread is where a
# size-blind budget fails first and hardest.
#
# WHAT MAKES THESE WORTH THE MONEY: required_sections is the POSITION LIST. A
# reading that runs out of room before it reaches "The Outcome" fails
# check_structure by name, and one that stops mid-sentence fails
# check_completeness. Those are the two ways a spread reading arrives
# incomplete, and both are now assertions rather than hopes.
# --------------------------------------------------------------------------- #

_ARCANA_QUESTION = "What do I need to understand right now?"


def _deck_attributions() -> List[str]:
    """Every "Planet in Sign" the deck asserts about its OWN cards.

    Read from the deck rather than transcribed, because these are facts of the
    Golden Dawn attribution table (the Five of Wands IS Saturn in Leo) and not a
    prompt instruction that could drift. Any of the thirty-six decans can turn up
    in a reading whichever cards were dealt, so the whole set is exempted rather
    than the drawn subset — see _about_the_querent in checks.py for what that
    exemption does and does not cover.
    """
    import tarot_data as TD
    out = set()
    for card in list(TD.MAJOR_ARCANA) + list(TD.MINOR_ARCANA):
        for attr in card.get("astrology", []):
            if " in " in attr:
                out.add(attr)
    return sorted(out)

# Transcribed from tarot.py SPREAD_POSITIONS. Deliberately a copy and not an
# import: if somebody reorders or renames a position, these cases should FAIL
# and be re-recorded, not silently follow along. Same coupling as the section
# headers above, for the same reason.
_CELTIC_CROSS_POSITIONS = [
    "The Heart", "The Crossing", "The Foundation", "The Recent Past",
    "The Crown", "The Near Future", "The Self", "The Environment",
    "Hopes and Fears", "The Outcome",
]
_TWELVE_HOUSE_POSITIONS = [f"House {i}" for i in range(1, 13)]


def _arcana_cases(placements: Dict[str, str],
                  aspects: Dict[str, str]) -> List[Case]:
    """One large-spread case per paid tier. Free never reaches the arcana AI
    path — /api/tarot-reading gates enrichment to supporter and oracle — so a
    free case here would be recording a call the product cannot make."""
    return [
        Case(
            id="supporter:celtic-cross",
            tier="supporter",
            lens="psychological",
            query=_ARCANA_QUESTION,
            placements=placements,
            spread="celtic_cross",
            card_attributions=_deck_attributions(),
            aspects=aspects,
            required_sections=_CELTIC_CROSS_POSITIONS,
            # tarot_prompts asks supporter for 220 + 90/card = 1,120 words here.
            # The band is generous on both sides: the point of the check is to
            # catch a reading that collapsed or ran away, not to police a writer
            # against a word count they were only ever asked to approximate.
            words_min=650,
            words_max=1700,
        ),
        Case(
            id="oracle:twelve-house",
            tier="oracle",
            lens="psychological",
            query=_ARCANA_QUESTION,
            placements=placements,
            spread="twelve_house",
            card_attributions=_deck_attributions(),
            aspects=aspects,
            required_sections=_TWELVE_HOUSE_POSITIONS,
            # oracle: 320 + 130/card = 1,880 words for twelve cards.
            words_min=1000,
            words_max=2700,
        ),
    ]
