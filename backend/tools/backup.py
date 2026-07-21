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
import sys
import tarfile
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


def _sources() -> list[Path]:
    """The files worth backing up, those that exist."""
    found = sorted((_BACKEND / "data").glob("*.db"))
    env = _BACKEND / ".env"
    if env.exists():
        found.append(env)
    return found


def _make_tar(paths: list[Path]) -> bytes:
    """tar.gz the given files under stable arcnames rooted at backend/."""
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for p in paths:
            tar.add(p, arcname=str(p.relative_to(_REPO)))
    return buf.getvalue()


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
    sources = _sources()
    if not sources:
        sys.exit("nothing to back up — no backend/data/*.db and no backend/.env")
    blob = _encrypt(_make_tar(sources), passphrase)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = out_dir / f"aae-backup-{ts}.enc"
    out.write_bytes(blob)
    rel = ", ".join(str(p.relative_to(_REPO)) for p in sources)
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
    import tempfile

    passphrase = _passphrase(args.passphrase)
    sources = _sources()
    if not sources:
        sys.exit("nothing to drill — no backend/data/*.db and no backend/.env")
    blob = _encrypt(_make_tar(sources), passphrase)

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
        for src in sources:
            restored = Path(tmp) / src.relative_to(_REPO)
            if not restored.exists():
                sys.exit(f"✗ DRILL FAILED: {src.name} missing after restore")
            if restored.read_bytes() != src.read_bytes():
                sys.exit(f"✗ DRILL FAILED: {src.name} differs after restore")
    print(f"✓ DRILL PASSED: {len(sources)} file(s) round-tripped byte-for-byte; "
          f"wrong passphrase correctly rejected ({len(blob):,} byte backup)")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Encrypted backup/restore of AAE server state.")
    ap.add_argument("--passphrase", help="overrides AAE_BACKUP_PASSPHRASE")
    sub = ap.add_subparsers(dest="cmd", required=True)

    c = sub.add_parser("create", help="write an encrypted backup file")
    c.add_argument("--out", default="backups", help="output directory (default: backups/)")
    c.set_defaults(func=cmd_create)

    r = sub.add_parser("restore", help="decrypt a backup into a directory")
    r.add_argument("file", help="the .enc backup file")
    r.add_argument("--into", required=True, help="destination directory")
    r.set_defaults(func=cmd_restore)

    d = sub.add_parser("drill", help="round-trip self-check, touches nothing")
    d.set_defaults(func=cmd_drill)

    args = ap.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
