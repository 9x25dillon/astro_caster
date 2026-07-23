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
CREATE TABLE IF NOT EXISTS entitlement_ledger (
    jti      TEXT PRIMARY KEY,   -- token id carried in the signed payload
    tier     TEXT NOT NULL,
    ref      TEXT NOT NULL,      -- payment reference (tx hash; later Stripe id)
    verified INTEGER NOT NULL,
    iat      INTEGER NOT NULL,
    exp      INTEGER NOT NULL,
    status   TEXT NOT NULL,      -- active | renewed (superseded) | revoked
    note     TEXT NOT NULL DEFAULT '',
    updated  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ent_ref ON entitlement_ledger(ref);
"""


def _connect() -> sqlite3.Connection:
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(_DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript(_SCHEMA)
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


# --------------------------------------------------------------------------- #
# Entitlement lifecycle ledger (Phase 4.1)
#
# Tier tokens stay STATELESS (signature + exp carry the truth); the ledger
# adds the lifecycle the schedule requires: revocation (a refund must be able
# to kill a token before its exp), renewal (supersede with a fresh exp), and
# re-link (recover a token on a new device from the payment ref).
#
# Failure posture, deliberate and documented:
#   - RECORDING a mint/renewal is best-effort: the signature is what grants
#     access, and /api/donate/verify is replayable by design — blocking a
#     mint on a ledger hiccup would strand a paying supporter for no security
#     gain. An unrecorded token simply cannot be individually revoked (the
#     AAE_SECRET rotation runbook remains the blunt instrument).
#   - The REVOCATION CHECK fails OPEN with a loud log: revocation is
#     defense-in-depth on top of the signature; locking out every paying
#     user because a local SQLite file hiccuped would invert the harm.
#   - REVOKING itself fails CLOSED (an admin must know a revoke didn't take).
# --------------------------------------------------------------------------- #


def ent_record(payload: dict, status: str = "active", note: str = "") -> bool:
    """Record a minted/renewed entitlement. Best-effort (see posture above)."""
    jti = payload.get("jti")
    if not jti:
        return False
    try:
        conn = _connect()
        with conn:
            conn.execute(
                "INSERT OR REPLACE INTO entitlement_ledger "
                "(jti, tier, ref, verified, iat, exp, status, note, updated) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (jti, payload.get("tier", ""), payload.get("ref", ""),
                 int(bool(payload.get("verified"))), int(payload.get("iat", 0)),
                 int(payload.get("exp", 0)), status, note, int(time.time())),
            )
        conn.close()
        return True
    except (sqlite3.Error, OSError):
        return False


def ent_status(jti: str) -> str | None:
    """The ledger status for a token id: active/renewed/revoked, None when the
    id is unknown (pre-ledger token) or the ledger is unreachable."""
    try:
        conn = _connect()
        row = conn.execute(
            "SELECT status FROM entitlement_ledger WHERE jti = ?", (jti,)
        ).fetchone()
        conn.close()
        return row[0] if row else None
    except (sqlite3.Error, OSError):
        return None


def ent_revoke(jti: str, note: str = "") -> tuple[bool, str]:
    """Mark a token id revoked. Fails CLOSED (the caller must know)."""
    try:
        conn = _connect()
        with conn:
            cur = conn.execute(
                "UPDATE entitlement_ledger SET status='revoked', note=?, updated=? "
                "WHERE jti = ?",
                (note, int(time.time()), jti),
            )
        conn.close()
        if cur.rowcount == 0:
            return False, "unknown token id (pre-ledger tokens revoke via secret rotation)"
        return True, "revoked"
    except (sqlite3.Error, OSError):
        return False, "ledger unavailable — revocation NOT recorded"


def ent_mark_renewed(old_jti: str) -> None:
    """Mark a superseded token. Best-effort (the new token is already live)."""
    try:
        conn = _connect()
        with conn:
            conn.execute(
                "UPDATE entitlement_ledger SET status='renewed', updated=? "
                "WHERE jti = ? AND status = 'active'",
                (int(time.time()), old_jti),
            )
        conn.close()
    except (sqlite3.Error, OSError):
        pass


def ent_find_active_ref(ref: str) -> dict | None:
    """Newest ACTIVE, unexpired ledger entry for a payment reference — the
    re-link lookup. Returns None when nothing re-linkable exists."""
    try:
        conn = _connect()
        row = conn.execute(
            "SELECT jti, tier, ref, verified, iat, exp FROM entitlement_ledger "
            "WHERE ref = ? AND status = 'active' AND exp > ? "
            "ORDER BY iat DESC LIMIT 1",
            (ref.strip(), int(time.time())),
        ).fetchone()
        conn.close()
        if not row:
            return None
        return {"jti": row[0], "tier": row[1], "ref": row[2],
                "verified": bool(row[3]), "iat": row[4], "exp": row[5]}
    except (sqlite3.Error, OSError):
        return None


def ent_revoke_ref(ref: str, note: str = "") -> tuple[bool, str]:
    """Revoke the active token for a payment reference — the Stripe refund /
    subscription-cancel path. Returns (ok, note); (False, ...) when there is
    no active entitlement for the ref (already revoked, or webhook out of
    order). Fails CLOSED like ent_revoke."""
    active = ent_find_active_ref(ref)
    if not active or not active.get("jti"):
        return False, "no active entitlement for this reference"
    return ent_revoke(active["jti"], note)


def ent_admin_list(q: str = "", limit: int = 50) -> list[dict]:
    """Operator lookup: rows matching a jti/ref fragment, newest first."""
    try:
        conn = _connect()
        like = f"%{q.strip()}%"
        rows = conn.execute(
            "SELECT jti, tier, ref, verified, iat, exp, status, note, updated "
            "FROM entitlement_ledger WHERE jti LIKE ? OR ref LIKE ? "
            "ORDER BY updated DESC LIMIT ?",
            (like, like, max(1, min(int(limit), 500))),
        ).fetchall()
        conn.close()
        keys = ("jti", "tier", "ref", "verified", "iat", "exp",
                "status", "note", "updated")
        return [dict(zip(keys, r)) for r in rows]
    except (sqlite3.Error, OSError):
        return []
