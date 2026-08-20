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
    Case, Generation, aspect_key, check_aspect_grounding, check_completeness,
    check_grounding, failed, run_checks,
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


# --------------------------------------------------------------------------- #
# Aspect grounding (2026-08-19)
#
# The arcana prompt now hands the model eighteen of the chart's aspects, which
# opens a failure check_grounding cannot see: a fluent sentence naming an aspect
# the chart does not contain. It reads exactly as authoritative as a true one.
#
# The check has to survive tarot prose, where two trumps are named after bodies,
# so both its teeth and its restraint are pinned below.
# --------------------------------------------------------------------------- #

_ASPECTS = {"Mercury|Moon": "Square", "Jupiter|Mars": "Opposition"}


def _aspect_case(**kw):
    base = dict(id="t", tier="oracle", lens="psychological", query="q",
                spread="celtic_cross", aspects=dict(_ASPECTS))
    base.update(kw)
    return Case(**base)


def test_an_aspect_the_chart_does_not_have_is_caught():
    gen = Generation(text="Your Saturn square Venus is the ache underneath.",
                     finish_reason="stop")
    found = check_aspect_grounding(gen, _aspect_case())
    assert len(found) == 1
    assert "no major aspect" in found[0].detail


def test_the_right_pair_with_the_wrong_aspect_is_caught():
    """The subtler half: these two ARE in aspect, just not that one."""
    gen = Generation(text="Mercury trine Moon opens the throat.", finish_reason="stop")
    found = check_aspect_grounding(gen, _aspect_case())
    assert len(found) == 1
    assert "chart has square" in found[0].detail


def test_a_true_aspect_passes_whichever_way_round_it_is_written():
    """An aspect is a relationship, not a direction."""
    for text in ("The Moon squares Mercury here.", "Mercury square Moon here."):
        assert check_aspect_grounding(Generation(text=text), _aspect_case()) == []


def test_two_trumps_facing_each_other_are_not_an_aspect_claim():
    """The Sun and The Moon are cards as well as bodies, and a Celtic Cross has
    positions that literally sit opposite one another."""
    gen = Generation(text="The Moon opposite The Sun in this spread speaks of a split.",
                     finish_reason="stop")
    assert check_aspect_grounding(gen, _aspect_case()) == []


def test_the_card_exemption_does_not_cover_a_natal_claim():
    """One side in card form, the other a bare body, is how a reading writes a
    claim about the chart — still judged."""
    gen = Generation(text="The Moon trine Saturn in your chart.", finish_reason="stop")
    assert len(check_aspect_grounding(gen, _aspect_case())) == 1


def test_a_case_with_no_aspects_is_silent_rather_than_failing_everything():
    """Absent aspects means "not given", never "the chart has none"."""
    gen = Generation(text="Your Saturn square Venus is the ache.", finish_reason="stop")
    assert check_aspect_grounding(gen, _aspect_case(aspects={})) == []


def test_each_distinct_claim_is_reported_once():
    gen = Generation(text=("Saturn square Venus. Later, Saturn square Venus again, "
                           "and once more Saturn square Venus."), finish_reason="stop")
    assert len(check_aspect_grounding(gen, _aspect_case())) == 1


def test_aspect_key_is_order_independent():
    assert aspect_key("Moon", "Mercury") == aspect_key("Mercury", "Moon")


def test_a_possessive_makes_it_a_claim_about_something_else():
    """"Lilith conjunct Pluto's sign" is about a SIGN, not about Pluto.

    From a live recording, 2026-08-19. The model was being careful — the same
    paragraph says "nearly kissing Pluto's sign" — and the first cut of this
    check reported it as a fabricated aspect. Lilith and Pluto are 12° apart and
    both in Scorpio; every word of the reading was true and the checker read
    past the apostrophe. This is the cry-wolf failure that gets a check deleted.
    """
    gen = Generation(
        text="Lilith conjunct Pluto's sign in the 2nd house suggests shadow-work.",
        finish_reason="stop")
    assert check_aspect_grounding(gen, _aspect_case()) == []


def test_a_possessive_on_the_first_body_is_still_judged():
    """"Pluto's square to Venus" IS an aspect claim about Pluto."""
    gen = Generation(text="Pluto's square to Venus is the ache.", finish_reason="stop")
    assert len(check_aspect_grounding(gen, _aspect_case())) == 1


def test_a_body_named_as_a_referent_is_not_being_placed():
    """"Venus, ruler of your Ascendant, floating alone in Gemini" places VENUS.

    From a live recording, 2026-08-19. Venus really is in Gemini and the
    Ascendant really is in Libra; the reading said both correctly, and this
    check bound the sign to the appositive and called it a hallucination.
    _binds already guards the mirror case — a sign belonging to a LATER body —
    and this is the same error pointing backwards.
    """
    gen = Generation(text=("the unaspected Venus, ruler of your Ascendant, "
                           "floating alone in Gemini's 8th house"),
                     finish_reason="stop")
    case = Case(id="c", tier="oracle", lens="psychological", query="q",
                placements={"Ascendant": "Libra", "Venus": "Gemini"})
    assert check_grounding(gen, case) == []


def test_the_referent_guard_does_not_excuse_a_direct_claim():
    gen = Generation(text="Your Ascendant in Gemini shapes how you arrive.",
                     finish_reason="stop")
    case = Case(id="c", tier="oracle", lens="psychological", query="q",
                placements={"Ascendant": "Libra"})
    assert len(check_grounding(gen, case)) == 1


def test_the_runner_pins_the_same_ephemeris_for_record_and_replay():
    """Cassettes must be checked against the chart they were generated from.

    The runner loads .env when --record (swiss-files: 17 bodies, 40 major
    aspects) and loaded nothing when replaying (moshier: 16 bodies, 33, and no
    Chiron at all, because Moshier has no asteroids). Every cassette was being
    graded against a different chart than it came from, which surfaced as a
    grounding check accusing a reading of inventing the aspect list it had
    actually been handed.
    """
    from evals.runner import chart_dict
    assert chart_dict()["meta"]["ephemeris"] == "swiss-files"


def test_the_reference_chart_contains_the_asteroid_bodies():
    """The tell for a silent Moshier fallback, stated as an assertion."""
    from evals.runner import chart_dict
    ids = {p["id"] for p in chart_dict()["planets"]}
    assert "Chiron" in ids, "Moshier fallback — SE_EPHE_PATH is not pinned"
