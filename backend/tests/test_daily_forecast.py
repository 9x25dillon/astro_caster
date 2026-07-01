"""
Phase 1.5 — daily cards are actually daily.

daily_arcana_from_events must return EXACTLY one card per requested day. Dates
with a transit event map to that event's trump; dates with no event get a
deterministic, natal-weighted "quiet sky / integration day" trump. Pre-fix, a
gap day was skipped, so an N-day request could return < N cards.
"""
import datetime as dt
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import ephemeris as E  # noqa: E402
from models import ChartRequest  # noqa: E402
import tarot as TAROT  # noqa: E402

_EINSTEIN = dict(year=1879, month=3, day=14, hour=11, minute=30, second=0,
                 lat=48.4011, lng=9.9876, tz_offset=0.67)
_CHART = E.calculate_chart(ChartRequest(**_EINSTEIN))
_SIG = TAROT.build_natal_arcana_signature(_CHART)
_START = dt.date(2026, 6, 15)


def _events(spec):
    """spec: {day_offset: (planet, target, significance)}."""
    out = []
    for off, (planet, target, sig) in spec.items():
        date = (_START + dt.timedelta(days=off)).isoformat()
        out.append({
            "type": "transit_natal", "planet": planet, "target": target,
            "significance": sig, "summary": f"{planet} to {target}", "date": date,
        })
    return out


def test_exactly_n_cards_when_days_have_gaps():
    events = _events({0: ("Saturn", "natal Sun", "high"),
                      3: ("Jupiter", "natal Moon", "medium")})
    cards = TAROT.daily_arcana_from_events(events, _START.isoformat(), 7, _SIG)
    assert len(cards) == 7                             # the core guarantee
    dates = [c["date"] for c in cards]
    assert dates == sorted(dates) and len(set(dates)) == 7   # every day, once, in order
    quiet = [c for c in cards if c["transit_summary"] == TAROT._QUIET_SKY_SUMMARY]
    event_days = [c for c in cards if c["transit_summary"] != TAROT._QUIET_SKY_SUMMARY]
    assert len(quiet) == 5 and len(event_days) == 2   # 2 events, 5 gap days filled
    for c in cards:                                    # every card fully formed
        assert c["card"]["id"] and c["best_expression"]


def test_all_quiet_when_no_events():
    cards = TAROT.daily_arcana_from_events([], _START.isoformat(), 5, _SIG)
    assert len(cards) == 5
    assert all(c["transit_summary"] == TAROT._QUIET_SKY_SUMMARY for c in cards)
    assert all(c["natal_link"] is None for c in cards)
    assert all(c["card"]["arcana"] == "major" for c in cards)   # trumps


def test_quiet_days_are_deterministic():
    a = TAROT.daily_arcana_from_events([], _START.isoformat(), 6, _SIG)
    b = TAROT.daily_arcana_from_events([], _START.isoformat(), 6, _SIG)
    assert [c["card"]["id"] for c in a] == [c["card"]["id"] for c in b]
    assert [c["reversed"] for c in a] == [c["reversed"] for c in b]
