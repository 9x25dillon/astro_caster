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

from typing import Dict, List

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


def build_cases(placements: Dict[str, str]) -> List[Case]:
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
            ))
    return cases
