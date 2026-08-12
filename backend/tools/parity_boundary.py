#!/usr/bin/env python3
"""
parity_boundary.py — Track A2: assert the DECISION, not the float.

Arcsecond tolerance is the wrong unit for a product whose output is
categorical. Two engines agreeing to 0.5" can still disagree about which house
a planet occupies, and the reader never sees the 0.5" — they see a reading
that says Mars is in the 7th when the other engine says the 6th.

So this suite does not sample randomly and hope to land near a boundary (that
is A1's job, and random sampling essentially never lands within a hair of a
cusp). It CONSTRUCTS the hostile case: for each categorical boundary it
root-finds the exact instant a real body sits at a chosen distance from it,
then asserts the two engines classify it the same way.

  sign          — root-find the instant a body's longitude is k·30° + d
  house cusp    — root-find the instant a body sits d from a moving cusp
  aspect orb    — root-find the instant a pair's orb is (cutoff + d)
  retrograde    — root-find the instant a body's speed is d (station ± d)

What is asserted, and why it is not "they must always agree"
------------------------------------------------------------
Two distinct implementations CANNOT agree about a value sitting exactly on a
boundary: at 30.000000° one engine returns 29.999999° (Aries) and the other
30.000001° (Taurus), and neither is wrong. Demanding identity there yields a
permanently flaky suite, and a flaky suite gets muted — which is how a drift
lock dies (this repo has the scar: a deliberately-red test sat red for weeks
and hid a genuinely broken build).

The contract in parity/tolerance.contract.json instead states, per quantity,
the HALF-WIDTH of the band in which disagreement is excused. This suite
asserts the two things that are actually true:

  1. OUTSIDE the band, the classification must be IDENTICAL across engines.
     A disagreement there is a defect, and that is where the teeth are: an
     injected 1-arcminute bias is 0.0167°, comfortably outside the 0.01°
     longitude band, so it produces disagreements this suite must catch.
  2. INSIDE the band, disagreement is permitted but COUNTED and reported —
     so a sudden rise in band-edge disagreement is visible rather than silent.
  3. Each engine must be SELF-CONSISTENT: its own reported sign/house must
     match its own reported longitude. This catches a classification bug that
     both engines could share, which no cross-engine comparison ever can.

Usage (from backend/):
    .venv/bin/python tools/parity_boundary.py
    .venv/bin/python tools/parity_boundary.py --kind sign --verbose
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

_REPO = Path(__file__).resolve().parents[2]
_VENDORED_EPHE = str(_REPO / "packages" / "astra-core" / "src" / "vendor" / "swisseph")
os.environ["SE_EPHE_PATH"] = _VENDORED_EPHE

import swisseph as swe  # noqa: E402

import astrology as A  # noqa: E402
import ephemeris as E  # noqa: E402
from models import ChartRequest  # noqa: E402

# The bridge is A1's; reused rather than reimplemented so both suites are
# comparing against the same TS process semantics.
from parity_property import Bridge  # noqa: E402

CONTRACT = json.loads((_REPO / "parity" / "tolerance.contract.json").read_text())
Q = CONTRACT["quantities"]
LON_BAND = Q["planet.longitude_deg"]["bound"]
CUSP_BAND = Q["house.cusp_deg"]["bound"]
ORB_BAND = Q["aspect.orb_deg"]["bound"]
SPEED_BAND = Q["planet.speed_deg_per_day"]["bound"]

SIGNS = A.SIGNS
SWE_ID = {
    "Sun": 0, "Moon": 1, "Mercury": 2, "Venus": 3, "Mars": 4,
    "Jupiter": 5, "Saturn": 6, "Uranus": 7, "Neptune": 8, "Pluto": 9,
}

# A fixed observing site for every constructed case. Mid-latitude and
# unremarkable on purpose: the point of these cases is the boundary, not the
# geography, and A1 already sweeps latitude hard.
SITE = {"lat": 51.4779, "lng": 0.0, "tz_offset": 0.0}

# Distances from the boundary to probe, as multiples of the band. The signed
# pairs matter: a classifier that is wrong on only one side (a >= that should
# be a >) shows up as an asymmetry.
#
# The multiples JUST above 1.0 are what give this suite its sensitivity, and
# they were added after the falsification self-test failed. A probe sitting d
# from a boundary only flips under an engine bias b when b > d, so the suite
# can only detect a bias larger than its smallest distance OUTSIDE the excused
# band. With multiples jumping 1.0 → 2.0 that floor was 0.02°, above the
# 0.0167° (one arcminute) the acceptance criterion demands, and the suite
# passed clean while an engine was visibly wrong. 1.1 puts the floor at
# 0.011°, just above the band, so any bias the contract does not already
# excuse is caught.
BAND_MULTIPLES = [0.0, 0.5, 1.0, 1.1, 1.5, 2.0, 10.0, 100.0]


def _signed_delta(a: float, b: float) -> float:
    """a - b wrapped into (-180, 180]."""
    d = (a - b + 180.0) % 360.0 - 180.0
    return d


def _jd_to_request(jd: float, **extra: Any) -> Dict[str, Any]:
    """Civil ChartRequest fields for a Julian Day (UT), tz 0 so local == UTC.

    ChartRequest carries integer seconds, so the instant is quantised on the
    way in. That is deliberate: the case must be expressible as something a
    user could actually enter. The resulting offset from the boundary is
    therefore MEASURED after the fact rather than assumed — see probe().
    """
    y, mo, d, hour_f = swe.revjul(jd, swe.GREG_CAL)
    total = round(hour_f * 3600.0)
    total = max(0, min(86399, total))
    h, rem = divmod(total, 3600)
    mi, s = divmod(rem, 60)
    return {
        "year": int(y), "month": int(mo), "day": int(d),
        "hour": int(h), "minute": int(mi), "second": int(s),
        **SITE, **extra,
    }


def _bisect(f: Callable[[float], float], lo: float, hi: float,
            iters: int = 60) -> Optional[float]:
    """Root of a continuous f on [lo, hi], or None if it does not bracket."""
    flo, fhi = f(lo), f(hi)
    if flo == 0.0:
        return lo
    if (flo < 0) == (fhi < 0):
        return None
    for _ in range(iters):
        mid = (lo + hi) / 2.0
        fmid = f(mid)
        if fmid == 0.0:
            return mid
        if (flo < 0) != (fmid < 0):
            hi = mid
        else:
            lo, flo = mid, fmid
    return (lo + hi) / 2.0


def _scan_root(f: Callable[[float], float], start: float, end: float,
               step: float) -> Optional[float]:
    """First root of f in [start, end], found by stepping then bisecting."""
    prev_x, prev = start, f(start)
    x = start + step
    while x <= end:
        cur = f(x)
        if (prev < 0) != (cur < 0):
            return _bisect(f, prev_x, x)
        prev_x, prev = x, cur
        x += step
    return None


def _lon(jd: float, body: str) -> float:
    with E.swe_lock:
        return A.norm360(swe.calc_ut(jd, SWE_ID[body], swe.FLG_SPEED)[0][0])


def _speed(jd: float, body: str) -> float:
    with E.swe_lock:
        return swe.calc_ut(jd, SWE_ID[body], swe.FLG_SPEED)[0][3]


# --------------------------------------------------------------------------- #
# The probe: one constructed case, both engines, one categorical question
# --------------------------------------------------------------------------- #

class Probe:
    """A single boundary case and the verdict on it."""

    def __init__(self, kind: str, label: str, req: Dict[str, Any],
                 distance: float, band: float) -> None:
        self.kind = kind
        self.label = label
        self.req = req
        self.distance = distance      # MEASURED distance from the boundary
        self.band = band
        self.outside = abs(distance) > band

    def __repr__(self) -> str:  # pragma: no cover - diagnostics only
        return f"<{self.kind} {self.label} d={self.distance:+.6f}>"


def _sign_of(lon: float) -> str:
    return SIGNS[int(A.norm360(lon) // 30) % 12]


def _landed(target: float, achieved: float, band: float) -> bool:
    """Did the probe land where it was aimed?

    Root-finding across a wrapped angular quantity can converge onto a
    DISCONTINUITY instead of a root — the first version of this file searched
    for "signed distance to the nearest 30° multiple", which jumps from +15°
    to −15° at every sign midpoint, and the bisector duly converged on those
    jumps. The probes reported healthy counts while sitting fifteen degrees
    from any boundary, so the suite tested nothing and said so in green.

    A probe that missed its mark is DISCARDED rather than kept-and-measured.
    Keeping it is what turns a broken generator into a silent one.
    """
    return abs(achieved - target) <= max(band, 1e-6)


def build_sign_probes() -> List[Probe]:
    """Bodies placed at measured distances from a 30° sign boundary.

    Targets one SPECIFIC boundary at a time (lon = B + d, continuous through
    the crossing) rather than "the nearest boundary", which is not.
    """
    probes: List[Probe] = []
    rejected = 0
    # One fast body and one slow: the fast body quantises coarsely in time
    # (the Moon moves 0.0075° per second of clock), the slow body finely, so
    # the pair exercises both ends of the achievable precision.
    for body, span_days, step in (("Moon", 40.0, 0.05), ("Sun", 400.0, 0.5)):
        base = swe.julday(2000, 1, 1, 0.0, swe.GREG_CAL)
        for mult in BAND_MULTIPLES:
            for sgn in (+1, -1):
                if mult == 0.0 and sgn < 0:
                    continue
                target_d = sgn * mult * LON_BAND
                placed = False
                for k in range(12):
                    boundary = 30.0 * k
                    aim = A.norm360(boundary + target_d)

                    def f(jd: float, a: float = aim) -> float:
                        return _signed_delta(_lon(jd, body), a)
                    jd = _scan_root(f, base, base + span_days, step)
                    if jd is None:
                        continue
                    req = _jd_to_request(jd)
                    actual_jd = E._julian_day_utc(ChartRequest(**req))
                    d = _signed_delta(_lon(actual_jd, body), boundary)
                    if not _landed(target_d, d, LON_BAND):
                        rejected += 1
                        continue
                    probes.append(Probe("sign", f"{body}@{boundary:.0f}°",
                                        req, d, LON_BAND))
                    placed = True
                    break
                if not placed:
                    rejected += 1
    if rejected:
        print(f"  (sign: {rejected} aim(s) discarded as off-target)")
    return probes


def build_station_probes() -> List[Probe]:
    """Bodies at measured speeds either side of a station."""
    probes: List[Probe] = []
    base = swe.julday(2000, 1, 1, 0.0, swe.GREG_CAL)
    for body, span in (("Mercury", 200.0), ("Mars", 1200.0), ("Saturn", 500.0)):
        for mult in BAND_MULTIPLES:
            for sign in (+1, -1):
                if mult == 0.0 and sign < 0:
                    continue
                target = sign * mult * SPEED_BAND

                def f(jd: float, t: float = target) -> float:
                    return _speed(jd, body) - t
                jd = _scan_root(f, base, base + span, 1.0)
                if jd is None:
                    continue
                req = _jd_to_request(jd)
                actual_jd = E._julian_day_utc(ChartRequest(**req))
                achieved = _speed(actual_jd, body)
                if not _landed(target, achieved, SPEED_BAND):
                    continue
                probes.append(Probe("station", body, req, achieved, SPEED_BAND))
    return probes


def build_cusp_probes() -> List[Probe]:
    """Bodies at measured distances from a house cusp.

    The cusps sweep ~360°/day while the body barely moves, so time is the
    lever: root-find the instant the gap between a body and a chosen cusp is
    the target distance. This is also the intercepted-sign case in disguise —
    interception is decided entirely by where two adjacent cusps fall.
    """
    probes: List[Probe] = []
    base = swe.julday(2000, 3, 20, 0.0, swe.GREG_CAL)

    def gap(jd: float, cusp_idx: int, body: str) -> float:
        req = ChartRequest(**_jd_to_request(jd))
        chart = E.calculate_chart(req)
        cusp = chart.houses[cusp_idx].longitude
        lon = next(p.longitude for p in chart.planets if p.id == body)
        return _signed_delta(lon, cusp)

    for cusp_idx in (0, 5):          # cusp 1 (Asc) and cusp 6
        for body in ("Sun", "Saturn"):
            for mult in BAND_MULTIPLES:
                for sign in (+1, -1):
                    if mult == 0.0 and sign < 0:
                        continue
                    target = sign * mult * CUSP_BAND

                    def f(jd: float, t: float = target, c: int = cusp_idx,
                          b: str = body) -> float:
                        return _signed_delta(gap(jd, c, b), t / 1.0)
                    # One sidereal day covers every cusp/body gap exactly once.
                    jd = _scan_root(f, base, base + 1.02, 0.002)
                    if jd is None:
                        continue
                    req = _jd_to_request(jd)
                    d = gap(E._julian_day_utc(ChartRequest(**req)), cusp_idx, body)
                    # gap() wraps at ±180 once per day, so the same
                    # converge-on-a-discontinuity trap applies here.
                    if not _landed(target, d, CUSP_BAND):
                        continue
                    probes.append(Probe("cusp", f"{body}/cusp{cusp_idx + 1}",
                                        req, d, CUSP_BAND))
    return probes


def build_aspect_probes() -> List[Probe]:
    """Pairs whose orb sits at a measured distance from an aspect cutoff.

    Every aspect family in the table, at the natal orb policy (factor 1.0 —
    what calculate_chart applies). The Moon/Sun separation sweeps 0–180° every
    fortnight, so every aspect angle is reachable from one short window.
    """
    probes: List[Probe] = []
    base = swe.julday(2000, 1, 1, 0.0, swe.GREG_CAL)
    for ad in A.ASPECT_DEFS:
        cutoff = ad.default_orb
        for mult in BAND_MULTIPLES:
            for sign in (+1, -1):
                if mult == 0.0 and sign < 0:
                    continue
                target = cutoff + sign * mult * ORB_BAND

                def f(jd: float, t: float = target, angle: float = ad.angle) -> float:
                    sep = A.angular_separation(_lon(jd, "Moon"), _lon(jd, "Sun"))
                    return abs(sep - angle) - t
                jd = _scan_root(f, base, base + 30.0, 0.02)
                if jd is None:
                    continue
                req = _jd_to_request(jd)
                actual_jd = E._julian_day_utc(ChartRequest(**req))
                sep = A.angular_separation(_lon(actual_jd, "Moon"),
                                           _lon(actual_jd, "Sun"))
                orb = abs(sep - ad.angle)
                if not _landed(sign * mult * ORB_BAND, orb - cutoff, ORB_BAND):
                    continue
                probes.append(Probe("aspect", f"Moon-Sun {ad.name}", req,
                                    orb - cutoff, ORB_BAND))
    return probes


# --------------------------------------------------------------------------- #
# Verdicts
# --------------------------------------------------------------------------- #

def _classify(chart: Dict[str, Any], probe: Probe) -> Any:
    """The single categorical answer this probe is about."""
    kind = probe.kind
    if kind == "sign":
        body = probe.label.split("@")[0]
        p = next((x for x in chart["planets"] if x["id"] == body), None)
        return None if p is None else p["sign"]
    if kind == "station":
        p = next((x for x in chart["planets"] if x["id"] == probe.label), None)
        return None if p is None else p["retrograde"]
    if kind == "cusp":
        body = probe.label.split("/")[0]
        p = next((x for x in chart["planets"] if x["id"] == body), None)
        return None if p is None else p["house"]
    if kind == "aspect":
        name = probe.label.split(" ", 1)[1]
        return any(
            {a["p1"], a["p2"]} == {"Moon", "Sun"} and a["type"] == name
            for a in chart["aspects"]
        )
    raise AssertionError(f"unknown probe kind {kind}")


def _self_consistent(chart: Dict[str, Any], probe: Probe) -> Optional[str]:
    """An engine's own classification vs its own numbers. Engine-internal —
    catches a bug the two engines could SHARE, which no cross-engine
    comparison can ever see."""
    if probe.kind == "sign":
        body = probe.label.split("@")[0]
        p = next((x for x in chart["planets"] if x["id"] == body), None)
        if p and _sign_of(p["longitude"]) != p["sign"]:
            return (f"{body} reports sign {p['sign']} but its own longitude "
                    f"{p['longitude']} is {_sign_of(p['longitude'])}")
    if probe.kind == "station":
        p = next((x for x in chart["planets"] if x["id"] == probe.label), None)
        # The flag is derived from the FULL-PRECISION speed (ephemeris.py:200)
        # while the speed field is rounded to 6dp for display (:195). Within
        # half a unit of that rounding the displayed value has lost its sign —
        # Python renders the true -3e-9 as -0.0 and the wasm build renders it
        # as 0 — so asking whether the flag matches the displayed sign is not
        # a question the data can answer. Skip the band rather than assert
        # something unfalsifiable. (Noted for the product, not for parity: a
        # chart cast within seconds of a station shows "℞" beside a speed of
        # 0.000000. That reads oddly and is nonetheless true.)
        if p and abs(p["speed"]) >= 1e-6 and p["retrograde"] != (p["speed"] < 0):
            return (f"{probe.label} reports retrograde={p['retrograde']} but "
                    f"its own speed is {p['speed']}")
    return None


def _install_backend_bias(deg: float) -> None:
    """Corrupt the BACKEND ephemeris by a fixed longitude offset.

    This is the falsification hook, and where it sits is the whole point. The
    bridge's PARITY_INJECT_BIAS_DEG perturbs the TS engine's reported
    longitude AFTER that engine has already assigned sign, house and aspects —
    which falsifies A1 correctly (A1 compares longitudes) but is invisible to
    A2, because A2 compares the classifications, and those were computed
    before the perturbation landed. Verified the hard way: the first version
    of this suite passed clean under a 1-arcminute injection, i.e. it had no
    teeth for the exact fault it exists to detect.

    Patching swe.calc_ut instead puts the error UPSTREAM of every decision —
    sign, house, aspect membership and dignity all derive from the corrupted
    longitude, which is what a genuinely biased ephemeris would look like.
    Applied after the probes are built, so the probes still mark the true
    boundaries and only one engine drifts off them.
    """
    original = swe.calc_ut

    def biased(jd: float, ipl: int, flags: int = 0):  # type: ignore[no-untyped-def]
        res = original(jd, ipl, flags)
        vals = list(res[0])
        vals[0] = (vals[0] + deg) % 360.0
        return (tuple(vals),) + tuple(res[1:])

    swe.calc_ut = biased  # type: ignore[assignment]


def run(kinds: List[str], verbose: bool, inject_bias: float = 0.0) -> int:
    builders = {
        "sign": build_sign_probes,
        "station": build_station_probes,
        "cusp": build_cusp_probes,
        "aspect": build_aspect_probes,
    }
    # Build every probe against the UNCORRUPTED engines, so the boundaries
    # they mark are the real ones.
    built: List[Tuple[str, List[Probe]]] = [(k, builders[k]()) for k in kinds]
    if inject_bias:
        print(f"  !! injecting a {inject_bias}° backend bias "
              f"({inject_bias * 60:.1f} arcmin) — this suite MUST go red")
        _install_backend_bias(inject_bias)

    bridge = Bridge()
    failures: List[str] = []
    inside_band = 0
    checked = 0
    try:
        for kind, probes in built:
            if not probes:
                failures.append(f"{kind}: built ZERO probes — the root-finder "
                                "never bracketed a boundary, so this kind is "
                                "silently untested")
                continue
            for pr in probes:
                py = json.loads(
                    E.calculate_chart(ChartRequest(**pr.req)).model_dump_json())
                ts = bridge.chart(pr.req)
                if "bridge_error" in ts:
                    failures.append(f"{pr.kind} {pr.label}: TS engine error")
                    continue
                checked += 1

                for engine, chart in (("py", py), ("ts", ts)):
                    msg = _self_consistent(chart, pr)
                    if msg:
                        failures.append(
                            f"{pr.kind} {pr.label}: {engine} self-inconsistent — {msg}")

                a, b = _classify(py, pr), _classify(ts, pr)
                agree = a == b
                if pr.outside and not agree:
                    failures.append(
                        f"{pr.kind} {pr.label}: engines DISAGREE at "
                        f"{abs(pr.distance):.6f} from the boundary, which is "
                        f"outside the {pr.band} band — py={a} ts={b}")
                elif not pr.outside and not agree:
                    inside_band += 1
                if verbose:
                    mark = "ok " if agree else ("FAIL" if pr.outside else "band")
                    print(f"  {mark} {pr.kind:8s} {pr.label:22s} "
                          f"d={pr.distance:+.6f} py={a} ts={b}")

        print(f"\nparity_boundary: {checked} constructed boundary cases across "
              f"{len(kinds)} kind(s)")
        print(f"  {checked - len(failures)} agreed or were inside the excused band")
        print(f"  {inside_band} disagreed INSIDE the band (permitted by contract "
              f"v{CONTRACT['version']})")
        if failures:
            print(f"\n✗ {len(failures)} contract violation(s):")
            for f in failures:
                print(f"    - {f}")
            return 1
        print("  0 disagreed outside the band")
        return 0
    finally:
        bridge.close()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--kind", action="append",
                    choices=["sign", "station", "cusp", "aspect"],
                    help="restrict to one boundary kind (repeatable)")
    ap.add_argument("--verbose", action="store_true")
    ap.add_argument("--inject-bias-deg", type=float, default=0.0,
                    help="corrupt the BACKEND ephemeris by this many degrees "
                         "upstream of every classification — the falsification "
                         "self-test. 0.0167 is one arcminute.")
    args = ap.parse_args()
    kinds = args.kind or ["sign", "station", "cusp", "aspect"]
    print(f"parity_boundary: contract v{CONTRACT['version']} · kinds={','.join(kinds)}")
    return run(kinds, args.verbose, args.inject_bias_deg)


if __name__ == "__main__":
    raise SystemExit(main())
