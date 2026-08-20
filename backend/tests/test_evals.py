"""
The eval suite, run as a test.

Two obligations, and the second matters as much as the first:

  1. The recorded readings still pass every check. This is the standing gate —
     change a prompt, a model, or a budget, re-record, and if the product got
     worse the build says so.

  2. THE SUITE STILL CATCHES THE DEFECT IT WAS BUILT FOR. A quality suite that
     passes everything is indistinguishable from no suite, and drifts there
     quietly as checks are loosened to make builds green. So the known-bad
     fixtures under `evals/regressions/` are asserted to FAIL. If someone waters
     down `check_completeness`, these go green and this file goes red.

Replay only — no network, no spend. Re-record with:

    .venv/bin/python -m evals.runner --record
"""
import json
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from evals.cases import build_cases  # noqa: E402
from evals.checks import (  # noqa: E402
    Case, Generation, check_completeness, check_grounding, failed, run_checks,
)
from evals.runner import load_cassette  # noqa: E402

REGRESSIONS = Path(__file__).resolve().parent.parent / "evals" / "regressions"

# COMPUTED from the engine, never hand-typed.
#
# The first draft of this file pinned a literal table "so the tests never depend
# on the ephemeris", and got Moon and Midheaven wrong — which made the grounding
# check accuse three correct readings of inventing placements. A truth table that
# can drift from the truth is worse than no truth table: it turns the check that
# catches hallucinations into a source of them. cases.py says exactly this about
# its own placements, one directory over, and this file still had to learn it.
from evals.runner import chart_placements  # noqa: E402

PLACEMENTS = chart_placements()


def _cases():
    return build_cases(PLACEMENTS)


# --------------------------------------------------------------------------- #
# 1. the recorded product still passes
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("case", _cases(), ids=lambda c: c.id)
def test_recorded_reading_passes_every_check(case: Case):
    gen = load_cassette(case.id)
    if gen is None:
        pytest.skip(f"no cassette for {case.id} — run: python -m evals.runner --record")
    findings = run_checks(gen, case)
    hard = [f for f in findings if f.severity == "fail"]
    assert not hard, "\n".join(str(f) for f in hard)


# --------------------------------------------------------------------------- #
# 2. the suite still catches what it was built for
# --------------------------------------------------------------------------- #
def _load_regression(name: str) -> Generation:
    d = json.loads((REGRESSIONS / name).read_text())
    return Generation(text=d["text"], finish_reason=d.get("finish_reason"),
                      model=d.get("model", ""),
                      completion_tokens=d.get("completion_tokens"))


def test_catches_the_midsentence_truncation():
    """The shape a paying reader actually received on 2026-08-17."""
    gen = _load_regression("supporter_midsentence_derived.json")
    findings = check_completeness(gen, _cases()[0])
    assert failed(findings), "the truncation the suite exists for went undetected"
    assert any("finish_reason='length'" in str(f) for f in findings)
    assert any("mid-sentence" in str(f) for f in findings)


def test_catches_null_content_at_the_ceiling():
    """Recorded live from the pre-fix supporter budget: content=None, 3000 tokens spent."""
    gen = _load_regression("supporter_null_content_2026_08_17.json")
    findings = check_completeness(gen, _cases()[0])
    assert failed(findings)
    assert any("empty reading" in str(f) for f in findings)


def test_checks_survive_the_worst_input():
    """A checker that dies on a null response protects nothing."""
    assert Generation(text=None).text == ""
    findings = run_checks(Generation(text=None, finish_reason="length"), _cases()[0])
    assert failed(findings)


# --------------------------------------------------------------------------- #
# 3. the grounding check, in both directions
# --------------------------------------------------------------------------- #
def test_grounding_flags_an_invented_placement():
    """
    The failure mode from the 2026-08-17 session: confident prose about a rising
    sign the chart does not contain. Fluent, well-formed, and wrong.
    """
    case = Case(id="t", tier="oracle", lens="natal", query="q", placements=PLACEMENTS)
    gen = Generation(text="You rise in Pisces, dreamer of the twelfth wave.",
                     finish_reason="stop")
    findings = check_grounding(gen, case)
    assert failed(findings)
    assert "Ascendant in Pisces" in str(findings[0])
    assert "Libra" in str(findings[0])


def test_grounding_accepts_a_correct_placement():
    case = Case(id="t", tier="oracle", lens="natal", query="q", placements=PLACEMENTS)
    gen = Generation(text="Your Sun in Cancer and Pluto in Scorpio speak together.",
                     finish_reason="stop")
    assert check_grounding(gen, case) == []


@pytest.mark.parametrize("text", [
    # The two false positives the first cut of the matcher produced against real
    # readings. Both name a body, then a DIFFERENT body's sign within the window.
    "...Ascendant) and fierce directness (Mars in Aries) drive you",
    "...Uranus, Neptune, all retrograde) and **Pluto in Scorpio** anchors it",
])
def test_grounding_does_not_cry_wolf(text):
    """A check that reports false positives gets switched off, and then guards nothing."""
    case = Case(id="t", tier="oracle", lens="natal", query="q", placements=PLACEMENTS)
    assert check_grounding(Generation(text=text, finish_reason="stop"), case) == []


# --------------------------------------------------------------------------- #
# Grounding vs the tarot deck (2026-08-19)
#
# A minor arcana card IS a decan — the Five of Wands is Saturn in Leo — so an
# honest tarot reading says "Planet in Sign" constantly while claiming nothing
# about the querent. Recording the first arcana cassette produced eight
# grounding "failures", every one of them the deck naming its own cards.
#
# The exemption that fixes that could very easily be a hole big enough to drive
# the original defect through, so both directions are pinned here: the deck's
# own decan is allowed, and the same words claimed as the READER's placement are
# still caught.
# --------------------------------------------------------------------------- #

_DECANS = ["Saturn in Leo", "Mercury in Sagittarius"]
_PLACEMENTS = {"Saturn": "Capricorn", "Mercury": "Cancer", "Sun": "Cancer"}


def _arcana_case(**kw):
    base = dict(id="t", tier="oracle", lens="psychological", query="q",
                placements=dict(_PLACEMENTS), spread="celtic_cross",
                card_attributions=list(_DECANS))
    base.update(kw)
    return Case(**base)


def test_a_cards_own_decan_is_not_a_hallucination():
    gen = Generation(text=(
        "**Five of Wands** — Saturn in Leo, Hod of Atziluth — the Golden Dawn "
        "called this one strife, and it sits in your third house."), finish_reason="stop")
    assert check_grounding(gen, _arcana_case()) == []


def test_the_same_decan_claimed_as_the_readers_own_still_fails():
    """The half of the exemption that must not leak.

    Same four words, one possessive in front of them, opposite verdict — that
    is the whole distinction the check now rests on.
    """
    gen = Generation(text=(
        "This card answers your natal Saturn in Leo, which has been asking "
        "for patience."), finish_reason="stop")
    found = check_grounding(gen, _arcana_case())
    assert len(found) == 1 and "Saturn" in found[0].detail


def test_a_placement_that_is_no_cards_decan_still_fails_in_a_tarot_reading():
    """Exempting the deck must not exempt the sky."""
    gen = Generation(text="The Tower speaks to Sun in Aquarius here.",
                     finish_reason="stop")
    found = check_grounding(gen, _arcana_case())
    assert len(found) == 1 and "Sun" in found[0].detail


def test_chart_readings_get_no_exemption_at_all():
    """A case with no card_attributions is unchanged by any of this."""
    gen = Generation(text="Your chart shows Saturn in Leo.", finish_reason="stop")
    found = check_grounding(gen, Case(
        id="c", tier="oracle", lens="psychological", query="q",
        placements=dict(_PLACEMENTS)))
    assert len(found) == 1
