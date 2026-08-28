"""
oracle_report.py
================
The Oracle Report — the paid, extremely enriched reading (oracle tier).

Architecture honors the project's core invariant: the DETERMINISTIC engine
builds the full symbolic substrate (natal signature, chart-weighted spread,
learning path) with zero AI; Claude Fable 5 is a removable synthesis layer on
top. If the AI layer is unavailable (no key, network down, safety refusal), a
deterministic offline report is returned with an honest ai_source flag — the
substrate, seed, and disclaimer are identical either way.

The AI call uses the official Anthropic SDK directly (not the OpenAI-compatible
gateway in ai.py). Fable 5 notes:
  - thinking is always on; the `thinking` param must be OMITTED entirely
  - sampling params (temperature/top_p/top_k) are removed; depth via effort
  - safety classifiers may return stop_reason "refusal" (HTTP 200) — handled;
    server-side fallbacks to Opus 4.8 are enabled by default so a false-positive
    decline is transparently re-served instead of failing a paid report
  - requires 30-day data retention on the org (ZDR orgs get 400 on every call)

Privacy: the prompt carries only SYMBOLIC data (trump links, themes, drawn
cards, house themes) — never raw birth coordinates or timestamps.

Env:
    AAE_ANTHROPIC_API_KEY         enables the Fable layer (unset => offline report)
    AAE_ORACLE_REPORT_MODEL       default claude-fable-5
    AAE_ORACLE_REPORT_FALLBACK    default claude-opus-4-8 (server-side fallback)
    AAE_ORACLE_REPORT_MAX_TOKENS  default 16000
    AAE_ORACLE_REPORT_EFFORT      default high (low|medium|high|xhigh|max)
"""

from __future__ import annotations

import logging
import os
from typing import AsyncIterator, Dict, List, Optional, Tuple

import tarot as TAROT
from tarot_models import (
    LearningPathRequest,
    OracleReportRequest,
    OracleReportResponse,
    TarotReadingRequest,
)
from tarot_prompts import ARCANA_SYSTEM

import promptsafe as PS

# Completion guarantee for the long-form reports, mirroring ai.py's. Bounded so a
# runaway generation cannot bill without limit; two continuations on a 32k budget
# is ~96k tokens, far past anything these prompts ask for.
_MAX_CONTINUATIONS = 2

_CONTINUE_INSTRUCTION = (
    "Continue the report from exactly where it stopped. Do not repeat any text "
    "you have already written, do not greet or re-introduce yourself, and do not "
    "summarise what came before. Resume mid-sentence if that is where it ended, "
    "and carry through to a proper close."
)

_log = logging.getLogger("aae.oracle_report")

_ANTHROPIC_KEY = os.environ.get("AAE_ANTHROPIC_API_KEY", "").strip()
_REPORT_MODEL = os.environ.get("AAE_ORACLE_REPORT_MODEL", "claude-fable-5")
_FALLBACK_MODEL = os.environ.get("AAE_ORACLE_REPORT_FALLBACK", "claude-opus-4-8")
_MAX_TOKENS = int(os.environ.get("AAE_ORACLE_REPORT_MAX_TOKENS", "16000"))
_EFFORT = os.environ.get("AAE_ORACLE_REPORT_EFFORT", "high")
_TIMEOUT_S = float(os.environ.get("AAE_ORACLE_REPORT_TIMEOUT", "600"))


def ai_configured() -> bool:
    """True when the Fable layer has a key to call.

    Shared by the Oracle report, the Course and the Personal Report, all three
    of which route through `_call_fable` and therefore through this one key.
    Callers use it to tell "offline because nothing is set up" from "offline
    because the call failed" — see `metrics.observe_ai_fallback`, which alarms
    on only the second.
    """
    return bool(_ANTHROPIC_KEY)

REPORT_SYSTEM = ARCANA_SYSTEM + """

You are writing the ORACLE REPORT — the deepest reading this observatory
offers. Produce a long-form markdown report with exactly these sections:

## I. The Signature — who arrives
## II. The Spread — what is active now   (one subsection per drawn card)
## III. The Path — anchor to growth edge
## IV. Practices — small, optional, concrete
## V. Synthesis — one page that holds it all

Every claim must cite the specific card, position, or natal placement it rests
on. Close with one journal question. Do not add sections; do not predict events.
""" + PS.SYSTEM_NOTE


# --------------------------------------------------------------------------- #
# Deterministic substrate (AI-free, reproducible, testable)
# --------------------------------------------------------------------------- #


def build_report_substrate(req: OracleReportRequest) -> Dict:
    """Everything the report is made of, from the deterministic engine only."""
    reading = TAROT.build_reading_core(TarotReadingRequest(
        chart=req.chart, spread=req.spread, source=req.source,
        question=req.question, date=req.date,
        include_activities=True, include_lessons=True, include_ai=False,
    ))
    path = TAROT.build_learning_path(LearningPathRequest(
        chart=req.chart, source=req.source, steps=req.steps,
    ))
    return {"reading": reading, "path": path, "meta": TAROT.source_meta(req.source)}


def _substrate_prompt(sub: Dict, question: str) -> str:
    """Textual form of the substrate for the model — symbolic data only."""
    reading, path, meta = sub["reading"], sub["path"], sub["meta"]
    sig = reading.signature
    lines = [
        "QUESTION:",
        PS.quarantine(question, "question", 1000),
        f"INTERPRETIVE LINEAGE: {meta['name']} — {meta['lens']}",
        "",
        "NATAL ARCANA SIGNATURE:",
        f"- Dominant element {sig.dominant_element}, modality {sig.dominant_modality}",
        f"- Strongest archetypes: {', '.join(sig.themes)}",
        f"- Growth-ward / shadow archetypes: {', '.join(sig.shadows) or 'in balance'}",
    ]
    lines += [f"- {l.note}" for l in sig.links]
    lines += ["", f"THE SPREAD ({reading.spread}):"]
    for c in reading.cards:
        orient = "reversed" if c.reversed else "upright"
        why = "; ".join(w.label for w in c.weight_sources)
        lines.append(f"- {c.position}: {c.card.name} ({orient}) — {c.meaning}")
        lines.append(f"  why this card was likely: {why}")
    lines += ["", f"LEARNING PATH ({path.anchor} → {path.growth_edge}):"]
    for s in path.steps:
        lines.append(f"- {s.order}. [{s.stage}] {s.card.name}: {s.focus}")
    return "\n".join(lines)


def _offline_report(sub: Dict, question: str) -> str:
    """Deterministic report assembled purely from engine output. Always available."""
    reading, path, meta = sub["reading"], sub["path"], sub["meta"]
    sig = reading.signature
    parts = [
        "## I. The Signature — who arrives",
        f"Read through the **{meta['name']}** lineage. Your chart leans "
        f"**{sig.dominant_element}** in a **{sig.dominant_modality}** rhythm. "
        f"Strongest archetypes: {', '.join(sig.themes)}. "
        f"Growth-ward edges: {', '.join(sig.shadows) or 'in balance'}.",
        "",
        "## II. The Spread — what is active now",
    ]
    for c in reading.cards:
        parts += [f"### {c.position} — {c.card.name}", c.meaning, ""]
    parts += ["## III. The Path — anchor to growth edge",
              f"{path.anchor} → {path.growth_edge} ({path.lineage}):"]
    for s in path.steps:
        parts.append(f"{s.order}. **{s.card.name}** ({s.stage}) — {s.focus}")
    parts += ["", "## IV. Practices — small, optional, concrete"]
    parts += [f"- {s.card.name}: {s.practice}" for s in path.steps]
    parts += ["", "## V. Synthesis — one page that holds it all",
              reading.interpretation]
    return "\n".join(parts)


# --------------------------------------------------------------------------- #
# Fable 5 synthesis layer (removable; official Anthropic SDK)
# --------------------------------------------------------------------------- #


async def _call_fable_stream(
    system: str,
    user: str,
    *,
    model: Optional[str] = None,
    max_tokens: Optional[int] = None,
    effort: Optional[str] = None,
) -> AsyncIterator[Tuple[str, object]]:
    """`_call_fable`, but yielding the text as it is written.

    Yields ("chunk", str) per text delta, then exactly one terminal
    ("done", {"text", "model"}) — or ("done", None) when the caller should fall
    back to its deterministic edition, which is the same contract `_call_fable`
    expresses by returning None.

    WHY THIS EXISTS. `_call_fable` already streams FROM Fable; it just buffers
    the whole thing before returning, so the HTTP response is a single silent
    wait. Measured in production: /api/v1/course took 125.5s and /api/v1/tts
    113s, and Cloudflare's proxy gives an origin 100 SECONDS to produce a
    complete response before it returns a 524 to the reader. The origin logged
    `200 125534ms` — the course was generated and billed, and the reader got an
    error page. Cloudflare's timer is reset by bytes in flight, so a response
    that starts within seconds and keeps moving never trips it, however long the
    whole generation runs.

    The continuation loop, the refusal check and the server-side fallback are
    reproduced here verbatim rather than shared, because factoring them out
    would mean restructuring the non-streaming path that every other caller
    (the Personal Report especially) depends on. Any change to one MUST be made
    to the other; `tests/test_course_stream.py` pins that they agree.
    """
    if not _ANTHROPIC_KEY:
        yield ("done", None)
        return
    try:
        from anthropic import AsyncAnthropic

        client = AsyncAnthropic(api_key=_ANTHROPIC_KEY, timeout=_TIMEOUT_S)
        messages = [{"role": "user", "content": user}]
        parts: List[str] = []
        served_by = model or _REPORT_MODEL

        for _ in range(_MAX_CONTINUATIONS + 1):
            async with client.beta.messages.stream(
                model=model or _REPORT_MODEL,
                max_tokens=max_tokens or _MAX_TOKENS,
                system=system,
                output_config={"effort": effort or _EFFORT},
                betas=["server-side-fallback-2026-06-01"],
                fallbacks=[{"model": _FALLBACK_MODEL}],
                messages=messages,
            ) as stream:
                # The deltas ARE the keepalive. A refusal carries no text, so
                # nothing is emitted before the stop_reason check below.
                async for delta in stream.text_stream:
                    if delta:
                        parts.append(delta)
                        yield ("chunk", delta)
                msg = await stream.get_final_message()
            if msg.stop_reason == "refusal":
                _log.warning("streamed report refused by the full model chain")
                yield ("done", None)
                return
            served_by = msg.model
            if msg.stop_reason != "max_tokens":
                break
            if not "".join(parts).strip():
                break
            # Ordinary history, never a prefill — see _call_fable.
            messages = messages[:1] + [
                {"role": "assistant", "content": msg.content},
                {"role": "user", "content": _CONTINUE_INSTRUCTION},
            ]

        text = "".join(parts).strip()
        if text and msg.stop_reason == "max_tokens":
            # Mirror of _call_fable's last resort, and here it WORKS even
            # though the raw deltas already streamed: the done frame is the
            # authoritative text and the client renders it over anything it
            # accumulated, so the reader's final copy ends on a sentence.
            from ai import _trim_to_last_complete_sentence
            _log.warning(
                "streamed report still unfinished after %d continuations — "
                "trimming to the last complete sentence", _MAX_CONTINUATIONS)
            text = _trim_to_last_complete_sentence(text)
        yield ("done", {"text": text, "model": served_by} if text else None)
    except Exception as exc:
        _log.warning("streamed report AI layer failed: %r", exc)
        yield ("done", None)


async def _call_fable(
    system: str,
    user: str,
    *,
    model: Optional[str] = None,
    max_tokens: Optional[int] = None,
    effort: Optional[str] = None,
) -> Optional[Dict[str, str]]:
    """One streamed Fable 5 call with server-side Opus 4.8 fallback.

    Defaults come from the Oracle Report env config; callers with their own
    budget (e.g. the Personal Report) pass overrides. Returns {"text", "model"}
    or None on any failure — including a whole-chain safety refusal — so the
    caller falls back to its deterministic report.
    """
    if not _ANTHROPIC_KEY:
        return None
    try:
        from anthropic import AsyncAnthropic

        client = AsyncAnthropic(api_key=_ANTHROPIC_KEY, timeout=_TIMEOUT_S)
        messages = [{"role": "user", "content": user}]
        parts: List[str] = []
        served_by = model or _REPORT_MODEL

        # These reports are the longest and dearest text the product makes, and
        # until now `stop_reason` was checked ONLY for "refusal" — a report that
        # hit its 16k/24k/32k ceiling was returned as though finished. Same
        # defect the ask path had, on the output a reader pays the most for.
        for _ in range(_MAX_CONTINUATIONS + 1):
            # Fable 5: no `thinking` param (always on), no sampling params. Streamed
            # because a long report can run minutes. Server-side fallbacks re-serve a
            # safety decline on Opus 4.8 inside the same call, repriced automatically.
            async with client.beta.messages.stream(
                model=model or _REPORT_MODEL,
                max_tokens=max_tokens or _MAX_TOKENS,
                system=system,
                output_config={"effort": effort or _EFFORT},
                betas=["server-side-fallback-2026-06-01"],
                fallbacks=[{"model": _FALLBACK_MODEL}],
                messages=messages,
            ) as stream:
                msg = await stream.get_final_message()
            if msg.stop_reason == "refusal":
                # Whole chain declined (requested model AND fallback) — check
                # stop_reason before reading content; a refusal's content is empty.
                _log.warning("oracle report refused by the full model chain")
                return None
            served_by = msg.model
            parts.append(
                "".join(b.text for b in msg.content if b.type == "text"))
            if msg.stop_reason != "max_tokens":
                break
            if not "".join(parts).strip():
                break          # nothing to continue from; let the caller fall back

            # Continue as ORDINARY HISTORY, not a prefill. A trailing assistant
            # turn is a prefill and 400s on this model family; an assistant turn
            # followed by a user turn is just conversation. `msg.content` is
            # passed back VERBATIM — thinking blocks included, even when their
            # text is empty under the default display — because editing or
            # dropping them breaks the turn.
            messages = messages[:1] + [
                {"role": "assistant", "content": msg.content},
                {"role": "user", "content": _CONTINUE_INSTRUCTION},
            ]

        text = "".join(parts).strip()
        if not text:
            return None
        if msg.stop_reason == "max_tokens":
            # Continuation budget spent and the writer was STILL going — the
            # ceilings make this remote (2 continuations on a 16k–32k budget),
            # but a reading that trails off mid-word must never reach a
            # reader. Same last resort the ask path uses: end on a finished
            # sentence, and say so in the log.
            from ai import _trim_to_last_complete_sentence
            _log.warning(
                "report still unfinished after %d continuations — trimming to "
                "the last complete sentence", _MAX_CONTINUATIONS)
            text = _trim_to_last_complete_sentence(text)
        return {"text": text, "model": served_by}
    except Exception as exc:
        _log.warning("oracle report AI layer failed: %r", exc)
        return None


async def generate_oracle_report(req: OracleReportRequest,
                                 allow_ai: bool = True) -> OracleReportResponse:
    """Substrate first (deterministic), then the Fable synthesis with an honest
    offline fallback. The seed is disclosed so the draw is reproducible.
    allow_ai=False (budget cap) skips the provider → the offline compiler."""
    sub = build_report_substrate(req)
    reading = sub["reading"]
    ai = await _call_fable(REPORT_SYSTEM, _substrate_prompt(sub, req.question)) if allow_ai else None
    if ai:
        report, ai_source, model = ai["text"], "llm", ai["model"]
    else:
        report, ai_source, model = _offline_report(sub, req.question), "offline", None
    return OracleReportResponse(
        spread=req.spread, source=req.source, question=req.question,
        seed=reading.seed, lineage=sub["meta"]["name"],
        report=report, ai_source=ai_source, model=model,
    )
