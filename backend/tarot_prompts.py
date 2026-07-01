"""
tarot_prompts.py
================
Prompt scaffolding for AI-enriched Astra Arcana readings. Inherits the same
anti-deterministic stance as ai.py's Astra system prompt: tarot + astrology are
symbolic mirrors, never fortune-telling.
"""

from __future__ import annotations

from typing import Dict, List

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
) -> str:
    """Compose the user message: chart signature + drawn cards + question."""
    sig = "\n".join(f"- {line}" for line in signature_lines)
    cards = "\n".join(
        f"- {d['position']}: {d['name']} ({d['orientation']})"
        f"{' — natal echo: ' + d['natal_link'] if d.get('natal_link') else ''}"
        for d in drawn
    )
    lens_line = f"INTERPRETIVE LINEAGE (read the cards through this tradition): {source_lens}\n" if source_lens else ""
    return (
        f"NATAL ARCANA SIGNATURE (do not contradict):\n"
        f"{lens_line}"
        f"Dominant element: {dominant_element}. Dominant modality: {dominant_modality}.\n"
        f"Strongest archetypes: {', '.join(themes)}.\n"
        f"Growth-ward / quieter archetypes: {', '.join(shadows) or 'in balance'}.\n"
        f"Body-to-card map:\n{sig}\n\n"
        f"SPREAD: {spread}\n"
        f"CARDS DRAWN:\n{cards}\n\n"
        f"QUESTION: {question}\n\n"
        f"Give the reading now, following the required structure."
    )
