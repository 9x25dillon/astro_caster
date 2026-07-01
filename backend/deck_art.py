"""
deck_art.py
===========
Deck-Art Prompt Studio (Phase 4). Deterministic, offline, AI-free.

Generates image-generation PROMPTS only — no image generation happens in-engine.
Each prompt is an art-direction brief composed from the same symbolic substrate
the engine already models: the card's correspondences (tarot_data), the
querent's natal arcana signature, and HOUSE_THEMES — shaped by the selected
source system so lineage visibly changes the imagery.

Determinism contract: a prompt is a pure function of (natal signature, card,
source system). The "characterful" variation (composition, atmosphere) is drawn
from tarot's canonical sha256 seeding, so identical inputs always yield the
identical prompt, offline, with zero LLM tokens.
"""

from __future__ import annotations

from typing import Dict, List, Optional

# _seed_rng is tarot's canonical sha256 seeding — reused (not reimplemented) so
# the "never builtin hash()" invariant has exactly one implementation to audit.
from tarot import _seed_rng, build_natal_arcana_signature, card_model, source_meta
from tarot_data import CARD_BY_ID, HOUSE_THEMES, SUIT_ELEMENTS
from tarot_models import (
    DeckArtPrompt,
    DeckArtRequest,
    DeckArtResponse,
    NatalArcanaSignature,
)

# --------------------------------------------------------------------------- #
# Lineage style lenses — how each source system wants to be *seen*
# --------------------------------------------------------------------------- #

_STYLE_LENS: Dict[str, Dict[str, str]] = {
    "golden_dawn": {
        "style": "a hermetic ceremonial tarot plate — precise Golden Dawn "
                 "correspondences, temple pillars and veils, stained-glass "
                 "geometry, gilded linework on deep grounds",
        "figure": "hieratic, near-symmetrical figures posed like ritual officers",
    },
    "rws": {
        "style": "a narrative pictorial scene in the Waite-Smith tradition — "
                 "storybook symbolism, bold woodcut-inflected outlines, flat "
                 "medieval color fields",
        "figure": "an expressive human figure mid-story, readable at a glance",
    },
    "thoth": {
        "style": "a flowing energetic abstraction in the Crowley-Harris Thoth "
                 "style — art-deco geometry, projective rays, interpenetrating "
                 "planes of force",
        "figure": "a stylised archetypal form dissolving into currents of energy",
    },
    "jungian": {
        "style": "a depth-psychological dreamscape — an archetypal figure "
                 "half-emerged from shadow, soft chiaroscuro, an inner landscape "
                 "rendered as outer weather",
        "figure": "a mirrored or doubled figure meeting its own reflection",
    },
}

_ELEMENT_PALETTE: Dict[str, str] = {
    "Fire": "ember reds, molten gold, and living flame-light",
    "Water": "deep teal, moonlit silver, and tidal blue-greens",
    "Air": "pale dawn sky, luminous whites, and high violet air",
    "Earth": "moss green, ochre, umber, and warm stone",
}
_DEFAULT_PALETTE = "midnight indigo and starlit silver"

# Seeded per (signature, card, source) — the deterministic "character".
_COMPOSITIONS = [
    "a centered iconic emblem inside a tall arched frame",
    "a low-horizon landscape with the figure at a threshold",
    "twin pillars framing the scene like a temple doorway",
    "a spiral composition drawing the eye toward the card's heart",
    "a night-sky vault above, the scene unfolding beneath it",
]
_ATMOSPHERES = [
    "first light of dawn",
    "deep night under a dense starfield",
    "storm-light breaking through cloud",
    "late golden afternoon",
    "still mist over water",
]

_NEGATIVE_PROMPT = (
    "photorealism, modern objects, brand logos or watermarks, "
    "garbled text artifacts, gore or horror elements"
)


def _signature_key(signature: NatalArcanaSignature) -> str:
    """Stable string form of the natal emphasis — the chart's part of the seed."""
    weights = "|".join(f"{k}:{v}" for k, v in sorted(signature.major_weights.items()))
    return f"{signature.dominant_element}#{weights}"


def _natal_context(card_id: str, signature: NatalArcanaSignature) -> Optional[str]:
    """If this trump lives in the querent's chart, say where — house theme included."""
    link = next((l for l in signature.links if l.card.id == card_id), None)
    if link is None:
        return None
    theme = HOUSE_THEMES.get(link.house, "an important domain of life")
    where = f"natal {link.body}" + (f" in {link.sign}" if link.sign else "")
    return f"In this chart the card is carried by {where}, working through {theme}."


def build_card_prompt(
    card_id: str, signature: NatalArcanaSignature, source: str
) -> DeckArtPrompt:
    """One deterministic art brief for (signature, card, source)."""
    d = CARD_BY_ID.get(card_id)
    if d is None:
        raise ValueError(f"unknown card id: {card_id!r}")
    lens = _STYLE_LENS.get(source, _STYLE_LENS["golden_dawn"])
    rng = _seed_rng("deck_art", _signature_key(signature), card_id, source)
    composition = rng.choice(_COMPOSITIONS)
    atmosphere = rng.choice(_ATMOSPHERES)

    element = d.get("element") or SUIT_ELEMENTS.get(d.get("suit") or "", "")
    palette = _ELEMENT_PALETTE.get(element, _DEFAULT_PALETTE)
    dom = signature.dominant_element
    dom_accent = _ELEMENT_PALETTE.get(dom, _DEFAULT_PALETTE)

    keywords = list(d.get("keywords", []))
    astrology = list(d.get("astrology", []))
    motifs = keywords[:4] + astrology
    essence = d.get("lesson", {}).get("mythic") or d.get("upright", "")
    title_line = f' (titled "{d["title"]}")' if d.get("title") else ""
    natal = _natal_context(card_id, signature)

    parts = [
        f"Tarot card illustration of {d['name']}{title_line}, rendered as {lens['style']}.",
        f"Scene: {lens['figure']}, embodying {essence}",
        f"Composition: {composition}, under {atmosphere}.",
        f"Symbolic motifs woven into the scene: {', '.join(motifs)}.",
        f"Palette: {palette}, with accents of the querent's dominant "
        f"{dom} element ({dom_accent}).",
    ]
    if natal:
        parts.append(f"Personal resonance: {natal}")
    if d.get("number") is not None:
        parts.append(
            f"An ornate border carries the card's number ({d['number']}) and its "
            f"{element or 'elemental'} sigil; no text besides the card title."
        )

    return DeckArtPrompt(
        card=card_model(card_id),
        title=f"{d['name']} — {source_meta(source)['name']} deck art",
        prompt=" ".join(p.rstrip(".") + "." for p in parts),
        negative_prompt=_NEGATIVE_PROMPT,
        motifs=motifs,
        palette=palette,
        natal_context=natal,
    )


def _soul_deck_ids(signature: NatalArcanaSignature) -> List[str]:
    """The querent's signature trumps in canonical (Sun-first) link order, deduped."""
    seen: set = set()
    return [
        l.card.id for l in signature.links
        if not (l.card.id in seen or seen.add(l.card.id))
    ]


def build_deck_art(req: DeckArtRequest) -> DeckArtResponse:
    """Deck-art prompt(s): one card when `card_id` is set, else the soul deck
    (every trump in the natal signature). Deterministic per (chart, card, source)."""
    signature = build_natal_arcana_signature(req.chart)
    card_ids = [req.card_id] if req.card_id else _soul_deck_ids(signature)
    prompts = [build_card_prompt(cid, signature, req.source) for cid in card_ids]
    return DeckArtResponse(
        source=req.source,
        lineage=source_meta(req.source)["name"],
        prompts=prompts,
    )
