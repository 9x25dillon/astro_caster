#!/usr/bin/env python
"""
smoke_tiers.py — behavioral smoke test of the tier system against a RUNNING
backend (default http://127.0.0.1:8787). Walks the tier × endpoint gate
matrix and prints a PASS/FAIL table.

Cheap by design: every default check either exercises a deterministic path or
is rejected by a gate BEFORE any AI/RPC work, so nothing costs tokens or money
even when API keys are configured. The one clever trick: a PDF-2 claim bound
to a FABRICATED session seed passes the purchase gate and is then rejected 409
by the genuine-session check — proving the gate ordering with zero AI spend.

    .venv/bin/python tools/smoke_tiers.py            # gate matrix (free)
    .venv/bin/python tools/smoke_tiers.py --full     # + real Oracle → purchase
                                                     #   claim → deluxe compile
                                                     #   (free offline without
                                                     #   AAE_ANTHROPIC_API_KEY;
                                                     #   COSTS MONEY with one)

Tokens are minted locally with the AAE_SECRET from backend/.env — the same
secret the server signs with — so they validate like real ones.
If checks come back 429, the rate limiter is on: AAE_RATE_LIMIT_ENABLED=0.
"""
from __future__ import annotations

import argparse
import os
import sys

_BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _BACKEND)

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(_BACKEND, ".env"))   # before importing entitlements
except ImportError:
    pass

import httpx  # noqa: E402

import entitlements as ENT  # noqa: E402

_EINSTEIN = dict(year=1879, month=3, day=14, hour=11, minute=30, second=0,
                 lat=48.4011, lng=9.9876, tz_offset=0.67)
_Q = "What is asked of me?"

_results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, note: str = "") -> None:
    _results.append((name, ok, note))
    print(f"  {'✓' if ok else '✗ FAIL'}  {name}" + (f"  — {note}" if note else ""))


def fake_session(seed: str = "smoke-fake-seed") -> dict:
    return {"seed": seed, "spread": "three_card", "source": "golden_dawn",
            "question": _Q, "report": "# Smoke\nnon-empty oracle text",
            "generated_at": "2026-07-01", "ai_source": "offline"}


def main() -> None:
    ap = argparse.ArgumentParser(description="tier gate smoke test")
    ap.add_argument("--base", default="http://127.0.0.1:8787")
    ap.add_argument("--full", action="store_true",
                    help="also run Oracle → purchase claim → deluxe compile end-to-end "
                         "(free offline; costs money if AAE_ANTHROPIC_API_KEY is set)")
    args = ap.parse_args()

    c = httpx.Client(base_url=args.base + "/api", timeout=120.0)

    sup = ENT.mint_entitlement("supporter", ref="smoke", verified=True)["token"]
    ora = ENT.mint_entitlement("oracle", ref="smoke", verified=True)["token"]
    dev = os.environ.get("AAE_DEV_TOKEN", "").strip()

    print(f"\n═ Smoke: tier matrix against {args.base} ═\n")

    # ── Server up + chart substrate ─────────────────────────────────────────
    r = c.get("/health")
    check("health", r.status_code == 200)
    r = c.post("/generate-chart", json=_EINSTEIN)
    check("generate-chart", r.status_code == 200)
    if r.status_code != 200:
        print("\nServer not usable — aborting. Is ./run.sh running?")
        sys.exit(1)
    chart = r.json()

    # ── Token validation reflects the minted tier ───────────────────────────
    print("\n─ entitlement status ─")
    for name, tok, want in [("no token → free", None, "free"),
                            ("supporter token", sup, "supporter"),
                            ("oracle token", ora, "oracle")]:
        r = c.get("/entitlement", params={"token": tok} if tok else None)
        check(name, r.json().get("tier") == want, f"got {r.json().get('tier')}")
    if dev:
        r = c.get("/entitlement", params={"token": dev})
        check("dev token → oracle", r.json().get("tier") == "oracle")
    # A PDF-2 claim must NOT work as a tier entitlement (token kinds disjoint).
    claim_fake = ENT.mint_report_token(seed="smoke-fake-seed", ref="smoke",
                                       verified=True)["token"]
    r = c.get("/entitlement", params={"token": claim_fake})
    check("report claim as entitlement → free", r.json().get("tier") in (None, "free"))

    # ── Free tier: the deterministic core must work with NO token ───────────
    print("\n─ free tier (offline-first invariant) ─")
    for name, path, body in [
        ("natal-arcana", "/natal-arcana", chart),   # takes the ChartResponse itself
        ("tarot-reading (no AI)", "/tarot-reading",
         {"chart": chart, "spread": "three_card", "question": _Q, "include_ai": False}),
        ("forecast (7d)", "/forecast", {"natal": _EINSTEIN, "days": 7}),
        ("deck-art", "/deck-art", {"chart": chart}),
    ]:
        r = c.post(path, json=body)
        check(name, r.status_code == 200, f"{r.status_code}")

    # ── Paid gates fail closed (all rejected BEFORE any AI work) ────────────
    print("\n─ tier gates (402 fail-closed) ─")
    r = c.post("/ai-ask", json={"chart": chart, "query": _Q,
                                "lens": "psychological", "depth": "deep"})
    check("ai-ask deep · free → 402", r.status_code == 402, f"{r.status_code}")
    r = c.post("/tts", json={"text": "smoke"})
    check("tts · free → 402 (503 = TTS unconfigured, also fine)",
          r.status_code in (402, 503), f"{r.status_code}")
    for name, tok in [("free", None), ("supporter", sup)]:
        r = c.post("/oracle-report", json={"chart": chart, "question": _Q,
                                           "entitlement": tok})
        check(f"oracle-report · {name} → 402", r.status_code == 402, f"{r.status_code}")
        r = c.post("/personal-report", json={"chart": chart, "oracle": fake_session(),
                                             "entitlement": tok})
        check(f"personal-report · {name} → 402", r.status_code == 402, f"{r.status_code}")

    # ── PDF-2 purchase gate (oracle tier is NOT enough) ─────────────────────
    print("\n─ PDF-2 deluxe purchase gate ─")
    r = c.post("/personal-report", json={"chart": chart, "oracle": fake_session(),
                                         "entitlement": ora})
    check("oracle, no claim → 402 naming 'purchase'",
          r.status_code == 402 and "purchase" in r.text, f"{r.status_code}")
    other = ENT.mint_report_token(seed="a-different-session", ref="smoke",
                                  verified=True)["token"]
    r = c.post("/personal-report", json={"chart": chart, "oracle": fake_session(),
                                         "entitlement": ora, "report_token": other})
    check("oracle, claim for OTHER seed → 402", r.status_code == 402, f"{r.status_code}")
    r = c.post("/personal-report", json={"chart": chart, "oracle": fake_session(),
                                         "entitlement": ora, "report_token": ora})
    check("oracle, tier token as claim → 402", r.status_code == 402, f"{r.status_code}")
    # Claim bound to the fabricated seed: purchase gate PASSES, genuine-session
    # check then rejects 409 — proves gate ordering without any AI spend.
    r = c.post("/personal-report", json={"chart": chart, "oracle": fake_session(),
                                         "entitlement": ora, "report_token": claim_fake})
    check("oracle, matching claim, fake session → 409 (gate order)",
          r.status_code == 409, f"{r.status_code}")
    if dev:
        r = c.post("/personal-report", json={"chart": chart, "oracle": fake_session(),
                                             "entitlement": dev})
        check("dev token bypasses purchase (fake session → 409, not 402)",
              r.status_code == 409, f"{r.status_code}")

    # ── Purchase rail itself ────────────────────────────────────────────────
    print("\n─ PDF-2 purchase rail ─")
    r = c.post("/personal-report/purchase", json={"tx_hash": "0xsmoke", "seed": "s"})
    check("purchase · no entitlement → 402", r.status_code == 402, f"{r.status_code}")
    trust = ENT.trust_mode_allowed()
    r = c.post("/personal-report/purchase",
               json={"tx_hash": "0xsmoke", "seed": "smoke-fake-seed",
                     "entitlement": ora})
    if trust:
        ok = r.status_code == 200 and r.json()["report_token"]["verified"] is False
        check("purchase · oracle + trust mode → 200 unverified mint", ok,
              f"{r.status_code}")
    else:
        check("purchase · oracle, no RPC/trust → 402 fail-closed",
              r.status_code == 402, f"{r.status_code}")
        print("     (to exercise the mint through the UI: AAE_TRUST_MODE=1 ./run.sh)")

    # ── Full paid flow (opt-in) ─────────────────────────────────────────────
    if args.full:
        print("\n─ full flow: Oracle → claim → deluxe compile ─")
        r = c.post("/oracle-report", json={"chart": chart, "question": _Q,
                                           "spread": "three_card",
                                           "source": "golden_dawn",
                                           "entitlement": ora})
        check("oracle-report · oracle → 200", r.status_code == 200, f"{r.status_code}")
        if r.status_code == 200:
            o = r.json()
            print(f"     ai_source={o['ai_source']} model={o['model']}")
            claim = ENT.mint_report_token(seed=o["seed"], ref="smoke",
                                          verified=True)["token"]
            session = {"seed": o["seed"], "spread": o["spread"], "source": o["source"],
                       "question": o["question"], "report": o["report"],
                       "generated_at": "2026-07-01", "ai_source": o["ai_source"],
                       "model": o["model"]}
            r = c.post("/personal-report", json={"chart": chart, "oracle": session,
                                                 "entitlement": ora,
                                                 "report_token": claim,
                                                 "display_name": "Smoke Test"})
            check("personal-report · genuine session + claim → 200",
                  r.status_code == 200, f"{r.status_code}")
            if r.status_code == 200:
                p = r.json()
                print(f"     ai_source={p['ai_source']} "
                      f"markdown={len(p['report_markdown'])} chars")

    # ── Summary ─────────────────────────────────────────────────────────────
    failed = [x for x in _results if not x[1]]
    print(f"\n═ {len(_results) - len(failed)}/{len(_results)} checks passed ═")
    if any("429" in note for _, _, note in _results):
        print("  (429s seen — the rate limiter is on; AAE_RATE_LIMIT_ENABLED=0 for smoke runs)")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
