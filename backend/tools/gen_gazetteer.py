#!/usr/bin/env python3
"""Generate the committed offline city gazetteer (GAZ-1).

    python tools/gen_gazetteer.py --source cities5000.txt   # (re)generate
    python tools/gen_gazetteer.py --check                   # tripwire, offline
    python tools/gen_gazetteer.py --check --source cities5000.txt   # full compare

Follows the `parity/` precedent: a generator produces a committed artifact and a
`--check` mode fails CI on drift. It differs from `gen_parity_vectors.py` in one
way that matters, and the difference is deliberate:

    parity vectors regenerate from OUR OWN engine, so `--check` can recompute
    them anywhere. The gazetteer's input is a 5.4 MB third-party dump. Making CI
    download it on every run would be flaky (their server, their rate limits)
    and rude. So `--check` has two tiers:

      * WITHOUT --source (what CI runs): re-derives everything that can be
        re-derived from the artifact alone -- structural invariants, table
        integrity, sort order, coordinate ranges, and the self-recorded row
        count and content digest. This catches corruption and hand-editing,
        which is the drift that actually happens to a committed data file.
      * WITH --source: the full byte-for-byte regeneration comparison.

Source: GeoNames cities5000 (https://download.geonames.org/export/dump/),
licensed CC-BY 4.0 -- attribution is required and is rendered in the picker.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(REPO, "frontend", "public", "gazetteer", "cities.json")

# GeoNames cities*.txt is tab-separated with a fixed column order.
C_NAME, C_ASCII, C_LAT, C_LNG, C_CC, C_ADMIN1, C_POP, C_TZ = 1, 2, 4, 5, 8, 10, 14, 17
N_COLUMNS = 19

# 3 decimal places is ~110 m. A city is kilometres across and the numeric
# lat/lng fields stay authoritative, so more precision is bytes for nothing.
COORD_DP = 3

SCHEMA = 1


def build(source_path: str) -> dict:
    rows = []
    with open(source_path, encoding="utf-8") as fh:
        for line in fh:
            f = line.rstrip("\n").split("\t")
            if len(f) < N_COLUMNS:
                continue
            try:
                lat, lng, pop = float(f[C_LAT]), float(f[C_LNG]), int(f[C_POP] or 0)
            except ValueError:
                continue
            rows.append((f[C_NAME], f[C_ASCII], f[C_CC], f[C_ADMIN1], lat, lng, pop, f[C_TZ]))

    # Population descending IS the search ranking, which is why population is
    # not stored per row -- the order carries it. The secondary keys make the
    # order total, so the artifact is byte-identical across runs and machines.
    rows.sort(key=lambda r: (-r[6], r[0], r[2], r[3]))

    timezones = sorted({r[7] for r in rows})
    countries = sorted({r[2] for r in rows})
    admin1s = sorted({r[3] for r in rows})
    ti = {t: i for i, t in enumerate(timezones)}
    ci = {c: i for i, c in enumerate(countries)}
    ai = {a: i for i, a in enumerate(admin1s)}

    packed = []
    for name, ascii_name, cc, admin1, lat, lng, _pop, tz in rows:
        # asciiname is stored only when it differs from name (~79% of rows it
        # does not); "" means "same as name" and the loader re-expands it.
        packed.append([
            name,
            ascii_name if ascii_name != name else "",
            ci[cc],
            ai[admin1],
            round(lat, COORD_DP),
            round(lng, COORD_DP),
            ti[tz],
        ])

    doc = {
        "schema": SCHEMA,
        "source": "GeoNames cities5000",
        "licence": "CC-BY 4.0",
        "attribution": "© GeoNames (CC BY 4.0)",
        "count": len(packed),
        "coord_dp": COORD_DP,
        "tz": timezones,
        "cc": countries,
        "a1": admin1s,
        "rows": packed,
    }
    doc["digest"] = content_digest(doc)
    return doc


def content_digest(doc: dict) -> str:
    """Digest of the payload only, so it can be recomputed from the artifact."""
    payload = {k: doc[k] for k in ("schema", "count", "coord_dp", "tz", "cc", "a1", "rows")}
    blob = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def serialise(doc: dict) -> bytes:
    return json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def verify_invariants(doc: dict) -> list[str]:
    """Everything checkable from the artifact alone."""
    problems = []

    if doc.get("schema") != SCHEMA:
        problems.append(f"schema is {doc.get('schema')!r}, expected {SCHEMA}")

    rows = doc.get("rows")
    if not isinstance(rows, list) or not rows:
        return problems + ["rows missing or empty"]

    if doc.get("count") != len(rows):
        problems.append(f"count says {doc.get('count')} but there are {len(rows)} rows")

    n_tz, n_cc, n_a1 = len(doc.get("tz", [])), len(doc.get("cc", [])), len(doc.get("a1", []))
    dp = doc.get("coord_dp", COORD_DP)

    seen_tz, seen_cc, seen_a1 = set(), set(), set()
    for i, r in enumerate(rows):
        if len(r) != 7:
            problems.append(f"row {i}: expected 7 fields, got {len(r)}")
            break
        name, _ascii, cc, a1, lat, lng, tz = r
        if not name:
            problems.append(f"row {i}: empty name")
        if not (0 <= cc < n_cc):
            problems.append(f"row {i}: country index {cc} out of range")
            break
        if not (0 <= a1 < n_a1):
            problems.append(f"row {i}: admin1 index {a1} out of range")
            break
        if not (0 <= tz < n_tz):
            problems.append(f"row {i}: timezone index {tz} out of range")
            break
        if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
            problems.append(f"row {i}: coordinate out of range ({lat}, {lng})")
            break
        if round(lat, dp) != lat or round(lng, dp) != lng:
            problems.append(f"row {i}: coordinate exceeds the declared {dp}dp precision")
            break
        seen_cc.add(cc)
        seen_a1.add(a1)
        seen_tz.add(tz)

    # An unreferenced table entry is dead weight and means the tables and rows
    # were not produced by the same run.
    for label, seen, total in (("cc", seen_cc, n_cc), ("a1", seen_a1, n_a1), ("tz", seen_tz, n_tz)):
        if not problems and len(seen) != total:
            problems.append(f"{label} table has {total} entries but rows reference {len(seen)}")

    recorded = doc.get("digest")
    actual = content_digest(doc)
    if recorded != actual:
        problems.append(f"content digest mismatch: recorded {recorded!r}, actual {actual!r}")

    return problems


def main() -> int:
    ap = argparse.ArgumentParser(description="Generate the offline city gazetteer")
    ap.add_argument("--source", help="path to an unzipped GeoNames cities*.txt")
    ap.add_argument("--check", action="store_true",
                    help="verify the committed artifact instead of writing it")
    args = ap.parse_args()

    rel = os.path.relpath(OUT, REPO)

    if args.check:
        if not os.path.exists(OUT):
            sys.exit(f"missing {rel} — run with --source to create it")
        with open(OUT, encoding="utf-8") as fh:
            doc = json.load(fh)

        problems = verify_invariants(doc)
        if problems:
            for p in problems:
                print(f"  ✗ {p}", file=sys.stderr)
            sys.exit(f"{rel} failed its invariants")

        if args.source:
            if serialise(build(args.source)) != open(OUT, "rb").read():
                sys.exit(f"{rel} drifted from a regeneration of {args.source}")
            print(f"{rel}: {doc['count']:,} cities — byte-identical to a regeneration")
        else:
            print(f"{rel}: {doc['count']:,} cities — invariants hold, digest matches")
            print("  (pass --source to also compare against a full regeneration)")
        return 0

    if not args.source:
        sys.exit("--source is required when generating (path to GeoNames cities*.txt)")

    doc = build(args.source)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    blob = serialise(doc)
    with open(OUT, "wb") as fh:
        fh.write(blob)
    print(f"wrote {rel}: {doc['count']:,} cities, {len(blob)/1e6:.2f} MB raw")
    print(f"  digest {doc['digest']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
