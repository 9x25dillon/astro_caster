"""How the eighteen aspects sent to a model get chosen.

WHY THIS FILE EXISTS
====================
Both prompt paths hand the model a bounded slice of the chart's aspects — a
chart averages ~49 and neither prompt wants all of them. Which slice is a real
decision, and the obvious rule is wrong.

Raw orb ranks a half-degree semisextile above a half-degree conjunction, because
it compares a 2°-orb aspect and an 8°-orb one as though the numbers meant the
same thing. Measured over 120 charts (2026-08-19, Swiss ephemeris): raw orb
sends 45% major aspects, orb-over-allowance sends 70%, at identical cost.

The rule lives in astrology.py beside ASPECT_DEFS because both consumers need
it and neither owns it.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import ai  # noqa: E402
import astrology as A  # noqa: E402
import ephemeris as E  # noqa: E402
import tarot as TAROT  # noqa: E402
from models import ChartRequest  # noqa: E402


def _chart():
    return E.calculate_chart(ChartRequest(
        year=1990, month=7, day=4, hour=14, minute=30, second=0,
        lat=40.7128, lng=-74.0060, tz_offset=-4))


# --------------------------------------------------------------------------- #
# The rule itself
# --------------------------------------------------------------------------- #

def test_a_conjunction_beats_a_semisextile_at_the_same_raw_orb():
    """The case the whole change exists for."""
    assert A.relative_orb("Conjunction", 0.5) < A.relative_orb("Semisextile", 0.5)


def test_an_exact_aspect_scores_zero_and_one_at_its_limit():
    assert A.relative_orb("Trine", 0.0) == 0.0
    assert A.relative_orb("Trine", A.ASPECT_BY_NAME["Trine"].default_orb) == 1.0


def test_an_unknown_aspect_sorts_last_rather_than_raising():
    """A minor aspect added to the engine must not break a paid reading."""
    assert A.relative_orb("Novile", 0.1) == 1.0


def test_the_tarot_path_delegates_to_the_same_rule():
    """One rule, two callers — a second copy is how they drift apart."""
    chart = _chart()
    a = chart.aspects[0]
    assert TAROT._relative_tightness(a) == A.relative_orb(a.type, a.orb)


# --------------------------------------------------------------------------- #
# The ask path
# --------------------------------------------------------------------------- #

def test_the_ask_path_sends_the_most_exact_eighteen_not_the_first_eighteen():
    chart = _chart().model_dump()
    assert len(chart["aspects"]) > 18, "chart too sparse to exercise the cap"
    ctx = ai._build_context(chart, None, None)
    assert len(ctx["aspects"]) == 18
    expected = sorted(chart["aspects"],
                      key=lambda a: A.relative_orb(a["type"], a["orb"]))[:18]
    assert [f"{a['p1']}–{a['p2']}" for a in expected] == \
           [a["between"] for a in ctx["aspects"]]


def test_the_new_ranking_actually_differs_from_the_old_one():
    """Otherwise this suite asserts nothing about the ranking.

    The engine emits aspects sorted by ascending raw orb, so the old rule was
    simply the first eighteen.
    """
    chart = _chart().model_dump()
    ctx = ai._build_context(chart, None, None)
    old = [f"{a['p1']}–{a['p2']}" for a in chart["aspects"][:18]]
    new = [a["between"] for a in ctx["aspects"]]
    assert set(new) != set(old)


def test_the_ranking_sends_more_major_aspects_than_raw_orb_did():
    """The point of the change, asserted on a real chart rather than trusted."""
    chart = _chart().model_dump()
    ctx = ai._build_context(chart, None, None)
    majors = lambda rows, key: sum(1 for r in rows if r[key] in A.MAJOR_ASPECTS)
    old = majors(chart["aspects"][:18], "type")
    new = majors(ctx["aspects"], "type")
    assert new > old, f"raw orb sent {old} majors, new rule sent {new}"


def test_a_chart_with_few_aspects_is_passed_through_whole():
    chart = _chart().model_dump()
    chart["aspects"] = chart["aspects"][:4]
    assert len(ai._build_context(chart, None, None)["aspects"]) == 4


def test_no_aspects_is_not_an_error():
    chart = _chart().model_dump()
    chart["aspects"] = []
    assert ai._build_context(chart, None, None)["aspects"] == []
