"""
The long generations must reach the reader, not just the origin.

Measured in production on 2026-08-27: `POST /api/v1/course` returned **200 after
125,534 ms**. Cloudflare gives an origin 100 seconds to produce a complete
response before it answers the browser with a 524, so the course was composed,
billed, and then thrown away — the reader saw an error page for work that had
succeeded. `/api/v1/tts` did the same at 113s, twice, without anyone reporting
it.

Cloudflare's timer is reset by bytes in flight. `_call_fable` already streamed
FROM Fable and merely buffered the result, so the fix is to pass the deltas
through rather than to make the model faster.

That leaves two implementations of one contract — `_call_fable` and
`_call_fable_stream` — with a continuation loop and a refusal check that are
easy to let drift apart. The first test here is the lock: same fake turns
through both paths, identical text out.
"""
import asyncio
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import oracle_report as OR  # noqa: E402


class _Block:
    def __init__(self, text, type="text"):
        self.text = text
        self.type = type


class _Msg:
    def __init__(self, text, stop_reason, model="claude-fable-5", content=None):
        self.content = content if content is not None else [_Block(text)]
        self.stop_reason = stop_reason
        self.model = model
        self.text = text


class _Stream:
    """Fake SDK stream: `text_stream` yields the message in small deltas, then
    `get_final_message()` returns the assembled message — the same two-surface
    shape the real client exposes."""

    def __init__(self, msg, chunk_size=7):
        self._msg = msg
        self._chunk = chunk_size

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    @property
    def text_stream(self):
        text = self._msg.text
        size = self._chunk

        async def _gen():
            for i in range(0, len(text), size):
                yield text[i:i + size]
        return _gen()

    async def get_final_message(self):
        return self._msg


class _Messages:
    def __init__(self, turns, calls):
        self._turns = turns
        self._calls = calls

    def stream(self, **kwargs):
        self._calls.append(kwargs)
        return _Stream(self._turns.pop(0))


class _Beta:
    def __init__(self, turns, calls):
        self.messages = _Messages(turns, calls)


class _FakeClient:
    def __init__(self, turns, calls):
        self.beta = _Beta(turns, calls)


def _install(monkeypatch, turns):
    calls = []

    class _FakeAnthropicModule:
        AsyncAnthropic = staticmethod(lambda **kw: _FakeClient(turns, calls))

    monkeypatch.setitem(sys.modules, "anthropic", _FakeAnthropicModule)
    monkeypatch.setattr(OR, "_ANTHROPIC_KEY", "test-key")
    return calls


def _drain(turns):
    """Run the streaming call, returning (chunks, terminal_payload)."""
    async def _go():
        chunks, final = [], "unset"
        async for event, payload in OR._call_fable_stream("system", "user"):
            if event == "chunk":
                chunks.append(payload)
            else:
                assert final == "unset", "more than one terminal frame"
                final = payload
        assert final != "unset", "stream ended without a done frame"
        return chunks, final
    return asyncio.run(_go())


# ------------------------------------------------------------------ the lock

def test_streamed_and_buffered_calls_agree(monkeypatch):
    """The anti-drift lock: two implementations, one contract."""
    turns = [_Msg("A whole course, composed.", "end_turn")]
    _install(monkeypatch, list(turns))
    buffered = asyncio.run(OR._call_fable("system", "user"))

    _install(monkeypatch, list(turns))
    chunks, streamed = _drain(list(turns))

    assert buffered["text"] == streamed["text"]
    assert buffered["model"] == streamed["model"]
    # and the chunks are the text, in order, losing nothing
    assert "".join(chunks) == streamed["text"]


def test_agreement_holds_across_a_continuation(monkeypatch):
    """A course that hits its ceiling continues — in BOTH paths, identically."""
    def turns():
        return [_Msg("First half. ", "max_tokens"), _Msg("Second half.", "end_turn")]

    _install(monkeypatch, turns())
    buffered = asyncio.run(OR._call_fable("system", "user"))
    calls = _install(monkeypatch, turns())
    chunks, streamed = _drain(turns())

    assert buffered["text"] == streamed["text"] == "First half. Second half."
    assert "".join(chunks) == "First half. Second half."
    assert len(calls) == 2, "the ceiling must trigger exactly one continuation"

    # The continuation is ORDINARY HISTORY, never a prefill — a trailing
    # assistant turn 400s on this model family.
    msgs = calls[1]["messages"]
    assert msgs[-1]["role"] == "user"
    assert msgs[1]["role"] == "assistant"


def test_an_exhausted_budget_still_ends_on_a_finished_sentence(monkeypatch):
    """The last resort of the completion guarantee: when every continuation is
    spent and the writer is STILL going, the reader gets a text that ends on a
    complete sentence — never "...you are a natural counsel". In the streamed
    path the raw deltas cannot be retracted, but the done frame is the
    authoritative text and the client renders it over the partial, so the
    trim reaches the reader there too. Both paths, identically."""
    def turns():
        return [
            _Msg("A finished sentence. ", "max_tokens"),
            _Msg("Another finished one. ", "max_tokens"),
            _Msg("And a half-fini", "max_tokens"),   # budget dies mid-word
        ]

    _install(monkeypatch, turns())
    buffered = asyncio.run(OR._call_fable("system", "user"))
    calls = _install(monkeypatch, turns())
    _chunks, streamed = _drain(turns())

    assert buffered["text"] == streamed["text"] \
        == "A finished sentence. Another finished one."
    assert len(calls) == 1 + OR._MAX_CONTINUATIONS, "budget spent exactly"


# ------------------------------------------------------- refusal & failure

def test_a_refusal_emits_no_text_and_asks_for_the_fallback(monkeypatch):
    """A refusal carries empty content, so nothing must reach the reader before
    the stop_reason is checked."""
    _install(monkeypatch, [_Msg("", "refusal")])
    chunks, final = _drain([_Msg("", "refusal")])
    assert chunks == []
    assert final is None, "None is how both paths ask for the offline edition"


def test_an_unconfigured_key_terminates_cleanly(monkeypatch):
    monkeypatch.setattr(OR, "_ANTHROPIC_KEY", "")
    chunks, final = _drain([])
    assert chunks == []
    assert final is None


def test_an_upstream_failure_terminates_cleanly(monkeypatch):
    class _Boom:
        AsyncAnthropic = staticmethod(
            lambda **kw: (_ for _ in ()).throw(RuntimeError("upstream down")))

    monkeypatch.setitem(sys.modules, "anthropic", _Boom)
    monkeypatch.setattr(OR, "_ANTHROPIC_KEY", "test-key")
    chunks, final = _drain([])
    assert chunks == []
    assert final is None, "a failure must not look like a finished course"


def test_whitespace_only_output_is_treated_as_no_course(monkeypatch):
    """Same rule as _call_fable: blank text means fall back, not ship blank."""
    _install(monkeypatch, [_Msg("   \n  ", "end_turn")])
    _, final = _drain([_Msg("   \n  ", "end_turn")])
    assert final is None


# --------------------------------------------------------- the course layer

@pytest.mark.parametrize("allow_ai", [False])
def test_offline_course_still_streams_one_chunk_then_done(monkeypatch, allow_ai):
    """The capped/unconfigured path must use the SAME frame shape, so the client
    needs no second code path for a fallback."""
    import course as COURSE

    class _Req:
        source = "golden_dawn"
        focus = "a foundation"
        entitlement = None

    monkeypatch.setattr(COURSE, "build_course_substrate",
                        lambda req: {"path": _Path(), "meta": {"name": "Golden Dawn"}})
    monkeypatch.setattr(COURSE, "course_id", lambda sub, req: "cid")
    monkeypatch.setattr(COURSE, "_offline_course", lambda sub, focus: "An offline course.")

    async def _go():
        out = []
        async for ev, payload in COURSE.generate_course_stream(_Req(), allow_ai=False):
            out.append((ev, payload))
        return out

    frames = asyncio.run(_go())
    assert frames[0][0] == "chunk" and frames[0][1] == "An offline course."
    assert frames[-1][0] == "done"
    assert frames[-1][1].ai_source == "offline"
    assert frames[-1][1].course == "An offline course."


class _Path:
    anchor = "The Sun"
    growth_edge = "Strength"
    steps = [1, 2, 3]


# ------------------------------------------------------------ the SSE frames
# The frame shape IS the contract with api/client.fetchCourseStream: event
# names, one JSON payload per frame, blank-line separated. A mismatch here is
# invisible to every test above and breaks only in a browser.

def test_the_endpoint_emits_chunk_frames_then_one_done(monkeypatch):
    from fastapi.testclient import TestClient
    from models import ChartRequest
    import ephemeris as E
    import main
    import course as COURSE
    import entitlements as ENT

    chart = E.calculate_chart(ChartRequest(
        year=1879, month=3, day=14, hour=11, minute=30, second=0,
        lat=48.4011, lng=9.9876, tz_offset=0.67,
        house_system="P", zodiac="tropical", ayanamsha=1))

    monkeypatch.setattr(ENT, "entitlement_status", lambda t: {"tier": "oracle"})
    monkeypatch.setattr(main.ENT, "entitlement_status", lambda t: {"tier": "oracle"})

    async def _fake_stream(req, allow_ai=True):
        yield ("chunk", "Lesson one: ")
        yield ("chunk", 'the "Sun" — a quote & an ampersand.')
        yield ("done", COURSE.CourseResponse(
            course_id="cid", source=req.source, lineage="Golden Dawn",
            anchor="The Sun", growth_edge="Strength", focus=req.focus,
            lessons=3, course="The whole course.", ai_source="llm",
            model="claude-fable-5"))

    monkeypatch.setattr(COURSE, "generate_course_stream", _fake_stream)

    client = TestClient(main.app)
    r = client.post("/api/course-stream", json={
        "chart": chart.model_dump(), "source": "golden_dawn",
        "lessons": 3, "focus": "a foundation", "entitlement": "x",
    })
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/event-stream")
    # nginx must not buffer, or the proxy reintroduces the very silence this
    # endpoint exists to remove
    assert r.headers.get("x-accel-buffering") == "no"

    blocks = [b for b in r.text.split("\n\n") if b.strip()]
    events = [b.split("\n")[0].removeprefix("event: ") for b in blocks]
    assert events == ["chunk", "chunk", "done"], events

    import json as _j
    # payloads are JSON, so quotes and ampersands survive the wire intact
    assert _j.loads(blocks[1].split("data: ", 1)[1]) == 'the "Sun" — a quote & an ampersand.'
    done = _j.loads(blocks[2].split("data: ", 1)[1])
    assert done["course"] == "The whole course."
    assert done["ai_source"] == "llm"


def test_the_endpoint_refuses_below_oracle_before_any_work(monkeypatch):
    """402 must arrive as a status, not as an error frame inside a 200 stream —
    the client branches on it to open the support flow."""
    from fastapi.testclient import TestClient
    from models import ChartRequest
    import ephemeris as E
    import main

    chart = E.calculate_chart(ChartRequest(
        year=1879, month=3, day=14, hour=11, minute=30, second=0,
        lat=48.4011, lng=9.9876, tz_offset=0.67,
        house_system="P", zodiac="tropical", ayanamsha=1))
    monkeypatch.setattr(main.ENT, "entitlement_status", lambda t: {"tier": "free"})

    client = TestClient(main.app)
    r = client.post("/api/course-stream", json={
        "chart": chart.model_dump(), "source": "golden_dawn",
        "lessons": 3, "focus": "a foundation", "entitlement": None,
    })
    assert r.status_code == 402
