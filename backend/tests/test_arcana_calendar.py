"""
Phase 3.2 — Arcana calendar (.ics) export.

build_ics must emit a valid iCalendar document: one all-day VEVENT per day, CRLF
line endings, escaped TEXT, folded long lines, and stable UIDs (so re-imports
update rather than duplicate). The endpoint returns text/calendar with N events
for an N-day window (respecting the Phase 1.5 exactly-N guarantee).
"""
import os
import sys

from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import arcana_calendar as CAL  # noqa: E402
import ephemeris as E  # noqa: E402
import main  # noqa: E402
from models import ChartRequest  # noqa: E402
import tarot as TAROT  # noqa: E402

client = TestClient(main.app)

_EINSTEIN = dict(year=1879, month=3, day=14, hour=11, minute=30, second=0,
                 lat=48.4011, lng=9.9876, tz_offset=0.67)
_CHART = E.calculate_chart(ChartRequest(**_EINSTEIN))
_SIG = TAROT.build_natal_arcana_signature(_CHART)
_START = "2026-06-15"


def _sample_days(n=3):
    return TAROT.daily_arcana_from_events([], _START, n, _SIG)


# --- ICS structure --------------------------------------------------------- #

def test_ics_is_well_formed():
    ics = CAL.build_ics(_sample_days(3))
    assert ics.startswith("BEGIN:VCALENDAR\r\n")
    assert ics.rstrip().endswith("END:VCALENDAR")
    assert "VERSION:2.0" in ics
    assert ics.count("BEGIN:VEVENT") == 3          # one event per day
    assert ics.count("END:VEVENT") == 3
    assert "\r\n" in ics                            # CRLF line endings (RFC 5545)


def test_all_day_events_use_date_value():
    ics = CAL.build_ics(_sample_days(2))
    assert "DTSTART;VALUE=DATE:20260615" in ics
    # DTEND is the exclusive next day
    assert "DTEND;VALUE=DATE:20260616" in ics


def test_uids_are_stable_across_regeneration():
    a = CAL.build_ics(_sample_days(3))
    b = CAL.build_ics(_sample_days(3))
    uids_a = sorted(l for l in a.split("\r\n") if l.startswith("UID:"))
    uids_b = sorted(l for l in b.split("\r\n") if l.startswith("UID:"))
    assert uids_a == uids_b and len(uids_a) == 3    # deterministic, one per day


def test_text_escaping_and_folding():
    days = [{
        "date": "2026-06-15",
        "card": {"id": "tower", "name": "The Tower"},
        "reversed": True,
        "transit_summary": "Comma, semicolon; and backslash \\ here",
        "best_expression": "x" * 200,               # forces line folding
        "alignment_action": "ritual line",
        "journal_prompt": "journal line",
    }]
    ics = CAL.build_ics(days)
    # escaped special chars appear in the (unfolded) description
    unfolded = ics.replace("\r\n ", "")
    assert "\\, " in unfolded or "\\," in unfolded   # comma escaped
    assert "\\;" in unfolded                         # semicolon escaped
    assert "\\\\" in unfolded                        # backslash escaped
    assert "reversed" in unfolded                    # orientation in summary
    # every physical line is <= 75 octets (folding invariant)
    for line in ics.split("\r\n"):
        assert len(line.encode("utf-8")) <= 75, line


def test_kind_selects_primary_prompt():
    days = [{
        "date": "2026-06-15",
        "card": {"id": "star", "name": "The Star"},
        "reversed": False,
        "transit_summary": "", "best_expression": "",
        "alignment_action": "DO_THE_RITUAL",
        "journal_prompt": "WRITE_THE_JOURNAL",
    }]
    ritual = CAL.build_ics(days, kind="ritual").replace("\r\n ", "")
    journal = CAL.build_ics(days, kind="journal").replace("\r\n ", "")
    assert "Practice: DO_THE_RITUAL" in ritual
    assert "Practice: WRITE_THE_JOURNAL" in journal


# --- endpoint -------------------------------------------------------------- #

def test_calendar_endpoint_returns_ics():
    r = client.post("/api/arcana-calendar", json={
        "chart": _CHART.model_dump(), "days": 7, "start_date": _START,
    })
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/calendar")
    assert "attachment" in r.headers["content-disposition"]
    assert ".ics" in r.headers["content-disposition"]
    body = r.text
    assert body.count("BEGIN:VEVENT") == 7          # exactly N events (Phase 1.5)
