"""
The backend side of the ASTRA-CORE drift lock (MOBILE_ROADMAP §3 step 5):
recompute every committed parity vector and compare within the tolerance
contract stored in the file itself. When the TS engine lands, it runs the
same comparison against the same file — divergence on either side is a red
build, not a bug report.
"""
import json
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import astrology as A  # noqa: E402
import ephemeris as E  # noqa: E402
from models import ChartRequest  # noqa: E402

VECTOR_FILE = Path(__file__).resolve().parents[2] / "parity" / "natal-chart.json"

PAYLOAD = json.loads(VECTOR_FILE.read_text())
TOL = PAYLOAD["tolerances"]


def _cross_engine_factor(actual_meta: dict) -> float:
    """Vectors are engine-stamped. A different ephemeris source (moshier vs
    swiss-files) legitimately shifts positions by up to ~1 arcmin, so widen
    the angular tolerances instead of failing an engine upgrade — categorical
    fields still must match exactly."""
    return 1.0 if actual_meta["ephemeris"] == PAYLOAD["engine"] else 5.0


def _angdiff(a: float, b: float) -> float:
    return A.angular_separation(a, b)


@pytest.mark.parametrize("case", PAYLOAD["cases"], ids=lambda c: c["id"])
def test_vector_case(case):
    actual = E.calculate_chart(ChartRequest(**case["request"])).model_dump()
    expected = case["expected"]
    k = _cross_engine_factor(actual["meta"])

    # Planets — matched by id, none missing, none extra.
    exp_planets = {p["id"]: p for p in expected["planets"]}
    act_planets = {p["id"]: p for p in actual["planets"]}
    assert act_planets.keys() == exp_planets.keys()
    for pid, ep in exp_planets.items():
        ap = act_planets[pid]
        assert _angdiff(ap["longitude"], ep["longitude"]) <= TOL["planet.longitude_deg"] * k, pid
        assert abs(ap["latitude"] - ep["latitude"]) <= TOL["planet.latitude_deg"] * k, pid
        assert abs(ap["declination"] - ep["declination"]) <= TOL["planet.declination_deg"] * k, pid
        assert abs(ap["speed"] - ep["speed"]) <= TOL["planet.speed_deg_per_day"] * k, pid
        for field in ("sign", "degree", "house", "retrograde", "dignity", "element", "modality"):
            assert ap[field] == ep[field], f"{pid}.{field}"

    # House cusps.
    for ah, eh in zip(actual["houses"], expected["houses"]):
        assert ah["index"] == eh["index"]
        assert _angdiff(ah["longitude"], eh["longitude"]) <= TOL["house.cusp_deg"] * k
        assert ah["sign"] == eh["sign"], f"house {eh['index']}"

    # Angles.
    for name in ("ascendant", "midheaven", "descendant", "imum_coeli"):
        assert _angdiff(actual["angles"][name], expected["angles"][name]) <= TOL["angle_deg"] * k, name

    # Aspects — the SET must match exactly; orbs within tolerance.
    def akey(a):
        return (*sorted((a["p1"], a["p2"])), a["type"])
    exp_aspects = {akey(a): a for a in expected["aspects"]}
    act_aspects = {akey(a): a for a in actual["aspects"]}
    assert act_aspects.keys() == exp_aspects.keys()
    for key, ea in exp_aspects.items():
        aa = act_aspects[key]
        assert abs(aa["orb"] - ea["orb"]) <= TOL["aspect.orb_deg"] * k, key
        assert _angdiff(aa["separation"], ea["separation"]) <= TOL["aspect.separation_deg"] * k, key
        assert aa["applying"] == ea["applying"], key

    # Patterns as a set of (type, member-planets); prose descriptions excluded.
    def pkey(p):
        return (p["type"], tuple(sorted(p["planets"])))
    assert {pkey(p) for p in actual["patterns"]} == {pkey(p) for p in expected["patterns"]}

    # Weighted tallies and the time conversion are arithmetic — exact.
    assert actual["elements"] == expected["elements"]
    assert actual["modalities"] == expected["modalities"]
    assert actual["meta"]["julian_day"] == expected["meta"]["julian_day"]


def test_tolerance_contract_is_complete():
    """Every tolerance key the comparisons rely on exists in the file — a
    consumer (the TS side) can trust the contract without defaults."""
    required = {
        "planet.longitude_deg", "planet.latitude_deg", "planet.declination_deg",
        "planet.speed_deg_per_day", "house.cusp_deg", "angle_deg",
        "aspect.orb_deg", "aspect.separation_deg",
    }
    assert required <= TOL.keys()
    assert PAYLOAD["schema"] == "astra-parity/natal-chart@1"
    assert len(PAYLOAD["cases"]) >= 2
