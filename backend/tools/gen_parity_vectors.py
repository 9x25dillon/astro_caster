"""
gen_parity_vectors.py — golden vectors for ASTRA-CORE parity (MOBILE_ROADMAP §3).

Writes the backend's own deterministic output to parity/*.json so the
TypeScript engine (@astra/core) can reproduce it in CI, and so the Python
backend stays pinned to the same files (tests/test_parity_vectors.py) — the
two stacks drift-lock to each other symmetrically. Emitted files:
  • natal-chart.json  — ChartResponse for the reference charts (tolerance-based)
  • mt19937.json      — CPython random.Random sequences (the tarot RNG; exact)
  • tarot-draw.json   — natal signatures + weighted spread draws (exact)

Usage (from backend/):
    .venv/bin/python tools/gen_parity_vectors.py           # (re)write all files
    .venv/bin/python tools/gen_parity_vectors.py --check   # exit 1 on any drift
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import random
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import ephemeris as E  # noqa: E402
import tarot as TAROT  # noqa: E402
from models import ChartRequest  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
PARITY_DIR = REPO_ROOT / "parity"
VECTOR_FILE = PARITY_DIR / "natal-chart.json"
MT_FILE = PARITY_DIR / "mt19937.json"
TAROT_FILE = PARITY_DIR / "tarot-draw.json"

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


# --------------------------------------------------------------------------- #
# MT19937 — the tarot RNG. Reproducing CPython's random.Random bit-for-bit is
# the crux of the tarot port, so it gets its own exact vector independent of
# the tarot logic on top of it.
# --------------------------------------------------------------------------- #

MT_SEEDS = ["alpha", "The Fool|three_card", "12345", "", "☉ sun"]


def build_mt_payload() -> dict:
    cases = []
    for s in MT_SEEDS:
        digest = hashlib.sha256(s.encode("utf-8")).hexdigest()
        rng = random.Random(int(digest, 16))
        cases.append({
            "seed_text": s,
            "sha256": digest,
            # Full-precision floats; JSON round-trips IEEE-754 doubles exactly.
            "sequence": [rng.random() for _ in range(8)],
        })
    return {"schema": "astra-parity/mt19937@1", "cases": cases}


# --------------------------------------------------------------------------- #
# Tarot draws — signature + weighted spread, exact.
# --------------------------------------------------------------------------- #

TAROT_SPREADS = ["daily", "three_card", "elemental_balance", "planetary_seven",
                 "twelve_house", "relationship"]
TAROT_SEEDS = ["natal-seed-1", "2026-07-05|oracle"]

# @astra/core v0.1 computes Sun–Pluto, Asc, MC, Part of Fortune but not the
# lunar Node / Chiron / Lilith (astronomy-engine lacks them). So the tarot
# vector targets a chart restricted to that supported body set — the signature
# and draws it represents are exactly what the TS engine can reproduce. The
# backend drift-lock test applies the same restriction. Full-body tarot follows
# the WASM-Swiss escalation (roadmap §3); the chart vector still carries every
# body so the astronomical target never drifts.
SUPPORTED_BODIES = {
    "Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn",
    "Uranus", "Neptune", "Pluto", "Ascendant", "Midheaven", "Part of Fortune",
}


def _supported_chart(req: dict):
    chart = E.calculate_chart(ChartRequest(**req))
    chart.planets = [p for p in chart.planets if p.id in SUPPORTED_BODIES]
    return chart


def build_tarot_payload() -> dict:
    cases = []
    for case_id, req in CASES:
        chart = _supported_chart(req)
        sig = TAROT.build_natal_arcana_signature(chart)
        draws = []
        for spread in TAROT_SPREADS:
            for seed in TAROT_SEEDS:
                cards = TAROT.weighted_draw(sig, spread, seed)
                draws.append({
                    "spread": spread, "seed": seed,
                    "cards": [{"card": c, "reversed": rev, "position": pos}
                              for c, rev, pos in cards],
                })
        cases.append({
            "id": case_id,
            "request": req,
            "signature": {
                "suit_bias": sig.suit_bias,
                "major_weights": sig.major_weights,
                "dominant_element": sig.dominant_element,
                "dominant_modality": sig.dominant_modality,
            },
            "draws": draws,
        })
    return {"schema": "astra-parity/tarot-draw@1", "cases": cases}


def _render(payload: dict) -> str:
    return json.dumps(payload, indent=1, sort_keys=True) + "\n"


def main() -> None:
    ap = argparse.ArgumentParser(description="Generate ASTRA-CORE parity vectors")
    ap.add_argument("--check", action="store_true",
                    help="compare against the committed files; exit 1 on drift")
    args = ap.parse_args()

    targets = [
        (VECTOR_FILE, build_payload()),
        (MT_FILE, build_mt_payload()),
        (TAROT_FILE, build_tarot_payload()),
    ]

    if args.check:
        for path, payload in targets:
            rel = path.relative_to(REPO_ROOT)
            if not path.exists():
                sys.exit(f"missing {rel} — run without --check to create it")
            if path.read_text() != _render(payload):
                sys.exit(f"{rel} drifted from the current backend output — "
                         "regenerate (and investigate why)")
            print(f"ok: {rel} matches")
        return

    PARITY_DIR.mkdir(parents=True, exist_ok=True)
    for path, payload in targets:
        path.write_text(_render(payload))
        print(f"wrote {path.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
