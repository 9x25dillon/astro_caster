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
from zoneinfo import ZoneInfo

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
    LearningPathRequest,
    LearningPathResponse,
    LearningStep,
    NatalArcanaSignature,
    TarotCard,
    TarotReadingRequest,
    TarotReadingResponse,
    WeightSource,
)

# Trump name -> id, for resolving shadow archetype names back to card ids.
_MAJOR_NAME_TO_ID = {d["name"]: cid for cid, d in MAJOR_BY_ID.items()}

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
    # card id -> the natal contributions that built its weight (Phase 2.1). Built
    # in lockstep with major_weights so the explainability panel is derived from
    # the exact numbers that feed the draw, never a reconstruction.
    weight_sources: Dict[str, List[WeightSource]] = {}

    for body in _SIGNATURE_ORDER:
        p = planets.get(body)
        if p is None:
            continue
        card_id = _card_for_body(body, p)
        if card_id is None:
            continue
        w = _BODY_WEIGHT.get(body, _DEFAULT_BODY_WEIGHT)
        sign = getattr(p, "sign", None)
        major_weights[card_id] = major_weights.get(card_id, 0.0) + w
        weight_sources.setdefault(card_id, []).append(WeightSource(
            label=f"{MAJOR_BY_ID[card_id]['name']} emphasised by natal {body}"
                  + (f" in {sign}" if sign else ""),
            weight=round(w, 3),
        ))
        # A planet also lights up the trump of its sign (secondary emphasis).
        sign_card = SIGN_MAJOR.get(sign)
        if sign_card and sign_card != card_id:
            major_weights[sign_card] = major_weights.get(sign_card, 0.0) + w * 0.4
            weight_sources.setdefault(sign_card, []).append(WeightSource(
                label=f"{MAJOR_BY_ID[sign_card]['name']} lit by {sign} placement ({body})",
                weight=round(w * 0.4, 3),
            ))

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
        weight_sources=weight_sources,
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


# Current interpretive doctrine. The seed folds in the source system so a
# different lineage yields a different draw (Phase 2.2). The default contributes
# nothing to the seed string, so existing seeds remain reproducible.
_DEFAULT_SOURCE = "golden_dawn"

# Interpretive lineages (Phase 2.2). `lens` shapes the offline prose and the AI
# prompt; the selection also folds into the determinism seed.
SOURCE_SYSTEMS: Dict[str, Dict[str, str]] = {
    "golden_dawn": {
        "name": "Golden Dawn / Hermetic",
        "lens": "Hermetic Qabalah, decan rulerships, and elemental dignities — the "
                "tradition this deck's correspondences are built on.",
    },
    "rws": {
        "name": "Rider-Waite-Smith",
        "lens": "the Waite-Smith pictorial tradition — narrative scene symbolism and "
                "accessible, story-first imagery.",
    },
    "thoth": {
        "name": "Thoth (Crowley-Harris)",
        "lens": "the Thelemic Thoth tradition — titled minors, astrological decans, "
                "and dynamic, energetic correspondences.",
    },
    "jungian": {
        "name": "Psychological / Jungian",
        "lens": "depth psychology — archetypes, individuation, shadow work, and "
                "projection, reading the cards as inner figures.",
    },
}


def source_meta(source: Optional[str]) -> Dict[str, str]:
    """Resolve a source system to its display name + interpretive lens."""
    return SOURCE_SYSTEMS.get(source or _DEFAULT_SOURCE, SOURCE_SYSTEMS[_DEFAULT_SOURCE])


def resolve_local_date(
    start_date: Optional[str] = None, timezone: Optional[str] = None
) -> _dt.date:
    """Resolve the querent's local date, the unit of meaning for tarot/astrology.

    Precedence: explicit ``start_date`` (ISO "YYYY-MM-DD") wins; else "today" in
    the given IANA ``timezone``; else server-local today. Raises ValueError (bad
    date string) or ZoneInfoNotFoundError (unknown timezone) — the endpoint
    surfaces either as HTTP 400.
    """
    if start_date:
        return _dt.date.fromisoformat(start_date)
    if timezone:
        return _dt.datetime.now(ZoneInfo(timezone)).date()
    return _dt.date.today()


def _default_seed(
    chart: ChartResponse,
    spread: str,
    question: str,
    local_date: Optional[str] = None,
    source: str = _DEFAULT_SOURCE,
) -> str:
    """
    Stable seed — a pure function of (natal signature, resolved local date for the
    'daily' spread, spread, question, source system). The 'daily' branch folds in
    the local date so a daily card changes each day *and* is reproducible for a
    given local date regardless of the server clock; other spreads omit the date.

    Defaults reproduce the prior seed string exactly: an unset local_date falls
    back to server today (legacy), and the default source contributes nothing.
    """
    bodies = "|".join(
        f"{p.id}:{round(p.longitude, 2)}" for p in sorted(chart.planets, key=lambda x: x.id)
    )
    day = f"#{local_date or _dt.date.today().isoformat()}" if spread == "daily" else ""
    src = "" if (not source or source == _DEFAULT_SOURCE) else f"#src:{source}"
    return f"{bodies}#{spread}#{question.strip().lower()}{day}{src}"


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


def _card_weight_sources(card_id: str, signature: NatalArcanaSignature) -> List[WeightSource]:
    """Why a card was likely — from the ACTUAL draw weights, not a reconstruction.
    Majors carry their natal contributions; minors are explained by suit bias."""
    d = CARD_BY_ID[card_id]
    if d.get("arcana") == "minor":
        suit = d.get("suit") or ""
        element = SUIT_ELEMENTS.get(suit, "")
        bias = signature.suit_bias.get(suit, 0.0)
        return [WeightSource(
            label=f"{suit.title()} weighted by {element} balance ({round(bias * 100)}% of the chart)",
            weight=round(bias, 3),
        )]
    srcs = signature.weight_sources.get(card_id)
    if srcs:
        return list(srcs)
    return [WeightSource(label="Neutral draw — no natal emphasis on this trump", weight=0.0)]


def build_reading_core(req: TarotReadingRequest) -> TarotReadingResponse:
    """Deterministic reading WITHOUT AI. main.py may overwrite `interpretation`."""
    if req.date:
        # The local date is the unit of meaning for a daily draw — an unparseable
        # date must be rejected (-> HTTP 400), never silently folded into the seed.
        _dt.date.fromisoformat(req.date)
    signature = build_natal_arcana_signature(req.chart)
    seed = req.seed or _default_seed(
        req.chart, req.spread, req.question, local_date=req.date, source=req.source
    )
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
            weight_sources=_card_weight_sources(card_id, signature),
        ))
        if req.include_lessons:
            lessons.append(lesson_for_card(card_id))
        if activity:
            activities.append(activity)

    interpretation = _offline_reading_prose(req, signature, cards)

    return TarotReadingResponse(
        spread=req.spread, source=req.source, question=req.question, seed=seed,
        signature=signature, cards=cards, interpretation=interpretation,
        ai_source=None, lessons=lessons, activities=activities,
    )


def _offline_reading_prose(req, signature, cards) -> str:
    names = ", ".join(f"{c.card.name} ({c.position})" for c in cards)
    dom = signature.dominant_element
    suit = ELEMENT_SUIT.get(dom, "wands")
    meta = source_meta(getattr(req, "source", _DEFAULT_SOURCE))
    lines = [
        f"You asked: *{req.question}*",
        "",
        f"Read through the **{meta['name']}** lineage — {meta['lens']}",
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
# Phase 3.1 — Classroom as a generated learning path
# --------------------------------------------------------------------------- #


def _shadow_trump_ids(signature: NatalArcanaSignature) -> List[str]:
    """Resolve the signature's shadow archetype names back to trump ids."""
    return [_MAJOR_NAME_TO_ID[n] for n in signature.shadows if n in _MAJOR_NAME_TO_ID]


def build_learning_path(req: LearningPathRequest) -> LearningPathResponse:
    """A deterministic archetypal curriculum for this chart + source system.

    The path departs from the querent's strongest archetype (anchor) and ascends —
    through emphasis-weighted intermediate trumps — toward an underdeveloped shadow
    archetype (growth edge), e.g. High Priestess -> Justice -> Death -> Temperance.
    Fully reproducible from (natal signature, source system).
    """
    signature = build_natal_arcana_signature(req.chart)
    meta = source_meta(req.source)
    n = max(3, min(req.steps, 8))
    rng = _seed_rng("learning_path", signature.dominant_element,
                    "|".join(f"{k}:{v}" for k, v in sorted(signature.major_weights.items())),
                    req.source)

    ranked = sorted(signature.major_weights.items(), key=lambda kv: kv[1], reverse=True)
    anchor_id = ranked[0][0] if ranked else "fool"
    shadows = _shadow_trump_ids(signature)
    # Growth edge: a shadow trump distinct from the anchor; else the least-emphasised
    # trump present; else The World (completion) as a stable fallback.
    growth_id = next((c for c in shadows if c != anchor_id), None)
    if growth_id is None:
        growth_id = next((cid for cid, _ in reversed(ranked) if cid != anchor_id), "world")

    a_num, g_num = MAJOR_BY_ID[anchor_id]["number"], MAJOR_BY_ID[growth_id]["number"]
    lo_id, hi_id = (anchor_id, growth_id) if a_num <= g_num else (growth_id, anchor_id)
    lo, hi = min(a_num, g_num), max(a_num, g_num)

    # Intermediate trumps strictly between the endpoints, chosen by emphasis
    # (major_weights) with a seeded tie-break, then the whole path sorted by number.
    between = [c for c in MAJOR_ARCANA if lo < c["number"] < hi]
    between.sort(key=lambda c: (-signature.major_weights.get(c["id"], 0.0), rng.random()))
    chosen_mid = sorted(between[: max(0, n - 2)], key=lambda c: c["number"])
    ordered_ids = [lo_id] + [c["id"] for c in chosen_mid] + [hi_id]
    # Dedup while preserving order (endpoints can coincide with a midpoint edge case).
    seen: set = set()
    ordered_ids = [c for c in ordered_ids if not (c in seen or seen.add(c))]

    dom = signature.dominant_element
    steps: List[LearningStep] = []
    last = len(ordered_ids) - 1
    for i, cid in enumerate(ordered_ids):
        d = MAJOR_BY_ID[cid]
        lesson = d.get("lesson", {})
        if i == 0:
            stage = "Anchor"
            focus = (f"You begin where you are already strong: {d['name']} is emphasised "
                     f"in your chart. Ground the journey in this familiar archetype.")
        elif i == last:
            stage = "Growth edge"
            focus = (f"{d['name']} is a quieter, growth-ward archetype for you — the "
                     f"underdeveloped edge this path is walking toward.")
        else:
            stage = "Bridge"
            focus = (f"{d['name']} bridges the work, carrying your {dom} emphasis one "
                     f"step further along the sequence.")
        steps.append(LearningStep(
            order=i + 1, stage=stage, card=card_model(cid), focus=focus,
            practice=(lesson.get("practice", "") or _minor_practice(d)),
            journal=(lesson.get("journal", "") or _minor_journal(d)),
        ))

    return LearningPathResponse(
        source=req.source,
        anchor=MAJOR_BY_ID[anchor_id]["name"],
        growth_edge=MAJOR_BY_ID[growth_id]["name"],
        lineage=meta["name"],
        steps=steps,
    )


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


_QUIET_SKY_SUMMARY = "Quiet sky — an integration day."


def _arcana_day_dict(
    date: str, card_id: str, reversed_flag: bool,
    natal_link: Optional[str], transit_summary: str,
) -> Dict:
    """Assemble one ArcanaDay dict from a trump + its static lesson content."""
    d = MAJOR_BY_ID[card_id]
    lesson = d.get("lesson", {})
    return {
        "date": date,
        "transit_summary": transit_summary,
        "natal_link": natal_link,
        "card": card_model(card_id, reversed_flag).model_dump(),
        "reversed": reversed_flag,
        "lesson": lesson.get("psychological", ""),
        "shadow": lesson.get("shadow", ""),
        "best_expression": d.get("upright", ""),
        "alignment_action": (PLANET_ACTIVITY.get(natal_link) or lesson.get("practice", "")),
        "journal_prompt": lesson.get("journal", ""),
    }


def _quiet_day_card(
    signature: NatalArcanaSignature, seed_base: str, date_iso: str
) -> Tuple[str, bool]:
    """Deterministically draw a single trump for a day with no transit event,
    weighted by the natal signature so the 'integration day' still reflects the
    chart. Stable for (seed_base, date, signature)."""
    rng = _seed_rng(seed_base, date_iso, "quiet")
    majors = [c["id"] for c in MAJOR_ARCANA]
    card_id = _weighted_sample_without_replacement(
        rng, majors, signature.major_weights, 1
    )[0]
    reversed_flag = rng.random() < _REVERSED_PROB
    return card_id, reversed_flag


def daily_arcana_from_events(
    events: List[Dict], start_iso: str, days: int, signature: NatalArcanaSignature
) -> List[Dict]:
    """
    Build EXACTLY one card per day over the window (Phase 7 overlay). For a date
    with transit events, pick the highest-significance event and map it to a
    trump. For a date with no event, deterministically draw a natal-weighted
    trump labelled a "quiet sky / integration day" — so an N-day request always
    returns N cards. Returns plain dicts (-> ArcanaDay).
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
        if ev is not None:
            card_id, natal_link = arcana_for_event(ev)
            # Stable per-day reversal (no global RNG state).
            reversed_flag = _seed_rng(seed_base, date, card_id).random() < _REVERSED_PROB
            out.append(_arcana_day_dict(
                date, card_id, reversed_flag, natal_link, ev.get("summary", "")
            ))
        else:
            card_id, reversed_flag = _quiet_day_card(signature, seed_base, date)
            out.append(_arcana_day_dict(
                date, card_id, reversed_flag, None, _QUIET_SKY_SUMMARY
            ))
    return out
