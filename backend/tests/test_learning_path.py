"""
Phase 3.1 — Classroom as a generated learning path.

The path is a deterministic archetypal sequence from the querent's strongest
archetype (anchor) toward an underdeveloped shadow (growth edge), ascending in
trump number, reproducible from (natal signature, source system).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import ephemeris as E  # noqa: E402
from models import ChartRequest  # noqa: E402
import tarot as TAROT  # noqa: E402
import tarot_data as TD  # noqa: E402
from tarot_models import LearningPathRequest  # noqa: E402

_EINSTEIN = dict(year=1879, month=3, day=14, hour=11, minute=30, second=0,
                 lat=48.4011, lng=9.9876, tz_offset=0.67)
_CHART = E.calculate_chart(ChartRequest(**_EINSTEIN))


def _path(**kw):
    return TAROT.build_learning_path(LearningPathRequest(chart=_CHART, **kw))


def test_path_is_deterministic():
    a = _path()
    b = _path()
    assert [s.card.id for s in a.steps] == [s.card.id for s in b.steps]
    assert a.anchor == b.anchor and a.growth_edge == b.growth_edge


def test_path_length_and_stages():
    p = _path(steps=5)
    assert 3 <= len(p.steps) <= 5
    assert p.steps[0].stage == "Anchor"
    assert p.steps[-1].stage == "Growth edge"
    assert all(s.stage == "Bridge" for s in p.steps[1:-1])
    # orders are 1..n contiguous
    assert [s.order for s in p.steps] == list(range(1, len(p.steps) + 1))


def test_path_ascends_in_trump_number():
    p = _path(steps=6)
    nums = [TD.MAJOR_BY_ID[s.card.id]["number"] for s in p.steps]
    assert nums == sorted(nums)              # monotonic ascending
    assert len(set(nums)) == len(nums)       # no repeats


def test_all_steps_are_major_trumps_with_content():
    p = _path()
    for s in p.steps:
        assert s.card.arcana == "major"
        assert s.focus and s.practice and s.journal


def test_source_system_can_change_the_path():
    gd = _path(source="golden_dawn")
    th = _path(source="thoth")
    assert gd.lineage != th.lineage
    # endpoints are anchored to the same chart; the bridge selection may differ by
    # lineage. At minimum the lineage label threads through.
    assert gd.anchor == th.anchor            # same chart -> same strongest archetype


def test_steps_clamped_to_range():
    assert len(_path(steps=99).steps) <= 8
    assert len(_path(steps=1).steps) >= 3
