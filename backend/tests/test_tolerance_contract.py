"""
Track A2 — the tolerance contract's own integrity.

parity/tolerance.contract.json now states the bounds, and parity/*.json still
carry a `tolerances` block that the vector suites read. That is two places
holding the same numbers, which is one more than is safe: they will drift, and
the drift will be silent because each suite only reads its own copy.

These tests pin them together and enforce the contract's own record-keeping
rules, so a bound cannot be changed in one place alone and a new quantity
cannot arrive without its justification.
"""
import json
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

_PARITY = Path(__file__).resolve().parents[2] / "parity"
CONTRACT = json.loads((_PARITY / "tolerance.contract.json").read_text())
VECTORS = json.loads((_PARITY / "natal-chart.json").read_text())

REQUIRED = (
    "unit", "bound", "product_justification",
    "categorical_decisions_protected", "must_never_flip_outside_band",
)


def test_contract_is_versioned():
    assert CONTRACT["schema"] == "astra-parity/tolerance-contract@1"
    assert isinstance(CONTRACT["version"], int) and CONTRACT["version"] >= 1


@pytest.mark.parametrize("name", sorted(CONTRACT["quantities"]))
def test_every_quantity_states_what_it_protects(name):
    """A bound with no stated justification cannot be argued with, only
    obeyed or quietly changed — which is the failure this whole track is
    about."""
    spec = CONTRACT["quantities"][name]
    missing = [f for f in REQUIRED if f not in spec]
    assert not missing, f"{name} missing {missing}"
    assert isinstance(spec["bound"], (int, float)) and spec["bound"] > 0
    assert len(spec["product_justification"]) > 40, (
        f"{name}: justification is too short to be one — say what the number "
        "means for a reader of a chart, not just that it is small"
    )
    assert isinstance(spec["categorical_decisions_protected"], list)


def test_contract_matches_the_vector_tolerances():
    """The two copies of every shared bound must agree.

    If this fails, decide which is right and change BOTH — do not silence it
    by deleting a key. The vectors' block is what the golden-vector suites
    enforce; the contract is what the boundary suite enforces. They describe
    the same promise.
    """
    vector_tol = VECTORS["tolerances"]
    contract = {k: v["bound"] for k, v in CONTRACT["quantities"].items()}
    shared = set(vector_tol) & set(contract)
    assert shared, "the contract shares no quantity with the vectors — one of them is misnamed"
    mismatched = {
        k: (vector_tol[k], contract[k])
        for k in sorted(shared)
        if vector_tol[k] != contract[k]
    }
    assert not mismatched, (
        "contract and parity/natal-chart.json disagree "
        f"(vector, contract): {mismatched}"
    )


def test_every_vector_tolerance_is_in_the_contract():
    """A quantity the vectors bound but the contract does not is a bound with
    no owner: the ratchet cannot see it, so it can be widened freely."""
    unowned = sorted(set(VECTORS["tolerances"]) - set(CONTRACT["quantities"]))
    assert not unowned, (
        f"bounded by the vectors but absent from the contract: {unowned} — "
        "add an entry (with its justification) so the ratchet covers it"
    )


def test_not_applicable_entries_carry_a_reason():
    """The boundaries we deliberately do NOT cover are part of the contract
    too — an empty exclusion list would read as full coverage."""
    for key, reason in CONTRACT.get("not_applicable", {}).items():
        assert len(reason) > 60, (
            f"not_applicable.{key} needs a real reason, not a label"
        )
