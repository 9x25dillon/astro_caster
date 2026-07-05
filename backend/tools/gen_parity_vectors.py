"""
gen_parity_vectors.py — golden vectors for ASTRA-CORE parity (MOBILE_ROADMAP §3).

Computes the backend's own ChartResponse for the repo's reference charts and
writes them, with the versioned tolerance contract, to parity/natal-chart.json.
The future TypeScript engine (@astra/core) must reproduce these within the
stated tolerances in CI; tests/test_parity_vectors.py pins the Python backend
to the same file so the two stacks drift-lock to each other symmetrically.

Usage (from backend/):
    .venv/bin/python tools/gen_parity_vectors.py           # (re)write the file
    .venv/bin/python tools/gen_parity_vectors.py --check   # exit 1 on drift
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import ephemeris as E  # noqa: E402
from models import ChartRequest  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
VECTOR_FILE = REPO_ROOT / "parity" / "natal-chart.json"

# The two reference charts every backend suite already leans on.
CASES: list[tuple[str, dict]] = [
    (
        # Public figure, public birth data — the suite's standard natal chart.
        "einstein-ulm-1879",
        dict(year=1879, month=3, day=14, hour=11, minute=30, second=0,
             lat=48.4011, lng=9.9876, tz_offset=0.67),
    ),
    (
        # Greenwich noon J2000 — anchored to independently-known positions
        # (test_chart.py checks the Sun at ~280.4° against the almanac).
        "greenwich-noon-j2000",
        dict(year=2000, month=1, day=1, hour=12, minute=0, second=0,
             lat=51.4769, lng=0.0, tz_offset=0.0),
    ),
]

# Tolerance contract (roadmap §3) — versioned WITH the vectors. A consumer
# compares circularly (359.99° vs 0.01° = 0.02°) for anything angle-valued.
TOLERANCES = {
    "planet.longitude_deg": 0.01,
    "planet.latitude_deg": 0.01,
    "planet.declination_deg": 0.01,
    "planet.speed_deg_per_day": 0.005,
    "house.cusp_deg": 0.02,
    "angle_deg": 0.02,
    "aspect.orb_deg": 0.01,
    "aspect.separation_deg": 0.01,
    # Everything else — signs, houses, retrograde flags, dignities, aspect
    # sets, pattern sets, element/modality tallies, meta.julian_day — is
    # arithmetic/categorical and must match exactly.
}


def _round_floats(obj, ndigits: int = 6):
    """Stable file diffs: full float repr churns; 6 dp ≈ 0.0036 arcsec."""
    if isinstance(obj, float):
        return round(obj, ndigits)
    if isinstance(obj, list):
        return [_round_floats(v, ndigits) for v in obj]
    if isinstance(obj, dict):
        return {k: _round_floats(v, ndigits) for k, v in obj.items()}
    return obj


def build_payload() -> dict:
    cases = []
    engine = None
    for case_id, req in CASES:
        chart = E.calculate_chart(ChartRequest(**req)).model_dump()
        engine = chart["meta"]["ephemeris"]
        cases.append({"id": case_id, "request": req, "expected": _round_floats(chart)})
    return {
        "schema": "astra-parity/natal-chart@1",
        "engine": engine,
        "tolerances": TOLERANCES,
        "cases": cases,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description="Generate ASTRA-CORE parity vectors")
    ap.add_argument("--check", action="store_true",
                    help="compare against the committed file; exit 1 on drift")
    args = ap.parse_args()

    payload = build_payload()
    text = json.dumps(payload, indent=1, sort_keys=True) + "\n"

    if args.check:
        if not VECTOR_FILE.exists():
            sys.exit(f"missing {VECTOR_FILE} — run without --check to create it")
        if VECTOR_FILE.read_text() != text:
            sys.exit(f"{VECTOR_FILE.relative_to(REPO_ROOT)} drifted from the "
                     "current backend output — regenerate (and investigate why)")
        print(f"ok: {VECTOR_FILE.relative_to(REPO_ROOT)} matches "
              f"({len(payload['cases'])} cases, engine={payload['engine']})")
        return

    VECTOR_FILE.parent.mkdir(parents=True, exist_ok=True)
    VECTOR_FILE.write_text(text)
    print(f"wrote {VECTOR_FILE.relative_to(REPO_ROOT)} "
          f"({len(payload['cases'])} cases, engine={payload['engine']})")


if __name__ == "__main__":
    main()
