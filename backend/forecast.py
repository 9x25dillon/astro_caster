"""
forecast.py
===========
Astrological forecast engine. Scans a future date range (default 90 days) for:
  - Planetary stations (retrograde / direct)
  - Major aspects between transiting planets (world-sky events)
  - Transits of planets to the natal chart (personal activations)

Algorithm: step forward one day at a time using Swiss Ephemeris.
Track per-pair orbs; record an event when a minimum is detected (orb was
decreasing then starts increasing). Bisect stations to ±1 hour precision.

Runs synchronously — intended to be called via asyncio.to_thread().
"""

from __future__ import annotations

import datetime as dt
from typing import Dict, List, Tuple

import swisseph as swe

import astrology as A

# --------------------------------------------------------------------------- #
# Tables
# --------------------------------------------------------------------------- #

_TRANSIT_BODIES: List[Tuple[str, int]] = [
    ("Sun",        swe.SUN),
    ("Moon",       swe.MOON),
    ("Mercury",    swe.MERCURY),
    ("Venus",      swe.VENUS),
    ("Mars",       swe.MARS),
    ("Jupiter",    swe.JUPITER),
    ("Saturn",     swe.SATURN),
    ("Uranus",     swe.URANUS),
    ("Neptune",    swe.NEPTUNE),
    ("Pluto",      swe.PLUTO),
    ("Chiron",     swe.CHIRON),
    ("North Node", swe.TRUE_NODE),
]

_SWE_IDS: Dict[str, int] = dict(_TRANSIT_BODIES)

# Only five major aspects for cleaner forecast signal.
_ASPECTS: List[Tuple[str, float, float]] = [
    ("Conjunction", 0.0,   2.5),
    ("Opposition",  180.0, 2.5),
    ("Square",      90.0,  2.0),
    ("Trine",       120.0, 2.0),
    ("Sextile",     60.0,  1.5),
]

_ASPECT_COLOR: Dict[str, str] = {
    "Conjunction": "#c9a84c",
    "Opposition":  "#b03a2e",
    "Square":      "#b03a2e",
    "Trine":       "#2e86c1",
    "Sextile":     "#48a999",
}
_ASPECT_HARMONY: Dict[str, str] = {
    "Conjunction": "neutral",
    "Opposition":  "challenging",
    "Square":      "challenging",
    "Trine":       "harmonious",
    "Sextile":     "harmonious",
}

_GLYPHS: Dict[str, str] = {
    "Sun": "☉", "Moon": "☽", "Mercury": "☿", "Venus": "♀", "Mars": "♂",
    "Jupiter": "♃", "Saturn": "♄", "Uranus": "♅", "Neptune": "♆", "Pluto": "♇",
    "Chiron": "⚷", "North Node": "☊",
    "Ascendant": "Asc", "Midheaven": "MC",
}

_OUTER  = {"Jupiter", "Saturn", "Uranus", "Neptune", "Pluto", "Chiron"}
_INNER  = {"Sun", "Moon", "Mercury", "Venus", "Mars"}
_ANGLES = {"Ascendant", "Midheaven"}

_SIG_RANK = {"high": 3, "medium": 2, "low": 1}

# --------------------------------------------------------------------------- #
# Station meanings
# --------------------------------------------------------------------------- #

_STATION_MEANING: Dict[str, str] = {
    "Mercury":    "Communication, agreements, devices, and travel slow down for review. Backtrack, revise, and reflect. Not the moment to launch — an excellent moment to reconsider.",
    "Venus":      "Values, relationships, and what you find beautiful turn inward. Old connections resurface. Pause before new financial or romantic commitments.",
    "Mars":       "Drive turns inward. Reconsider strategies, conserve energy, avoid unnecessary conflict — the force that usually pushes outward is redirected toward internal reconstruction.",
    "Jupiter":    "Expansion pauses for reflection. A phase of philosophical digestion, course-correction, and integrating past growth before the next outward surge.",
    "Saturn":     "Structures and responsibilities return for deeper inspection. Lessons not yet fully absorbed come back. A productive time for quiet, serious work.",
    "Uranus":     "Liberation turns inward. Sudden realizations about personal authenticity and freedom. Inner revolutions that will eventually manifest outwardly.",
    "Neptune":    "Illusions clarify temporarily. Spiritual attunement deepens. Confusion about reality may resolve — or what seemed certain begins to dissolve.",
    "Pluto":      "An archeological descent into the unconscious. Power dynamics, buried fears, and compulsions toward transformation all intensify beneath the surface.",
    "Chiron":     "Old wounds resurface with fresh perspective — not to reopen them, but to metabolize what was not yet digested. A healing retrograde.",
    "North Node": "The nodal axis shifts — collective themes of fate and dharma are being reconfigured. A reorientation of the karmic field.",
}

# --------------------------------------------------------------------------- #
# Core calculation helpers
# --------------------------------------------------------------------------- #

_FLAGS = swe.FLG_SPEED | swe.FLG_MOSEPH


def _jd_noon(d: dt.date) -> float:
    return swe.julday(d.year, d.month, d.day, 12.0, swe.GREG_CAL)


def _date_from_jd(jd: float) -> dt.date:
    y, m, d, _ = swe.revjul(jd, swe.GREG_CAL)
    return dt.date(int(y), int(m), int(d))


def _iso(d: dt.date) -> str:
    return d.isoformat()


def _positions(jd: float) -> Dict[str, Tuple[float, float]]:
    """Return {name: (longitude, speed)} for all transit bodies."""
    out: Dict[str, Tuple[float, float]] = {}
    for name, swe_id in _TRANSIT_BODIES:
        try:
            data, _ = swe.calc_ut(jd, swe_id, _FLAGS)
            out[name] = (float(data[0]), float(data[3]))
        except Exception:
            pass
    return out


def _moon_lon(jd: float) -> float:
    """Moon ecliptic longitude at jd."""
    data, _ = swe.calc_ut(jd, swe.MOON, _FLAGS)
    return float(data[0])


def _orb(lon_a: float, lon_b: float, target_angle: float) -> float:
    return abs(A.angular_separation(lon_a, lon_b) - target_angle)


def _bisect_station(planet: str, jd_lo: float, jd_hi: float, iters: int = 10) -> float:
    """Find exact JD where planet speed crosses zero via binary search."""
    swe_id = _SWE_IDS.get(planet)
    if swe_id is None:
        return (jd_lo + jd_hi) / 2.0
    lo_spd = swe.calc_ut(jd_lo, swe_id, _FLAGS)[0][3]
    for _ in range(iters):
        mid = (jd_lo + jd_hi) / 2.0
        mid_spd = swe.calc_ut(mid, swe_id, _FLAGS)[0][3]
        if (lo_spd > 0) == (mid_spd > 0):
            jd_lo = mid
            lo_spd = mid_spd
        else:
            jd_hi = mid
    return (jd_lo + jd_hi) / 2.0


# --------------------------------------------------------------------------- #
# Significance helpers
# --------------------------------------------------------------------------- #

def _sig_station(planet: str) -> str:
    if planet in _OUTER:
        return "high"
    if planet == "Mars":
        return "medium"
    return "low"          # Mercury, Venus


def _sig_t2t(p1: str, p2: str) -> str:
    if {p1, p2} == {"Sun", "Moon"}:
        return "medium"   # lunations — new/full/quarter Moons carry the month
    if p1 in _OUTER and p2 in _OUTER:
        return "high"
    if p1 in _OUTER or p2 in _OUTER:
        return "medium"
    return "low"


def _sig_t2n(transiting: str, natal_target: str) -> str:
    luminaries_and_angles = {"Sun", "Moon", "Ascendant", "Midheaven"}
    if transiting in _OUTER and natal_target in luminaries_and_angles:
        return "high"
    if transiting in _OUTER:
        return "medium"
    if natal_target in luminaries_and_angles and transiting in {"Mars", "Jupiter"}:
        return "medium"
    return "low"


# --------------------------------------------------------------------------- #
# Event builders
# --------------------------------------------------------------------------- #

def _event_station(planet: str, jd: float, going_rx: bool) -> dict:
    lon = float(swe.calc_ut(jd, _SWE_IDS[planet], _FLAGS)[0][0])
    sign = A.sign_for(lon)
    deg, minute, _ = A.degree_in_sign(lon)
    direction = "retrograde" if going_rx else "direct"
    label = "stations retrograde" if going_rx else "stations direct"
    color = "#b87333" if going_rx else "#c9a84c"
    return dict(
        date=_iso(_date_from_jd(jd)),
        jd=round(jd, 4),
        type="station",
        planet=planet,
        glyph=_GLYPHS.get(planet, planet),
        aspect=None,
        target=None,
        target_glyph=None,
        orb=0.0,
        significance=_sig_station(planet),
        direction=direction,
        summary=f"{planet} {label} at {deg}°{minute:02d}' {sign}",
        meaning=_STATION_MEANING.get(planet, ""),
        color=color,
        harmony=None,
    )


def _event_t2t(p1: str, p2: str, asp: str, exact_date: dt.date, orb: float) -> dict:
    action_map = {
        "Conjunction": "conjunct", "Opposition": "opposite",
        "Square": "square", "Trine": "trine", "Sextile": "sextile",
    }
    harmony = _ASPECT_HARMONY.get(asp, "neutral")
    action = action_map.get(asp, asp.lower())
    meaning_suffix = {
        "harmonious": " A supportive current in the collective atmosphere — initiative and cooperation flow more easily.",
        "challenging": " Tension in the sky asks for adaptation. World events may reflect the friction between these two planetary principles.",
        "neutral":     " A significant meeting of planetary currents shaping the atmosphere for days surrounding exactness.",
    }.get(harmony, "")
    return dict(
        date=_iso(exact_date),
        jd=round(_jd_noon(exact_date), 4),
        type="transit_transit",
        planet=p1,
        glyph=_GLYPHS.get(p1, p1),
        aspect=asp,
        target=p2,
        target_glyph=_GLYPHS.get(p2, p2),
        orb=round(orb, 3),
        significance=_sig_t2t(p1, p2),
        direction=None,
        summary=f"{p1} {action} {p2}",
        meaning=f"{p1} {action} {p2} in the sky." + meaning_suffix,
        color=_ASPECT_COLOR.get(asp, "#9a8f78"),
        harmony=harmony,
    )


def _event_t2n(transiting: str, natal_name: str, asp: str,
               exact_date: dt.date, orb: float) -> dict:
    action_map = {
        "Conjunction": "conjuncts", "Opposition": "opposes",
        "Square": "squares", "Trine": "trines", "Sextile": "sextiles",
    }
    harmony = _ASPECT_HARMONY.get(asp, "neutral")
    action = action_map.get(asp, asp.lower())
    meaning_suffix = {
        "harmonious": " A supportive current through this part of your chart — energy flows, doors open, natural momentum builds.",
        "challenging": " Growth through friction. The chart asks you to step up, adapt, or release what no longer serves this part of your life.",
        "neutral":     " This area of your chart is brought forward. Awareness and intentional response bring the most from this activation.",
    }.get(harmony, "")
    return dict(
        date=_iso(exact_date),
        jd=round(_jd_noon(exact_date), 4),
        type="transit_natal",
        planet=transiting,
        glyph=_GLYPHS.get(transiting, transiting),
        aspect=asp,
        target=natal_name,
        target_glyph=_GLYPHS.get(natal_name.replace("natal ", ""), natal_name),
        orb=round(orb, 3),
        significance=_sig_t2n(transiting, natal_name),
        direction=None,
        summary=f"{transiting} {action} natal {natal_name}",
        meaning=f"Transiting {transiting} {action} your natal {natal_name}." + meaning_suffix,
        color=_ASPECT_COLOR.get(asp, "#9a8f78"),
        harmony=harmony,
    )


# --------------------------------------------------------------------------- #
# Main forecast function
# --------------------------------------------------------------------------- #

def generate_forecast(
    natal: Dict[str, float],     # {planet_name: ecliptic_longitude}
    start_date: dt.date,
    days: int = 90,
    min_sig: str = "medium",     # "high" | "medium" | "low"
) -> List[dict]:
    """
    Return a list of forecast event dicts, sorted by date.
    Runs synchronously — call via asyncio.to_thread in async contexts.
    """
    min_rank = _SIG_RANK.get(min_sig, 2)
    events: List[dict] = []

    # Bootstrap: positions from the day before the range starts
    prev_pos = _positions(_jd_noon(start_date - dt.timedelta(days=1)))

    # Per-pair orb tracking: (p1, p2_or_natal_name, aspect_name) →
    # (prev_orb, was_decreasing). The trend bit is what detects an exactness
    # pass: the orb was shrinking and has now started to grow — a sign change
    # of the orb's derivative. (The old fixed +0.03°/day hysteresis could
    # never fire for slow outer-planet pairs, whose orb changes ≪ 0.03°/day
    # near the minimum, so the most significant transits were dropped.)
    tt_orbs: Dict[tuple, Tuple[float, bool]] = {}
    tn_orbs: Dict[tuple, Tuple[float, bool]] = {}
    tt_fired: set = set()   # keys that already fired — prevents final-pass duplicates
    tn_fired: set = set()
    _BIG = 999.0

    def _minimum_step(state: Dict[tuple, Tuple[float, bool]], key: tuple,
                      curr: float, threshold: float):
        """Advance one pair's orb state; return the minimum orb when the orb
        just passed a local minimum inside `threshold`, else None."""
        prev, decreasing = state.get(key, (_BIG, True))
        fired = prev if (decreasing and prev < threshold and curr > prev) else None
        if curr < prev:
            decreasing = True
        elif curr > prev:
            decreasing = False
        state[key] = (curr, decreasing)
        return fired

    # Initialise orb tables from the pre-range day. Moon pairs always key as
    # ("Moon", other) — the 6-hour Moon block is their only tracker, and a
    # symmetric ("Sun", "Moon") entry would sit stale until the final pass
    # emitted it as a phantom last-day event.
    body_names = [n for n, _ in _TRANSIT_BODIES]
    for i, n1 in enumerate(body_names):
        if n1 not in prev_pos:
            continue
        lon1, _ = prev_pos[n1]
        for j, n2 in enumerate(body_names):
            if j <= i or n2 not in prev_pos or "Moon" in (n1, n2):
                continue
            lon2, _ = prev_pos[n2]
            for asp, ang, _ in _ASPECTS:
                tt_orbs[(n1, n2, asp)] = (_orb(lon1, lon2, ang), True)
        if natal:
            for nn, nlon in natal.items():
                for asp, ang, _ in _ASPECTS:
                    tn_orbs[(n1, nn, asp)] = (_orb(lon1, nlon, ang), True)
    if "Moon" in prev_pos:
        mlon, _ = prev_pos["Moon"]
        for n2 in body_names:
            if n2 == "Moon" or n2 not in prev_pos:
                continue
            for asp, ang, _ in _ASPECTS:
                tt_orbs[("Moon", n2, asp)] = (_orb(mlon, prev_pos[n2][0], ang), True)

    # Step forward one day at a time
    for offset in range(days):
        today = start_date + dt.timedelta(days=offset)
        jd = _jd_noon(today)
        pos = _positions(jd)

        # ── Stations ─────────────────────────────────────────────────────────
        for name, _ in _TRANSIT_BODIES:
            # Sun and Moon cannot station; True Node is too slow to matter here
            if name in ("Sun", "Moon", "North Node"):
                continue
            if name not in pos or name not in prev_pos:
                continue
            prev_spd = prev_pos[name][1]
            curr_spd = pos[name][1]

            if prev_spd > 0 >= curr_spd:          # going retrograde
                exact_jd = _bisect_station(name, jd - 1, jd)
                ev = _event_station(name, exact_jd, going_rx=True)
                if _SIG_RANK.get(ev["significance"], 1) >= min_rank:
                    events.append(ev)

            elif prev_spd <= 0 < curr_spd:         # going direct
                exact_jd = _bisect_station(name, jd - 1, jd)
                ev = _event_station(name, exact_jd, going_rx=False)
                if _SIG_RANK.get(ev["significance"], 1) >= min_rank:
                    events.append(ev)

        # ── Transit-to-transit aspects (skip Moon — handled at 6h below) ────────
        for i, n1 in enumerate(body_names):
            if n1 == "Moon" or n1 not in pos:
                continue
            lon1, _ = pos[n1]
            for j, n2 in enumerate(body_names):
                if j <= i or n2 == "Moon" or n2 not in pos:
                    continue
                lon2, _ = pos[n2]
                for asp, ang, threshold in _ASPECTS:
                    key = (n1, n2, asp)
                    curr = _orb(lon1, lon2, ang)
                    min_orb = _minimum_step(tt_orbs, key, curr, threshold)
                    if min_orb is not None:
                        yesterday = today - dt.timedelta(days=1)
                        ev = _event_t2t(n1, n2, asp, yesterday, min_orb)
                        if _SIG_RANK.get(ev["significance"], 1) >= min_rank:
                            events.append(ev)
                        tt_fired.add(key)

        # ── Transit-to-natal aspects (skip Moon — handled at 6h below) ──────────
        if natal:
            for tname in body_names:
                if tname == "Moon" or tname not in pos:
                    continue
                tlon, _ = pos[tname]
                for nname, nlon in natal.items():
                    # Tighter orb for inner planet transits (they move fast)
                    t_threshold = 1.0 if tname in _INNER else 1.5
                    for asp, ang, _ in _ASPECTS:
                        key = (tname, nname, asp)
                        curr = _orb(tlon, nlon, ang)
                        min_orb = _minimum_step(tn_orbs, key, curr, t_threshold)
                        if min_orb is not None:
                            yesterday = today - dt.timedelta(days=1)
                            ev = _event_t2n(tname, nname, asp, yesterday, min_orb)
                            if _SIG_RANK.get(ev["significance"], 1) >= min_rank:
                                events.append(ev)
                            tn_fired.add(key)

        # ── Moon at 6-hour resolution (moves ~13°/day; daily step misses brief aspects)
        # Use daily positions of other planets (slow-movers: acceptable approximation).
        jd_midnight = jd - 0.5  # midnight of today (noon - 0.5 day)
        for sub_frac in (0.0, 0.25, 0.5, 0.75):   # 0h, 6h, 12h, 18h
            jd_sub = jd_midnight + sub_frac
            moon_lon = _moon_lon(jd_sub)
            # Moon–planet transit-transit aspects. Every OTHER body pairs with
            # the Moon here — including the Sun, whose Moon aspects are the
            # lunations (new/full Moons and quarters). An index guard copied
            # from the symmetric daily loop used to skip the Sun entirely.
            for n2 in body_names:
                if n2 == "Moon" or n2 not in pos:
                    continue
                lon2, _ = pos[n2]
                for asp, ang, threshold in _ASPECTS:
                    key = ("Moon", n2, asp)
                    curr = _orb(moon_lon, lon2, ang)
                    min_orb = _minimum_step(tt_orbs, key, curr, threshold)
                    if min_orb is not None:
                        ev = _event_t2t("Moon", n2, asp, today, min_orb)
                        if _SIG_RANK.get(ev["significance"], 1) >= min_rank:
                            events.append(ev)
                        tt_fired.add(key)
            # Moon–natal transit-to-natal aspects
            if natal:
                for nname, nlon in natal.items():
                    for asp, ang, _ in _ASPECTS:
                        key = ("Moon", nname, asp)
                        curr = _orb(moon_lon, nlon, ang)
                        min_orb = _minimum_step(tn_orbs, key, curr, 1.0)
                        if min_orb is not None:
                            ev = _event_t2n("Moon", nname, asp, today, min_orb)
                            if _SIG_RANK.get(ev["significance"], 1) >= min_rank:
                                events.append(ev)
                            tn_fired.add(key)

        prev_pos = pos

    # Final pass: capture aspects still approaching exactness on the last day
    # (their orb was still decreasing and never crossed back above the hysteresis
    # threshold, so the main loop's minimum-detection never fired).
    asp_thresholds = {asp: thr for asp, _, thr in _ASPECTS}
    last_day = start_date + dt.timedelta(days=days - 1)

    for key, (final_orb, decreasing) in tt_orbs.items():
        if key in tt_fired or not decreasing:
            continue
        n1, n2, asp = key
        if final_orb < asp_thresholds.get(asp, 2.0):
            ev = _event_t2t(n1, n2, asp, last_day, final_orb)
            if _SIG_RANK.get(ev["significance"], 1) >= min_rank:
                events.append(ev)

    if natal:
        for key, (final_orb, decreasing) in tn_orbs.items():
            if key in tn_fired or not decreasing:
                continue
            tname, nname, asp = key
            t_threshold = 1.0 if tname in _INNER else 1.5
            if final_orb < t_threshold:
                ev = _event_t2n(tname, nname, asp, last_day, final_orb)
                if _SIG_RANK.get(ev["significance"], 1) >= min_rank:
                    events.append(ev)

    # Sort by date, high-significance first within each day
    events.sort(key=lambda e: (e["date"], -_SIG_RANK.get(e["significance"], 1)))

    # Deduplicate: same (planet, aspect, target) within a 10-day window → keep
    # the one with the smallest orb.  This handles flat-minimum cases where the
    # same aspect passes several shallow minima on consecutive daily steps.
    deduped: List[dict] = []
    # (planet, aspect, target, direction) → index into deduped
    last_seen: dict = {}

    for ev in events:
        sig_key = (ev["planet"], ev.get("aspect"), ev.get("target"), ev.get("direction"))
        prev_idx = last_seen.get(sig_key)
        if prev_idx is not None:
            prev_ev = deduped[prev_idx]
            prev_d = dt.date.fromisoformat(prev_ev["date"])
            curr_d = dt.date.fromisoformat(ev["date"])
            if (curr_d - prev_d).days <= 10:
                if ev.get("orb", 999) < prev_ev.get("orb", 999):
                    deduped[prev_idx] = ev
                continue
        last_seen[sig_key] = len(deduped)
        deduped.append(ev)

    # Re-sort after dedup (replacing entries can change relative order)
    deduped.sort(key=lambda e: (e["date"], -_SIG_RANK.get(e["significance"], 1)))
    return deduped
