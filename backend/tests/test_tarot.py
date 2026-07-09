"""
Tests for the Astra Arcana engine (tarot.py / tarot_data.py / tarot_models.py).
These assert deterministic, AI-free behaviour: stable mappings, reproducible
seeded draws, and no duplicate cards in normal spreads.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import astrology as A  # noqa: E402
import ephemeris as E  # noqa: E402
from models import ChartRequest  # noqa: E402
import tarot as TAROT  # noqa: E402
import tarot_data as TD  # noqa: E402
from tarot_models import TarotReadingRequest  # noqa: E402


def _chart(**kw):
    base = dict(year=1879, month=3, day=14, hour=11, minute=30, second=0,
                lat=48.4011, lng=9.9876, tz_offset=0.67)  # Einstein — public natal data
    base.update(kw)
    return E.calculate_chart(ChartRequest(**base))


# --- data integrity -------------------------------------------------------- #

def test_major_arcana_complete():
    assert len(TD.MAJOR_ARCANA) == 22
    numbers = sorted(c["number"] for c in TD.MAJOR_ARCANA)
    assert numbers == list(range(22))
    # every card has lesson content
    for c in TD.MAJOR_ARCANA:
        assert c["lesson"]["journal"]
        assert c["upright"] and c["reversed"]


def test_element_suit_roundtrip():
    for el, suit in TD.ELEMENT_SUIT.items():
        assert TD.SUIT_ELEMENTS[suit] == el


def test_planet_and_sign_maps_point_to_real_cards():
    for cid in list(TD.PLANET_MAJOR.values()) + list(TD.SIGN_MAJOR.values()):
        assert cid in TD.MAJOR_BY_ID, cid
    # all 12 signs covered
    assert set(TD.SIGN_MAJOR) == set(A.SIGNS)


def test_sun_maps_to_sun_card():
    assert TD.PLANET_MAJOR["Sun"] == "sun"
    assert TD.PLANET_MAJOR["Moon"] == "high_priestess"
    assert TD.SIGN_MAJOR["Aries"] == "emperor"


# --- signature ------------------------------------------------------------- #

def test_signature_deterministic_and_grounded():
    chart = _chart()
    sig1 = TAROT.build_natal_arcana_signature(chart)
    sig2 = TAROT.build_natal_arcana_signature(chart)
    assert sig1.major_weights == sig2.major_weights
    assert sig1.dominant_element in ("Fire", "Earth", "Air", "Water")
    # suit bias sums to ~1
    assert abs(sum(sig1.suit_bias.values()) - 1.0) < 0.05
    # Sun link resolves to the Sun trump
    sun = next(l for l in sig1.links if l.body == "Sun")
    assert sun.card.id == "sun"


# --- draw determinism + uniqueness ----------------------------------------- #

def test_seeded_draw_is_reproducible():
    chart = _chart()
    sig = TAROT.build_natal_arcana_signature(chart)
    a = TAROT.weighted_draw(sig, "three_card", seed="fixed-seed")
    b = TAROT.weighted_draw(sig, "three_card", seed="fixed-seed")
    assert a == b
    c = TAROT.weighted_draw(sig, "three_card", seed="other-seed")
    assert a != c  # different seed -> (almost surely) different draw


def test_no_duplicate_cards_in_spread():
    chart = _chart()
    sig = TAROT.build_natal_arcana_signature(chart)
    for spread in TAROT.SPREAD_POSITIONS:
        draw = TAROT.weighted_draw(sig, spread, seed="seed-" + spread)
        ids = [cid for cid, _rev, _pos in draw]
        assert len(ids) == len(set(ids)), f"duplicate in {spread}"
        assert len(ids) == len(TAROT.SPREAD_POSITIONS[spread])


def test_reading_core_offline_complete():
    chart = _chart()
    req = TarotReadingRequest(chart=chart, spread="three_card", question="test?")
    reading = TAROT.build_reading_core(req)
    assert reading.ai_source is None  # core is AI-free
    assert len(reading.cards) == 3
    for c in reading.cards:
        assert c.meaning and c.position and c.journal_prompt
    assert reading.disclaimer  # framing travels with the data


def test_minor_arcana_complete():
    assert len(TD.MINOR_ARCANA) == 56            # 40 pips + 16 courts
    assert len(TD.FULL_DECK) == 78               # + 22 majors
    assert len(TD.CARD_BY_ID) == 78              # all ids unique (no major/minor collision)
    for suit in ("wands", "cups", "swords", "pentacles"):
        in_suit = [c for c in TD.MINOR_ARCANA if c["suit"] == suit]
        assert len(in_suit) == 14, suit          # Ace–10 + 4 courts
        assert all(c["element"] == TD.SUIT_ELEMENTS[suit] for c in in_suit)
    # every minor has the faces drawing needs
    for c in TD.MINOR_ARCANA:
        assert c["upright"] and c["reversed"] and c["keywords"]


def test_full_deck_draw_can_include_minors_and_stays_deterministic():
    chart = _chart()
    sig = TAROT.build_natal_arcana_signature(chart)
    a = TAROT.weighted_draw(sig, "twelve_house", seed="full-deck")
    b = TAROT.weighted_draw(sig, "twelve_house", seed="full-deck")
    assert a == b                                # reproducible
    ids = [cid for cid, _r, _p in a]
    assert len(ids) == len(set(ids)) == 12       # no dups across 78-card deck
    # majors_only path still works and draws only trumps
    m = TAROT.weighted_draw(sig, "three_card", seed="x", majors_only=True)
    assert all(cid in TD.MAJOR_BY_ID for cid, _r, _p in m)


def test_minor_card_renders_in_reading():
    # Force a minor into the draw by checking card_model + meaning for one
    card = TAROT.card_model("knight_of_cups", reversed=True)
    assert card.arcana == "minor" and card.suit == "cups"
    lesson = TAROT.lesson_for_card("ten_of_swords")
    assert lesson["journal"] and lesson["astrology"] == "Sun in Gemini"


def test_arcana_for_event_maps_target():
    ev = {"type": "transit_natal", "planet": "Saturn", "target": "natal Sun",
          "significance": "high", "summary": "Saturn squares natal Sun"}
    card_id, link = TAROT.arcana_for_event(ev)
    assert card_id == "sun" and link == "Sun"
