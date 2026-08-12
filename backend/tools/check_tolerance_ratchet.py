#!/usr/bin/env python3
"""
check_tolerance_ratchet.py — Track A2: the ratchet on parity/tolerance.contract.json.

Tolerances that drift upward to make builds green are how a drift lock dies.
Widening is sometimes correct — an ephemeris upgrade legitimately moves things,
and pretending otherwise just teaches people to route around the check — but it
must be a decision somebody wrote down rather than a number somebody nudged.

So: any change that INCREASES a bound fails unless the same change adds an ADR
under docs/design/adr/. Tightening a bound is always allowed and never needs
paperwork, which is the asymmetry that makes this a ratchet rather than a lock.

Compares the working tree's contract against a base revision (default: the
merge-base with origin/main, so it reads a PR's whole effect rather than the
last commit's; on a push to main that merge-base is HEAD, so it falls through
to HEAD~1 rather than comparing the contract against itself).

A base that cannot be resolved at all is an ERROR, not a pass: "I could not
run the check" must never exit the same way as "there was nothing to check".

Usage (from backend/):
    .venv/bin/python tools/check_tolerance_ratchet.py
    .venv/bin/python tools/check_tolerance_ratchet.py --base origin/main
"""
from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path
from typing import Dict, Optional

_REPO = Path(__file__).resolve().parents[2]
_CONTRACT_REL = "parity/tolerance.contract.json"
_ADR_DIR_REL = "docs/design/adr"


def _git(*args: str) -> Optional[str]:
    try:
        out = subprocess.run(
            ["git", *args], cwd=str(_REPO), capture_output=True, text=True, check=True
        )
        return out.stdout
    except subprocess.CalledProcessError:
        return None


def _bounds(payload: dict) -> Dict[str, float]:
    return {
        name: spec["bound"]
        for name, spec in payload.get("quantities", {}).items()
        if "bound" in spec
    }


def _rev(spec: str) -> Optional[str]:
    """Resolve `spec` to a commit sha, or None if it names nothing."""
    out = _git("rev-parse", "--verify", "--quiet", f"{spec}^{{commit}}")
    return out.strip() if out and out.strip() else None


def _resolve_base(explicit: Optional[str]) -> tuple[Optional[str], str]:
    """(sha, how) for the revision to ratchet against.

    An explicit --base must resolve; a typo there is a broken invocation, not
    a licence to skip the check.

    Otherwise walk a chain. The merge-base with origin/main reads a PR's whole
    effect, which is the case this gate is really for. But on a push to main
    that merge-base IS HEAD, so the contract would be compared against itself
    and every direct commit to main would sail through unchecked — and this
    repo does push to main directly. Fall through to HEAD~1 there, so a commit
    that widens a bound is caught whichever way it arrived.
    """
    if explicit is not None:
        return _rev(explicit), f"--base {explicit}"

    head = _rev("HEAD")
    mb = _git("merge-base", "HEAD", "origin/main")
    for spec, how in (
        (mb.strip() if mb else None, "merge-base with origin/main"),
        ("origin/main", "origin/main"),
        ("HEAD~1", "HEAD~1 (direct commit to a mainline)"),
    ):
        if not spec:
            continue
        sha = _rev(spec)
        # A base equal to HEAD compares the contract against itself.
        if sha and sha != head:
            return sha, how
    return None, "no usable base"


def _base_contract(base: str) -> Optional[dict]:
    raw = _git("show", f"{base}:{_CONTRACT_REL}")
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def _adrs_added(base: str) -> list[str]:
    """ADRs present in the WORKING TREE that did not exist at `base`.

    Deliberately not `git diff --diff-filter=A`, which only sees files git
    already knows about. The contract itself is read from the working tree,
    so reading ADRs from the index instead would be asymmetric — and that
    asymmetry is a trap: you write the ADR the error message asked for, re-run,
    and the check still fails with the same message because the file is
    untracked. Comparing directory listings treats both sides the same way and
    works before `git add` as well as in CI.
    """
    at_base = set()
    raw = _git("ls-tree", "-r", "--name-only", base, "--", _ADR_DIR_REL)
    if raw:
        at_base = {ln.strip() for ln in raw.splitlines() if ln.strip()}
    here = {
        str(p.relative_to(_REPO))
        for p in (_REPO / _ADR_DIR_REL).glob("*.md")
    } if (_REPO / _ADR_DIR_REL).is_dir() else set()
    # README.md is the format guide, not a decision.
    return sorted(
        p for p in here - at_base
        if not p.endswith("/README.md")
    )


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--base", default=None,
                    help="revision to compare against (default: merge-base with "
                         "origin/main, then origin/main, then HEAD~1 — skipping "
                         "any that resolve to HEAD itself)")
    args = ap.parse_args()

    current = json.loads((_REPO / _CONTRACT_REL).read_text())

    base, how = _resolve_base(args.base)
    if base is None:
        # NOT the same as "the contract is new", and it must not exit the same
        # way. An unresolvable base means the comparison never happened; if
        # that returned 0 the gate would vanish in exactly the conditions that
        # break ref resolution (a shallow clone, a missing remote) while still
        # printing a reassuring line. Fail loudly instead.
        print(f"ratchet: ERROR — cannot resolve a base revision ({how}).")
        print("  The ratchet compares the working tree's contract against a base;")
        print("  with no base there is nothing to compare and no check was run.")
        print("  In CI this usually means a shallow clone — use fetch-depth: 0.")
        print("  Pass --base <rev> explicitly to say what to compare against.")
        return 1

    previous = _base_contract(base)
    if previous is None:
        # The base is real and simply has no contract yet: this change is the
        # one introducing the file. Genuinely nothing to ratchet against.
        print(f"ratchet: no contract at {base[:12]} ({how}) — "
              "first appearance, nothing to compare")
        return 0

    cur, prev = _bounds(current), _bounds(previous)
    widened: list[str] = []
    tightened: list[str] = []
    for name, bound in cur.items():
        if name not in prev:
            continue
        if bound > prev[name]:
            widened.append(
                f"{name}: {prev[name]} → {bound} "
                f"(+{(bound / prev[name] - 1) * 100:.1f}%)")
        elif bound < prev[name]:
            tightened.append(f"{name}: {prev[name]} → {bound}")

    removed = sorted(set(prev) - set(cur))

    for line in tightened:
        print(f"ratchet: tightened (always allowed) — {line}")
    if removed:
        # Removing a quantity removes its protection entirely, which is a
        # widening in every sense that matters.
        widened.extend(f"{name}: REMOVED from the contract" for name in removed)

    if not widened:
        print(f"ratchet: no bound widened against {base[:12]} — ok")
        return 0

    adrs = _adrs_added(base)
    print(f"\nratchet: {len(widened)} bound(s) widened against {base[:12]}:")
    for line in widened:
        print(f"    - {line}")

    if adrs:
        print("\nratchet: accompanied by a new ADR — allowed:")
        for a in adrs:
            print(f"    + {a}")
        return 0

    print(
        "\n✗ A widened tolerance needs an ADR.\n"
        "  A bound is the half-width of the band in which the two engines are\n"
        "  permitted to disagree about a CATEGORICAL decision — a sign, a\n"
        "  house, an aspect. Widening one excuses divergence that was a\n"
        "  defect yesterday, so it needs a reason on the record.\n\n"
        "  Add docs/design/adr/NNNN-<slug>.md saying what moved and why\n"
        "  (an ephemeris upgrade? a measured divergence? a wrong original\n"
        "  figure?), then re-run. If the engines are wrong rather than the\n"
        "  bound, fix the engines instead — that is the outcome this check\n"
        "  exists to make the easier one."
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
