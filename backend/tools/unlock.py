#!/usr/bin/env python3
"""
unlock.py — use your own Astra for free.

Astra's oracle tier is normally unlocked by a crypto contribution, but the owner
shouldn't pay themselves. `AAE_DEV_TOKEN` is a static bypass string (set in
backend/.env) that grants **oracle tier, no expiry**, checked separately from the
HMAC signing path — so rotating AAE_SECRET never revokes your own access.

This tool reads (or creates) that token and prints everything you need to unlock
a browser: the shareable `?entitlement=` URL and the devtools localStorage snippet.

Usage (from backend/):
    .venv/bin/python tools/unlock.py                 # localhost:5173
    .venv/bin/python tools/unlock.py --url https://my-astra.example
    .venv/bin/python tools/unlock.py --ensure        # generate + persist a token if none is set
    .venv/bin/python tools/unlock.py --qr            # also print a scannable QR (needs `qrcode`)
"""
from __future__ import annotations

import argparse
import re
import secrets
from pathlib import Path

ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
KEY = "AAE_DEV_TOKEN"


def read_token() -> str | None:
    if not ENV_PATH.exists():
        return None
    for line in ENV_PATH.read_text().splitlines():
        m = re.match(rf"\s*{KEY}\s*=\s*(.+?)\s*$", line)
        if m:
            val = m.group(1).strip().strip('"').strip("'")
            return val or None
    return None


def ensure_token() -> str:
    """Return the existing dev token, or generate one and append it to .env."""
    existing = read_token()
    if existing:
        return existing
    token = secrets.token_hex(24)
    with ENV_PATH.open("a") as f:
        if ENV_PATH.exists() and ENV_PATH.read_text() and not ENV_PATH.read_text().endswith("\n"):
            f.write("\n")
        f.write(f"\n# Personal free-access token (oracle tier, no expiry) — see tools/unlock.py\n")
        f.write(f"{KEY}={token}\n")
    print(f"→ generated a new {KEY} and wrote it to {ENV_PATH}")
    print("  (restart the backend so it picks up the new token)\n")
    return token


def main() -> None:
    ap = argparse.ArgumentParser(description="Unlock your own Astra (oracle tier, free).")
    ap.add_argument("--url", default="http://localhost:5173",
                    help="base URL of your Astra instance (default: http://localhost:5173)")
    ap.add_argument("--ensure", action="store_true",
                    help="generate + persist a dev token to .env if none is set")
    ap.add_argument("--qr", action="store_true", help="also render the unlock URL as a QR code")
    args = ap.parse_args()

    token = ensure_token() if args.ensure else read_token()
    if not token:
        raise SystemExit(
            f"No {KEY} in {ENV_PATH}.\n"
            f"Run with --ensure to generate one, or add it yourself:\n"
            f"    echo '{KEY}='$(openssl rand -hex 24) >> backend/.env"
        )

    base = args.url.rstrip("/")
    unlock_url = f"{base}/?entitlement={token}"

    print("═" * 68)
    print("  UNLOCK YOUR OWN ASTRA — oracle tier, no expiry, no payment")
    print("═" * 68)
    print("\n1) Open this URL (it stores the token and scrubs itself from the bar):\n")
    print(f"   {unlock_url}\n")
    print("   …or on a phone, text/AirDrop it to yourself and tap it.\n")
    print("2) Prefer devtools? Paste this in the browser console instead:\n")
    print(f"   localStorage.setItem('aae.entitlement', '{token}'); location.reload()\n")
    print("   To go back to the free tier:")
    print(f"   {base}/?entitlement=clear\n")
    print("═" * 68)

    if args.qr:
        try:
            import qrcode  # type: ignore

            qr = qrcode.QRCode(border=1)
            qr.add_data(unlock_url)
            qr.make()
            qr.print_ascii(invert=True)
        except ImportError:
            print("(QR skipped — `pip install qrcode` to enable)")


if __name__ == "__main__":
    main()
