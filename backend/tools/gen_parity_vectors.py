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

# Vectors are generated against the VENDORED seas-only ephemeris dir — the
# exact configuration the on-device TS engine ships (Chiron from seas_18.se1,
# everything else Moshier fallback). The file is committed, so `--check`
# reproduces byte-identically in CI regardless of whether backend/ephe (the
# full production file set, gitignored) is present. Must run before the
# ephemeris import — flags are resolved at import time.
_VENDORED_EPHE = str(Path(__file__).resolve().parents[2]
                     / "packages" / "astra-core" / "src" / "vendor" / "swisseph")
os.environ["SE_EPHE_PATH"] = _VENDORED_EPHE

import ephemeris as E  # noqa: E402
import tarot as TAROT  # noqa: E402
from models import ChartRequest  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
PARITY_DIR = REPO_ROOT / "parity"
VECTOR_FILE = PARITY_DIR / "natal-chart.json"
MT_FILE = PARITY_DIR / "mt19937.json"
TAROT_FILE = PARITY_DIR / "tarot-draw.json"
READING_FILE = PARITY_DIR / "tarot-reading.json"
FORECAST_FILE = PARITY_DIR / "forecast.json"
SYNASTRY_FILE = PARITY_DIR / "synastry.json"
PREDICTIVE_FILE = PARITY_DIR / "predictive.json"
ADVANCED_FILE = PARITY_DIR / "advanced.json"

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
    # The chart vector additionally carries a SIDEREAL case (Lahiri, the UI's
    # ayanamsha) — @astra/core derives it from the wasm's Fagan/Bradley mode
    # plus a J2000-calibrated shift, so the vector locks that arithmetic.
    chart_cases = CASES + [(
        "einstein-ulm-1879-sidereal-lahiri",
        dict(CASES[0][1], zodiac="sidereal", ayanamsha=1),
    )]
    cases = []
    engine = None
    for case_id, req in chart_cases:
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

# @astra/core computes the FULL backend body set: Sun–Pluto via
# astronomy-engine, plus North/South Node, Chiron and Lilith via the vendored
# WASM Swiss Ephemeris (the roadmap-§3 escalation, landed 2026-07-08). The
# supported set therefore equals the backend's — the restriction machinery is
# kept so any future body addition starts restricted until its TS engine lands.
SUPPORTED_BODIES = {
    "Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn",
    "Uranus", "Neptune", "Pluto", "North Node", "South Node", "Chiron",
    "Lilith", "Ascendant", "Midheaven", "Part of Fortune",
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


# --------------------------------------------------------------------------- #
# Forecast — transit scan + stations, tolerance-based (event identity + ≤1-day
# date window; astronomy-engine vs pyswisseph nudge near-midnight stations and
# flat-minimum aspects by a day). Restricted to Sun–Pluto so it matches
# @astra/core v0.1 (no Chiron / lunar Node).
# --------------------------------------------------------------------------- #

import datetime as _dt  # noqa: E402
import forecast as FC  # noqa: E402

FORECAST_START = "2026-01-01"
FORECAST_DAYS = 60
FORECAST_MIN_SIG = "medium"
# Mirrors main.py's production natal map (all chart planets minus
# _NATAL_EXCLUDE = Descendant/IC/South Node/PoF/Vertex/Lilith).
NATAL_TARGETS = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter",
                 "Saturn", "Uranus", "Neptune", "Pluto", "North Node",
                 "Chiron", "Ascendant", "Midheaven"]
# Full backend mover list — Chiron and the true Node now ride the WASM Swiss
# engine on the TS side.
_SUPPORTED_TRANSITS = list(FC._TRANSIT_BODIES)


def _natal_map(req: dict) -> dict:
    chart = E.calculate_chart(ChartRequest(**req))
    idx = {p.id: p.longitude for p in chart.planets}
    return {name: idx[name] for name in NATAL_TARGETS if name in idx}


def build_forecast_payload() -> dict:
    # Run the backend scanner over the supported transit set only, so the
    # vector is exactly what @astra/core v0.1 can reproduce.
    saved = FC._TRANSIT_BODIES
    FC._TRANSIT_BODIES = _SUPPORTED_TRANSITS
    try:
        cases = []
        start = _dt.date.fromisoformat(FORECAST_START)
        for case_id, req in CASES:
            natal = _natal_map(req)
            events = FC.generate_forecast(natal, start, days=FORECAST_DAYS,
                                          min_sig=FORECAST_MIN_SIG)
            # Keep the structural fields the TS engine reproduces (prose omitted).
            slim = [{
                "date": e["date"], "type": e["type"], "planet": e["planet"],
                "aspect": e.get("aspect"), "target": e.get("target"),
                "orb": e.get("orb"), "significance": e["significance"],
                "direction": e.get("direction"),
            } for e in events]
            cases.append({
                "id": case_id, "request": req, "natal": natal,
                "start": FORECAST_START, "days": FORECAST_DAYS,
                "min_sig": FORECAST_MIN_SIG, "events": slim,
            })
        return {"schema": "astra-parity/forecast@1",
                "date_tolerance_days": 0, "orb_tolerance_deg": 1e-6,
                "cases": cases}
    finally:
        FC._TRANSIT_BODIES = saved


# --------------------------------------------------------------------------- #
# Offline tarot reading — proves the on-device reading matches the backend's
# OFFLINE build_reading_core (seed string + dealt cards + per-card meaning).
# Uses the FULL chart (all bodies), which the browser reproduces when fed a
# cached full chart. Exact.
# --------------------------------------------------------------------------- #

from tarot_models import TarotReadingRequest  # noqa: E402

READING_CASES = [
    ("three_card", "what should I focus on", None, "golden_dawn"),
    ("daily", "guidance for today", "2026-07-05", "golden_dawn"),
    ("relationship", "where is this bond going", None, "thoth"),
]


def _slim_chart(chart) -> dict:
    return {
        "planets": [{"id": p.id, "longitude": p.longitude, "sign": p.sign,
                     "house": p.house, "element": p.element, "modality": p.modality}
                    for p in chart.planets],
        "elements": chart.elements,
        "modalities": chart.modalities,
    }


def build_reading_payload() -> dict:
    cases = []
    for case_id, req in CASES:
        chart = E.calculate_chart(ChartRequest(**req))
        sig = TAROT.build_natal_arcana_signature(chart)
        signature = {
            "links": [{"body": l.body, "card_id": l.card.id, "note": l.note}
                      for l in sig.links],
            "themes": list(sig.themes),
            "shadows": list(sig.shadows),
            "dominant_element": sig.dominant_element,
            "dominant_modality": sig.dominant_modality,
        }
        readings = []
        for spread, question, date, source in READING_CASES:
            r = TAROT.build_reading_core(TarotReadingRequest(
                chart=chart, spread=spread, question=question, date=date,
                source=source, include_activities=False, include_lessons=False))
            readings.append({
                "spread": spread, "question": question, "date": date, "source": source,
                "seed": r.seed,
                "cards": [{"card": c.card.id, "reversed": c.reversed,
                           "position": c.position, "meaning": c.meaning}
                          for c in r.cards],
            })
        cases.append({"id": case_id, "chart": _slim_chart(chart),
                      "signature": signature, "readings": readings})
    return {"schema": "astra-parity/tarot-reading@1", "cases": cases}


# --------------------------------------------------------------------------- #
# Relational — synastry inter-aspects + grid, composite (midpoint), Davison, and
# the synastry-tarot bond (MOBILE_ROADMAP §3.4). Restricted to the supported
# body set so it's exactly what @astra/core reproduces. Positions are
# tolerance-based (shared TOLERANCES); the grid + tarot spread are categorical
# and match exactly.
# --------------------------------------------------------------------------- #

import synastry as SYN  # noqa: E402
from models import ChartRequest as _CR  # noqa: E402

# Person A × Person B for the relational vector (the two reference charts).
SYN_PAIR = (CASES[0], CASES[1])


def _chart_dump(obj) -> dict:
    return obj.model_dump()


def build_synastry_payload() -> dict:
    (id_a, req_a), (id_b, req_b) = SYN_PAIR
    chart_a = _supported_chart(req_a)
    chart_b = _supported_chart(req_b)

    inter = SYN.synastry_aspects(chart_a, chart_b)
    grid = SYN.synastry_grid(chart_a, chart_b)
    composite = SYN.composite_midpoints(chart_a, chart_b, house_method="midpoint")

    # Davison recomputes a fresh chart (all bodies); restrict planets to the
    # supported set and recompute aspects among them so it matches @astra/core,
    # whose davisonChart only ever computes the supported bodies.
    davison = SYN.davison_chart(_CR(**req_a), _CR(**req_b))
    davison.planets = [p for p in davison.planets if p.id in SUPPORTED_BODIES]
    davison.aspects = E.calculate_aspects(davison.planets)

    tarot = SYN.synastry_tarot(chart_a, chart_b)

    payload = {
        "schema": "astra-parity/synastry@1",
        "engine": chart_a.meta["ephemeris"],
        "tolerances": TOLERANCES,
        "pair": {"a": {"id": id_a, "request": req_a},
                 "b": {"id": id_b, "request": req_b}},
        "inter_aspects": [a.model_dump() for a in inter],
        "grid": grid.model_dump(),
        "composite": _chart_dump(composite),
        "davison": _chart_dump(davison),
        "synastry_tarot": tarot.spread.model_dump(),
    }
    return _round_floats(payload)


# --------------------------------------------------------------------------- #
# Predictive — secondary progressions + solar return (MOBILE_ROADMAP §3.4).
# Restricted to the supported body set; positions tolerance-based. Eclipses are
# NOT vectored (Swiss eclipse-search is the deferred hard-20%).
# --------------------------------------------------------------------------- #

import predictive as PRED  # noqa: E402

PROG_TARGET_ISO = "2026-01-01T00:00:00+00:00"
SOLAR_RETURN_YEAR = 2026
ECLIPSE_START_ISO = "2026-01-01T00:00:00+00:00"
ECLIPSE_COUNT = 8


def _restrict_planets(planets):
    return [p for p in planets if p.id in SUPPORTED_BODIES]


def build_predictive_payload() -> dict:
    cases = []
    for case_id, req in CASES:
        cr = _CR(**req)
        natal_chart = E.calculate_chart(cr)
        natal_supported = _restrict_planets(natal_chart.planets)

        prog = PRED.progressed_chart(cr, PROG_TARGET_ISO)
        prog_planets = _restrict_planets(prog.planets)
        # Recompute progressed→natal aspects on the supported set (both sides),
        # so the vector is exactly what @astra/core reproduces.
        prog_aspects = E.aspects_between(natal_supported, prog_planets)

        sr = PRED.solar_return(cr, SOLAR_RETURN_YEAR)
        sr_planets = _restrict_planets(sr.planets)
        sr_aspects = E.calculate_aspects(sr_planets)

        cases.append({
            "id": case_id,
            "request": req,
            "progressed": {
                "target_iso": PROG_TARGET_ISO,
                "age_years": prog.age_years,
                "progressed_iso": prog.progressed_iso,
                "planets": [p.model_dump() for p in prog_planets],
                "aspects_to_natal": [a.model_dump() for a in prog_aspects],
            },
            "solar_return": {
                "year": SOLAR_RETURN_YEAR,
                "return_iso": sr.return_iso,
                "planets": [p.model_dump() for p in sr_planets],
                "houses": [h.model_dump() for h in sr.houses],
                "angles": sr.angles.model_dump(),
                "aspects": [a.model_dump() for a in sr_aspects],
                "elements": sr.elements,
                "modalities": sr.modalities,
            },
            "eclipses": {
                "start_iso": ECLIPSE_START_ISO,
                "count": ECLIPSE_COUNT,
                "events": [e.model_dump() for e in
                           PRED.eclipse_timeline(cr, ECLIPSE_START_ISO, ECLIPSE_COUNT).eclipses],
            },
        })
    payload = {
        "schema": "astra-parity/predictive@1",
        "engine": E.calculate_chart(_CR(**CASES[0][1])).meta["ephemeris"],
        "tolerances": TOLERANCES,
        "cases": cases,
    }
    return _round_floats(payload)


# --------------------------------------------------------------------------- #
# Advanced — harmonics, midpoint trees, fixed stars (MOBILE_ROADMAP §3.4). Pure
# arithmetic on natal positions; harmonic longitudes amplify the cross-engine
# position error ×N, so the consumer scales the tolerance accordingly.
# --------------------------------------------------------------------------- #

import advanced as ADV  # noqa: E402

HARMONIC_N = 5
MIDPOINT_ORB = 1.0
FIXED_STAR_ORB = 1.5


def build_advanced_payload() -> dict:
    cases = []
    for case_id, req in CASES:
        cr = _CR(**req)
        # Restrict the base chart to the supported body set before the technique
        # runs, so every derived position is one @astra/core reproduces.
        harm = ADV.harmonic_chart(cr, HARMONIC_N)
        harm.positions = [p for p in harm.positions if p.id in SUPPORTED_BODIES]
        harm.aspects = [a for a in harm.aspects
                        if a["p1"] in SUPPORTED_BODIES and a["p2"] in SUPPORTED_BODIES]

        tree = ADV.midpoint_tree(cr, MIDPOINT_ORB)
        # Keep entries whose pair + contacts are all supported bodies.
        tree_entries = []
        for e in tree.entries:
            a_id, b_id = e.pair.split("/")
            if a_id not in SUPPORTED_BODIES or b_id not in SUPPORTED_BODIES:
                continue
            contacts = [c for c in e.contacts if c.body in SUPPORTED_BODIES]
            if contacts:
                d = e.model_dump()
                d["contacts"] = [c.model_dump() for c in contacts]
                tree_entries.append(d)

        stars = ADV.fixed_star_hits(cr, FIXED_STAR_ORB)
        star_hits = [h.model_dump() for h in stars.hits if h.natal_body in SUPPORTED_BODIES]

        cases.append({
            "id": case_id,
            "request": req,
            "harmonic": {
                "n": HARMONIC_N,
                "positions": [p.model_dump() for p in harm.positions],
                "aspects": harm.aspects,
            },
            "midpoint_tree": {"orb": MIDPOINT_ORB, "entries": tree_entries},
            "fixed_stars": {"orb": FIXED_STAR_ORB, "hits": star_hits},
        })
    payload = {
        "schema": "astra-parity/advanced@1",
        "engine": E.calculate_chart(_CR(**CASES[0][1])).meta["ephemeris"],
        "tolerances": TOLERANCES,
        "cases": cases,
    }
    return _round_floats(payload)


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
        (FORECAST_FILE, build_forecast_payload()),
        (READING_FILE, build_reading_payload()),
        (SYNASTRY_FILE, build_synastry_payload()),
        (PREDICTIVE_FILE, build_predictive_payload()),
        (ADVANCED_FILE, build_advanced_payload()),
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
