#!/usr/bin/env python3
"""
parity_property.py — Track A1: stratified generative parity (Python ⇄ TypeScript).

The nine golden vectors are point samples; this harness draws a SEEDED,
stratified sample of chart inputs per run and asserts that the backend
(pyswisseph) and @astra/core (vendored WASM Swiss) agree on every case —
categorically where the output is categorical (sign, house, retrograde flag,
house-system fallback), numerically within the tolerance contract where it is
angular. The nine vectors stay as immutable regression anchors; this covers
the space between them, deliberately oversampling the hostile regions:

  • |lat| > 66.5° — Placidus/Koch degenerate; BOTH engines must fall back to
    whole-sign identically (meta.house_system compared as a hard invariant)
  • the near-polar band 60–66.5°, and the southern hemisphere
  • years 1800–2100, times within ±2 min of local midnight and of 12:00 UTC
    (the Julian-day rollover), fractional tz offsets including :15/:30/:45
  • retrograde stations: cases within ±48 h of a real station, where the
    speed's SIGN is the decision
  • both zodiacs, every supported house system

DST transitions are deliberately out of scope HERE: the deterministic engines
take tz_offset as a given number (no tz database on this path — see
models.ChartRequest); historical-zone resolution is frontend timezone.ts,
tested in its own suite.

Reproducibility: every case derives from --seed (CI passes the run id). A
failure prints the seed, the failing case, a SHRUNK minimal case, and the
one-line replay command. Failures exit 1.

Privacy: generated cases are echoed in full because this process invented
them — they describe nobody. A case supplied via --case is NOT echoed, and
the values in its divergence report are redacted, because the reason to reach
for --case is to reproduce one chart that misbehaved, i.e. precisely when the
input is a real person's birth moment. The prime directive ("no birth data in
any log line") has no carve-out for developer tools, and in CI stdout is a
retained log. Caught by CodeQL on PR #170, and it was right.

Usage (from backend/):
    .venv/bin/python tools/parity_property.py --n 2000 --seed 12345
    .venv/bin/python tools/parity_property.py --seed 12345 --index 137   # replay one
    .venv/bin/python tools/parity_property.py --case '{"year":2000,...}' # ad-hoc
"""
from __future__ import annotations

import argparse
import json
import os
import random
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Same discipline as gen_parity_vectors.py: pin BOTH stacks to the vendored
# seas-only ephemeris so the comparison is engine-vs-engine, never data-vs-data.
# Must run before the ephemeris import — flags resolve at import time.
_REPO = Path(__file__).resolve().parents[2]
_VENDORED_EPHE = str(_REPO / "packages" / "astra-core" / "src" / "vendor" / "swisseph")
os.environ["SE_EPHE_PATH"] = _VENDORED_EPHE

import swisseph as swe  # noqa: E402

import ephemeris as E  # noqa: E402
from models import ChartRequest  # noqa: E402

# ── The tolerance contract ──────────────────────────────────────────────────
# Stored in the golden vector file (parity/README.md: "the tolerances stored
# in the files remain the contractual outer bound"). Loaded, not restated.
_TOL = json.loads((_REPO / "parity" / "natal-chart.json").read_text())["tolerances"]
LON_TOL = _TOL["planet.longitude_deg"]
SPEED_TOL = _TOL["planet.speed_deg_per_day"]
CUSP_TOL = _TOL["house.cusp_deg"]
ANGLE_TOL = _TOL["angle_deg"]
# A categorical decision (sign/house) may only differ when the underlying
# angle sits within this margin of the boundary — that's A2's territory
# (decision-vs-float); here it keeps random sampling honest about float noise.
BOUNDARY = 2 * LON_TOL
# Aspect-set membership: each body contributes up to LON_TOL of orb noise.
ASPECT_EDGE = 4 * LON_TOL

MAX_ORB = {
    "Conjunction": 8.0, "Opposition": 8.0, "Trine": 7.0, "Square": 6.0,
    "Sextile": 5.0, "Quincunx": 3.0, "Semisextile": 2.0,
    "Sesquiquadrate": 2.0, "Semisquare": 2.0, "Quintile": 2.0,
}

HOUSE_SYSTEMS = ["P", "K", "O", "R", "C", "E", "W", "B"]
STATION_BODIES = [(2, "Mercury"), (3, "Venus"), (4, "Mars"), (5, "Jupiter"),
                  (6, "Saturn"), (7, "Uranus"), (8, "Neptune"), (9, "Pluto")]
# Quarter-hour offsets, -12:00 … +14:00 — includes the half/quarter-hour zones.
TZ_CHOICES = [x / 4 for x in range(-48, 57)]

YEAR_MIN, YEAR_MAX = 1800, 2100


# Divergence messages carry two kinds of information. The CONTINUOUS values —
# longitudes, Julian days, deltas, speeds — are derived from the birth moment
# and, given enough of them, invert back toward it; those are redacted when the
# input did not come from our own RNG. The CATEGORICAL structure — which body,
# which field, which cusp index — is what actually diagnoses a divergence and
# leaks no moment on its own, so it survives. A reviewer who thinks that line
# sits in the wrong place can move it here, in one function, rather than
# arguing with prose.
_FLOATY = re.compile(r"-?\d+\.\d+")
_PARENTHETICAL = re.compile(r"\s*\([^)]*\)")


def _redact(message: str) -> str:
    return _FLOATY.sub("<redacted>", _PARENTHETICAL.sub("", message))


def _circ(a: float, b: float) -> float:
    d = abs(a - b) % 360.0
    return min(d, 360.0 - d)


def _days_in_month(year: int, month: int) -> int:
    if month == 2:
        leap = year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)
        return 29 if leap else 28
    return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]


# ── The stratified generator ────────────────────────────────────────────────

def _station_near(rng: random.Random, jd_hint: float) -> Optional[float]:
    """JD of a station (speed zero-crossing) within ±120 d of jd_hint, or None.

    Uses the backend ephemeris to STEER sampling toward stations — steering
    only; the comparison downstream is still engine-vs-engine.
    """
    body, _name = rng.choice(STATION_BODIES)
    with E.swe_lock:
        def speed(jd: float) -> float:
            return swe.calc_ut(jd, body, swe.FLG_SPEED)[0][3]
        lo = jd_hint - 120.0
        prev = speed(lo)
        step = 1.0
        jd = lo + step
        while jd <= jd_hint + 120.0:
            cur = speed(jd)
            if prev == 0.0 or (prev < 0) != (cur < 0):
                a, b = jd - step, jd
                for _ in range(40):
                    mid = (a + b) / 2
                    if (speed(a) < 0) != (speed(mid) < 0):
                        b = mid
                    else:
                        a = mid
                return (a + b) / 2
            prev = cur
            jd += step
    return None


def gen_case(rng: random.Random) -> Dict[str, Any]:
    """One stratified ChartRequest dict. Deterministic per rng state."""
    strata: List[str] = []

    r = rng.random()
    if r < 0.25:
        lat = rng.uniform(66.5, 89.9) * rng.choice([1, -1])
        strata.append("polar")
    elif r < 0.40:
        lat = rng.uniform(60.0, 66.5) * rng.choice([1, -1])
        strata.append("near-polar")
    else:
        lat = rng.uniform(-60.0, 60.0)
    if lat < 0:
        strata.append("southern")

    lng = rng.uniform(-180.0, 180.0)
    tz = rng.choice(TZ_CHOICES)
    if tz % 1:
        strata.append("fractional-tz")

    year = rng.randint(YEAR_MIN, YEAR_MAX)
    month = rng.randint(1, 12)
    day = rng.randint(1, _days_in_month(year, month))
    hour, minute, second = rng.randint(0, 23), rng.randint(0, 59), rng.randint(0, 59)

    tr = rng.random()
    if tr < 0.12:
        # UTC time putting LOCAL time within ±2 min of midnight.
        local_min = rng.choice([1438, 1439, 0, 1, 2])
        utc_min = int((local_min - tz * 60) % 1440)
        hour, minute = divmod(utc_min, 60)
        strata.append("local-midnight")
    elif tr < 0.22:
        # Within ±2 min of 12:00 UTC — the Julian-day rollover.
        m = rng.choice([-2, -1, 0, 1, 2])
        hour, minute = divmod((12 * 60 + m) % 1440, 60)
        strata.append("jd-rollover")
    elif tr < 0.32:
        # Within ±48 h of a real retrograde station.
        jd_hint = swe.julday(year, month, day, 12.0, swe.GREG_CAL)
        jd_st = _station_near(rng, jd_hint)
        if jd_st is not None:
            jd_birth = jd_st + rng.uniform(-2.0, 2.0)
            y, mo, d, h = swe.revjul(jd_birth, swe.GREG_CAL)
            if YEAR_MIN <= y <= YEAR_MAX:
                year, month, day = y, mo, d
                hour = int(h)
                minute = int((h - hour) * 60)
                second = int((((h - hour) * 60) - minute) * 60)
                strata.append("station")

    zodiac = "sidereal" if rng.random() < 0.3 else "tropical"
    if zodiac == "sidereal":
        strata.append("sidereal")
    hs = rng.choice(HOUSE_SYSTEMS)

    return {
        "year": year, "month": month, "day": day,
        "hour": hour, "minute": minute, "second": second,
        "lat": round(lat, 4), "lng": round(lng, 4), "tz_offset": tz,
        "house_system": hs, "zodiac": zodiac,
        "_strata": strata,
    }


# ── The TS bridge ───────────────────────────────────────────────────────────

class Bridge:
    """One long-lived `tsx tools/case-bridge.mjs` process, line-per-case."""

    def __init__(self) -> None:
        self.proc = subprocess.Popen(
            ["npx", "tsx", "tools/case-bridge.mjs"],
            cwd=str(_REPO / "packages" / "astra-core"),
            stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, text=True,
        )
        ready = self.proc.stdout.readline().strip()
        if ready != "READY":
            raise RuntimeError(
                f"case-bridge failed to start: {ready!r}\n{self.proc.stderr.read()}"
            )

    def chart(self, case: Dict[str, Any]) -> Dict[str, Any]:
        req = {k: v for k, v in case.items() if not k.startswith("_")}
        self.proc.stdin.write(json.dumps(req) + "\n")
        self.proc.stdin.flush()
        line = self.proc.stdout.readline()
        if not line:
            raise RuntimeError(f"case-bridge died:\n{self.proc.stderr.read()}")
        return json.loads(line)

    def close(self) -> None:
        try:
            self.proc.stdin.close()
            self.proc.terminate()
        except Exception:
            pass


# ── The comparator ──────────────────────────────────────────────────────────

def _near_sign_edge(lon: float) -> bool:
    return min(lon % 30.0, 30.0 - (lon % 30.0)) <= BOUNDARY


def _near_any_cusp(lon: float, cusps: List[float]) -> bool:
    return any(_circ(lon, c) <= BOUNDARY for c in cusps)


def _aspect_key(a: Dict[str, Any]) -> str:
    return "|".join(sorted([a["p1"], a["p2"]]) + [a["type"]])


def compare(py: Dict[str, Any], ts: Dict[str, Any]) -> List[str]:
    """Return a list of divergence descriptions (empty = parity)."""
    fails: List[str] = []
    if "bridge_error" in ts:
        return [f"TS engine error: {ts['bridge_error'][:400]}"]

    # Time base.
    d_jd = abs(float(py["meta"]["julian_day"]) - float(ts["meta"]["julian_day"]))
    if d_jd > 1e-6:
        fails.append(f"julian_day Δ{d_jd:.9f}")

    # The polar fallback must be IDENTICAL — which system actually served.
    if py["meta"]["house_system"] != ts["meta"]["house_system"]:
        fails.append(
            "house-system fallback diverged: "
            f"py={py['meta']['house_system']} ts={ts['meta']['house_system']}"
        )

    py_p = {p["id"]: p for p in py["planets"]}
    ts_p = {p["id"]: p for p in ts["planets"]}
    if set(py_p) != set(ts_p):
        fails.append(f"body sets differ: only-py={sorted(set(py_p)-set(ts_p))} "
                     f"only-ts={sorted(set(ts_p)-set(py_p))}")

    strict_signs = True
    for pid in sorted(set(py_p) & set(ts_p)):
        a, b = py_p[pid], ts_p[pid]
        dl = _circ(a["longitude"], b["longitude"])
        if dl > LON_TOL:
            fails.append(f"{pid} lon Δ{dl:.6f} ({a['longitude']} vs {b['longitude']})")
        if abs(a["latitude"] - b["latitude"]) > _TOL["planet.latitude_deg"]:
            fails.append(f"{pid} lat Δ{abs(a['latitude']-b['latitude']):.6f}")
        if abs(a["declination"] - b["declination"]) > _TOL["planet.declination_deg"]:
            fails.append(f"{pid} decl Δ{abs(a['declination']-b['declination']):.6f}")
        if abs(a["speed"] - b["speed"]) > SPEED_TOL:
            fails.append(f"{pid} speed Δ{abs(a['speed']-b['speed']):.6f}")
        # Categorical: identical, unless the angle itself sits on the edge.
        if a["sign"] != b["sign"]:
            strict_signs = False
            if not (_near_sign_edge(a["longitude"]) or _near_sign_edge(b["longitude"])):
                fails.append(f"{pid} SIGN {a['sign']} vs {b['sign']} "
                             f"(lon {a['longitude']} / {b['longitude']})")
        elif a["dignity"] != b["dignity"] or a["element"] != b["element"] \
                or a["modality"] != b["modality"]:
            fails.append(f"{pid} sign-derived fields differ on same sign "
                         f"({a['dignity']}/{a['element']}/{a['modality']} vs "
                         f"{b['dignity']}/{b['element']}/{b['modality']})")
        if a["house"] != b["house"]:
            cusps = [h["longitude"] for h in py["houses"]]
            if not (_near_any_cusp(a["longitude"], cusps)
                    or _near_any_cusp(b["longitude"], cusps)):
                fails.append(f"{pid} HOUSE {a['house']} vs {b['house']} "
                             f"(lon {a['longitude']})")
        if a["retrograde"] != b["retrograde"]:
            # At a station the speed's sign IS the decision; only a speed
            # within noise of zero may flip it.
            if min(abs(a["speed"]), abs(b["speed"])) > 2 * SPEED_TOL:
                fails.append(f"{pid} RETROGRADE {a['retrograde']} vs {b['retrograde']} "
                             f"(speed {a['speed']} / {b['speed']})")

    # Cusps + angles.
    for i, (ha, hb) in enumerate(zip(py["houses"], ts["houses"])):
        d = _circ(ha["longitude"], hb["longitude"])
        if d > CUSP_TOL:
            fails.append(f"cusp {i+1} Δ{d:.6f}")
    for name in ("ascendant", "midheaven", "descendant", "imum_coeli"):
        d = _circ(py["angles"][name], ts["angles"][name])
        if d > ANGLE_TOL:
            fails.append(f"{name} Δ{d:.6f}")
    if py["angles"].get("vertex") is not None and ts["angles"].get("vertex") is not None:
        d = _circ(py["angles"]["vertex"], ts["angles"]["vertex"])
        if d > ANGLE_TOL:
            fails.append(f"vertex Δ{d:.6f}")

    # Aspect sets — one-sided members tolerated only AT the orb cutoff.
    pa = {_aspect_key(a): a for a in py["aspects"]}
    ta = {_aspect_key(a): a for a in ts["aspects"]}
    aspects_clean = True
    for k in set(pa) - set(ta):
        a = pa[k]
        aspects_clean = False
        if abs(a["orb"] - MAX_ORB[a["type"]]) > ASPECT_EDGE:
            fails.append(f"aspect only in py, not at edge: {k} orb={a['orb']}")
    for k in set(ta) - set(pa):
        a = ta[k]
        aspects_clean = False
        if abs(a["orb"] - MAX_ORB[a["type"]]) > ASPECT_EDGE:
            fails.append(f"aspect only in ts, not at edge: {k} orb={a['orb']}")
    for k in set(pa) & set(ta):
        if abs(pa[k]["orb"] - ta[k]["orb"]) > ASPECT_EDGE:
            fails.append(f"aspect orb Δ: {k} {pa[k]['orb']} vs {ta[k]['orb']}")

    # Patterns/tallies build on aspects/signs — compare only when the layer
    # beneath matched exactly (boundary flips cascade by construction).
    if aspects_clean:
        pk = {f"{p['type']}:{','.join(sorted(p['planets']))}" for p in py["patterns"]}
        tk = {f"{p['type']}:{','.join(sorted(p['planets']))}" for p in ts["patterns"]}
        if pk != tk:
            fails.append(f"patterns differ: only-py={sorted(pk-tk)} only-ts={sorted(tk-pk)}")
    if strict_signs and py["elements"] != ts["elements"]:
        fails.append(f"element tallies differ: {py['elements']} vs {ts['elements']}")
    if strict_signs and py["modalities"] != ts["modalities"]:
        fails.append(f"modality tallies differ: {py['modalities']} vs {ts['modalities']}")

    return fails


# ── Shrinking ───────────────────────────────────────────────────────────────

def _still_fails(case: Dict[str, Any], bridge: Bridge) -> bool:
    req = {k: v for k, v in case.items() if not k.startswith("_")}
    py = json.loads(E.calculate_chart(ChartRequest(**req)).model_dump_json())
    return bool(compare(py, bridge.chart(case)))


def shrink(case: Dict[str, Any], bridge: Bridge) -> Dict[str, Any]:
    """Greedy simplification: adopt any single-field simplification that
    still reproduces the divergence. Terminates: every step strictly
    simplifies a field toward its fixed point."""
    steps = [
        ("second", 0), ("minute", 0), ("hour", 12), ("tz_offset", 0.0),
        ("zodiac", "tropical"), ("house_system", "P"),
        ("lng", lambda v: float(round(v))), ("lng", 0.0),
        ("lat", lambda v: float(round(v))),
        ("day", 15), ("month", 6), ("year", 2000),
    ]
    current = dict(case)
    changed = True
    while changed:
        changed = False
        for field, target in steps:
            value = target(current[field]) if callable(target) else target
            if current[field] == value:
                continue
            candidate = {**current, field: value}
            try:
                if _still_fails(candidate, bridge):
                    current = candidate
                    changed = True
            except Exception:
                continue
    return current


# ── The run ─────────────────────────────────────────────────────────────────

def run(seed: int, n: int, only_index: Optional[int], ad_hoc: Optional[str]) -> int:
    bridge = Bridge()
    # Provenance of the cases about to run, and therefore what may be printed.
    # Generated == this process made the numbers up; supplied == they came from
    # outside and must be treated as somebody's birth moment. See the report
    # branch in the loop below.
    synthetic = ad_hoc is None
    try:
        if ad_hoc is not None:
            cases = [json.loads(ad_hoc)]
        else:
            rng = random.Random(seed)
            cases = [gen_case(rng) for _ in range(n)]
            if only_index is not None:
                cases = [cases[only_index]]

        strata_counts: Dict[str, int] = {}
        failures = 0
        for i, case in enumerate(cases):
            for s in case.get("_strata", []):
                strata_counts[s] = strata_counts.get(s, 0) + 1
            req = {k: v for k, v in case.items() if not k.startswith("_")}
            py = json.loads(E.calculate_chart(ChartRequest(**req)).model_dump_json())
            fails = compare(py, bridge.chart(case))
            if fails:
                failures += 1
                index = only_index if only_index is not None else i
                print(f"\n✗ case {index} (seed {seed}) diverged:")
                if synthetic:
                    # Safe to echo in full: every field came from the seeded
                    # RNG above, so the "birth data" here describes nobody.
                    for f in fails:
                        print(f"    - {f}")
                    print(f"  case:   {json.dumps(req)}")
                    minimal = shrink(case, bridge)
                    min_req = {k: v for k, v in minimal.items()
                               if not k.startswith("_")}
                    if min_req != req:
                        print(f"  shrunk: {json.dumps(min_req)}")
                    print(f"  replay: .venv/bin/python tools/parity_property.py "
                          f"--seed {seed} --index {index}")
                else:
                    # --case takes arbitrary JSON, and the reason anyone reaches
                    # for it is to reproduce ONE chart that misbehaved — i.e.
                    # precisely when the input is a real person's birth moment.
                    # Echoing it (or the positions derived from it, which are
                    # invertible back toward a birth moment) would put birth
                    # data in stdout, and in CI that is a retained log line.
                    # The prime directive has no carve-out for developer tools,
                    # and the caller already holds the input they just passed,
                    # so the echo buys nothing. Report WHICH quantities diverged,
                    # never their values.
                    for f in fails:
                        print(f"    - {_redact(f)}")
                    print("  case:   <supplied via --case; not echoed — see the "
                          "privacy note in this file's report path>")
                if failures >= 5:
                    print("\n(stopping after 5 divergent cases)")
                    break

        total = len(cases)
        print(f"\nparity_property: {total - failures}/{total} cases agree "
              f"(seed {seed})")
        if strata_counts and total > 1:
            print("strata:", ", ".join(
                f"{k}={v}" for k, v in sorted(strata_counts.items())))
        if failures and synthetic:
            print(f"\nSEED {seed} — replay any case above locally with the "
                  "printed command.")
        elif failures:
            # No replay line here on purpose: the only handle for a supplied
            # case is the case itself, which is exactly what is not echoed.
            print("\nThe supplied case diverged. You already hold the input; "
                  "re-run with the same --case to reproduce.")
        return 1 if failures else 0
    finally:
        bridge.close()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--n", type=int, default=2000, help="cases per run (CI: ≥2000)")
    ap.add_argument("--seed", type=int, default=None,
                    help="sample seed; CI passes the run id. Default: random.")
    ap.add_argument("--index", type=int, default=None,
                    help="replay exactly one generated case by index")
    ap.add_argument("--case", type=str, default=None,
                    help="ad-hoc ChartRequest JSON to compare once")
    args = ap.parse_args()
    seed = args.seed if args.seed is not None else random.SystemRandom().randint(0, 2**31)
    print(f"parity_property: seed={seed} n={args.n if args.case is None else 1} "
          f"ephe={_VENDORED_EPHE}")
    return run(seed, args.n, args.index, args.case)


if __name__ == "__main__":
    raise SystemExit(main())
