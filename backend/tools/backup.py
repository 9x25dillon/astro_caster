#!/usr/bin/env python3
"""Phase 3.5 — encrypted backup + restore of the observatory's server state.

The only state that lives on the server (not in the browser vault) is:
  - backend/data/*.db   — the receipts ledger + telemetry counters
  - backend/.env        — the secrets (AAE_SECRET, dev token, API keys)

Both are gathered into a single tar.gz, encrypted with AES (Fernet:
AES-128-CBC + HMAC-SHA256 authentication), and written as one timestamped
file. The key is derived from a passphrase via scrypt, with a fresh random
salt stored in the file header — so the backup file is safe to copy to
off-box storage, and a corrupted or truncated file fails the HMAC on restore
rather than silently restoring garbage.

Passphrase source (in order): --passphrase, then AAE_BACKUP_PASSPHRASE.
Keep it in the host's secret store, NOT in the repo or the backup itself.

Usage (from repo root):
  backend/.venv/bin/python backend/tools/backup.py create --out backups/
  backend/.venv/bin/python backend/tools/backup.py restore backups/aae-backup-<ts>.enc --into /tmp/restore
  backend/.venv/bin/python backend/tools/backup.py drill        # round-trip self-check, touches nothing

Schedule it (see DEPLOY.md §7) with a systemd timer or cron; ship the
resulting file to encrypted off-box storage.
"""
from __future__ import annotations

import argparse
import io
import os
import sqlite3
import sys
import tarfile
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

# File header: magic + version, then the 16-byte salt, then the Fernet token.
_MAGIC = b"AAEBAK1\n"
_SALT_LEN = 16
# scrypt cost — interactive-grade, ample for a passphrase-protected backup.
_SCRYPT_N, _SCRYPT_R, _SCRYPT_P = 2 ** 15, 8, 1

# Repo layout: this file is backend/tools/backup.py.
_BACKEND = Path(__file__).resolve().parent.parent
_REPO = _BACKEND.parent


def _derive_key(passphrase: bytes, salt: bytes) -> bytes:
    import base64
    kdf = Scrypt(salt=salt, length=32, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P)
    return base64.urlsafe_b64encode(kdf.derive(passphrase))


def _passphrase(explicit: str | None) -> bytes:
    raw = explicit or os.environ.get("AAE_BACKUP_PASSPHRASE", "")
    raw = raw.strip()
    if not raw:
        sys.exit("no passphrase — pass --passphrase or set AAE_BACKUP_PASSPHRASE")
    return raw.encode("utf-8")


def _sources(data_dir: str | None = None, env_files: list[str] | None = None) -> list[Path]:
    """The files worth backing up, those that exist.

    Defaults are the dev layout (backend/data, backend/.env). The DEPLOYED
    layout is different on both counts, which is why the paths are arguments:
    the databases live in the `backend-data` Docker volume (mounted at
    /app/data inside the backend container, absent from the host's
    backend/data), and compose reads secrets from the REPO-ROOT .env. Run with
    the defaults on the box and this backed up neither the purchase ledger nor
    the secrets — see ops/monthly_maintenance.sh for the invocation that does.
    """
    data = Path(data_dir) if data_dir else _BACKEND / "data"
    found = sorted(data.glob("*.db"))
    envs = [Path(e) for e in env_files] if env_files else [_BACKEND / ".env"]
    found.extend(e for e in envs if e.exists())
    return found


_SQLITE_MAGIC = b"SQLite format 3\x00"


def _snapshot(p: Path) -> bytes:
    """The bytes to archive for `p`. A live SQLite database is copied through
    the online-backup API, so a write landing mid-backup cannot tear the copy
    (a plain file read of a database being written can capture half a
    transaction). Anything else is read as-is."""
    with p.open("rb") as fh:
        is_db = fh.read(len(_SQLITE_MAGIC)) == _SQLITE_MAGIC
    if not is_db:
        return p.read_bytes()
    with tempfile.TemporaryDirectory() as tmp:
        dst_path = Path(tmp) / p.name
        src = sqlite3.connect(f"file:{p}?mode=ro", uri=True)
        dst = sqlite3.connect(dst_path)
        try:
            src.backup(dst)
        finally:
            dst.close()
            src.close()
        return dst_path.read_bytes()


def _arcname(p: Path) -> str:
    try:
        return str(p.resolve().relative_to(_REPO.resolve()))
    except ValueError:
        # Outside the tree (e.g. a secrets file mounted into a container):
        # keep the archive relative so restore stays inside its destination.
        return str(Path(*p.resolve().parts[1:]))


def _collect(paths: list[Path]) -> list[tuple[str, bytes]]:
    return [(_arcname(p), _snapshot(p)) for p in paths]


def _tar_members(members: list[tuple[str, bytes]]) -> bytes:
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for name, data in members:
            info = tarfile.TarInfo(name=name)
            info.size = len(data)
            info.mode = 0o600          # ledger + secrets: owner-only on restore
            tar.addfile(info, io.BytesIO(data))
    return buf.getvalue()


def _make_tar(paths: list[Path]) -> bytes:
    """tar.gz the given files under stable arcnames relative to the repo."""
    return _tar_members(_collect(paths))


def _encrypt(plaintext: bytes, passphrase: bytes) -> bytes:
    salt = os.urandom(_SALT_LEN)
    token = Fernet(_derive_key(passphrase, salt)).encrypt(plaintext)
    return _MAGIC + salt + token


def _decrypt(blob: bytes, passphrase: bytes) -> bytes:
    if not blob.startswith(_MAGIC):
        raise ValueError("not an AAE backup file (bad magic)")
    body = blob[len(_MAGIC):]
    salt, token = body[:_SALT_LEN], body[_SALT_LEN:]
    try:
        return Fernet(_derive_key(passphrase, salt)).decrypt(token)
    except InvalidToken as exc:
        raise ValueError(
            "decryption failed — wrong passphrase or corrupted file"
        ) from exc


def cmd_create(args) -> int:
    passphrase = _passphrase(args.passphrase)
    sources = _sources(getattr(args, "data", None), getattr(args, "env", None))
    if not sources:
        sys.exit("nothing to back up — no *.db in the data dir and no env file")
    blob = _encrypt(_make_tar(sources), passphrase)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = out_dir / f"aae-backup-{ts}.enc"
    out.write_bytes(blob)
    rel = ", ".join(_arcname(p) for p in sources)
    print(f"✓ backed up {len(sources)} file(s) [{rel}] → {out} ({len(blob):,} bytes)")
    return 0


def cmd_restore(args) -> int:
    passphrase = _passphrase(args.passphrase)
    blob = Path(args.file).read_bytes()
    tar_bytes = _decrypt(blob, passphrase)
    into = Path(args.into)
    into.mkdir(parents=True, exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(tar_bytes), mode="r:gz") as tar:
        _safe_extract(tar, into)
    print(f"✓ restored into {into}")
    return 0


def _safe_extract(tar: tarfile.TarFile, dest: Path) -> None:
    """Extract, refusing any member that would escape dest (path traversal)."""
    dest = dest.resolve()
    for member in tar.getmembers():
        target = (dest / member.name).resolve()
        if not (target == dest or dest in target.parents):
            raise ValueError(f"unsafe path in archive: {member.name}")
    # filter="data" (py3.12+) is defense-in-depth: it independently rejects
    # traversal/absolute paths and strips device/special members.
    tar.extractall(dest, filter="data")


def cmd_drill(args) -> int:
    """Exit-criterion self-check: back up the live state to memory, restore
    it to a temp dir, and confirm every file round-trips byte-for-byte.
    Touches no real files."""
    passphrase = _passphrase(args.passphrase)
    sources = _sources(getattr(args, "data", None), getattr(args, "env", None))
    if not sources:
        sys.exit("nothing to drill — no *.db in the data dir and no env file")
    members = _collect(sources)
    blob = _encrypt(_tar_members(members), passphrase)

    # Wrong passphrase must fail the HMAC, not restore garbage.
    try:
        _decrypt(blob, b"definitely-not-the-passphrase")
        sys.exit("✗ DRILL FAILED: a wrong passphrase decrypted the backup")
    except ValueError:
        pass

    with tempfile.TemporaryDirectory() as tmp:
        tar_bytes = _decrypt(blob, passphrase)
        with tarfile.open(fileobj=io.BytesIO(tar_bytes), mode="r:gz") as tar:
            _safe_extract(tar, Path(tmp))
        for name, data in members:
            restored = Path(tmp) / name
            if not restored.exists():
                sys.exit(f"✗ DRILL FAILED: {name} missing after restore")
            if restored.read_bytes() != data:
                sys.exit(f"✗ DRILL FAILED: {name} differs after restore")
            # A restored ledger must OPEN, not merely match bytes.
            if data.startswith(_SQLITE_MAGIC):
                conn = sqlite3.connect(restored)
                try:
                    ok = conn.execute("PRAGMA integrity_check").fetchone()[0]
                finally:
                    conn.close()
                if ok != "ok":
                    sys.exit(f"✗ DRILL FAILED: {name} integrity_check: {ok}")
    print(f"✓ DRILL PASSED: {len(sources)} file(s) round-tripped byte-for-byte; "
          f"wrong passphrase correctly rejected ({len(blob):,} byte backup)")
    return 0


def _add_source_args(p: argparse.ArgumentParser) -> None:
    p.add_argument("--data", help="directory holding the *.db files (default: backend/data)")
    p.add_argument("--env", action="append",
                   help="secrets file to include; repeatable (default: backend/.env)")


def main() -> int:
    ap = argparse.ArgumentParser(description="Encrypted backup/restore of AAE server state.")
    ap.add_argument("--passphrase", help="overrides AAE_BACKUP_PASSPHRASE")
    sub = ap.add_subparsers(dest="cmd", required=True)

    c = sub.add_parser("create", help="write an encrypted backup file")
    c.add_argument("--out", default="backups", help="output directory (default: backups/)")
    c.set_defaults(func=cmd_create)
    _add_source_args(c)

    r = sub.add_parser("restore", help="decrypt a backup into a directory")
    r.add_argument("file", help="the .enc backup file")
    r.add_argument("--into", required=True, help="destination directory")
    r.set_defaults(func=cmd_restore)

    d = sub.add_parser("drill", help="round-trip self-check, touches nothing")
    d.set_defaults(func=cmd_drill)
    _add_source_args(d)

    args = ap.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
