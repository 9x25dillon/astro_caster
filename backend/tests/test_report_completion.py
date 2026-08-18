"""
The long-form reports must not stop at their token ceiling either.

`_call_fable` is the single Anthropic call behind all three of the product's
dearest outputs — the Oracle Report (16k), the Course (24k), and the deluxe
Personal Report (32k). It checked `stop_reason` for exactly one value,
`"refusal"`, and returned anything else as a finished report. A reader who paid
for the deluxe edition and hit the ceiling got a document that stopped
mid-sentence, with nothing anywhere recording that it had.

The continuation shape matters and is easy to get wrong: a TRAILING assistant
turn is a prefill, and prefills return 400 on this model family. An assistant
turn followed by a user turn is ordinary conversation history and is fine.
`msg.content` is echoed back verbatim — thinking blocks included, even when
their text is empty under the default display — because editing them breaks the
turn on the same model.
"""
import asyncio
import os
import sys

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


class _Stream:
    def __init__(self, msg):
        self._msg = msg

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

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


def _call():
    return asyncio.run(OR._call_fable("system", "user"))


# --------------------------------------------------------------------------- #
def test_completed_report_is_returned_as_is(monkeypatch):
    calls = _install(monkeypatch, [_Msg("A whole report.", "end_turn")])
    out = _call()
    assert out["text"] == "A whole report."
    assert len(calls) == 1


def test_report_cut_at_the_ceiling_is_continued(monkeypatch):
    calls = _install(monkeypatch, [
        _Msg("## V. Synthesis\n\nThe chart asks you to hold both the salt-dark an",
             "max_tokens"),
        _Msg("d the dry clarity of stone.", "end_turn"),
    ])
    out = _call()
    assert out["text"].endswith("the salt-dark and the dry clarity of stone.")
    assert len(calls) == 2


def test_continuation_is_history_not_a_prefill(monkeypatch):
    """A trailing assistant turn 400s on this model family."""
    calls = _install(monkeypatch, [
        _Msg("half", "max_tokens"),
        _Msg(" done.", "end_turn"),
    ])
    _call()
    roles = [m["role"] for m in calls[1]["messages"]]
    assert roles == ["user", "assistant", "user"]
    assert roles[-1] == "user", "trailing assistant turn is a prefill — 400s"
    assert "not repeat" in calls[1]["messages"][-1]["content"]


def test_continuation_echoes_content_blocks_verbatim(monkeypatch):
    """Thinking blocks ride in msg.content and must be passed back unedited."""
    thinking = _Block("", type="thinking")
    text = _Block("visible half")
    calls = _install(monkeypatch, [
        _Msg(None, "max_tokens", content=[thinking, text]),
        _Msg(" and the rest.", "end_turn"),
    ])
    out = _call()
    echoed = calls[1]["messages"][1]["content"]
    assert echoed is not None
    assert thinking in echoed and text in echoed, "content blocks were rebuilt, not echoed"
    # Only text blocks contribute to the report body.
    assert out["text"] == "visible half and the rest."


def test_refusal_still_short_circuits(monkeypatch):
    _install(monkeypatch, [_Msg("", "refusal")])
    assert _call() is None


def test_refusal_on_a_continuation_abandons_the_report(monkeypatch):
    """Fall back to the deterministic report rather than ship half of one."""
    _install(monkeypatch, [
        _Msg("first half", "max_tokens"),
        _Msg("", "refusal"),
    ])
    assert _call() is None


def test_continuation_is_bounded(monkeypatch):
    calls = _install(monkeypatch, [_Msg("more. ", "max_tokens")] * 20)
    _call()
    assert len(calls) == OR._MAX_CONTINUATIONS + 1


def test_empty_first_turn_does_not_buy_another(monkeypatch):
    """Nothing to continue from — don't spend a second 32k budget on it."""
    calls = _install(monkeypatch, [_Msg("", "max_tokens")] * 3)
    assert _call() is None
    assert len(calls) == 1


def test_served_by_model_is_reported(monkeypatch):
    """A server-side fallback changes who wrote it; the caller records that."""
    _install(monkeypatch, [_Msg("done.", "end_turn", model="claude-opus-4-8")])
    assert _call()["model"] == "claude-opus-4-8"


def test_no_key_means_no_call(monkeypatch):
    monkeypatch.setattr(OR, "_ANTHROPIC_KEY", "")
    assert _call() is None
