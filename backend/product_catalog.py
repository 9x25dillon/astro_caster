"""
product_catalog.py
==================
The bespoke-commission ladder: what each package costs, and what it unlocks.

This is NOT the subscription ladder. `entitlements.py` owns access to the
observatory (free / supporter / oracle, recurring). This module owns the
one-time, high-value commissions described in `docs/design/MASTER_PIPELINE.md`
— a manuscript, a narration scored by the customer's own chart, a forged game
character, and at the upper tiers physical objects that ship.

Why a module and not a table in a doc: the tiers are checked in three places
(the offer surface, the checkout rail, and whatever fulfils the job), and three
transcriptions of one price is how a customer gets charged one number and shown
another.

Env override convention is `stripe_rail`'s, deliberately: the DEFAULT is the
intended price, never an old placeholder, so a deploy that forgets a variable
undercharges at worst and never charges more than was decided. `_f` tolerates
SET-BUT-EMPTY because compose passes optional vars as `${VAR:-}` — see
`stripe_rail._f` and `[[compose-env-passthrough-trap]]`.

NOTHING HERE CHARGES ANYONE. The catalog is data plus predicates; minting,
checkout and fulfilment live elsewhere and are deliberately not imported, so
this module stays safe to read from any surface.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Dict, FrozenSet, Optional, Tuple

# --------------------------------------------------------------------------- #
# Deliverables — the atoms a package unlocks.
#
# Each name is a THING THE CUSTOMER RECEIVES, not a subsystem that produces it.
# `sound_bed` is what they get; whether it renders in their browser or on the
# box is an implementation question the catalog must not encode (that decision
# is still open — MASTER_PIPELINE §7.2).
# --------------------------------------------------------------------------- #

MANUSCRIPT = "manuscript"            # the long-form Fable 5 synthesis
FORECAST_1Y = "forecast_1y"          # the 1-year transit progression
NARRATION = "narration"              # the manuscript, spoken (voice clone)
SOUND_BED = "sound_bed"              # the chart's own ambient score
MASTERED_AUDIO = "mastered_audio"    # narration blended over the bed
CHARACTER = "character"              # the forged Tap Blade build
DECK_ART_FULL = "deck_art_full"      # all 78 cards rendered
BOOK_PHYSICAL = "book_physical"      # the printed tome
POPUP_CHART = "popup_chart"          # the pop-up natal chart
DECK_PHYSICAL = "deck_physical"      # the printed, boxed 78-card deck

# Fulfilment classes. The distinction is not cosmetic: once an object has been
# manufactured or shipped, the refund window and the retention rules both
# change, and a caller needs to know which world it is in without parsing a
# list of deliverables.
FULFIL_NONE = "none"
FULFIL_PHYSICAL = "physical"


def _f(env: str, default: float) -> float:
    """Read a numeric env var, tolerating SET-BUT-EMPTY.

    `os.environ.get(k, default)` only falls back when the key is ABSENT; a key
    present with an empty value returns "" and float("") raises at import time,
    taking the whole app down. Same idiom, same reason, as `stripe_rail._f`.
    """
    raw = os.environ.get(env, "").strip()
    if not raw:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


@dataclass(frozen=True)
class Package:
    sku: str
    name: str
    blurb: str
    fulfilment: str
    unlocks: FrozenSet[str]
    _price_env: str
    _price_default: float

    @property
    def price_cents(self) -> int:
        return int(round(_f(self._price_env, self._price_default) * 100))

    @property
    def price_usd(self) -> float:
        return self.price_cents / 100

    def includes(self, deliverable: str) -> bool:
        return deliverable in self.unlocks

    def public(self) -> dict:
        """The offer surface's view. Prices as CENTS — a float that has been
        through JSON is not a thing to bill from."""
        return {
            "sku": self.sku,
            "name": self.name,
            "blurb": self.blurb,
            "price_cents": self.price_cents,
            "fulfilment": self.fulfilment,
            "unlocks": sorted(self.unlocks),
        }


_DIGITAL = frozenset({
    MANUSCRIPT, FORECAST_1Y, NARRATION, SOUND_BED, MASTERED_AUDIO, CHARACTER,
})
_ARTIFACT = _DIGITAL | {BOOK_PHYSICAL, POPUP_CHART}
_COLLECTOR = _ARTIFACT | {DECK_ART_FULL, DECK_PHYSICAL}

# The ladder. ORDERED cheapest-first, and every rung is a SUPERSET of the one
# below it — `test_product_catalog` asserts that containment, so a tier can
# never quietly come to offer less than a cheaper one.
CATALOG: Tuple[Package, ...] = (
    Package(
        sku="digital",
        name="The Digital Grimoire",
        blurb="Your manuscript and year ahead, narrated over the score your "
              "own chart makes, with your forged character.",
        fulfilment=FULFIL_NONE,
        unlocks=_DIGITAL,
        _price_env="AAE_PKG_DIGITAL_USD",
        _price_default=175.0,
    ),
    Package(
        sku="artifact",
        name="The Complete Artifact",
        blurb="The Digital Grimoire, plus the printed tome and a pop-up chart "
              "of your sky.",
        fulfilment=FULFIL_PHYSICAL,
        unlocks=_ARTIFACT,
        _price_env="AAE_PKG_ARTIFACT_USD",
        _price_default=625.0,
    ),
    Package(
        sku="collector",
        name="The Collector's Grimoire",
        blurb="Everything, plus all 78 cards rendered in your own art and "
              "printed as a boxed deck.",
        fulfilment=FULFIL_PHYSICAL,
        unlocks=_COLLECTOR,
        _price_env="AAE_PKG_COLLECTOR_USD",
        _price_default=1200.0,
    ),
)

_BY_SKU: Dict[str, Package] = {p.sku: p for p in CATALOG}


def get(sku: str) -> Optional[Package]:
    """The package, or None. Callers that must have one use `require`."""
    return _BY_SKU.get(sku)


def require(sku: str) -> Package:
    """The package, or ValueError. Use at a boundary where an unknown sku is a
    programming error rather than user input."""
    pkg = _BY_SKU.get(sku)
    if pkg is None:
        raise ValueError(f"no package with sku {sku!r}")
    return pkg


def unlocks(sku: str, deliverable: str) -> bool:
    """Does this package include this deliverable? An unknown sku unlocks
    NOTHING — fail closed, the same posture every entitlement check here takes.
    """
    pkg = _BY_SKU.get(sku)
    return bool(pkg and pkg.includes(deliverable))


def public_catalog() -> list:
    """The whole ladder, cheapest first, for an offer surface."""
    return [p.public() for p in CATALOG]
