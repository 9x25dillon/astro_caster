"""
The bespoke-commission ladder (docs/design/MASTER_PIPELINE.md §5).

Three properties are worth a test here, and they are the three that would cost
real money to get wrong:

  · the ladder is NESTED — a dearer package can never offer less than a
    cheaper one, which is the failure a hand-maintained list drifts into;
  · an unknown sku unlocks NOTHING (fail closed, as every gate here does);
  · the DEFAULT price is the intended one, so a deploy that forgets a variable
    undercharges at worst and never charges more than was decided.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import product_catalog as PC  # noqa: E402


def test_the_ladder_is_nested_cheapest_first():
    prices = [p.price_cents for p in PC.CATALOG]
    assert prices == sorted(prices), "the ladder must be ordered cheapest-first"
    for cheaper, dearer in zip(PC.CATALOG, PC.CATALOG[1:]):
        assert cheaper.unlocks <= dearer.unlocks, (
            f"{dearer.sku} offers less than {cheaper.sku}: "
            f"missing {sorted(cheaper.unlocks - dearer.unlocks)}"
        )


def test_every_sku_is_unique_and_resolvable():
    skus = [p.sku for p in PC.CATALOG]
    assert len(skus) == len(set(skus))
    for sku in skus:
        assert PC.require(sku).sku == sku
        assert PC.get(sku) is not None


def test_an_unknown_sku_unlocks_nothing_and_raises_where_it_must():
    assert PC.get("no-such-tier") is None
    assert PC.unlocks("no-such-tier", PC.MANUSCRIPT) is False
    # Empty string is the shape a missing form field arrives as — still closed.
    assert PC.unlocks("", PC.MANUSCRIPT) is False
    with pytest.raises(ValueError):
        PC.require("no-such-tier")


def test_defaults_are_the_intended_prices(monkeypatch):
    # A deploy that passes no package vars must charge the decided amounts.
    for p in PC.CATALOG:
        monkeypatch.delenv(p._price_env, raising=False)
    assert PC.require("digital").price_cents == 17_500
    assert PC.require("artifact").price_cents == 62_500
    assert PC.require("collector").price_cents == 120_000


def test_an_empty_env_var_does_not_crash_and_falls_back(monkeypatch):
    # compose passes optional vars as `${VAR:-}`, which SETS them to empty
    # rather than leaving them unset — float("") would raise at import time and
    # crash-loop the backend. Third occurrence of this trap in this project.
    monkeypatch.setenv("AAE_PKG_DIGITAL_USD", "")
    assert PC.require("digital").price_cents == 17_500
    monkeypatch.setenv("AAE_PKG_DIGITAL_USD", "not-a-number")
    assert PC.require("digital").price_cents == 17_500


def test_env_override_is_honoured(monkeypatch):
    monkeypatch.setenv("AAE_PKG_DIGITAL_USD", "199.99")
    assert PC.require("digital").price_cents == 19_999


def test_physical_tiers_are_marked_as_such():
    # Refund windows and retention rules both change once an object ships, so
    # a caller must be able to ask without parsing the deliverable list.
    assert PC.require("digital").fulfilment == PC.FULFIL_NONE
    assert PC.require("artifact").fulfilment == PC.FULFIL_PHYSICAL
    assert PC.require("collector").fulfilment == PC.FULFIL_PHYSICAL
    # And the marking agrees with what is actually in the box.
    for p in PC.CATALOG:
        physical = {PC.BOOK_PHYSICAL, PC.POPUP_CHART, PC.DECK_PHYSICAL}
        has_object = bool(p.unlocks & physical)
        assert has_object == (p.fulfilment == PC.FULFIL_PHYSICAL), p.sku


def test_the_public_view_bills_in_cents_and_hides_nothing_else():
    view = PC.public_catalog()
    assert [v["sku"] for v in view] == [p.sku for p in PC.CATALOG]
    for v, p in zip(view, PC.CATALOG):
        assert v["price_cents"] == p.price_cents
        assert isinstance(v["price_cents"], int), "never bill from a float"
        assert set(v["unlocks"]) == p.unlocks
        assert v["blurb"] and v["name"]


def test_the_78_card_render_belongs_only_to_the_collector():
    # The single largest variable cost in the ladder ($2.34-$19.50 of image
    # generation per customer). If it ever appears on a cheaper tier that is a
    # margin decision, not a typo — this test makes it impossible to make by
    # accident.
    assert PC.unlocks("collector", PC.DECK_ART_FULL)
    assert not PC.unlocks("artifact", PC.DECK_ART_FULL)
    assert not PC.unlocks("digital", PC.DECK_ART_FULL)
