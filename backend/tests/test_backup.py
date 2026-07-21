"""
Phase 3.5 — encrypted backup/restore. The crypto round-trips, a wrong
passphrase or a tampered byte is rejected (authenticated encryption), the
archive can't be made to write outside its destination, and the drill
self-check passes against synthetic state.
"""
import io
import os
import sys
import tarfile

import pytest

sys.path.insert(0, os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tools"))

import backup as B  # noqa: E402

_PW = b"correct horse battery staple"


# ── crypto envelope ─────────────────────────────────────────────────────────

def test_encrypt_decrypt_roundtrip():
    data = os.urandom(4096)
    assert B._decrypt(B._encrypt(data, _PW), _PW) == data


def test_wrong_passphrase_rejected():
    blob = B._encrypt(b"secret ledger", _PW)
    with pytest.raises(ValueError, match="wrong passphrase or corrupted"):
        B._decrypt(blob, b"wrong passphrase")


def test_tampered_ciphertext_rejected():
    blob = bytearray(B._encrypt(b"secret ledger", _PW))
    blob[-1] ^= 0x01  # flip a bit in the token
    with pytest.raises(ValueError):
        B._decrypt(bytes(blob), _PW)


def test_bad_magic_rejected():
    with pytest.raises(ValueError, match="bad magic"):
        B._decrypt(b"not a backup file at all", _PW)


def test_salt_is_random_per_backup():
    a = B._encrypt(b"x", _PW)
    b = B._encrypt(b"x", _PW)
    assert a != b  # same plaintext + passphrase, different salt → different blob


# ── tar packing + safe extraction ───────────────────────────────────────────

def test_tar_roundtrips_files(tmp_path, monkeypatch):
    (tmp_path / "data").mkdir()
    f1 = tmp_path / "data" / "a.db"
    f2 = tmp_path / ".env"
    f1.write_bytes(b"ledger-bytes")
    f2.write_text("AAE_SECRET=xyz\n")
    monkeypatch.setattr(B, "_REPO", tmp_path)  # arcnames relative to tmp root
    blob = B._encrypt(B._make_tar([f1, f2]), _PW)

    out = tmp_path / "restore"
    tar_bytes = B._decrypt(blob, _PW)
    with tarfile.open(fileobj=io.BytesIO(tar_bytes), mode="r:gz") as tar:
        B._safe_extract(tar, out)
    assert (out / "data" / "a.db").read_bytes() == b"ledger-bytes"
    assert (out / ".env").read_text() == "AAE_SECRET=xyz\n"


def test_safe_extract_blocks_path_traversal(tmp_path):
    # Craft an archive whose member escapes the destination.
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        info = tarfile.TarInfo(name="../escaped.txt")
        payload = b"pwned"
        info.size = len(payload)
        tar.addfile(info, io.BytesIO(payload))
    buf.seek(0)
    dest = tmp_path / "dest"
    dest.mkdir()
    with tarfile.open(fileobj=buf, mode="r:gz") as tar:
        with pytest.raises(ValueError, match="unsafe path"):
            B._safe_extract(tar, dest)
    assert not (tmp_path / "escaped.txt").exists()


# ── the drill (exit criterion) ──────────────────────────────────────────────

def test_drill_passes_on_synthetic_state(tmp_path, monkeypatch, capsys):
    (tmp_path / "data").mkdir()
    (tmp_path / "data" / "receipts.db").write_bytes(os.urandom(2048))
    (tmp_path / ".env").write_text("AAE_SECRET=drill\n")
    monkeypatch.setattr(B, "_REPO", tmp_path)
    monkeypatch.setattr(B, "_BACKEND", tmp_path)

    class _Args:
        passphrase = "drill-pass"
    assert B.cmd_drill(_Args()) == 0
    assert "DRILL PASSED" in capsys.readouterr().out


def test_passphrase_required(monkeypatch):
    monkeypatch.delenv("AAE_BACKUP_PASSPHRASE", raising=False)
    with pytest.raises(SystemExit):
        B._passphrase(None)
