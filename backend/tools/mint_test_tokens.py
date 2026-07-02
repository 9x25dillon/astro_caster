#!/usr/bin/env python
"""
mint_test_tokens.py — dev utility: mint valid entitlement tokens for every
tier (plus an optional PDF-2 deluxe report claim) signed with the SAME
AAE_SECRET the local server loads from backend/.env, so they validate against
the running backend exactly like real supporter/oracle tokens.

Usage (from backend/):
    .venv/bin/python tools/mint_test_tokens.py
    .venv/bin/python tools/mint_test_tokens.py --seed <oracle_session_seed>

Then in the browser devtools console (http://127.0.0.1:5173):
    localStorage.setItem("aae.entitlement", "<token>"); location.reload()

Tier cheat-sheet:
    free      → localStorage.removeItem("aae.entitlement"); location.reload()
    supporter → paste the SUPPORTER token
    oracle    → paste the ORACLE token (or the AAE_DEV_TOKEN from .env)
    deluxe    → --seed binds a PDF-2 claim to one Oracle session; paste it into
                the aae.report_tokens map (instructions printed below)
"""
from __future__ import annotations

import argparse
import json
import os
import sys

_BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _BACKEND)

# Load .env BEFORE importing entitlements — it reads env at import time.
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(_BACKEND, ".env"))
except ImportError:
    pass

import entitlements as ENT  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 2)[1])
    ap.add_argument("--seed", help="Oracle session seed to bind a PDF-2 report claim to")
    ap.add_argument("--days", type=int, default=None,
                    help="override lifetime for the report claim (default: AAE_REPORT_TOKEN_DAYS)")
    args = ap.parse_args()

    if ENT._SECRET_INSECURE:
        print("⚠  AAE_SECRET is the dev default — tokens will only validate against a "
              "server using the same default.\n")

    sup = ENT.mint_entitlement("supporter", ref="local-test", verified=True)
    ora = ENT.mint_entitlement("oracle", ref="local-test", verified=True)

    print("── SUPPORTER token ──────────────────────────────────────────────")
    print(sup["token"])
    print()
    print("── ORACLE token ─────────────────────────────────────────────────")
    print(ora["token"])
    print()
    print('Browser: localStorage.setItem("aae.entitlement", "<token>"); location.reload()')
    print('Free tier: localStorage.removeItem("aae.entitlement"); location.reload()')

    dev = os.environ.get("AAE_DEV_TOKEN", "").strip()
    if dev:
        print("\n(AAE_DEV_TOKEN is set in .env — it also grants oracle tier AND bypasses "
              "the PDF-2 purchase gate; use the ORACLE token above when you want to "
              "test the purchase rail itself.)")

    if args.seed:
        if args.days is not None:
            ENT._REPORT_TOKEN_DAYS = args.days
        claim = ENT.mint_report_token(seed=args.seed, ref="local-test", verified=True)
        print("\n── PDF-2 report claim (bound to that Oracle session) ────────────")
        print(claim["token"])
        print("\nBrowser (merges into the per-seed claim map the UI reads):")
        snippet = (
            'const m = JSON.parse(localStorage.getItem("aae.report_tokens") ?? "{}"); '
            f'm[{json.dumps(args.seed)}] = {json.dumps(claim["token"])}; '
            'localStorage.setItem("aae.report_tokens", JSON.stringify(m));'
        )
        print(f"    {snippet}")
        print("\nThen re-run the same Oracle Report (same chart + spread + question) —")
        print("the deluxe block shows '✓ deluxe purchase verified' with the Compile button.")


if __name__ == "__main__":
    main()
