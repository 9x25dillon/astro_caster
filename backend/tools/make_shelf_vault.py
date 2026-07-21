#!/usr/bin/env python3
"""Tome Phase 0 — wrap raw report files into an importable vault.

The July-8 Fable sessions (Oracle Report + deluxe Personal Report) predate
the Bookshelf, so they exist only as text files — but the physical tome
binds from the shelf. This tool wraps them (and optionally a course) into an
astra-vault@3 JSON that the Library's ⇑ Restore imports, putting the real
corpus where the book compiler reads.

Privacy posture: birth data is NEVER baked into this script or the repo —
pass it on the command line if you want shelf reprints to re-cast the chart
and re-deal plates on-device (the book compile itself uses the live cast, so
importing without birth still binds every word). The emitted vault file
carries your reports (and birth, if given): it is gitignored; guard it like
a key.

Usage (from repo root):
  backend/.venv/bin/python backend/tools/make_shelf_vault.py \
    --oracle oracle_report_2026-07-08.txt \
    --personal oracle_report_personal_2026-07-08.txt \
    --course course_2a5c79a37197_2026-07-10.txt \
    --question "What is this season of my life asking me to build, ..." \
    --birth '{"year":2000,"month":1,"day":1,"hour":12,"minute":0,"second":0,
              "lat":51.4779,"lng":0.0,"tz_offset":0,
              "house_system":"P","zodiac":"tropical","ayanamsha":1}'

Then: Library (chapter VIII) → The Vault → ⇑ Restore → pick the JSON.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path


def read_text(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def guess_question(markdown: str) -> str | None:
    """Pull the held question out of a report header, if present."""
    m = re.search(r"\*\*Question held[^:]*:\*\*\s*\*?\"?([^*\n\"]+)", markdown)
    return m.group(1).strip().rstrip('"') if m else None


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--oracle", help="Oracle Report markdown/text file")
    ap.add_argument("--personal", help="deluxe Personal Report file (attaches to the oracle session)")
    ap.add_argument("--course", help="course file (binds into chapter VI)")
    ap.add_argument("--question", help="the session's question (recovered from the file header when omitted)")
    ap.add_argument("--spread", default="planetary_seven")
    ap.add_argument("--source", default="golden_dawn")
    ap.add_argument("--lineage", default="Golden Dawn / Hermetic")
    ap.add_argument("--model", default="claude-fable-5",
                    help="model that served the reports (ai_source llm); use --offline for offline compiles")
    ap.add_argument("--offline", action="store_true", help="mark the reports as offline-compiled")
    ap.add_argument("--date", default=None, help="the oracle call's local date for daily spreads (usually omit)")
    ap.add_argument("--oracle-date", default=None, help="session date shown on the deluxe edition (default: from filename or today)")
    ap.add_argument("--short-seed", default="", help="the deluxe edition's short seed, if you kept it")
    ap.add_argument("--birth", default=None, help="BirthInput JSON — enables on-device re-cast/plates on shelf reprints")
    ap.add_argument("--out", default="astra-vault-phase0.json")
    args = ap.parse_args()

    if not args.oracle and not args.course:
        ap.error("nothing to wrap — pass --oracle and/or --course")

    birth = json.loads(args.birth) if args.birth else None
    ts = now_iso()
    entries = []

    if args.oracle:
        report = read_text(args.oracle)
        question = args.question or guess_question(report)
        if not question:
            ap.error("could not recover the question from the file — pass --question")
        stamp = re.search(r"(\d{4}-\d{2}-\d{2})", args.oracle)
        session_date = args.oracle_date or (stamp.group(1) if stamp else ts[:10])
        entry = {
            # The original seed wasn't stored with the file; identity here is
            # the import. Reprints re-deal deterministically from chart +
            # spread + question + date — NOT the seed — so plates still match.
            "seed": f"import:oracle-{session_date}",
            "savedAt": ts, "updatedAt": ts,
            "question": question,
            "spread": args.spread, "source": args.source, "lineage": args.lineage,
            "date": args.date,
            "ai_source": "offline" if args.offline else "llm",
            "model": None if args.offline else args.model,
            "report": report,
            "birth": birth,
        }
        if args.personal:
            entry["personal"] = {
                "report_markdown": read_text(args.personal),
                "short_seed": args.short_seed,
                "oracle_date": session_date,
                "ai_source": "offline" if args.offline else "llm",
                "model": None if args.offline else args.model,
                "spread": args.spread,
            }
        entries.append(entry)

    if args.course:
        course = read_text(args.course)
        cid = re.search(r"course_([0-9a-f]{6,})", args.course)
        course_id = cid.group(1) if cid else "imported"
        focus = re.search(r"curriculum for \*\*([^*]+)\*\*", course)
        entries.append({
            "seed": f"course:{course_id}",
            "savedAt": ts, "updatedAt": ts,
            "question": f"Course — {focus.group(1) if focus else 'imported curriculum'}",
            "spread": "course", "source": args.source, "lineage": args.lineage,
            "date": None,
            # The July-10 course ran on the offline compiler (usage cap).
            "ai_source": "offline", "model": None,
            "report": course,
            "birth": birth,
        })

    vault = {
        "format": "astra-vault@3",
        "exported_at": ts,
        "localStorage": {},
        "bookshelf": entries,
        "journal": [],
    }
    Path(args.out).write_text(json.dumps(vault, indent=2), encoding="utf-8")
    print(f"wrote {args.out} — {len(entries)} shelf entr{'y' if len(entries) == 1 else 'ies'}")
    print("import it: Library (chapter VIII) → The Vault → ⇑ Restore")
    return 0


if __name__ == "__main__":
    sys.exit(main())
