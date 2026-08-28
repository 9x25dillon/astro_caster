"""
delivery_audit.py
=================
Did the people who paid actually RECEIVE what they paid for?

This exists because on 2026-08-28 the answer was no, and nothing was asking.
A deluxe Personal Report was bought at 03:07:59 — receipt on the ledger,
verified, bound to a session seed — while the delivery count for that product
stood at **zero, ever, by anybody**. Not zero that day. Zero since the product
shipped. The number was sitting in `telemetry.db` and was queryable at any
moment for weeks; it took a customer noticing their text had vanished for
anyone to run the query.

So the lesson is not "test more carefully". It is that there was no STANDING
QUESTION being asked of the system. This module is that question, in a form a
cron job or a deploy gate can ask:

    for every paid thing — has one ever been delivered, and does the number
    delivered account for the number paid for?

Two independent checks, because they fail differently:

  · RECONCILIATION (§1) — every verified purchase on the receipt ledger should
    have a delivery at or after it. Unmatched purchases are money taken for
    something never handed over. This is the one that catches a silent,
    complete failure, which is the dangerous kind: no error, no complaint
    path, and on our side no signal at all.

  · LIVENESS (§2) — a paid capability that has NEVER produced output is
    critical whether or not anyone has bought it yet, because it means the
    path has never once been walked end to end. That is exactly the state the
    deluxe edition was in on the day it took money.

Read-only. Opens both databases read-only and writes nothing, so it is safe to
run against production while it serves.

Usage:
    python -m delivery_audit                      # human report; exit 1 on CRITICAL
    python -m delivery_audit --json               # machine-readable
    python -m delivery_audit --window-days 30     # liveness horizon for §3
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

# --------------------------------------------------------------------------- #
# What counts as a PAID deliverable.
#
# Keyed by the `lens` recorded in telemetry.ai_events. Adding a paid product
# without adding it here is how the next silent non-delivery hides, so the
# entry is part of shipping a paid product, not an afterthought.
# --------------------------------------------------------------------------- #

@dataclass(frozen=True)
class Deliverable:
    lens: str
    name: str
    #: True when a purchase is recorded per-delivery on the receipt ledger, so
    #: §1 can reconcile paid against delivered one-for-one.
    reconcilable: bool = False


PAID_DELIVERABLES: Tuple[Deliverable, ...] = (
    Deliverable("personal_report", "Deluxe Personal Report (one-time, per session)",
                reconcilable=True),
    Deliverable("oracle_report", "Oracle Report (oracle tier)"),
    Deliverable("course", "The Course (oracle tier)"),
    Deliverable("deck_art_image", "Deck-art plate (paid image generation)"),
)

# Known blind spot, stated rather than silently omitted: /api/tts records only
# a metrics counter (MET.observe_ai_call), never a telemetry row, so a spoken
# reading cannot be audited here at all. A paid capability this tool CANNOT
# see is worth more attention than one it can — see REPORT footer.
UNAUDITABLE = ("tts — records a metrics counter only, no telemetry row",)


# --------------------------------------------------------------------------- #
# Pure reconciliation — no database in here, so every rule is testable.
# --------------------------------------------------------------------------- #

def reconcile(paid_ts: Sequence[int], delivered_ts: Sequence[int],
              grace_s: int = 0) -> Tuple[List[Tuple[int, int]], List[int]]:
    """Match each purchase to the earliest delivery at or after it.

    Returns (matched pairs, unmatched purchase timestamps).

    Greedy, earliest-first, and one delivery may satisfy only one purchase —
    two purchases and one delivery leaves one purchase unmatched, which is the
    honest reading. `grace_s` allows a delivery marginally BEFORE its receipt,
    because a purchase row is written when the webhook lands and a clock skew
    of seconds between two writers should not manufacture a finding.

    A delivery with no purchase before it is NOT an error: the operator's own
    generations, dev tokens, and comped sessions all look like that.
    """
    remaining = sorted(delivered_ts)
    matched: List[Tuple[int, int]] = []
    unmatched: List[int] = []
    for p in sorted(paid_ts):
        hit = None
        for i, d in enumerate(remaining):
            if d >= p - grace_s:
                hit = i
                break
        if hit is None:
            unmatched.append(p)
        else:
            matched.append((p, remaining.pop(hit)))
    return matched, unmatched


@dataclass
class LivenessRow:
    lens: str
    name: str
    total: int
    last_ts: Optional[int]
    recent: int

    @property
    def never_delivered(self) -> bool:
        return self.total == 0


@dataclass
class AuditReport:
    generated_at: int
    liveness: List[LivenessRow] = field(default_factory=list)
    paid_count: int = 0
    delivered_count: int = 0
    undelivered: List[int] = field(default_factory=list)
    critical: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    notes: List[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.critical


def build_report(
    receipts: Sequence[dict],
    events: Sequence[dict],
    *,
    now: Optional[int] = None,
    window_days: int = 30,
) -> AuditReport:
    """The whole audit, over rows already read from the databases.

    `receipts` — verified rows from report_receipts (dicts with `created`).
    `events`   — rows from ai_events (dicts with `lens`, `ts`, `source`).
    """
    now = int(time.time()) if now is None else now
    horizon = now - window_days * 86400
    rep = AuditReport(generated_at=now)

    # Only genuine deliveries count. An offline-compiled fallback is NOT the
    # paid product being delivered — it is the honest degradation, and
    # counting it here would let a permanently-degraded key look healthy.
    by_lens: Dict[str, List[int]] = {}
    for e in events:
        if e.get("source") == "llm":
            by_lens.setdefault(str(e.get("lens")), []).append(int(e["ts"]))

    for d in PAID_DELIVERABLES:
        ts = sorted(by_lens.get(d.lens, []))
        row = LivenessRow(
            lens=d.lens, name=d.name, total=len(ts),
            last_ts=ts[-1] if ts else None,
            recent=sum(1 for t in ts if t >= horizon),
        )
        rep.liveness.append(row)
        if row.never_delivered:
            rep.critical.append(
                f"{d.lens}: NEVER delivered — the paid path has not once been "
                f"walked end to end ({d.name})"
            )

    # §1 — reconciliation, for the products bought one at a time.
    paid_ts = sorted(int(r["created"]) for r in receipts)
    delivered_ts = sorted(
        t for d in PAID_DELIVERABLES if d.reconcilable for t in by_lens.get(d.lens, [])
    )
    rep.paid_count = len(paid_ts)
    rep.delivered_count = len(delivered_ts)
    _matched, unmatched = reconcile(paid_ts, delivered_ts, grace_s=300)
    rep.undelivered = unmatched
    if unmatched:
        rep.critical.append(
            f"{len(unmatched)} verified purchase(s) with NO delivery after them "
            f"— money taken for something never handed over"
        )

    # §3 — a paid capability that worked once and then stopped is a different
    # failure from one that never worked, and warrants a softer word.
    for row in rep.liveness:
        if row.total and not row.recent:
            rep.warnings.append(
                f"{row.lens}: nothing delivered in {window_days}d "
                f"(last {_ago(now, row.last_ts)})"
            )

    for u in UNAUDITABLE:
        rep.notes.append(f"NOT AUDITABLE: {u}")
    return rep


def _ago(now: int, ts: Optional[int]) -> str:
    if not ts:
        return "never"
    s = max(0, now - ts)
    if s < 3600:
        return f"{s // 60}m ago"
    if s < 86400:
        return f"{s // 3600}h ago"
    return f"{s // 86400}d ago"


# --------------------------------------------------------------------------- #
# Database reads — read-only, and a missing database is itself a finding.
# --------------------------------------------------------------------------- #

def _read_only(path: Path) -> sqlite3.Connection:
    # `mode=ro` so this can never write to a production database, and never
    # creates one by accident (which would make a missing file look empty).
    return sqlite3.connect(f"file:{path}?mode=ro", uri=True)


def read_receipts(path: Path) -> List[dict]:
    with _read_only(path) as c:
        return [
            {"tx_hash": r[0], "seed": r[1], "ref": r[2], "created": r[3]}
            for r in c.execute(
                "SELECT tx_hash, seed, ref, created FROM report_receipts "
                "WHERE verified = 1 ORDER BY created"
            )
        ]


def read_ai_events(path: Path) -> List[dict]:
    with _read_only(path) as c:
        return [
            {"ts": r[0], "lens": r[1], "tier": r[2], "source": r[3],
             "model": r[4], "response_len": r[5]}
            for r in c.execute(
                "SELECT ts, lens, tier, source, model, response_len "
                "FROM ai_events ORDER BY ts"
            )
        ]


def audit_paths(receipts_db: Path, telemetry_db: Path, *,
                window_days: int = 30, now: Optional[int] = None) -> AuditReport:
    missing = [str(p) for p in (receipts_db, telemetry_db) if not p.exists()]
    if missing:
        rep = AuditReport(generated_at=int(time.time()) if now is None else now)
        rep.critical.append(
            "database(s) not found: " + ", ".join(missing) +
            " — an audit that cannot read the ledger proves nothing"
        )
        return rep
    return build_report(read_receipts(receipts_db), read_ai_events(telemetry_db),
                        now=now, window_days=window_days)


# --------------------------------------------------------------------------- #
# Report
# --------------------------------------------------------------------------- #

def render(rep: AuditReport, window_days: int) -> str:
    B, R, Y, G, D = "\033[1m", "\033[31m", "\033[33m", "\033[32m", "\033[0m"
    out: List[str] = [f"{B}== Delivery audit — did the people who paid receive it?{D}", ""]

    out.append(f"{B}§1 Purchases vs deliveries (per-session products){D}")
    out.append(f"   verified purchases on the ledger : {rep.paid_count}")
    out.append(f"   deliveries recorded             : {rep.delivered_count}")
    if rep.undelivered:
        out.append(f"   {R}UNDELIVERED: {len(rep.undelivered)}{D}")
        for ts in rep.undelivered:
            out.append(f"     · paid {time.strftime('%Y-%m-%d %H:%M:%SZ', time.gmtime(ts))}"
                       f" — no delivery after it")
    elif rep.paid_count:
        out.append(f"   {G}every purchase has a delivery after it{D}")
    else:
        out.append("   (no purchases on the ledger yet)")
    out.append("")

    out.append(f"{B}§2 Has each paid capability EVER delivered?{D}")
    for row in rep.liveness:
        mark = f"{R}NEVER{D}" if row.never_delivered else f"{G}yes{D}"
        out.append(f"   {mark:>14}  {row.lens:<18} total {row.total:<5} "
                   f"last {_ago(rep.generated_at, row.last_ts)}")
    out.append("")

    if rep.warnings:
        out.append(f"{B}§3 Quiet for {window_days}d{D}")
        for w in rep.warnings:
            out.append(f"   {Y}WARN{D}  {w}")
        out.append("")

    if rep.notes:
        for n in rep.notes:
            out.append(f"   {Y}note{D}  {n}")
        out.append("")

    if rep.critical:
        out.append(f"{B}{R}CRITICAL{D}")
        for c in rep.critical:
            out.append(f"   {R}·{D} {c}")
    else:
        out.append(f"{G}Everything paid for has been delivered.{D}")
    return "\n".join(out)


def main(argv: Optional[Sequence[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[3])
    ap.add_argument("--receipts-db", default=os.environ.get("AAE_RECEIPTS_DB", "data/receipts.db"))
    ap.add_argument("--telemetry-db", default=os.environ.get("AAE_TELEMETRY_DB", "data/telemetry.db"))
    ap.add_argument("--window-days", type=int, default=30)
    ap.add_argument("--json", action="store_true", help="machine-readable output")
    args = ap.parse_args(argv)

    rep = audit_paths(Path(args.receipts_db), Path(args.telemetry_db),
                      window_days=args.window_days)
    if args.json:
        print(json.dumps({
            "ok": rep.ok,
            "generated_at": rep.generated_at,
            "purchases": rep.paid_count,
            "deliveries": rep.delivered_count,
            "undelivered": rep.undelivered,
            "liveness": [
                {"lens": r.lens, "total": r.total, "last_ts": r.last_ts,
                 "recent": r.recent, "never_delivered": r.never_delivered}
                for r in rep.liveness
            ],
            "critical": rep.critical,
            "warnings": rep.warnings,
            "notes": rep.notes,
        }, indent=2))
    else:
        print(render(rep, args.window_days))
    # Non-zero on CRITICAL so a cron job or a deploy gate can fail on it.
    return 0 if rep.ok else 1


if __name__ == "__main__":
    sys.exit(main())
