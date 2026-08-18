"""
The spend cap must be priced for the model that actually answers, and a
subscription must not be silently rationed.

Two defects, found 2026-08-17:

1. `estimate_cost` multiplied every "ask" by 0.2, commented "usually a
   local/cheap model". An oracle-tier ask is answered by opus-5, so the cap
   counted those calls at a fifth of their price — the real ceiling sat five
   times higher than AAE_USER_DAILY_USD claimed.

2. Paid tiers were rationed by the same $2/day per-user cap as anonymous
   visitors. Past it, `allow_ai=False` routed a subscriber to the deterministic
   offline compiler — a different engine, no notice. A subscription sold as
   unlimited readings cannot have a daily ceiling that swaps the writer.

The global cap and the spend alarm still bind everyone, subscribers included;
what the exemption removes is the per-user refusal, never the accounting.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import ai as AI  # noqa: E402
import budget as B  # noqa: E402


@pytest.fixture(autouse=True)
def _clean():
    B.reset()
    yield
    B.reset()


# --------------------------------------------------------------------------- #
# Priced by model
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("model,expected", [
    ("claude-fable-5", 50.0),
    ("claude-opus-5", 25.0),
    ("claude-opus-4-8", 25.0),
    ("claude-sonnet-5", 15.0),
    ("claude-haiku-4-5", 5.0),
])
def test_list_prices(model, expected):
    assert B.output_price(model) == expected


def test_openrouter_route_prefix_resolves():
    """The app calls `anthropic/claude-opus-5`; the price table keys are bare."""
    assert B.output_price("anthropic/claude-opus-5") == 25.0
    assert B.output_price("anthropic/claude-haiku-4-5") == 5.0


def test_unknown_model_bills_at_the_dearest_rate():
    """Guess high: degrading a reader early is recoverable, overspending is not."""
    assert B.output_price("some-model-shipped-next-year") == 50.0
    assert B.output_price(None) == 50.0


def test_oracle_ask_is_no_longer_a_fifth_of_its_price():
    """The exact defect: opus-5 output counted at haiku-ish rates."""
    chars = 20_000
    opus = B.estimate_cost("ask", chars, "anthropic/claude-opus-5")
    haiku = B.estimate_cost("ask", chars, "anthropic/claude-haiku-4-5")
    assert opus == pytest.approx(chars / 4 / 1e6 * 25.0)
    assert opus == pytest.approx(haiku * 5.0)


def test_kind_no_longer_changes_the_price():
    """Cost follows the model, not the shape of the request."""
    args = (30_000, "anthropic/claude-opus-5")
    assert B.estimate_cost("ask", *args) == B.estimate_cost("oracle", *args)


def test_per_unit_kinds_are_untouched():
    assert B.estimate_cost("plate", 0) == pytest.approx(0.02)
    assert B.estimate_cost("tts", 1000) == pytest.approx(0.03)


def test_model_for_tier_matches_what_build_prompts_uses():
    """The pre-flight estimate must price the model the reading will really use."""
    for tier in ("free", "supporter", "oracle"):
        _s, _u, model, _b = AI._build_prompts(
            "q", {"planets": [], "aspects": []}, "psychological",
            None, None, "quick", "cloud", tier, False)
        assert AI.model_for_tier(tier) == model


# --------------------------------------------------------------------------- #
# Subscribers are exempt from the per-user cap
# --------------------------------------------------------------------------- #
def _spend_past_the_user_cap(token):
    B.record(token, "ask", 4_000_000, None, model="claude-opus-5")
    assert B.snapshot()["global_today_usd"] > B.user_daily_cap()


def test_free_tier_is_still_capped(monkeypatch):
    monkeypatch.setattr(B, "is_subscriber", lambda token: False)
    _spend_past_the_user_cap("anon-token")
    allowed, reason = B.allow_call("anon-token", "ask", None)
    assert not allowed and reason == "user"


@pytest.mark.parametrize("tier", ["supporter", "oracle"])
def test_subscribers_are_not_capped(monkeypatch, tier):
    monkeypatch.setattr(B, "is_subscriber", lambda token: True)
    _spend_past_the_user_cap("sub-token")
    allowed, reason = B.allow_call("sub-token", "ask", None)
    assert allowed, f"{tier} was rationed at the per-user cap: {reason}"


def test_the_global_cap_still_binds_subscribers(monkeypatch):
    """Unlimited per user is not unlimited per instance."""
    monkeypatch.setattr(B, "is_subscriber", lambda token: True)
    monkeypatch.setenv("AAE_GLOBAL_DAILY_USD", "1.00")
    B.record("sub-token", "ask", 4_000_000, None, model="claude-opus-5")
    allowed, reason = B.allow_call("sub-token", "ask", None)
    assert not allowed and reason == "global"


def test_subscriber_spend_is_still_recorded(monkeypatch):
    """Exempt from refusal, not from accounting — the alarm still needs to see it."""
    monkeypatch.setattr(B, "is_subscriber", lambda token: True)
    before = B.snapshot()["global_today_usd"]
    B.record("sub-token", "ask", 100_000, None, model="claude-opus-5")
    assert B.snapshot()["global_today_usd"] > before


def test_is_subscriber_fails_closed_on_a_bad_token(monkeypatch):
    """An unreadable token must stay capped, never become uncapped."""
    import entitlements as ENT

    def _boom(_token):
        raise ValueError("corrupt")

    monkeypatch.setattr(ENT, "entitlement_status", _boom)
    assert B.is_subscriber("garbage") is False


def test_is_subscriber_is_false_without_a_token():
    assert B.is_subscriber(None) is False
    assert B.is_subscriber("") is False
