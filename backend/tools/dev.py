#!/usr/bin/env python3
"""
dev.py — one entry point for the observatory's developer tools & tests.

Wraps the individual tools (unlock, mint-token, smoke, parity) and the test
suites behind a single CLI, and adds `ai set` / `ai check` to configure and
LIVE-VERIFY the Anthropic key that powers the premium readings — the in-depth
Oracle Report and the deluxe PDF Personal Report both read AAE_ANTHROPIC_API_KEY.

Run from backend/:

    .venv/bin/python tools/dev.py <command> [args]

Commands:
    unlock [--url URL]          Print your personal free-access unlock link.
    token  [--tier T] [--seed S]  Mint a browser entitlement token.
    smoke  [--full]             Tier-matrix smoke test against a live server.
    parity [--check]            Regenerate (or --check) the golden parity vectors.
    test   [backend|core|frontend|all]   Run the test suites (default: all).

    ai set <key>                Store AAE_ANTHROPIC_API_KEY in backend/.env.
    ai check [--model M] [--effort E]    Live-verify the Fable 5 premium path.
    ai status                   Show the current premium-report configuration.

`ai check` makes one cheap real request through the exact beta/fallbacks/effort
surface the reports use, so a green check means the Oracle & Personal reports
will actually serve (not silently fall back to the offline compiler).
"""
from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent          # backend/tools
BACKEND = HERE.parent                            # backend
ROOT = BACKEND.parent                            # repo root
ENV_PATH = BACKEND / ".env"
PY = str(BACKEND / ".venv/bin/python")


# --------------------------------------------------------------------------- #
# .env helpers
# --------------------------------------------------------------------------- #

def _read_env(key: str) -> str | None:
    if not ENV_PATH.exists():
        return None
    for line in ENV_PATH.read_text().splitlines():
        m = re.match(rf"\s*{re.escape(key)}\s*=\s*(.*?)\s*$", line)
        if m:
            return m.group(1).strip().strip('"').strip("'") or None
    return None


def _upsert_env(key: str, value: str) -> None:
    """Set or replace KEY=value in backend/.env, preserving other lines."""
    lines = ENV_PATH.read_text().splitlines() if ENV_PATH.exists() else []
    pat = re.compile(rf"\s*{re.escape(key)}\s*=")
    out, replaced = [], False
    for line in lines:
        if pat.match(line):
            out.append(f"{key}={value}")
            replaced = True
        else:
            out.append(line)
    if not replaced:
        out.append(f"{key}={value}")
    ENV_PATH.write_text("\n".join(out) + "\n")


def _run(argv: list[str]) -> int:
    """Run a subprocess from backend/, streaming its output; return exit code."""
    print(f"→ {' '.join(argv)}\n", flush=True)
    return subprocess.call(argv, cwd=str(BACKEND))


# --------------------------------------------------------------------------- #
# Thin wrappers over the existing tools
# --------------------------------------------------------------------------- #

def cmd_unlock(args) -> int:
    return _run([PY, "tools/unlock.py", *(["--url", args.url] if args.url else [])])


def cmd_token(args) -> int:
    argv = [PY, "tools/mint_test_tokens.py"]
    if args.tier:
        argv += ["--tier", args.tier]
    if args.seed:
        argv += ["--seed", args.seed]
    return _run(argv)


def cmd_smoke(args) -> int:
    return _run([PY, "tools/smoke_tiers.py", *(["--full"] if args.full else [])])


def cmd_parity(args) -> int:
    return _run([PY, "tools/gen_parity_vectors.py", *(["--check"] if args.check else [])])


def cmd_test(args) -> int:
    target = args.target
    rc = 0
    if target in ("backend", "all"):
        rc |= _run([PY, "-m", "pytest", "tests/", "-q"])
    if target in ("core", "all"):
        rc |= subprocess.call(["npm", "test"], cwd=str(ROOT / "packages/astra-core"))
    if target in ("frontend", "all"):
        rc |= subprocess.call(["npm", "run", "build"], cwd=str(ROOT / "frontend"))
    return rc


# --------------------------------------------------------------------------- #
# AI / premium-report key configuration + live verification
# --------------------------------------------------------------------------- #

def cmd_ai_status(_args) -> int:
    key = _read_env("AAE_ANTHROPIC_API_KEY") or os.environ.get("AAE_ANTHROPIC_API_KEY")
    print("Premium-report configuration (backend/.env):\n")
    masked = f"set (…{key[-4:]})" if key else "UNSET → reports serve the deterministic OFFLINE compiler"
    print(f"  AAE_ANTHROPIC_API_KEY         {masked}")
    for k, default in [
        ("AAE_ORACLE_REPORT_MODEL", "claude-fable-5"),
        ("AAE_ORACLE_REPORT_FALLBACK", "claude-opus-4-8"),
        ("AAE_ORACLE_REPORT_EFFORT", "high"),
        ("AAE_PERSONAL_REPORT_MODEL", "claude-fable-5"),
        ("AAE_PERSONAL_REPORT_EFFORT", "high"),
    ]:
        print(f"  {k:29} {_read_env(k) or f'{default} (default)'}")
    print("\nRun `dev.py ai check` to verify the key reaches Fable 5.")
    return 0


def cmd_ai_set(args) -> int:
    _upsert_env("AAE_ANTHROPIC_API_KEY", args.key)
    print(f"→ wrote AAE_ANTHROPIC_API_KEY to {ENV_PATH}")
    print("  Restart the backend, then run `dev.py ai check`.")
    return 0


def cmd_ai_check(args) -> int:
    key = args.key or _read_env("AAE_ANTHROPIC_API_KEY") or os.environ.get("AAE_ANTHROPIC_API_KEY")
    if not key:
        print("No AAE_ANTHROPIC_API_KEY. Set one first:  dev.py ai set sk-ant-...")
        return 2
    model = args.model or _read_env("AAE_ORACLE_REPORT_MODEL") or "claude-fable-5"
    fallback = _read_env("AAE_ORACLE_REPORT_FALLBACK") or "claude-opus-4-8"

    import anthropic

    print(f"Probing {model} (effort={args.effort}, fallback→{fallback})…\n")
    client = anthropic.Anthropic(api_key=key, timeout=90)
    try:
        # Mirror the reports' exact premium surface: beta messages + server-side
        # refusal fallbacks + effort (no thinking/sampling params on Fable 5).
        resp = client.beta.messages.create(
            model=model,
            max_tokens=512,
            output_config={"effort": args.effort},
            betas=["server-side-fallback-2026-06-01"],
            fallbacks=[{"model": fallback}],
            messages=[{"role": "user", "content": "Reply with exactly: ok"}],
        )
    except anthropic.AuthenticationError:
        print("✗ Authentication failed — the API key is invalid or revoked.")
        return 1
    except anthropic.PermissionDeniedError as e:
        print(f"✗ Permission denied — the key can't access {model}: {e}")
        return 1
    except anthropic.NotFoundError:
        print(f"✗ {model} not found for this key (typo, or no access to the model).")
        return 1
    except anthropic.BadRequestError as e:
        msg = str(e)
        if "retention" in msg.lower() or "zdr" in msg.lower():
            print("✗ Fable 5 requires 30-day data retention on your Anthropic org.\n"
                  "  Zero-data-retention orgs get a 400 on every Fable 5 call.\n"
                  "  Fix the org's retention setting, or point the reports at Opus:\n"
                  "    dev.py ai check --model claude-opus-4-8")
        else:
            print(f"✗ Bad request: {msg}")
        return 1
    except anthropic.APIError as e:
        print(f"✗ API error: {e}")
        return 1

    served = resp.model
    refused = resp.stop_reason == "refusal"
    fell_back = served and served != model
    if refused:
        cat = getattr(resp.stop_details, "category", None) if resp.stop_details else None
        print(f"⚠ The whole chain refused (category={cat}). The key works, but this "
              "prompt was declined — a real report may still succeed.")
        return 0
    print(f"✓ Premium path live. Served by: {served}"
          + (f"  (Fable 5 fell back to {served})" if fell_back else ""))
    print("  The Oracle Report and PDF Personal Report will use this key.")
    return 0


# --------------------------------------------------------------------------- #

def main() -> None:
    ap = argparse.ArgumentParser(prog="dev.py", description="Observatory dev tools & tests.")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("unlock", help="print your free-access unlock link")
    p.add_argument("--url"); p.set_defaults(fn=cmd_unlock)

    p = sub.add_parser("token", help="mint a browser entitlement token")
    p.add_argument("--tier"); p.add_argument("--seed"); p.set_defaults(fn=cmd_token)

    p = sub.add_parser("smoke", help="tier-matrix smoke test vs a live server")
    p.add_argument("--full", action="store_true"); p.set_defaults(fn=cmd_smoke)

    p = sub.add_parser("parity", help="regenerate (or --check) golden vectors")
    p.add_argument("--check", action="store_true"); p.set_defaults(fn=cmd_parity)

    p = sub.add_parser("test", help="run test suites")
    p.add_argument("target", nargs="?", default="all",
                   choices=["backend", "core", "frontend", "all"])
    p.set_defaults(fn=cmd_test)

    ai = sub.add_parser("ai", help="configure / verify the premium-report API key")
    ai_sub = ai.add_subparsers(dest="ai_cmd", required=True)
    s = ai_sub.add_parser("status", help="show premium-report config"); s.set_defaults(fn=cmd_ai_status)
    s = ai_sub.add_parser("set", help="store AAE_ANTHROPIC_API_KEY in .env")
    s.add_argument("key"); s.set_defaults(fn=cmd_ai_set)
    s = ai_sub.add_parser("check", help="live-verify the Fable 5 premium path")
    s.add_argument("--model"); s.add_argument("--effort", default="low"); s.add_argument("--key")
    s.set_defaults(fn=cmd_ai_check)

    args = ap.parse_args()
    sys.exit(args.fn(args))


if __name__ == "__main__":
    main()
