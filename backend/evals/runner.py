"""
runner.py — run the eval cases and report.

Two modes, and the distinction is the thing that makes this suite affordable:

  REPLAY (default)  Read recorded generations from `cassettes/` and check them.
                    No network, no spend, deterministic — so CI can run it on
                    every push, which is the only way a quality suite actually
                    holds a line.

  RECORD (--record) Call the real provider, save what comes back, then check it.
                    Costs money. Run when a prompt, model, or budget changes.

A cassette is a real generation, not a fixture someone typed. That is the whole
argument for this suite existing: mocked output cannot be truncated, cannot
invent a placement, and cannot drift — which is precisely why 488 mocked tests
watched every supporter reading end mid-sentence and reported success.

Usage
-----
    .venv/bin/python -m evals.runner                 # replay, check, report
    .venv/bin/python -m evals.runner --record        # re-record from the provider
    .venv/bin/python -m evals.runner --record --case oracle:angles
    .venv/bin/python -m evals.runner --json report.json
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from dataclasses import asdict
from pathlib import Path
from typing import Dict, List, Optional

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Pin the ephemeris, FORCED, exactly as tests/conftest.py does — and for a
# sharper reason here than there.
#
# `main()` loads .env when --record, so a RECORDING used the operator's
# SE_EPHE_PATH and got swiss-files: 17 bodies, 40 major aspects. A REPLAY loaded
# no .env at all, fell back to Moshier, and got 16 bodies and 33 major aspects —
# no Chiron, because Moshier has no asteroids. So every cassette was being
# checked against a chart that was not the one it had been generated from.
#
# It surfaced on 2026-08-19 as a false "Jupiter conjunct Chiron — chart has no
# major aspect between them" against a reading that was quoting the aspect list
# it had actually been handed. A grounding check comparing prose to the wrong
# chart does not merely miss defects; it manufactures them.
#
# The vendored directory is the drift-lock set the parity vectors are generated
# against and the exact files the on-device engine ships. Must precede any
# ephemeris import — the lazy imports inside chart_dict() are what make setting
# it here sufficient.
os.environ["SE_EPHE_PATH"] = str(
    Path(__file__).resolve().parents[2]
    / "packages" / "astra-core" / "src" / "vendor" / "swisseph")

from .cases import CHART_REQUEST, build_cases          # noqa: E402
from .checks import Case, Generation, failed, run_checks  # noqa: E402

CASSETTE_DIR = Path(__file__).resolve().parent / "cassettes"


# --------------------------------------------------------------------------- #
# cassettes
# --------------------------------------------------------------------------- #
def _slug(case_id: str) -> str:
    return case_id.replace(":", "__")


def cassette_path(case_id: str) -> Path:
    return CASSETTE_DIR / f"{_slug(case_id)}.json"


def load_cassette(case_id: str) -> Optional[Generation]:
    p = cassette_path(case_id)
    if not p.exists():
        return None
    d = json.loads(p.read_text())
    return Generation(
        text=d["text"], finish_reason=d.get("finish_reason"),
        model=d.get("model", ""), completion_tokens=d.get("completion_tokens"))


def save_cassette(case_id: str, gen: Generation, meta: Dict) -> None:
    CASSETTE_DIR.mkdir(parents=True, exist_ok=True)
    payload = {**asdict(gen), "case": case_id, **meta}
    cassette_path(case_id).write_text(json.dumps(payload, indent=2, ensure_ascii=False))


# --------------------------------------------------------------------------- #
# placements from the real engine
# --------------------------------------------------------------------------- #
def chart_placements() -> Dict[str, str]:
    """planet id -> sign, computed. The grounding check's source of truth."""
    from ephemeris import calculate_chart
    from models import ChartRequest
    chart = calculate_chart(ChartRequest(**CHART_REQUEST)).model_dump()
    return {p["id"]: p["sign"] for p in chart["planets"]}


def chart_aspects() -> Dict[str, str]:
    """{"Body|Body": aspect type} for the MAJOR aspects the chart really has.

    The aspect check's source of truth, computed the same way the placements are
    rather than transcribed — an aspect table typed by hand rots the moment the
    reference chart or the orb rules move.
    """
    from evals.checks import aspect_key
    chart = chart_dict()
    majors = {"Conjunction", "Opposition", "Trine", "Square", "Sextile"}
    return {aspect_key(a["p1"], a["p2"]): a["type"]
            for a in chart["aspects"] if a["type"] in majors}


def chart_dict() -> Dict:
    from ephemeris import calculate_chart
    from models import ChartRequest
    return calculate_chart(ChartRequest(**CHART_REQUEST)).model_dump()


# --------------------------------------------------------------------------- #
# recording
# --------------------------------------------------------------------------- #
def _arcana_prompts(case: Case, chart: Dict):
    """System, user, model and budget for a tarot-spread case.

    Mirrors what main.py's /api/tarot-reading builds. It is assembled here
    rather than imported from the endpoint because the endpoint is a FastAPI
    handler that also mints entitlements, rate-limits and records spend; what
    the eval needs is the prompt pair and the ceiling, which is the part that
    decides whether the reading arrives whole.
    """
    import ai
    import tarot as TAROT
    from models import ChartResponse
    from tarot_models import TarotReadingRequest
    from tarot_prompts import (ARCANA_READING_STRUCTURE, ARCANA_SYSTEM,
                               build_arcana_user_prompt)

    chart_obj = ChartResponse(**chart)
    reading = TAROT.build_reading_core(TarotReadingRequest(
        chart=chart_obj, spread=case.spread, question=case.query))
    sig = reading.signature
    drawn = [{"position": c.position, "name": c.card.name,
              "orientation": "reversed" if c.reversed else "upright",
              "natal_link": c.natal_link or ""} for c in reading.cards]
    user = build_arcana_user_prompt(
        question=case.query, spread=case.spread,
        dominant_element=sig.dominant_element,
        dominant_modality=sig.dominant_modality,
        themes=sig.themes, shadows=sig.shadows,
        signature_lines=[l.note for l in sig.links], drawn=drawn,
        source_lens=TAROT.source_meta(reading.source)["lens"], tier=case.tier,
        aspect_lines=TAROT.aspect_prompt_lines(chart_obj),
        further_points=TAROT.unsigned_body_lines(chart_obj))
    model = ai._MODEL_ORACLE if case.tier == "oracle" else ai._MODEL_SUPPORTER
    budget = ai._arcana_budget(case.tier, len(reading.cards))
    return ARCANA_SYSTEM + ARCANA_READING_STRUCTURE, user, model, budget


async def record_case(case: Case, chart: Dict) -> Generation:
    """One real provider call, capturing the wire facts the checks need."""
    import httpx
    import ai

    if case.spread:
        system, user, model, budget = _arcana_prompts(case, chart)
    else:
        ctx = ai._build_context(chart, None, None)
        system, user, model, budget = ai._build_prompts(
            case.query, ctx, case.lens, None, None, "quick", "cloud", case.tier, False)
    payload = {"model": model,
               "messages": [{"role": "system", "content": system},
                            {"role": "user", "content": user}],
               "temperature": 0.8, "max_tokens": budget, "stream": False}
    # The reasoning-effort ceiling the product sends. This function builds its
    # own request rather than going through ai._chat_openai_compat, so anything
    # added there has to be mirrored here — and on 2026-08-19 it was not: a
    # recording spent 6,320 tokens where the shipped path spends ~3,000, because
    # the cassette was made without the parameter the reader's call carries.
    # A cassette that does not match the request the product makes is not
    # evidence about the product.
    reasoning = ai._reasoning_param(model)
    if reasoning:
        payload["reasoning"] = reasoning
    headers = {"Content-Type": "application/json",
               "Authorization": f"Bearer {ai._API_KEY}",
               "HTTP-Referer": "https://localhost",
               "X-Title": "Astrological Analysis Environment"}
    async with httpx.AsyncClient(timeout=300.0) as client:
        r = await client.post(
            f"{ai._BASE_URL}/v1/chat/completions", headers=headers, json=payload)
        r.raise_for_status()
        data = r.json()
    choice = data["choices"][0]
    return Generation(
        text=choice["message"]["content"],
        finish_reason=choice.get("finish_reason"),
        model=model,
        completion_tokens=data.get("usage", {}).get("completion_tokens"))


# --------------------------------------------------------------------------- #
# report
# --------------------------------------------------------------------------- #
def evaluate(cases: List[Case], record: bool) -> Dict:
    chart = chart_dict() if record else None
    results = []
    for case in cases:
        if record:
            gen = asyncio.run(record_case(case, chart))
            save_cassette(case.id, gen, {"budget_note": "recorded from live provider"})
        else:
            gen = load_cassette(case.id)
            if gen is None:
                results.append({
                    "case": case.id, "status": "MISSING",
                    "findings": ["no cassette — run with --record"]})
                continue
        findings = run_checks(gen, case)
        results.append({
            "case": case.id,
            "status": "FAIL" if failed(findings) else "PASS",
            "model": gen.model,
            "tokens": gen.completion_tokens,
            "finish_reason": gen.finish_reason,
            "words": len(gen.text.split()),
            "findings": [str(f) for f in findings],
        })
    return {
        "total": len(results),
        "passed": sum(1 for r in results if r["status"] == "PASS"),
        "failed": sum(1 for r in results if r["status"] == "FAIL"),
        "missing": sum(1 for r in results if r["status"] == "MISSING"),
        "results": results,
    }


def print_report(report: Dict) -> None:
    for r in report["results"]:
        mark = {"PASS": "PASS", "FAIL": "FAIL", "MISSING": "MISS"}[r["status"]]
        extra = ""
        if r["status"] != "MISSING":
            extra = (f"  {r['words']:>5}w  {r['tokens'] or '?':>5}tok  "
                     f"finish={r['finish_reason']}")
        print(f"  {mark}  {r['case']:<24}{extra}")
        for f in r["findings"]:
            print(f"          {f}")
    print()
    print(f"  {report['passed']}/{report['total']} passed"
          f"   failed={report['failed']}   missing={report['missing']}")


def main() -> int:
    ap = argparse.ArgumentParser(description="Astra reading eval suite")
    ap.add_argument("--record", action="store_true",
                    help="call the live provider and re-record cassettes (costs money)")
    ap.add_argument("--case", help="limit to one case id, e.g. oracle:angles")
    ap.add_argument("--json", help="write the full report to this path")
    args = ap.parse_args()

    os.environ.setdefault("AAE_ENV", "development")
    if args.record:
        try:
            from dotenv import load_dotenv
            load_dotenv(Path(__file__).resolve().parent.parent / ".env")
        except ImportError:
            pass

    cases = build_cases(chart_placements(), chart_aspects())
    if args.case:
        cases = [c for c in cases if c.id == args.case]
        if not cases:
            print(f"no such case: {args.case}")
            return 2

    print(f"Astra eval suite — {'RECORD' if args.record else 'replay'} "
          f"— {len(cases)} cases\n")
    report = evaluate(cases, args.record)
    print_report(report)

    if args.json:
        Path(args.json).write_text(json.dumps(report, indent=2, ensure_ascii=False))
        print(f"  report -> {args.json}")

    return 1 if (report["failed"] or report["missing"]) else 0


if __name__ == "__main__":
    raise SystemExit(main())
