"""
Phase 2 — explainability (weight_sources) and source-system sourcing.

2.1: every drawn card exposes WHY it was likely, generated from the ACTUAL draw
weights — the panel and the seed can never disagree (a major card's sources sum
to its major_weight; a minor's source is its suit bias).
2.2: the source system threads into interpretation and the determinism seed; the
default reproduces existing seeds, a different lineage changes the draw.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import ephemeris as E  # noqa: E402
from models import ChartRequest  # noqa: E402
import tarot as TAROT  # noqa: E402
from tarot_models import TarotReadingRequest  # noqa: E402

_EINSTEIN = dict(year=1879, month=3, day=14, hour=11, minute=30, second=0,
                 lat=48.4011, lng=9.9876, tz_offset=0.67)
_CHART = E.calculate_chart(ChartRequest(**_EINSTEIN))


# --- 2.1 explainability derives from actual weights ------------------------ #

def test_weight_sources_sum_to_major_weights():
    sig = TAROT.build_natal_arcana_signature(_CHART)
    assert sig.weight_sources  # populated
    for card_id, weight in sig.major_weights.items():
        srcs = sig.weight_sources.get(card_id)
        assert srcs, f"no sources for weighted major {card_id}"
        total = sum(s.weight for s in srcs)
        # the panel's numbers ARE the draw's numbers (small rounding tolerance)
        assert abs(total - weight) < 0.02, (card_id, total, weight)


def test_every_drawn_card_carries_nonempty_weight_sources():
    reading = TAROT.build_reading_core(
        TarotReadingRequest(chart=_CHART, spread="three_card", question="why?")
    )
    for c in reading.cards:
        assert c.weight_sources and all(s.label for s in c.weight_sources)
        # a weighted major's panel equals the signature's actual contributions
        if c.card.arcana == "major" and c.card.id in reading.signature.weight_sources:
            expected = reading.signature.weight_sources[c.card.id]
            assert [s.label for s in c.weight_sources] == [s.label for s in expected]
            assert [s.weight for s in c.weight_sources] == [s.weight for s in expected]


def test_minor_weight_source_is_the_suit_bias():
    sig = TAROT.build_natal_arcana_signature(_CHART)
    ws = TAROT._card_weight_sources("knight_of_cups", sig)
    assert len(ws) == 1
    assert abs(ws[0].weight - sig.suit_bias["cups"]) < 1e-9
    assert "Cups" in ws[0].label and "Water" in ws[0].label


# --- 2.2 source system in seed + interpretation ---------------------------- #

def test_source_default_reproduces_and_others_differ():
    kw = dict(chart=_CHART, spread="daily", question="q", date="2026-06-15")
    base = TAROT.build_reading_core(TarotReadingRequest(**kw))
    same = TAROT.build_reading_core(TarotReadingRequest(**kw, source="golden_dawn"))
    other = TAROT.build_reading_core(TarotReadingRequest(**kw, source="thoth"))
    assert base.seed == same.seed                                   # default == golden_dawn
    assert [c.card.id for c in base.cards] == [c.card.id for c in same.cards]
    assert base.seed != other.seed                                  # lineage changes the seed
    assert other.source == "thoth"                                  # echoed on the response


def test_source_lineage_named_in_interpretation():
    for src, name in [("thoth", "Thoth"), ("jungian", "Psychological / Jungian"),
                      ("rws", "Rider-Waite-Smith"), ("golden_dawn", "Golden Dawn")]:
        r = TAROT.build_reading_core(
            TarotReadingRequest(chart=_CHART, spread="three_card", question="q", source=src)
        )
        assert name in r.interpretation, src
