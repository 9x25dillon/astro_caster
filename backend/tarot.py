"""
tarot.py
========
The Astra Arcana engine. Deterministic, offline-first, AI-free at its core:

  build_natal_arcana_signature(chart)  -> a reusable archetypal signature
  weighted_draw(signature, spread, seed) -> chart-weighted, reproducible draw
  lesson_for_card / activity_for_card   -> static educational + alignment content
  generate_tarot_reading(req)           -> orchestration (sans AI)
  arcana_for_event(event)               -> Phase 7 transit-card overlay helper

Reproducibility: all randomness is seeded from a sha256 of a stable string
(chart signature + date + question + spread). Python's builtin hash() is salted
per-process and is NEVER used for seeding here.
"""

from __future__ import annotations

import datetime as _dt
import hashlib
import random
from typing import Dict, List, Optional, Tuple

import astrology as A
from models import ChartResponse
from tarot_data import (
    CARD_BY_ID,
    ELEMENT_SUIT,
    FULL_DECK,
    HOUSE_THEMES,
    MAJOR_ARCANA,
    MAJOR_BY_ID,
    MINOR_ARCANA,
    MINOR_BY_ID,
    PLANET_ACTIVITY,
    PLANET_MAJOR,
    SIGN_MAJOR,
    SUIT_ELEMENTS,
    SUIT_THEME,
)
from tarot_models import (
    ArcanaCardLink,
    DrawnCard,
    NatalArcanaSignature,
    TarotCard,
    TarotReadingRequest,
    TarotReadingResponse,
)

# Canonical display order for the natal signature.
_SIGNATURE_ORDER = [
    "Sun", "Moon", "Ascendant", "Mercury", "Venus", "Mars", "Jupiter",
    "Saturn", "Uranus", "Neptune", "Pluto", "North Node", "Midheaven",
]

# How strongly each body weights its archetypal cards in the soul-deck.
_BODY_WEIGHT = {
    "Sun": 3.0, "Moon": 3.0, "Ascendant": 2.5, "Mercury": 1.5, "Venus": 1.5,
    "Mars": 1.5, "Jupiter": 1.2, "Saturn": 1.2, "Midheaven": 1.5,
}
_DEFAULT_BODY_WEIGHT = 1.0

_REVERSED_PROB = 0.28

# Spread definitions: ordered position labels. Card count = len(positions).
SPREAD_POSITIONS: Dict[str, List[str]] = {
    "daily": ["Today"],
    "three_card": ["Self", "Mirror", "Shadow"],
    "elemental_balance": ["Fire", "Water", "Air", "Earth", "Spirit"],
    "planetary_seven": ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"],
    "twelve_house": [f"House {i}" for i in range(1, 13)],
    "relationship": ["You", "The Other", "The Bond", "The Lesson", "The Becoming"],
    "transit_pressure": ["The Pressure", "What It Asks", "The Resource", "The Release"],
    "shadow_integration": ["The Mask", "The Shadow", "The Gift", "The Integration"],
    "creative_expression": ["The Spark", "The Form", "The Block", "The Offering"],
}


# --------------------------------------------------------------------------- #
# Card model helpers
# --------------------------------------------------------------------------- #


def card_model(card_id: str, reversed: bool = False) -> TarotCard:
    """Build a TarotCard model from any card id (Major or Minor Arcana)."""
    d = CARD_BY_ID[card_id]
    return TarotCard(
        id=d["id"], name=d["name"], arcana=d.get("arcana", "major"),
        number=d.get("number"), suit=d.get("suit"),
        keywords=list(d.get("keywords", [])), element=d.get("element"),
        astrology=list(d.get("astrology", [])),
        upright=d.get("upright"), reversed_meaning=d.get("reversed"),
    )


# --------------------------------------------------------------------------- #
# Phase 1 — Natal Arcana signature (deterministic, no AI)
# --------------------------------------------------------------------------- #


def _planet_index(chart: ChartResponse) -> Dict[str, object]:
    return {p.id: p for p in chart.planets}


def _card_for_body(body_id: str, planet) -> Optional[str]:
    """Resolve a natal body to its Major Arcana id."""
    if body_id in PLANET_MAJOR:
        return PLANET_MAJOR[body_id]
    # Angles (Ascendant/Midheaven) take the trump of the sign they fall in.
    if planet is not None and planet.sign in SIGN_MAJOR:
        return SIGN_MAJOR[planet.sign]
    return None


def build_natal_arcana_signature(chart: ChartResponse) -> NatalArcanaSignature:
    """Map a natal chart into a reusable archetypal tarot signature. AI-free."""
    planets = _planet_index(chart)
    links: List[ArcanaCardLink] = []
    major_weights: Dict[str, float] = {}

    for body in _SIGNATURE_ORDER:
        p = planets.get(body)
        if p is None:
            continue
        card_id = _card_for_body(body, p)
        if card_id is None:
            continue
        w = _BODY_WEIGHT.get(body, _DEFAULT_BODY_WEIGHT)
        major_weights[card_id] = major_weights.get(card_id, 0.0) + w
        # A planet also lights up the trump of its sign (secondary emphasis).
        sign_card = SIGN_MAJOR.get(getattr(p, "sign", None))
        if sign_card and sign_card != card_id:
            major_weights[sign_card] = major_weights.get(sign_card, 0.0) + w * 0.4

        house = getattr(p, "house", None)
        theme = HOUSE_THEMES.get(house, "an important domain of life")
        note = (
            f"{body} in {p.sign} (house {house}) — "
            f"{MAJOR_BY_ID[card_id]['name']} working through {theme}."
        )
        links.append(ArcanaCardLink(
            body=body, sign=getattr(p, "sign", None), house=house,
            card=card_model(card_id), note=note,
        ))

    # Suit bias from elemental balance.
    elements = chart.elements or {}
    total_el = sum(elements.values()) or 1
    suit_bias = {
        ELEMENT_SUIT[el]: round(elements.get(el, 0) / total_el, 3)
        for el in ("Fire", "Water", "Air", "Earth")
    }

    dominant_element = max(elements, key=elements.get) if elements else "Fire"
    modalities = chart.modalities or {}
    dominant_modality = max(modalities, key=modalities.get) if modalities else "Cardinal"

    # Themes: the most-emphasised trumps. Shadows: the weakest element's archetypes.
    ranked = sorted(major_weights.items(), key=lambda kv: kv[1], reverse=True)
    themes = [MAJOR_BY_ID[cid]["name"] for cid, _ in ranked[:5]]

    weakest_el = min(elements, key=elements.get) if elements else "Earth"
    shadow_signs = [s for s, e in A.ELEMENTS.items() if e == weakest_el]
    shadows = sorted({MAJOR_BY_ID[SIGN_MAJOR[s]]["name"] for s in shadow_signs if s in SIGN_MAJOR})

    return NatalArcanaSignature(
        links=links,
        dominant_element=dominant_element,
        dominant_modality=dominant_modality,
        suit_bias=suit_bias,
        major_weights={k: round(v, 3) for k, v in major_weights.items()},
        themes=themes,
        shadows=shadows,
    )


# --------------------------------------------------------------------------- #
# Phase 2 — Deterministic, chart-weighted spread draw
# --------------------------------------------------------------------------- #


def _seed_rng(*parts: str) -> random.Random:
    """Stable RNG seeded from sha256 of the joined parts (never builtin hash())."""
    raw = "".join(parts).encode("utf-8")
    digest = hashlib.sha256(raw).hexdigest()
    return random.Random(int(digest, 16))


def _weighted_sample_without_replacement(
    rng: random.Random, items: List[str], weights: Dict[str, float], k: int
) -> List[str]:
    """Draw k distinct ids, biased by weight, preserving randomness."""
    pool = list(items)
    chosen: List[str] = []
    k = min(k, len(pool))
    for _ in range(k):
        wts = [max(0.0001, 1.0 + weights.get(c, 0.0)) for c in pool]
        total = sum(wts)
        r = rng.random() * total
        upto = 0.0
        pick = pool[-1]
        for c, w in zip(pool, wts):
            upto += w
            if upto >= r:
                pick = c
                break
        chosen.append(pick)
        pool.remove(pick)
    return chosen


def _draw_weights(signature: NatalArcanaSignature) -> Dict[str, float]:
    """
    Per-card emphasis for the full 78-card deck: Major trumps weighted by the
    natal signature's major_weights, Minor cards weighted by the chart's suit
    bias (so a Water-dominant chart draws more Cups, etc.).
    """
    w: Dict[str, float] = dict(signature.major_weights)
    for c in MINOR_ARCANA:
        w[c["id"]] = signature.suit_bias.get(c["suit"], 0.0) * 3.0
    return w


def weighted_draw(
    signature: NatalArcanaSignature,
    spread: str,
    seed: str,
    majors_only: bool = False,
) -> List[Tuple[str, bool, str]]:
    """
    Return [(card_id, reversed, position)] for the spread. Deterministic for a
    given seed; no duplicate cards within a spread. Draws from the full 78-card
    deck (Major + Minor) unless majors_only is set.
    """
    positions = SPREAD_POSITIONS.get(spread, SPREAD_POSITIONS["three_card"])
    rng = _seed_rng(seed, spread)
    if majors_only:
        deck = [c["id"] for c in MAJOR_ARCANA]
        weights = signature.major_weights
    else:
        deck = [c["id"] for c in FULL_DECK]
        weights = _draw_weights(signature)
    drawn = _weighted_sample_without_replacement(
        rng, deck, weights, len(positions)
    )
    out: List[Tuple[str, bool, str]] = []
    for card_id, pos in zip(drawn, positions):
        reversed_flag = rng.random() < _REVERSED_PROB
        out.append((card_id, reversed_flag, pos))
    return out


# --------------------------------------------------------------------------- #
# Static lessons + alignment activities (offline)
# --------------------------------------------------------------------------- #


def _minor_journal(d: Dict) -> str:
    kw = d.get("keywords", ["this energy"])[0]
    return f"Where is the energy of {d['name']} — {kw} — moving in me right now?"


def _minor_practice(d: Dict) -> str:
    kw = d.get("keywords", ["this"])[0]
    return f"Notice one place today where {kw} is asking for your attention, and meet it consciously."


def lesson_for_card(card_id: str) -> Dict[str, str]:
    """Educational block for any card. Majors carry a full lesson corpus; minors
    degrade gracefully to their keywords, decan, and upright/reversed faces."""
    d = CARD_BY_ID[card_id]
    lesson = d.get("lesson", {})
    is_minor = d.get("arcana") == "minor"
    return {
        "card": d["name"],
        "summary": f"{d['name']} — {', '.join(d.get('keywords', [])[:3])}.",
        "mythic": lesson.get("mythic", "") or (f"Titled \"{d['title']}\" in the Golden Dawn tradition." if d.get("title") else ""),
        "psychological": lesson.get("psychological", "") or (d.get("upright", "") if is_minor else ""),
        "astrology": ", ".join(d.get("astrology", [])),
        "element": d.get("element", ""),
        "shadow": lesson.get("shadow", "") or (d.get("reversed", "") if is_minor else ""),
        "practice": lesson.get("practice", "") or (_minor_practice(d) if is_minor else ""),
        "journal": lesson.get("journal", "") or (_minor_journal(d) if is_minor else ""),
    }


def activity_for_card(card_id: str, signature: NatalArcanaSignature, position: str) -> Dict[str, str]:
    """A gentle, optional alignment activity grounded in the card + chart."""
    d = CARD_BY_ID[card_id]
    # Prefer a body-specific activity if this card is one of the natal links.
    body = next((l.body for l in signature.links if l.card.id == card_id), None)
    if body and body in PLANET_ACTIVITY:
        text = PLANET_ACTIVITY[body]
    else:
        text = d.get("lesson", {}).get("practice", "") or _minor_practice(d)
    return {"position": position, "card": d["name"], "activity": text}


# --------------------------------------------------------------------------- #
# Orchestration (AI-free core; AI enrichment is layered in main.py)
# --------------------------------------------------------------------------- #


def _default_seed(chart: ChartResponse, spread: str, question: str) -> str:
    """
    Stable per-chart-per-question seed. The 'daily' spread also folds in today's
    date so a daily card actually changes each day; other spreads stay
    reproducible for the same chart + question (no date).
    """
    bodies = "|".join(
        f"{p.id}:{round(p.longitude, 2)}" for p in sorted(chart.planets, key=lambda x: x.id)
    )
    day = f"#{_dt.date.today().isoformat()}" if spread == "daily" else ""
    return f"{bodies}#{spread}#{question.strip().lower()}{day}"


def _offline_meaning(card_id: str, reversed: bool, position: str, link_note: Optional[str]) -> str:
    d = CARD_BY_ID[card_id]
    face = d.get("reversed") if reversed else d.get("upright")
    orient = "reversed" if reversed else "upright"
    kind = "card" if d.get("arcana") == "minor" else "archetype"
    base = (
        f"**{d['name']}** ({orient}) in the *{position}* position speaks of "
        f"{face}. Its keywords — {', '.join(d.get('keywords', [])[:4])} — color how "
        f"this {kind} is moving for you now."
    )
    if link_note:
        base += f" In your chart, this trump already lives here: {link_note}"
    return base


def build_reading_core(req: TarotReadingRequest) -> TarotReadingResponse:
    """Deterministic reading WITHOUT AI. main.py may overwrite `interpretation`."""
    signature = build_natal_arcana_signature(req.chart)
    seed = req.seed or _default_seed(req.chart, req.spread, req.question)
    draw = weighted_draw(signature, req.spread, seed)

    # Keep the FIRST (canonical-order: Sun-first) body when several placements
    # share one trump, so natal_link/notes attach to the primary body.
    link_by_card: Dict[str, object] = {}
    for l in signature.links:
        link_by_card.setdefault(l.card.id, l)
    cards: List[DrawnCard] = []
    lessons: List[Dict[str, str]] = []
    activities: List[Dict[str, str]] = []

    for card_id, reversed_flag, position in draw:
        link = link_by_card.get(card_id)
        d = CARD_BY_ID[card_id]
        meaning = _offline_meaning(card_id, reversed_flag, position, link.note if link else None)
        activity = activity_for_card(card_id, signature, position) if req.include_activities else None
        journal = d.get("lesson", {}).get("journal") or (_minor_journal(d) if d.get("arcana") == "minor" else None)
        cards.append(DrawnCard(
            position=position,
            card=card_model(card_id, reversed_flag),
            reversed=reversed_flag,
            natal_link=link.body if link else None,
            meaning=meaning,
            activity=activity["activity"] if activity else None,
            journal_prompt=journal,
        ))
        if req.include_lessons:
            lessons.append(lesson_for_card(card_id))
        if activity:
            activities.append(activity)

    interpretation = _offline_reading_prose(req, signature, cards)

    return TarotReadingResponse(
        spread=req.spread, question=req.question, seed=seed,
        signature=signature, cards=cards, interpretation=interpretation,
        ai_source=None, lessons=lessons, activities=activities,
    )


def _offline_reading_prose(req, signature, cards) -> str:
    names = ", ".join(f"{c.card.name} ({c.position})" for c in cards)
    dom = signature.dominant_element
    suit = ELEMENT_SUIT.get(dom, "wands")
    lines = [
        f"You asked: *{req.question}*",
        "",
        f"Your chart leans **{dom}** ({SUIT_THEME[suit]}), in a **{signature.dominant_modality}** "
        f"rhythm. Against that ground, the cards drawn are: {names}.",
        "",
    ]
    for c in cards:
        d = CARD_BY_ID[c.card.id]
        face = d["reversed"] if c.reversed else d["upright"]
        lines.append(f"- **{c.position} — {c.card.name}**: {face}.")
    lines += [
        "",
        f"Strongest archetypes in you: {', '.join(signature.themes)}. "
        f"Quieter, growth-ward edges: {', '.join(signature.shadows) or 'in balance'}.",
        "",
        "Read these as mirrors, not verdicts — a language for the moment, not a map of fate.",
    ]
    return "\n".join(lines)


# --------------------------------------------------------------------------- #
# Phase 7 — Transit arcana overlay (thin layer over forecast.py events)
# --------------------------------------------------------------------------- #


def arcana_for_event(event: Dict) -> Tuple[str, Optional[str]]:
    """
    Map a forecast event dict to (card_id, natal_link). Priority:
      1. transit-to-natal -> the natal target body's card
      2. station / transit-to-transit -> the moving planet's card
    Falls back to the sign of the moving planet via its summary if needed.
    """
    etype = event.get("type")
    if etype == "transit_natal":
        target = (event.get("target") or "").replace("natal ", "").strip()
        if target in PLANET_MAJOR:
            return PLANET_MAJOR[target], target
    planet = event.get("planet")
    if planet in PLANET_MAJOR:
        return PLANET_MAJOR[planet], planet
    # Last resort: the Wheel (cycles/turning point).
    return "wheel_of_fortune", None


_SIG_RANK = {"high": 3, "medium": 2, "low": 1}


def daily_arcana_from_events(events: List[Dict], start_iso: str, days: int) -> List[Dict]:
    """
    Build one card per day from forecast events (Phase 7 overlay). For each date
    present, pick the highest-significance event and map it to a trump, attaching
    static lesson/shadow/action content. Returns plain dicts (-> ArcanaDay).
    """
    by_date: Dict[str, Dict] = {}
    for ev in events:
        d = ev.get("date")
        if not d:
            continue
        cur = by_date.get(d)
        if cur is None or _SIG_RANK.get(ev.get("significance"), 1) > _SIG_RANK.get(cur.get("significance"), 1):
            by_date[d] = ev

    start = _dt.date.fromisoformat(start_iso)
    out: List[Dict] = []
    seed_base = start_iso
    for i in range(days):
        date = (start + _dt.timedelta(days=i)).isoformat()
        ev = by_date.get(date)
        if ev is None:
            continue
        card_id, natal_link = arcana_for_event(ev)
        d = MAJOR_BY_ID[card_id]
        lesson = d.get("lesson", {})
        # A stable per-day reversal (no global RNG state).
        reversed_flag = _seed_rng(seed_base, date, card_id).random() < _REVERSED_PROB
        out.append({
            "date": date,
            "transit_summary": ev.get("summary", ""),
            "natal_link": natal_link,
            "card": card_model(card_id, reversed_flag).model_dump(),
            "reversed": reversed_flag,
            "lesson": lesson.get("psychological", ""),
            "shadow": lesson.get("shadow", ""),
            "best_expression": d.get("upright", ""),
            "alignment_action": (PLANET_ACTIVITY.get(natal_link)
                                 or lesson.get("practice", "")),
            "journal_prompt": lesson.get("journal", ""),
        })
    return out
