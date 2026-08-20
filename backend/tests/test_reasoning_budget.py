"""Reasoning tokens, and keeping them out of the reader's ceiling.

WHY THIS FILE EXISTS
====================
On Sonnet 5 and Opus 5 extended thinking is ON BY DEFAULT, and reasoning tokens
count against `max_tokens` while never reaching the reader. Nothing in this
codebase asked for thinking; it is simply what that model family does.

MEASURED 2026-08-19, supporter whole-chart at max_tokens=6600, with no reasoning
parameter — i.e. what shipped: 6,600 completion tokens of which 5,498 (83%) were
reasoning, finish_reason="length", and 482 words of visible reading. A paid
ceiling spent almost entirely on thinking, and the reading cut off.

The knob is per-model and it is an ALLOW-LIST, which is the part that is easy to
get backwards: on claude-haiku-4-5 reasoning is OFF by default and sending the
parameter TURNS IT ON — the same call measured 0 reasoning tokens and 990 words
without it, and 1,127 reasoning tokens and 234 words with it. Fixing the paid
tiers by broadcasting the parameter would have broken the free one.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest  # noqa: E402

import ai as AI  # noqa: E402
from test_completion_guarantee import _install  # noqa: E402


# --------------------------------------------------------------------------- #
# Which models get the parameter
# --------------------------------------------------------------------------- #

@pytest.mark.parametrize("model", [
    "claude-sonnet-5",
    "anthropic/claude-sonnet-5",          # OpenRouter route prefix
    "claude-opus-5",
    "anthropic/claude-opus-5",
    "claude-fable-5",
    "claude-opus-4-8",
])
def test_thinking_models_get_an_effort_ceiling(model):
    assert AI._reasoning_param(model) == {"effort": AI._REASONING_EFFORT}


@pytest.mark.parametrize("model", [
    "claude-haiku-4-5",
    "anthropic/claude-haiku-4-5",
    "qwen2.5:3b",                          # ollama
    "some-model-nobody-has-heard-of",
    "",
])
def test_everything_else_is_sent_nothing(model):
    """The failure direction that matters.

    A model that does not think by default is switched INTO thinking by this
    parameter. Silence is the only safe default for anything unrecognised.
    """
    assert AI._reasoning_param(model) is None


def test_the_knob_can_be_turned_off_entirely(monkeypatch):
    monkeypatch.setattr(AI, "_REASONING_EFFORT", "")
    assert AI._reasoning_param("claude-opus-5") is None


def test_the_effort_level_is_configurable(monkeypatch):
    monkeypatch.setattr(AI, "_REASONING_EFFORT", "low")
    assert AI._reasoning_param("claude-sonnet-5") == {"effort": "low"}


# --------------------------------------------------------------------------- #
# What actually goes on the wire
# --------------------------------------------------------------------------- #

def _chat(model):
    return AI._chat_openai_compat(
        "http://x", "key", "system", "user", model, max_tokens=100)


def test_the_parameter_reaches_the_request_body(monkeypatch):
    import asyncio
    holder = _install(monkeypatch, [("A whole reading.", "stop")])
    asyncio.run(_chat("anthropic/claude-sonnet-5"))
    body = holder["client"].requests[0]
    assert body["reasoning"] == {"effort": AI._REASONING_EFFORT}


def test_the_free_tier_model_sends_no_reasoning_key_at_all(monkeypatch):
    """Not `reasoning: null` — absent. A present-but-empty key is still a
    request to configure thinking, and this model must not receive one."""
    import asyncio
    holder = _install(monkeypatch, [("A whole reading.", "stop")])
    asyncio.run(_chat("anthropic/claude-haiku-4-5"))
    assert "reasoning" not in holder["client"].requests[0]


def test_every_continuation_carries_it_too(monkeypatch):
    """A continuation is a fresh request. If it dropped the parameter, the
    retry after a truncation would think without limit — the worst moment for
    it, because the budget is already half spent."""
    import asyncio
    holder = _install(monkeypatch, [
        ("first half", "length"), ("second half.", "stop")])
    asyncio.run(_chat("claude-opus-5"))
    reqs = holder["client"].requests
    assert len(reqs) == 2
    assert all(r["reasoning"] == {"effort": AI._REASONING_EFFORT} for r in reqs)
