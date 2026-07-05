"""
patterns.py
===========
Graph-based detection of major chart configurations. Rather than thousands of
hand-written conditionals, we build aspect adjacency graphs and look for the
geometric shapes that define each pattern.

A 'body' here is any PlanetData; aspects are the edges. We only consider the
classical planets + luminaries + Asc/MC for pattern membership to avoid noise
from derived points.
"""

from __future__ import annotations

from collections import defaultdict
from itertools import combinations
from typing import Dict, List, Set, Tuple

import astrology as A

# Bodies eligible to participate in patterns.
_CORE = {
    "Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn",
    "Uranus", "Neptune", "Pluto", "Chiron", "Ascendant", "Midheaven",
}


def _edges_of(aspects, kind: str) -> Set[frozenset]:
    """Undirected edge set for a given aspect type, restricted to core bodies."""
    out: Set[frozenset] = set()
    for a in aspects:
        if a.type == kind and a.p1 in _CORE and a.p2 in _CORE:
            out.add(frozenset((a.p1, a.p2)))
    return out


def _has(edges: Set[frozenset], x: str, y: str) -> bool:
    return frozenset((x, y)) in edges


def detect_patterns(planets, aspects) -> List["Pattern"]:
    # Imported lazily to avoid a circular import with models.
    from models import Pattern

    core = [p for p in planets if p.id in _CORE]
    by_id = {p.id: p for p in core}
    ids = list(by_id.keys())

    trines = _edges_of(aspects, "Trine")
    squares = _edges_of(aspects, "Square")
    opps = _edges_of(aspects, "Opposition")
    sextiles = _edges_of(aspects, "Sextile")
    quincunx = _edges_of(aspects, "Quincunx")

    patterns: List[Pattern] = []

    # --- Stellium: 3+ bodies in one sign ----------------------------------- #
    by_sign: Dict[str, List[str]] = defaultdict(list)
    for p in core:
        by_sign[p.sign].append(p.id)
    for sign, members in by_sign.items():
        if len(members) >= 3:
            patterns.append(Pattern(
                type="Stellium", planets=sorted(members),
                description=f"A concentration of {len(members)} bodies in {sign}, "
                            f"intensifying the {A.ELEMENTS[sign]}/{A.MODALITIES[sign]} signature.",
                extra={"sign": sign},
            ))

    # --- Grand Trine: triangle of trines ----------------------------------- #
    for a, b, c in combinations(ids, 3):
        if _has(trines, a, b) and _has(trines, b, c) and _has(trines, a, c):
            elem = by_id[a].element
            patterns.append(Pattern(
                type="Grand Trine", planets=sorted([a, b, c]),
                description=f"A harmonious {elem} triangle — innate, flowing talent "
                            f"that can become complacent if left unchallenged.",
                extra={"element": elem},
            ))

    # --- T-Square: two squares converging on an opposition ----------------- #
    # Iteration and pair-unpack order are sorted throughout: sets of frozensets
    # iterate in hash order, which varies per process and made pattern order,
    # description wording, and (for Kites) detection itself nondeterministic.
    for opp in sorted(opps, key=sorted):
        x, y = sorted(opp)
        for apex in ids:
            if apex in (x, y):
                continue
            if _has(squares, apex, x) and _has(squares, apex, y):
                patterns.append(Pattern(
                    type="T-Square", planets=sorted([x, y, apex]),
                    description=f"Dynamic tension between {x} and {y} discharges through "
                                f"{apex} (the apex) — a powerful engine of motivated growth.",
                    extra={"apex": apex},
                ))

    # --- Grand Cross: two oppositions mutually squared --------------------- #
    opp_list = sorted(opps, key=sorted)
    for o1, o2 in combinations(opp_list, 2):
        a, b = sorted(o1)
        c, d = sorted(o2)
        quad = {a, b, c, d}
        if len(quad) != 4:
            continue
        # Every cross pair (one from each opposition) must be square.
        if (_has(squares, a, c) and _has(squares, a, d)
                and _has(squares, b, c) and _has(squares, b, d)):
            patterns.append(Pattern(
                type="Grand Cross", planets=sorted(quad),
                description="Four bodies in mutual tension across all modalities of a "
                            "quality — immense drive that demands conscious integration.",
            ))

    # --- Yod (Finger of God): two quincunxes onto a sextile base ----------- #
    for sx in sorted(sextiles, key=sorted):
        x, y = sorted(sx)
        for apex in ids:
            if apex in (x, y):
                continue
            if _has(quincunx, apex, x) and _has(quincunx, apex, y):
                patterns.append(Pattern(
                    type="Yod", planets=sorted([x, y, apex]),
                    description=f"A 'Finger of Fate' pointing at {apex} — a call toward "
                                f"a refined, often fated vocation that asks for adjustment.",
                    extra={"apex": apex},
                ))

    # --- Kite: Grand Trine with an opposition to one apex ------------------ #
    grand_trines = [set(p.planets) for p in patterns if p.type == "Grand Trine"]
    for gt in grand_trines:
        for opp in sorted(opps, key=sorted):
            # Check both orientations: the old single arbitrary unpack missed
            # the kite whenever the trine member happened to land in y.
            lo, hi = sorted(opp)
            for x, y in ((lo, hi), (hi, lo)):
                if x in gt and y not in gt:
                    # y opposes a trine member x, and should sextile the other two.
                    others = gt - {x}
                    if all(_has(sextiles, y, o) for o in others):
                        patterns.append(Pattern(
                            type="Kite", planets=sorted(gt | {y}),
                            description="A Grand Trine focused and made productive by an "
                                        "opposition — talent given direction and an outlet.",
                            extra={"focus": y},
                        ))

    # De-duplicate (same type + same member set can arise via multiple paths).
    seen: Set[Tuple[str, frozenset]] = set()
    unique: List[Pattern] = []
    for p in patterns:
        key = (p.type, frozenset(p.planets))
        if key not in seen:
            seen.add(key)
            unique.append(p)
    return unique
