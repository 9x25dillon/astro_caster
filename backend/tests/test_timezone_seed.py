"""
Phase 1.4 — timezone / start-date control and seed determinism.

The daily seed must be a pure function of (natal signature, resolved local date,
spread, question, source system) — reproducible for a given local date REGARDLESS
of the server clock. Defaults must reproduce the pre-1.4 seed string so existing
seeds stay reproducible.
"""
import datetime as dt
import os
import sys
from zoneinfo import ZoneInfo

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import ephemeris as E  # noqa: E402
from models import ChartRequest  # noqa: E402
import tarot as TAROT  # noqa: E402
from tarot_models import TarotReadingRequest  # noqa: E402

_EINSTEIN = dict(year=1879, month=3, day=14, hour=11, minute=30, second=0,
                 lat=48.4011, lng=9.9876, tz_offset=0.67)
_CHART = E.calculate_chart(ChartRequest(**_EINSTEIN))


# --- date resolution ------------------------------------------------------- #

def test_resolve_local_date_explicit_start_date_wins():
    assert TAROT.resolve_local_date(start_date="2026-06-15") == dt.date(2026, 6, 15)
    # explicit start_date beats timezone
    assert TAROT.resolve_local_date("2026-06-15", "Asia/Tokyo") == dt.date(2026, 6, 15)


def test_resolve_local_date_timezone_uses_that_zone():
    got = TAROT.resolve_local_date(timezone="Asia/Tokyo")
    assert got == dt.datetime.now(ZoneInfo("Asia/Tokyo")).date()


def test_resolve_local_date_rejects_bad_inputs():
    with pytest.raises(ValueError):
        TAROT.resolve_local_date(start_date="not-a-date")
    with pytest.raises(Exception):
        TAROT.resolve_local_date(timezone="Not/AZone")


# --- seed purity + reproducibility ----------------------------------------- #

def test_daily_seed_is_pure_function_of_local_date():
    q = "what today?"
    s1 = TAROT._default_seed(_CHART, "daily", q, local_date="2026-06-15")
    s2 = TAROT._default_seed(_CHART, "daily", q, local_date="2026-06-15")
    s3 = TAROT._default_seed(_CHART, "daily", q, local_date="2026-06-16")
    assert s1 == s2                        # same local date -> identical seed
    assert s1 != s3                        # different local date -> different seed
    assert "2026-06-15" in s1              # seed reflects the passed local date
    # server clock does not leak in when the local date is explicit
    today = dt.date.today().isoformat()
    if today != "2026-06-15":
        assert today not in s1


def test_default_seed_reproduces_legacy_string():
    q = "Legacy?"
    bodies = "|".join(
        f"{p.id}:{round(p.longitude, 2)}"
        for p in sorted(_CHART.planets, key=lambda x: x.id)
    )
    # non-daily: no date, default source contributes nothing
    assert TAROT._default_seed(_CHART, "three_card", q) == \
        f"{bodies}#three_card#{q.strip().lower()}"
    # daily default: server today, default source -> legacy format
    today = dt.date.today().isoformat()
    assert TAROT._default_seed(_CHART, "daily", q) == \
        f"{bodies}#daily#{q.strip().lower()}#{today}"


def test_source_system_changes_seed_but_default_does_not():
    q = "src?"
    base = TAROT._default_seed(_CHART, "daily", q, local_date="2026-06-15")
    same_default = TAROT._default_seed(
        _CHART, "daily", q, local_date="2026-06-15", source=TAROT._DEFAULT_SOURCE
    )
    other = TAROT._default_seed(
        _CHART, "daily", q, local_date="2026-06-15", source="thoth"
    )
    assert base == same_default            # default source reproduces existing seed
    assert base != other                   # a different lineage changes the draw


# --- endpoint-level: daily reading respects the passed date ---------------- #

def test_daily_reading_reproducible_from_local_date():
    r1 = TAROT.build_reading_core(
        TarotReadingRequest(chart=_CHART, spread="daily", question="q", date="2026-06-15")
    )
    r2 = TAROT.build_reading_core(
        TarotReadingRequest(chart=_CHART, spread="daily", question="q", date="2026-06-15")
    )
    r3 = TAROT.build_reading_core(
        TarotReadingRequest(chart=_CHART, spread="daily", question="q", date="2026-06-16")
    )
    ids1 = [c.card.id for c in r1.cards]
    ids2 = [c.card.id for c in r2.cards]
    ids3 = [c.card.id for c in r3.cards]
    assert ids1 == ids2                    # same local date -> same draw
    assert "2026-06-15" in r1.seed
    assert ids1 != ids3 or r1.seed != r3.seed  # different local date -> different seed/draw
