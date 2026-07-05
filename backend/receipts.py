"""
receipts.py
===========
The receipt ledger that closes AUDIT_REGRESSION §6's accepted limitation:
report claims are stateless, so without a ledger one on-chain tx meeting the
price could be presented repeatedly to mint claims for *different* Oracle
session seeds. First redemption wins; recompiles of the SAME session stay
allowed (the claim was always seed-bound and re-usable for its own seed).

Deliberately scoped to the personal-report purchase rail. /api/donate/verify
stays replayable BY DESIGN: supporters re-verify their tx to recover a lost
token (the documented AAE_SECRET-rotation path), and a tier token grants the
same thing on every mint — there is no cross-seed amplification to prevent.

Storage is stdlib SQLite next to the telemetry db (same posture: local
instance data, gitignored). AAE_RECEIPTS_DB overrides the path.
"""

from __future__ import annotations

import os
import sqlite3
import time
from pathlib import Path

_DB_PATH = Path(os.environ.get("AAE_RECEIPTS_DB", "data/receipts.db"))

_SCHEMA = """
CREATE TABLE IF NOT EXISTS report_receipts (
    tx_hash  TEXT PRIMARY KEY,   -- normalized: stripped + lowercased
    seed     TEXT NOT NULL,      -- the ONE Oracle session this tx paid for
    ref      TEXT NOT NULL,
    verified INTEGER NOT NULL,   -- 0 = trust-mode (dev), 1 = on-chain
    wei      INTEGER NOT NULL,
    created  INTEGER NOT NULL
);
"""


def _connect() -> sqlite3.Connection:
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(_DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute(_SCHEMA)
    return conn


def _norm(tx_hash: str) -> str:
    return tx_hash.strip().lower()


def claim_tx(tx_hash: str, seed: str, *, verified: bool, wei: int = 0) -> tuple[bool, str]:
    """Atomically redeem `tx_hash` for `seed`.

    Returns (True, note) when the tx is fresh or already bound to this same
    seed (idempotent recompile / re-mint after a lost claim), and
    (False, reason) when the tx was already redeemed for a different session.
    """
    tx = _norm(tx_hash)
    try:
        conn = _connect()
    except (sqlite3.Error, OSError):
        # Fail CLOSED: a paid surface must not mint when the ledger is broken.
        return False, "receipt ledger unavailable — purchase not recorded, try again"
    try:
        # BEGIN IMMEDIATE takes the write lock up front so two concurrent
        # redemptions of the same tx serialize instead of double-inserting.
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute(
            "SELECT seed FROM report_receipts WHERE tx_hash = ?", (tx,)
        ).fetchone()
        if row is not None:
            conn.execute("COMMIT")
            if row[0] == seed:
                return True, "receipt already on ledger for this session"
            return False, (
                "this transaction was already redeemed for a different "
                "Oracle session — each deluxe purchase covers one session"
            )
        conn.execute(
            "INSERT INTO report_receipts (tx_hash, seed, ref, verified, wei, created) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (tx, seed, tx_hash.strip()[:18], int(verified), int(wei), int(time.time())),
        )
        conn.execute("COMMIT")
        return True, "receipt recorded"
    except sqlite3.Error:
        try:
            conn.execute("ROLLBACK")
        except sqlite3.Error:
            pass
        # Fail CLOSED: a paid surface must not mint when the ledger is broken.
        return False, "receipt ledger unavailable — purchase not recorded, try again"
    finally:
        conn.close()
