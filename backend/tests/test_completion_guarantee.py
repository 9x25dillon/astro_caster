"""
Readings must never be served chopped at the token ceiling.

Observed live 2026-08-17: a reader on an active subscription got a reading that
ended "- Profound psychological insight an". Measured against a real chart with
the cap lifted to 9000, every tier's prompt wanted more room than it was given:

    free       claude-haiku-4-5   needs 1,138-1,257   had   700
    supporter  claude-sonnet-5    needs 4,367-4,911   had 3,000
    oracle     claude-opus-5      needs 3,886-4,521   had 6,000

Supporter — a PAYING tier — could never finish: it shares ORACLE_EXTENSION with
oracle ("800-1200 words") but had barely half the room that prompt costs. Nothing
detected it, because `finish_reason` was read nowhere in ai.py.

These tests pin the two halves of the fix: budgets that fit the prompt, and a
continuation loop that finishes the job when a budget is wrong anyway.
"""
import asyncio
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import ai as AI  # noqa: E402


# --------------------------------------------------------------------------- #
# Fake OpenAI-compatible transport
# --------------------------------------------------------------------------- #
class _FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


class _FakeClient:
    """Returns one scripted (content, finish_reason) turn per request."""

    def __init__(self, turns):
        self.turns = list(turns)
        self.requests = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def post(self, url, headers=None, json=None):
        self.requests.append(json)
        content, finish = self.turns.pop(0)
        return _FakeResponse(
            {"choices": [{"message": {"content": content}, "finish_reason": finish}]}
        )


class _NoContentKeyClient(_FakeClient):
    """A provider that omits `content` entirely rather than sending null."""

    async def post(self, url, headers=None, json=None):
        self.requests.append(json)
        _content, finish = self.turns.pop(0)
        return _FakeResponse({"choices": [{"message": {}, "finish_reason": finish}]})


def _install(monkeypatch, turns):
    holder = {}

    def factory(*a, **kw):
        holder["client"] = _FakeClient(turns)
        return holder["client"]

    monkeypatch.setattr(AI.httpx, "AsyncClient", factory)
    return holder


def _chat():
    return AI._chat_openai_compat(
        "http://x", "key", "system", "user", "model", max_tokens=100)


# --------------------------------------------------------------------------- #
# Continuation
# --------------------------------------------------------------------------- #
def test_stops_when_the_model_is_finished(monkeypatch):
    """finish_reason "stop" means done — no second call, no wasted spend."""
    holder = _install(monkeypatch, [("A whole reading.", "stop")])
    out = asyncio.run(_chat())
    assert out == "A whole reading."
    assert len(holder["client"].requests) == 1


def test_continues_when_cut_off_at_the_ceiling(monkeypatch):
    """The reader gets the whole reading, spliced across turns."""
    holder = _install(monkeypatch, [
        ("Profound psychological insight an", "length"),
        ("d a gift for holding what others cannot.", "stop"),
    ])
    out = asyncio.run(_chat())
    assert out == (
        "Profound psychological insight and a gift for holding what others cannot.")
    assert len(holder["client"].requests) == 2


def test_continuation_feeds_the_partial_back_without_repeating(monkeypatch):
    """The follow-up carries the partial as an assistant turn + a resume order."""
    holder = _install(monkeypatch, [
        ("half a thought", "length"),
        (" completed.", "stop"),
    ])
    asyncio.run(_chat())
    second = holder["client"].requests[1]["messages"]
    assert [m["role"] for m in second] == ["system", "user", "assistant", "user"]
    assert second[2]["content"] == "half a thought"
    assert "not repeat" in second[3]["content"]
    # The original system + question survive verbatim, or the continuation would
    # be written without the chart in front of it.
    assert second[0]["content"] == "system"
    assert second[1]["content"] == "user"


def test_continuation_is_bounded(monkeypatch):
    """A model that never stops cannot bill forever."""
    holder = _install(monkeypatch, [("chunk. ", "length")] * 20)
    asyncio.run(_chat())
    assert len(holder["client"].requests) == AI._MAX_CONTINUATIONS + 1


def test_exhausted_continuations_still_end_on_a_sentence(monkeypatch):
    """Never hand back half a word, even when the bound is hit."""
    _install(monkeypatch, [
        ("One finished thought. ", "length"),
        ("And a second one. ", "length"),
        ("Then a dangling frag", "length"),
    ])
    out = asyncio.run(_chat())
    assert out.endswith(".")
    assert "dangling frag" not in out
    # The completed sentences before the cut are kept — trimming tidies the tail,
    # it does not discard the reading.
    assert out.startswith("One finished thought.")
    assert "And a second one." in out


# --------------------------------------------------------------------------- #
# Null content at the ceiling
#
# Observed live 2026-08-17 while recording eval fixtures: claude-sonnet-5 through
# OpenRouter answered finish_reason="length" with content=None, having spent all
# 3,000 tokens. Both the old code (`None.strip()`) and the first cut of the fix
# (`"".join([None])`) raised on it — a 500 charged at full price.
# --------------------------------------------------------------------------- #
def test_null_content_does_not_crash(monkeypatch):
    _install(monkeypatch, [(None, "length")])
    with pytest.raises(RuntimeError, match="no content"):
        asyncio.run(_chat())


def test_missing_content_key_does_not_crash(monkeypatch):
    holder = {}

    def factory(*a, **kw):
        holder["client"] = _NoContentKeyClient([(None, "length")])
        return holder["client"]

    monkeypatch.setattr(AI.httpx, "AsyncClient", factory)
    with pytest.raises(RuntimeError, match="no content"):
        asyncio.run(_chat())


def test_empty_first_turn_does_not_spend_another_budget(monkeypatch):
    """Nothing to continue FROM — don't pay for a second pass on an empty prefill."""
    holder = _install(monkeypatch, [(None, "length")] * 3)
    with pytest.raises(RuntimeError):
        asyncio.run(_chat())
    assert len(holder["client"].requests) == 1


def test_partial_then_null_keeps_what_was_written(monkeypatch):
    """A null continuation must not discard the text already paid for."""
    _install(monkeypatch, [
        ("A real first half. And a second sentence.", "length"),
        (None, "length"),
        (None, "length"),
    ])
    out = asyncio.run(_chat())
    assert out == "A real first half. And a second sentence."


# --------------------------------------------------------------------------- #
# Sentence trimming
# --------------------------------------------------------------------------- #
def test_completed_continuation_is_not_trimmed(monkeypatch):
    """
    Trimming applies only to text still mid-thought. A finished continuation may
    legitimately end on a closing quote or bold marker, and cutting back to the
    previous full stop would damage prose the model had properly closed.
    """
    _install(monkeypatch, [
        ("She writes: ", "length"),
        ('"the door opens from your side."', "stop"),
    ])
    out = asyncio.run(_chat())
    assert out.endswith('side."')


def test_trim_prefers_whole_text_over_a_stub():
    """Losing most of a paid reading to tidy its last line is the worse failure."""
    text = "Short. " + "and then a very long unpunctuated continuation " * 6
    assert AI._trim_to_last_complete_sentence(text) == text.rstrip()


def test_trim_cuts_a_trailing_fragment():
    text = "A complete sentence. Another complete one. A dangling frag"
    assert AI._trim_to_last_complete_sentence(text) == (
        "A complete sentence. Another complete one.")


def test_trim_handles_no_sentence_ending_at_all():
    assert AI._trim_to_last_complete_sentence("no ending here") == "no ending here"


# --------------------------------------------------------------------------- #
# Budgets fit the prompts that spend them
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("tier,measured", [
    ("free", 1257),
    ("supporter", 4911),
    ("oracle", 4521),
])
def test_budget_exceeds_measured_need(tier, measured):
    """Every tier can finish the reading its own prompt asks for."""
    _s, _u, _m, budget = AI._build_prompts(
        "q", {"planets": [], "aspects": []}, "psychological",
        None, None, "quick", "cloud", tier, False)
    assert budget > measured, (
        f"{tier} budget {budget} below its measured need {measured} — "
        "readings will truncate")


def test_paid_tiers_can_afford_the_prompt_they_share():
    """
    supporter and oracle are handed the SAME ORACLE_EXTENSION ("800-1200 words",
    five sections). The tier ladder may put oracle higher, but supporter's rung
    must still clear the brief both are given — that is precisely what it did not
    do, and the reason a paying reader got half a reading.

    The trap this pins: supporter needs MORE than oracle (sonnet-5 spends ~4.2-5.0
    tokens/word vs opus-5's ~3.4-3.8), so ranking budgets does not imply either
    one fits.
    """
    def budget_for(tier):
        return AI._build_prompts(
            "q", {"planets": [], "aspects": []}, "psychological",
            None, None, "quick", "cloud", tier, False)[3]

    assert budget_for("supporter") >= 4911
    assert budget_for("oracle") >= 4521
    assert budget_for("supporter") < budget_for("oracle")


def test_local_model_can_fit_its_own_brief():
    """LOCAL_SYSTEM asks ~300 words over four headers; 520 tokens could not."""
    _s, _u, _m, budget = AI._build_prompts(
        "q", {"planets": [], "aspects": []}, "psychological",
        None, None, "quick", "ollama", "free", False)
    assert budget >= 1000
