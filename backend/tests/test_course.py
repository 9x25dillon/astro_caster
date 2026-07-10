"""
The Course — Fable-designed personal curriculum (oracle tier).

Tests exercise the DETERMINISTIC layer (no Anthropic key in the test env, so
generate_course always takes the offline path) and the endpoint's tier gate.
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient  # noqa: E402

import course as C  # noqa: E402
import ephemeris as E  # noqa: E402
from main import app  # noqa: E402
from models import ChartRequest  # noqa: E402
from tarot_models import CourseRequest  # noqa: E402

client = TestClient(app)

_EINSTEIN = dict(year=1879, month=3, day=14, hour=11, minute=30, second=0,
                 lat=48.4011, lng=9.9876, tz_offset=0.67)
_CHART = E.calculate_chart(ChartRequest(**_EINSTEIN))


def _req(**kw):
    return CourseRequest(chart=_CHART, **kw)


def _generate(**kw):
    return asyncio.run(C.generate_course(_req(**kw)))


# --- deterministic engine ------------------------------------------------------


def test_offline_course_structure():
    r = _generate(lessons=5)
    assert r.ai_source == "offline" and r.model is None
    assert r.course.startswith("## Orientation")
    assert "## Commencement" in r.course
    # One lesson section per path step, each with the fixed subsections.
    assert r.course.count("## Lesson ") == r.lessons
    for sub in ("### The archetype", "### In your chart", "### Practice", "### Journal"):
        assert r.course.count(sub) == r.lessons
    # The curriculum departs from the anchor and studies toward the growth edge.
    assert f"**{r.anchor}**" in r.course and f"**{r.growth_edge}**" in r.course


def test_course_is_deterministic_and_id_stable():
    a = _generate(lessons=6)
    b = _generate(lessons=6)
    assert a.course == b.course
    assert a.course_id == b.course_id and len(a.course_id) == 12
    # A different curriculum shape is a different course identity.
    c = _generate(lessons=4)
    assert c.course_id != a.course_id


def test_first_lesson_is_the_anchor():
    # The course rides the learning path — the 4.1 fix guarantees lesson 1 is
    # the anchor archetype, not whichever endpoint has the lower trump number.
    r = _generate(lessons=5)
    first = r.course.split("## Lesson 1 — ", 1)[1].splitlines()[0].strip()
    assert first == r.anchor


def test_substrate_prompt_is_symbolic_only():
    # Privacy invariant shared with the reports: no raw birth data in prompts.
    req = _req()
    prompt = C._substrate_prompt(C.build_course_substrate(req), req.focus)
    for fragment in ("1879", "48.4", "9.987", "11:30"):
        assert fragment not in prompt


# --- endpoint gate ---------------------------------------------------------------


def test_endpoint_402_without_oracle_tier():
    r = client.post("/api/course", json={"chart": _CHART.model_dump()})
    assert r.status_code == 402
    assert "oracle" in r.json()["detail"]


def test_endpoint_serves_offline_course_to_oracle_tier():
    import entitlements as ENT
    token = ENT.mint_entitlement("oracle", ref="test", verified=True)["token"]
    r = client.post("/api/course", json={
        "chart": _CHART.model_dump(),
        "lessons": 4,
        "entitlement": token,
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ai_source"] == "offline"
    assert body["course"].count("## Lesson ") == body["lessons"] == 4
