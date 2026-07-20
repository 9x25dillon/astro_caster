"""
telemetry.py
============
Anonymous usage telemetry stored in a local SQLite database.

All writes are fire-and-forget via asyncio.to_thread so they never
block the request path. The database is created automatically on first use
at  data/telemetry.db  (relative to the working directory).

Tables
------
chart_events   cast counters — house system, zodiac, tier. Birth date/time
               and location are NEVER stored (issue #54 §3.3: exact birth
               time + rough location is an identifying set, and nothing in
               the admin summary used it). Legacy columns remain in old DBs
               but are written as NULL.
ai_events      AI queries — tier, lens, depth, query length, provider,
               model, response character count, source (llm / offline).
               Question text is never stored (same rationale).
feature_events UI events forwarded from the frontend — name + JSON props.
tier_events    Entitlement / donation lifecycle (donate, verify, redeem).

Admin
-----
  GET /api/admin/stats  (dev token via X-AAE-Token header)  → summary dicts.
"""

from __future__ import annotations

import asyncio
import json
import os
import sqlite3
import time
from pathlib import Path
from typing import Any, Dict, Optional

import entitlements as ENT

_DB_PATH = Path(os.environ.get("AAE_TELEMETRY_DB", "data/telemetry.db"))

_SCHEMA = """
CREATE TABLE IF NOT EXISTS chart_events (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    ts        INTEGER NOT NULL,
    year      INTEGER,
    month     INTEGER,
    day       INTEGER,
    hour      INTEGER,
    minute    INTEGER,
    lat       REAL,
    lng       REAL,
    house_sys TEXT,
    zodiac    TEXT,
    tier      TEXT DEFAULT 'free'
);

CREATE TABLE IF NOT EXISTS ai_events (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    ts            INTEGER NOT NULL,
    tier          TEXT DEFAULT 'free',
    lens          TEXT,
    depth         TEXT,
    query_len     INTEGER,
    query_preview TEXT,
    provider      TEXT,
    model         TEXT,
    response_len  INTEGER,
    source        TEXT,
    sel_type      TEXT,
    sel_id        TEXT
);

CREATE TABLE IF NOT EXISTS feature_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ts         INTEGER NOT NULL,
    session_id TEXT,
    name       TEXT NOT NULL,
    props      TEXT
);

CREATE TABLE IF NOT EXISTS tier_events (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    ts       INTEGER NOT NULL,
    action   TEXT NOT NULL,
    tier     TEXT,
    verified INTEGER,
    ref      TEXT
);
"""


def _get_conn() -> sqlite3.Connection:
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(_DB_PATH)
    conn.executescript(_SCHEMA)
    conn.commit()
    return conn


# One shared connection per thread (SQLite is not thread-safe across threads
# without check_same_thread=False; to_thread gives each call its own thread).
def _run(sql: str, params: tuple = ()) -> None:
    conn = _get_conn()
    try:
        conn.execute(sql, params)
        conn.commit()
    finally:
        conn.close()


async def _write(sql: str, params: tuple = ()) -> None:
    """Non-blocking write — runs DB work on the thread-pool executor.

    In personal mode (Edition P) telemetry records nothing at all: the only
    user is the operator, and "no telemetry" is part of that edition's
    contract. Reads (the admin summary) still work."""
    if ENT.personal_mode():
        return
    try:
        await asyncio.to_thread(_run, sql, params)
    except Exception:
        pass  # never let telemetry break the request


# --------------------------------------------------------------------------- #
# Public logging helpers
# --------------------------------------------------------------------------- #


async def log_chart(birth: Dict, tier: str = "free") -> None:
    # Only the non-identifying casting preferences are kept — never the birth
    # data itself ("your birth data never touches a server" must stay true of
    # what the server RETAINS; the request is processed in memory only).
    await _write(
        """INSERT INTO chart_events (ts, house_sys, zodiac, tier)
           VALUES (?,?,?,?)""",
        (
            int(time.time()),
            birth.get("house_system"), birth.get("zodiac"),
            tier,
        ),
    )


async def log_ai(
    *,
    tier: str = "free",
    lens: str = "",
    depth: str = "quick",
    query: str = "",
    provider: str = "",
    model: str = "",
    response_len: int = 0,
    source: str = "llm",
    sel_type: Optional[str] = None,
    sel_id: Optional[str] = None,
) -> None:
    # The question text is personal — only its length is kept.
    await _write(
        """INSERT INTO ai_events
           (ts, tier, lens, depth, query_len,
            provider, model, response_len, source, sel_type, sel_id)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
        (
            int(time.time()), tier, lens, depth,
            len(query),
            provider, model, response_len, source,
            sel_type, sel_id,
        ),
    )


async def log_feature(name: str, props: Optional[Dict] = None,
                       session_id: Optional[str] = None) -> None:
    await _write(
        "INSERT INTO feature_events (ts, session_id, name, props) VALUES (?,?,?,?)",
        (int(time.time()), session_id, name,
         json.dumps(props, separators=(",", ":")) if props else None),
    )


async def log_tier(action: str, tier: str = "free",
                   verified: bool = False, ref: str = "") -> None:
    await _write(
        "INSERT INTO tier_events (ts, action, tier, verified, ref) VALUES (?,?,?,?,?)",
        (int(time.time()), action, tier, int(verified), ref[:64]),
    )


# --------------------------------------------------------------------------- #
# Admin summary
# --------------------------------------------------------------------------- #


def _summary() -> Dict[str, Any]:
    conn = _get_conn()
    try:
        def q(sql: str) -> list:
            return conn.execute(sql).fetchall()

        now = int(time.time())
        day = now - 86400
        week = now - 7 * 86400

        chart_total = q("SELECT COUNT(*) FROM chart_events")[0][0]
        chart_day   = q(f"SELECT COUNT(*) FROM chart_events WHERE ts>{day}")[0][0]
        chart_week  = q(f"SELECT COUNT(*) FROM chart_events WHERE ts>{week}")[0][0]

        ai_total = q("SELECT COUNT(*) FROM ai_events")[0][0]
        ai_day   = q(f"SELECT COUNT(*) FROM ai_events WHERE ts>{day}")[0][0]

        by_tier  = {r[0]: r[1] for r in q(
            "SELECT tier, COUNT(*) FROM ai_events GROUP BY tier")}
        by_lens  = {r[0]: r[1] for r in q(
            "SELECT lens, COUNT(*) FROM ai_events GROUP BY lens")}
        by_depth = {r[0]: r[1] for r in q(
            "SELECT depth, COUNT(*) FROM ai_events GROUP BY depth")}
        by_model = {r[0]: r[1] for r in q(
            "SELECT model, COUNT(*) FROM ai_events GROUP BY model")}

        top_features = q(
            "SELECT name, COUNT(*) as c FROM feature_events "
            "GROUP BY name ORDER BY c DESC LIMIT 20")
        tier_actions = {r[0]: r[1] for r in q(
            "SELECT action, COUNT(*) FROM tier_events GROUP BY action")}

        # Deluxe-report purchases, split by rail: verified = a real treasury
        # tx passed the chain check; trust = dev/trust-mode mint.
        rp = {bool(r[0]): r[1] for r in q(
            "SELECT verified, COUNT(*) FROM tier_events "
            "WHERE action='report_purchase' GROUP BY verified")}
        report_purchases = {
            "total": sum(rp.values()),
            "verified": rp.get(True, 0),
            "trust": rp.get(False, 0),
        }

        return {
            "charts": {"total": chart_total, "last_24h": chart_day, "last_7d": chart_week},
            "ai": {
                "total": ai_total, "last_24h": ai_day,
                "by_tier": by_tier, "by_lens": by_lens,
                "by_depth": by_depth, "by_model": by_model,
            },
            "features": [{"name": r[0], "count": r[1]} for r in top_features],
            "tier_events": tier_actions,
            "report_purchases": report_purchases,
        }
    finally:
        conn.close()


def summary() -> Dict[str, Any]:
    """Synchronous wrapper for use in the FastAPI endpoint (runs in thread pool)."""
    return _summary()
