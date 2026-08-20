"""The arcana token ceiling, pinned to what was actually measured.

WHY THIS FILE EXISTS
====================
The old ceiling was a flat number per tier — {oracle: 2600, supporter: 1600} —
with no idea how many cards were on the cloth. A one-card daily draw and a
twelve-card house spread were handed the same room, so every large spread ran
into it and the reading was silently trimmed back to its last full sentence
after three round-trips. 565 backend tests passed throughout, because every one
of them mocks the provider: a mock cannot be truncated.

The numbers below are OBSERVATIONS, not expectations — twelve live readings, all
of which came back finish_reason="stop", so each is a length the writer chose.
Asserting the budget clears them is the one thing that keeps a future tidy-up
("these numbers look big, let's trim them") from re-introducing the bug. Change
them only by re-measuring; the probe pattern is in the ai.py comment block.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest  # noqa: E402

import ai  # noqa: E402
from tarot_prompts import arcana_target_words  # noqa: E402

# (tier, cards, tokens the model actually produced) — 2026-08-19, cap at 9000.
MEASURED = [
    ("supporter", 1, 683), ("supporter", 3, 1092), ("supporter", 7, 2908),
    ("supporter", 10, 3292), ("supporter", 10, 3444), ("supporter", 12, 4279),
    ("oracle", 1, 1264), ("oracle", 3, 1881), ("oracle", 7, 3107),
    ("oracle", 10, 3612), ("oracle", 10, 4383), ("oracle", 12, 4712),
    # Recorded under the aspect-aware prompt (evals/cassettes). The last of
    # these sat at 95% of the ceiling the first fit produced, which is what
    # forced the refit — a ceiling a reading only just fits under is a
    # truncation waiting for a slightly wordier run.
    ("supporter", 10, 3852), ("supporter", 10, 2223), ("oracle", 12, 6186),
]


@pytest.mark.parametrize("tier,cards,observed", MEASURED)
def test_budget_clears_every_measured_reading(tier, cards, observed):
    """Not "close to" the measurement — above it, with room to spare.

    Temperature is 0.8, so the same brief does not produce the same length
    twice. A ceiling sitting exactly on the mean truncates about half of all
    readings, which is indistinguishable from the bug this replaced.
    """
    budget = ai._arcana_budget(tier, cards)
    assert budget > observed, (
        f"{tier}/{cards} cards: ceiling {budget} is below the measured {observed}"
    )
    assert budget >= observed * 1.15, (
        f"{tier}/{cards} cards: ceiling {budget} leaves under 15% over the "
        f"measured {observed} — too tight for a temperature-0.8 writer"
    )


def test_the_old_flat_ceilings_would_fail_this_suite():
    """The regression, stated as a fact rather than a memory.

    If this ever starts passing, the budget has been flattened back into a
    per-tier constant and the large spreads are being cut again.
    """
    old = {"supporter": 1600, "oracle": 2600}
    cut = [(t, c, o) for t, c, o in MEASURED if o > old[t]]
    assert len(cut) == 11, "the historical failure set changed — re-derive it"
    assert all(c >= 7 for _, c, _ in cut), "the cut readings were the big spreads"


def test_budget_never_shrinks_as_the_spread_grows():
    for tier in ("free", "supporter", "oracle"):
        budgets = [ai._arcana_budget(tier, n) for n in range(1, 25)]
        assert budgets == sorted(budgets), f"{tier}: budget is not monotonic"


def test_bounds_hold_against_nonsense_input():
    # A missing or zero card count must not authorise a zero-token reading...
    assert ai._arcana_budget("oracle", 0) >= ai._ARCANA_FLOOR
    assert ai._arcana_budget("oracle", -5) >= ai._ARCANA_FLOOR
    # ...and a wild one must not authorise an unbounded spend.
    assert ai._arcana_budget("oracle", 10_000) == ai._ARCANA_CEILING
    # An unknown tier resolves rather than raising: the tarot endpoint gates AI
    # to the paid tiers today, and a KeyError here would turn a moved gate into
    # a 500 on a call the reader already paid for.
    assert ai._arcana_budget("nonsense", 3) > 0


# Tokens spent per WORD, worst observed in the same twelve readings, plus a
# little. The two tiers are far apart and it is not the direction anyone guesses:
# sonnet-5 spends up to 4.04 tokens per word where opus-5 stays near 2.5. So the
# tier asking for MORE words needs FEWER tokens per word to deliver them, and a
# single shared rate mis-sizes one tier or the other. (The rate also climbs with
# the card count — more positions means more headings, and a heading is mostly
# punctuation and markup.)
_TOKENS_PER_WORD = {"supporter": 4.2, "oracle": 3.0}


def test_the_ceiling_covers_the_words_the_prompt_asks_for():
    """The two halves of the fix must agree with each other.

    tarot_prompts.py asks for N words and ai.py has to leave room to write
    them. Nothing structural connects the two files, so this is the assertion
    that stops one from being tuned without the other — the exact failure mode
    that produced the original bug, where the prompt asked for five sections and
    the ceiling funded three.
    """
    for tier in ("supporter", "oracle"):
        for cards in (1, 3, 7, 10, 12):
            words = arcana_target_words(tier, cards)
            need = words * _TOKENS_PER_WORD[tier]
            budget = ai._arcana_budget(tier, cards)
            assert budget >= need, (
                f"{tier}/{cards} cards: the brief asks for {words} words "
                f"(~{need:.0f} tokens at {_TOKENS_PER_WORD[tier]}/word) but the "
                f"ceiling is only {budget}"
            )
