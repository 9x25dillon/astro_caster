"""FREE-1 — the free tier's daily taste of the good model.

The shape being locked here: a free reading inside the daily allowance gets the
SAME writer the supporter tier uses, at a third of the room. What the allowance
withholds is length, not quality — so the upgrade sells space to finish a
thought rather than a better mind.

The security property matters more than the happy path. `free_premium` arrives
in the request body, so the test that counts is the one proving it cannot move
anything a paying tier is entitled to.
"""
import ai


def _prompts(tier: str, *, free_premium: bool = False, depth: str = "quick"):
    """(system, user, model, budget) for a cloud-provider reading."""
    return ai._build_prompts(
        "why am I like this", {"planets": []}, "psychological",
        None, None, depth, "openai", tier, free_premium,
    )


def test_free_allowance_buys_the_supporter_model_at_a_shorter_length():
    _, _, prem_model, prem_budget = _prompts("free", free_premium=True)
    _, _, sup_model, sup_budget = _prompts("supporter")
    assert prem_model == sup_model, "the allowance is about length, not a lesser writer"
    assert prem_budget < sup_budget, "…but the free reading is deliberately shorter"


def test_an_exhausted_allowance_falls_back_to_the_cheap_model():
    _, _, prem_model, _ = _prompts("free", free_premium=True)
    _, _, spent_model, _ = _prompts("free", free_premium=False)
    assert spent_model != prem_model
    assert spent_model == ai._MODEL


def test_the_free_length_is_the_same_whether_or_not_the_allowance_is_spent():
    # Free-tier LIMITS are constant; only the writer changes. Upgrading is what
    # buys more room, which is the whole shape of the offer.
    _, _, _, prem = _prompts("free", free_premium=True)
    _, _, _, spent = _prompts("free", free_premium=False)
    assert prem == spent


def test_budget_rises_strictly_with_tier():
    _, _, _, free = _prompts("free")
    _, _, _, sup = _prompts("supporter")
    _, _, _, orc = _prompts("oracle")
    assert free < sup < orc, "every upgrade must buy visibly more room"


def test_free_premium_cannot_raise_a_paid_tier_s_budget_or_change_its_model():
    # The flag is client-supplied. A supporter or oracle request carrying it
    # must be byte-identical to one without it — no model swap, no extra room.
    for tier in ("supporter", "oracle"):
        assert _prompts(tier, free_premium=False) == _prompts(tier, free_premium=True), tier


def test_free_premium_never_reaches_the_oracle_model():
    # The most valuable thing to steal is the top-tier writer.
    _, _, model, _ = _prompts("free", free_premium=True)
    assert model != ai._MODEL_ORACLE


def test_deep_depth_does_not_smuggle_the_deep_model_into_an_exhausted_free_reading():
    # `depth="deep"` is gated at the endpoint (_require_supporter). If that gate
    # were ever bypassed, an exhausted free reading still must not cost more
    # than the cheap path is budgeted for.
    _, _, _, budget = _prompts("free", free_premium=False, depth="deep")
    _, _, _, quick = _prompts("free", free_premium=False, depth="quick")
    assert budget == quick


def test_every_tier_runs_a_current_generation_model():
    # The sonnet-4-6 -> sonnet-5 and opus-4-8 -> opus-5 upgrades were free:
    # Anthropic prices the replacements identically. If a future edit points a
    # tier back at a retired model, the margins in PRICING_MODEL.md silently
    # stop describing reality.
    for model in (ai._MODEL_SUPPORTER, ai._MODEL_ORACLE, ai._MODEL_FREE_PREMIUM):
        assert "-4-6" not in model and "-4-8" not in model, model
