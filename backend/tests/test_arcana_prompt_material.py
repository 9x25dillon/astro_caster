"""Aspects and the four unsigned bodies — prompt material that must never
become draw material.

WHY THIS FILE EXISTS
====================
The natal signature is built for the DRAW. _SIGNATURE_ORDER decides
major_weights, major_weights decide which cards come up. It carries thirteen
bodies and no aspects, and the chart carries seventeen bodies and ~49 aspects,
so there is a permanent temptation to "tidy up" by folding the rest in.

MEASURED 2026-08-19 (120 charts, 1940-2005, Swiss ephemeris): adding Chiron,
Lilith, Part of Fortune and South Node to _SIGNATURE_ORDER re-deals 120 of 120
charts at the same seed, on all three spreads tested. Every shelved reading
would reprint with different cards above its unchanged prose — the failure
session 28 fought at 28.8%, here at 100%.

So the prompt knows about bodies the signature does not, on purpose, and these
tests hold that line.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import ephemeris as E  # noqa: E402
import tarot as TAROT  # noqa: E402
from models import ChartRequest  # noqa: E402
from tarot_models import TarotReadingRequest  # noqa: E402
from tarot_prompts import build_arcana_user_prompt  # noqa: E402

MAJORS = {"Conjunction", "Opposition", "Trine", "Square", "Sextile"}


def _chart(**kw):
    base = dict(year=1990, month=7, day=4, hour=14, minute=30, second=0,
                lat=40.7128, lng=-74.0060, tz_offset=-4)
    base.update(kw)
    return E.calculate_chart(ChartRequest(**base))


# --------------------------------------------------------------------------- #
# The line that must not move
# --------------------------------------------------------------------------- #

def test_the_extra_material_does_not_reach_the_signature():
    """The four bodies stay out of the weights, whatever the prompt says."""
    chart = _chart()
    sig = TAROT.build_natal_arcana_signature(chart)
    named = {l.body for l in sig.links}
    for body in TAROT.UNSIGNED_BODIES:
        assert body not in named, (
            f"{body} entered the natal signature; every stored seed now deals "
            f"different cards")
    # weight_sources is generated in lockstep with major_weights, so a body that
    # slipped into one and not the other would still be caught here.
    labels = " ".join(w.label for ws in sig.weight_sources.values() for w in ws)
    for body in TAROT.UNSIGNED_BODIES:
        assert f"natal {body}" not in labels


def test_the_draw_is_unchanged_by_any_of_this():
    """Pinned card-for-card against a chart the suite already uses elsewhere.

    Not "the draw looks stable" — the exact cards, in order, for a fixed seed.
    If prompt material ever starts feeding the weights, this is the assertion
    that fails first and loudest.
    """
    chart = _chart()
    sig = TAROT.build_natal_arcana_signature(chart)
    drawn = TAROT.weighted_draw(sig, "celtic_cross", seed="prompt-material-pin")
    assert [c for c, _r, _p in drawn] == [
        "moon", "knight_of_wands", "seven_of_cups", "three_of_pentacles",
        "queen_of_swords", "lovers", "wheel_of_fortune", "six_of_pentacles",
        "king_of_wands", "three_of_cups",
    ]


# --------------------------------------------------------------------------- #
# Aspect selection
# --------------------------------------------------------------------------- #

def test_aspects_are_ranked_by_allowance_not_by_raw_orb():
    """A half-degree semisextile is not tighter than a half-degree conjunction.

    Raw orb says it is, because it compares a 2°-orb aspect against an 8°-orb one
    as though the numbers meant the same thing. Measured over 120 charts, raw orb
    fills the eighteen with 45% majors and this ranking with 70%.
    """
    chart = _chart()
    lines = TAROT.aspect_prompt_lines(chart)
    ranked = sorted(chart.aspects, key=TAROT._relative_tightness)[:len(lines)]
    assert [f"{a.p1} {a.type.lower()} {a.p2}" for a in ranked] == \
           [l.split(" (orb")[0] for l in lines]
    # And it genuinely differs from the raw-orb order this replaces, or the test
    # is asserting nothing about the ranking at all.
    assert [a.type for a in ranked] != [a.type for a in chart.aspects[:len(lines)]]


def test_the_cap_holds_and_the_tightest_survive_it():
    chart = _chart()
    assert len(chart.aspects) > TAROT.ASPECT_PROMPT_LIMIT, "chart too sparse to test the cap"
    lines = TAROT.aspect_prompt_lines(chart)
    assert len(lines) == TAROT.ASPECT_PROMPT_LIMIT
    tightest = sorted(chart.aspects, key=TAROT._relative_tightness)[0]
    assert f"{tightest.p1} {tightest.type.lower()} {tightest.p2}" in lines[0]


def test_minor_aspects_are_labelled_as_minor():
    chart = _chart()
    for line in TAROT.aspect_prompt_lines(chart):
        name = line.split()[1].title()
        if name not in {t.lower().title() for t in MAJORS}:
            assert ", minor)" in line or ", minor" in line, line


def test_an_aspect_the_engine_does_not_define_sorts_last_rather_than_raising():
    """A new minor aspect must not be able to crash a paid reading."""
    chart = _chart()
    a = chart.aspects[0]
    a.type = "Novile"                      # not in ASPECT_DEFS
    assert TAROT._relative_tightness(a) == 1.0
    assert TAROT.aspect_prompt_lines(chart)     # still produces lines


def test_a_chart_with_no_aspects_yields_no_lines():
    chart = _chart()
    chart.aspects = []
    assert TAROT.aspect_prompt_lines(chart) == []


# --------------------------------------------------------------------------- #
# The four bodies
# --------------------------------------------------------------------------- #

def test_every_unsigned_body_gets_a_placement_and_an_archetype():
    chart = _chart()
    lines = TAROT.unsigned_body_lines(chart)
    present = {p.id for p in chart.planets}
    for body in TAROT.UNSIGNED_BODIES:
        if body not in present:
            continue
        line = next((l for l in lines if l.startswith(body)), None)
        assert line, f"{body} missing from the further-points block"
        assert " in " in line and "—" in line, f"{body} has no trump: {line}"


def test_a_body_absent_from_the_chart_is_skipped_not_invented():
    """Chiron is absent under the Moshier fallback — no ephemeris files, no
    asteroids. The block must shrink rather than assert a placement nobody
    computed."""
    chart = _chart()
    chart.planets = [p for p in chart.planets if p.id != "Chiron"]
    lines = TAROT.unsigned_body_lines(chart)
    assert not any(l.startswith("Chiron") for l in lines)
    assert lines, "the other three should still appear"


# --------------------------------------------------------------------------- #
# Assembly
# --------------------------------------------------------------------------- #

def _prompt(chart, **extra):
    r = TAROT.build_reading_core(TarotReadingRequest(
        chart=chart, spread="celtic_cross", question="q"))
    sig = r.signature
    return build_arcana_user_prompt(
        question="q", spread="celtic_cross",
        dominant_element=sig.dominant_element, dominant_modality=sig.dominant_modality,
        themes=sig.themes, shadows=sig.shadows,
        signature_lines=[l.note for l in sig.links],
        drawn=[{"position": c.position, "name": c.card.name,
                "orientation": "reversed" if c.reversed else "upright",
                "natal_link": c.natal_link or ""} for c in r.cards],
        source_lens=TAROT.source_meta(r.source)["lens"], tier="oracle", **extra)


def test_the_blocks_are_optional_and_absent_by_default():
    """Nothing deterministic depends on them, so no caller is obliged to pass
    them and the prompt must not grow an empty heading when they are missing."""
    out = _prompt(_chart())
    assert "ASPECTS IN THIS CHART" not in out
    assert "FURTHER POINTS" not in out


def test_the_aspect_block_tells_the_model_to_ground_rather_than_recite():
    """The instruction is load-bearing, not decoration.

    Handed a bare list, a model will inventory it, and a reading that walks
    through eighteen aspects instead of reading the cards is worse than one that
    never saw them.
    """
    chart = _chart()
    out = _prompt(chart, aspect_lines=TAROT.aspect_prompt_lines(chart),
                  further_points=TAROT.unsigned_body_lines(chart))
    assert "GROUND" in out
    assert "Do not list them" in out
    assert "not mention an aspect that is not written here" in out


def test_the_assembled_prompt_carries_both_blocks_in_full():
    chart = _chart()
    aspects = TAROT.aspect_prompt_lines(chart)
    points = TAROT.unsigned_body_lines(chart)
    out = _prompt(chart, aspect_lines=aspects, further_points=points)
    for line in aspects + points:
        assert line in out, f"dropped from the prompt: {line}"
