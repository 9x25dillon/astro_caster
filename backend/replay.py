"""
replay.py — the OPT-IN half of the replay guardrail.

The default guardrail is entirely client-side (frontend/src/lib/replay.ts):
readings are remembered in the browser, and nothing about the question or the
answer leaves the device. That preserves the posture session 13 chose
deliberately — telemetry stores no birth data and no question text — and it is
enough for the two things replay is for: not paying twice, and not giving two
answers to one question.

What it cannot do is follow a reader to a second device, or survive a cleared
browser. This module is for readers who ask for that, and it is opt-in because
storing a reading server-side means storing the question inside it. There is no
version of this feature that keeps the text on the server and the question off
it — the question is in the answer.

THREE THINGS MAKE THE CONSENT REAL RATHER THAN IMPLIED:

  1. `consent=True` is a REQUIRED field on every write. A client that forgets it
     gets a 422, not a silent store. The consent is in the wire contract, so it
     is visible in any audit of what this endpoint accepts.
  2. Rows are OWNED. The owner is derived from the entitlement token, and reads
     are scoped to the owner — a key alone is not enough to fetch a reading.
     Anonymous callers have no owner and therefore cannot use this at all.
  3. Rows EXPIRE. AAE_REPLAY_TTL_DAYS (default 90) bounds how long a reading is
     held; `prune` drops the rest. Consent to store is not consent to keep
     forever.

Storage is stdlib SQLite next to the receipts db — same posture: local instance
data, gitignored.

Env:
    AAE_REPLAY_DB          path       default data/replay.db
    AAE_REPLAY_TTL_DAYS    retention  default 90
    AAE_REPLAY_MAX_CHARS   per-row    default 200000
"""

from __future__ import annotations

import os
import sqlite3
import time
from pathlib import Path
from typing import Dict, Optional

_DB_PATH = Path(os.environ.get("AAE_REPLAY_DB", "data/replay.db"))

_SCHEMA = """
CREATE TABLE IF NOT EXISTS replay (
    key      TEXT NOT NULL,        -- sha256 of the inputs, computed client-side
    owner    TEXT NOT NULL,        -- entitlement jti; reads are scoped to it
    text     TEXT NOT NULL,        -- the reading
    model    TEXT,
    created  INTEGER NOT NULL,
    PRIMARY KEY (key, owner)
);
CREATE INDEX IF NOT EXISTS replay_created ON replay (created);
"""


def _connect() -> sqlite3.Connection:
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(_DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript(_SCHEMA)
    return conn


def ttl_days() -> int:
    try:
        return max(1, int(os.environ.get("AAE_REPLAY_TTL_DAYS", "90")))
    except ValueError:
        return 90


def max_chars() -> int:
    try:
        return max(1, int(os.environ.get("AAE_REPLAY_MAX_CHARS", "200000")))
    except ValueError:
        return 200_000


def owner_for(token: Optional[str]) -> Optional[str]:
    """The row owner for an entitlement token, or None when there isn't one.

    The jti, never the token itself — the same reasoning as budget.user_key: a
    raw token in a table is a credential at rest, and this table is one a reader
    can ask us to hand back to them.

    Returns None for anonymous callers, which is what makes this feature
    unavailable without an entitlement rather than shared across everyone
    tokenless.
    """
    if not token:
        return None
    try:
        import entitlements as _ENT
        payload = _ENT.verify_token(token)
        if not payload:
            return None
        return payload.get("jti") or payload.get("ref") or None
    except Exception:
        return None


def get(key: str, owner: str) -> Optional[Dict]:
    """A stored reading, or None. Expired rows are treated as absent."""
    cutoff = int(time.time()) - ttl_days() * 86400
    conn = _connect()
    try:
        row = conn.execute(
            "SELECT text, model, created FROM replay "
            "WHERE key = ? AND owner = ? AND created >= ?",
            (key, owner, cutoff),
        ).fetchone()
    finally:
        conn.close()
    if not row:
        return None
    return {"text": row[0], "model": row[1], "created": row[2]}


def put(key: str, owner: str, text: str, model: Optional[str]) -> bool:
    """Store a reading. Returns False when it was refused.

    Refuses empty text and anything past AAE_REPLAY_MAX_CHARS — a reader's own
    device is a fine place for an unbounded pile of text, a shared server is
    not.

    First write wins for a given (key, owner). Overwriting would let the same
    inputs come to mean a different reading over time, which is precisely the
    contradiction replay exists to prevent.
    """
    if not text or not text.strip():
        return False
    if len(text) > max_chars():
        return False
    conn = _connect()
    try:
        conn.execute(
            "INSERT OR IGNORE INTO replay (key, owner, text, model, created) "
            "VALUES (?, ?, ?, ?, ?)",
            (key, owner, text, model, int(time.time())),
        )
        conn.commit()
    finally:
        conn.close()
    return True


def forget(owner: str) -> int:
    """Delete every reading held for an owner. Returns the number removed.

    Consent that cannot be withdrawn is not consent.
    """
    conn = _connect()
    try:
        cur = conn.execute("DELETE FROM replay WHERE owner = ?", (owner,))
        conn.commit()
        return cur.rowcount
    finally:
        conn.close()


def prune() -> int:
    """Drop rows past the TTL. Returns the number removed."""
    cutoff = int(time.time()) - ttl_days() * 86400
    conn = _connect()
    try:
        cur = conn.execute("DELETE FROM replay WHERE created < ?", (cutoff,))
        conn.commit()
        return cur.rowcount
    finally:
        conn.close()


def stats() -> Dict:
    conn = _connect()
    try:
        rows, owners = conn.execute(
            "SELECT COUNT(*), COUNT(DISTINCT owner) FROM replay"
        ).fetchone()
    finally:
        conn.close()
    return {"rows": rows, "owners": owners, "ttl_days": ttl_days()}
