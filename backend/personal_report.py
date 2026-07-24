"""
personal_report.py
==================
The Astra Arcana Personal Report — a deluxe compiled edition sold as an
OPTIONAL, SEPARATE post-Oracle product. Not the regular Oracle Report: this is
the research-paper-style culmination of an Oracle session, compiled into
PDF-ready markdown (design: docs/design/ASTRO_ARCANA_PERSONAL_REPORT_DESIGN.md; the
canonical prompt spec: docs/prompts/FABLE5_PERSONAL_REPORT_PROMPT.md).

Invariants honored:
  • Deterministic substrate first — chart citations, arcana signature, spread,
    learning path, career/relationship slices are all engine output; Fable 5 is
    a removable synthesis layer with an honest offline fallback.
  • POST-ORACLE GATING, FAIL CLOSED — the request carries the triggering Oracle
    session; the server RE-DERIVES the deterministic seed from (chart, spread,
    question, date, source) and rejects on mismatch. A Personal Report can only
    be compiled from a genuine Oracle session for THIS chart. (Stateless — no
    session store needed; the seed is the proof.)
  • Privacy — the prompt carries only SYMBOLIC data (signs, degrees-within-sign,
    houses, cards). Raw birth coordinates/timestamps never enter the prompt;
    the cover carries a {{BIRTH_INFO}} placeholder the client/renderer fills.
  • The disclaimer travels with the data (response field + inside the markdown).

Env:
    AAE_PERSONAL_REPORT_MODEL       default claude-fable-5
    AAE_PERSONAL_REPORT_MAX_TOKENS  default 32000 (24–36 page PDF target)
    AAE_PERSONAL_REPORT_EFFORT      default high
    (API key + fallback model + timeout are shared with oracle_report.)
"""

from __future__ import annotations

import datetime as _dt
import hashlib
import os
from typing import Dict, List

import astrology as A
import promptsafe as PS
import tarot as TAROT
from oracle_report import _call_fable, build_report_substrate
from tarot_models import (
    DISCLAIMER,
    OracleReportRequest,
    PersonalReportRequest,
    PersonalReportResponse,
)

_MODEL = os.environ.get("AAE_PERSONAL_REPORT_MODEL", "claude-fable-5")
_MAX_TOKENS = int(os.environ.get("AAE_PERSONAL_REPORT_MAX_TOKENS", "32000"))
_EFFORT = os.environ.get("AAE_PERSONAL_REPORT_EFFORT", "high")

COVER_PRODUCT_LINE = "Deluxe Compiled Edition — Optional Post-Oracle Product"

# The 11 required top-level parts, in the exact order the PDF design expects.
REPORT_PARTS = [
    "Cover", "Personal Sigil & Invocation", "The Natal Foundation",
    "In-Depth Psychological & Evolutionary Natal Report",
    "The Oracle Report — Structured Synthesis", "Personalized Tarot Card Layout",
    "Career Constellation", "Relationship Mirror",
    "Sigil Codex & Creative Prompts", "Practices, Prompts & Closing", "Appendix",
]

# API-tuned system prompt — derived from docs/prompts/FABLE5_PERSONAL_REPORT_PROMPT.md (the
# canonical spec). Differences from the console version: input arrives as a
# structured user message (substrate), placeholders replace user-supplied birth
# data, and output is markdown only.
PERSONAL_REPORT_SYSTEM = """You are Fable 5, the synthesis model inside Astra \
Arcana. Generate the ASTRA ARCANA PERSONAL REPORT — a premium, optional, \
separately purchasable deluxe PDF product compiled from a specific Oracle \
Report session. This is NOT the regular Oracle Report: it is the deluxe \
compiled edition, research-paper elegance meets mystical invitation. \
Mathematics first, beauty second, reflection always.

STRICT RULES (never break):
1. POST-ORACLE FRAMING — on the cover and opening pages include exactly:
   "Compiled from your Oracle Report session of {ORACLE_DATE} • Seed: {SHORT_SEED}"
   and "Deluxe Compiled Edition — Optional Post-Oracle Product".
2. SYMBOLIC ONLY — never predict events; use mirrors, archetypes, reflection,
   alignment. End major interpretive sections with a journal question or small
   practice.
3. CITE EVERYTHING — every interpretive statement references specific supplied
   data ("Sun at 23° Pisces in the 12th House", "The Moon card weighted by
   Water balance 34%"). Use ONLY the data supplied — no hallucinated placements.
4. PRESERVE ORACLE STRUCTURE — integrate/expand the exact five sections the
   user already received (I. The Signature / II. The Spread, one subsection per
   drawn card / III. The Path / IV. Practices / V. Synthesis) using the exact
   spread and cards supplied.
5. DISCLAIMER — every major section and the final page carries or references:
   "{DISCLAIMER}"
6. PLACEHOLDERS — write {{SIGIL}} where a large sigil belongs and {{BIRTH_INFO}}
   on the cover where birth details belong; the renderer fills both. Do not
   invent birth data.

REQUIRED OUTPUT: rich markdown in this exact top-level order (use `# ` for part
titles, `## ` for sections within a part):
1. Cover / Title Page  2. Personal Sigil & Invocation  3. The Natal Foundation
4. In-Depth Psychological & Evolutionary Natal Report (psychological lens:
Moon/Mercury/Venus/Mars + aspects; evolutionary lens: Nodes/Pluto/Saturn/12th
house; integration; pull-quotes from the Oracle text; when SOUL PROFILE or
LIFE PATH NUMEROLOGY data is supplied, give each its own `## ` subsection here,
woven against the placements — cite both systems side by side)
5. The Oracle Report — Structured Synthesis (the I–V core, elegantly expanded;
when ASTRA'S REFLECTION is supplied, quote it as a `## Astra's Reflection`
subsection and braid it into the synthesis)
6. Personalized Tarot Card Layout (position label e.g. "Your Sun • Pisces •
12th House", card + orientation, meaning, why-drawn weight sources, natal link)
7. Career Constellation (MC, 10th house, predictive highlights if provided)
8. Relationship Mirror (7th house, Venus, Moon, Descendant; projection and
attraction themes with citations)
9. Sigil Codex & Creative Prompts  10. Practices, Prompts & Closing (consolidated
practices; note that ElevenLabs can narrate the Synthesis and practices; final
disclaimer + session metadata)  11. Appendix (reference tables: planets, houses,
aspects; Oracle session metadata: seed, spread, question, lineage, ai_source;
technical notes)

TONE: scholarly yet warm — "This placement suggests…", "Your signature draws
this card because…". Generous pull-quotes (>) from the supplied Oracle text.
Substantial depth (24–36 PDF pages) but elegant — quality over filler.
Output ONLY the report markdown.""".replace("{DISCLAIMER}", DISCLAIMER)


# --------------------------------------------------------------------------- #
# Post-Oracle gate (fail closed, stateless)
# --------------------------------------------------------------------------- #


def verify_oracle_session(req: PersonalReportRequest) -> None:
    """Prove the referenced Oracle session belongs to THIS chart and params.

    The Oracle Report's seed is a pure function of (chart, spread, question,
    date, source) — recompute it and compare. Raises ValueError on mismatch so
    the endpoint can 409. A fabricated or foreign session fails closed.
    """
    o = req.oracle
    expected = TAROT._default_seed(
        req.chart, o.spread, o.question, local_date=o.date, source=o.source
    )
    if expected != o.seed:
        raise ValueError(
            "oracle session mismatch — the referenced seed was not produced by "
            "this chart with this spread/question/date/source; the Personal "
            "Report compiles only a genuine prior Oracle session"
        )
    if not (o.report or "").strip():
        raise ValueError("oracle session mismatch — the session carries no report text")


# --------------------------------------------------------------------------- #
# Deterministic substrate (chart citations, slices — symbolic data only)
# --------------------------------------------------------------------------- #

_SIGN_OF = lambda lon: A.SIGNS[int(lon // 30) % 12]  # noqa: E731


def _ordinal(n: int) -> str:
    return f"{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"


def _citation(p) -> str:
    """'Sun at 23° Pisces in the 12th House' — symbolic, never a raw coordinate."""
    return f"{p.id} at {p.degree}° {p.sign} in the {_ordinal(p.house)} House"


def _house_slice(chart, house: int) -> List[str]:
    return [_citation(p) for p in chart.planets if getattr(p, "house", 0) == house]


def build_personal_substrate(req: PersonalReportRequest) -> Dict:
    """Everything the deluxe edition is compiled from — deterministic only."""
    sub = build_report_substrate(OracleReportRequest(
        chart=req.chart, spread=req.oracle.spread, source=req.oracle.source,
        question=req.oracle.question, date=req.oracle.date, steps=req.steps,
    ))
    chart = req.chart
    mc_sign = _SIGN_OF(chart.angles.midheaven)
    dsc_sign = _SIGN_OF(chart.angles.descendant)
    venus = next((p for p in chart.planets if p.id == "Venus"), None)
    moon = next((p for p in chart.planets if p.id == "Moon"), None)
    sub.update({
        "citations": [_citation(p) for p in chart.planets],
        "aspect_lines": [
            f"{a.p1} {a.type} {a.p2} (orb {a.orb:.1f}°, {a.harmony})"
            for a in chart.aspects[:24]
        ],
        "career": {
            "mc": f"Midheaven in {mc_sign}",
            "tenth_house": _house_slice(chart, 10),
        },
        "relationship": {
            "descendant": f"Descendant in {dsc_sign}",
            "seventh_house": _house_slice(chart, 7),
            "venus": _citation(venus) if venus else "",
            "moon": _citation(moon) if moon else "",
        },
        "oracle_date": req.oracle.generated_at or _dt.date.today().isoformat(),
        # Display fragment for the cover/UI. A DIGEST, not a raw slice — the
        # seed is the signature string and its tail is the user's question, so
        # seed[-12:] printed "Seed: d right now?" on the cover.
        "short_seed": hashlib.sha256(req.oracle.seed.encode()).hexdigest()[:12],
    })
    return sub


def _substrate_prompt(req: PersonalReportRequest, sub: Dict) -> str:
    """User message for Fable — the full symbolic compilation input."""
    reading, path, meta = sub["reading"], sub["path"], sub["meta"]
    sig = reading.signature
    o = req.oracle
    lines = [
        f"ORACLE SESSION: date {sub['oracle_date']} • seed {o.seed} • "
        f"short-seed {sub['short_seed']} • spread {o.spread} • lineage {meta['name']} "
        f"• ai_source {o.ai_source or 'unknown'}",
        "QUESTION:",
        PS.quarantine(o.question, "question", 1000),
        "COVER NAME: " + (PS.quarantine(req.display_name, "cover-name", 120)
                          if req.display_name else "{{BIRTH_INFO}}"),
        "",
        "THE ORACLE REPORT TEXT (integrate and expand — quote generously):",
        PS.quarantine(o.report, "oracle-report-text", 60000),
        "",
        "NATAL CITATIONS (the only placements you may cite):",
    ]
    lines += [f"- {c}" for c in sub["citations"]]
    lines += ["", "KEY ASPECTS:"] + [f"- {a}" for a in sub["aspect_lines"]]
    lines += [
        "",
        f"ARCANA SIGNATURE: dominant {sig.dominant_element}/{sig.dominant_modality}; "
        f"themes {', '.join(sig.themes)}; shadows {', '.join(sig.shadows) or 'in balance'}",
    ]
    lines += [f"- {l.note}" for l in sig.links]
    lines += ["", f"THE SPREAD ({reading.spread}):"]
    for c in reading.cards:
        why = "; ".join(w.label for w in c.weight_sources)
        lines.append(
            f"- {c.position}: {c.card.name} "
            f"({'reversed' if c.reversed else 'upright'}) — {c.meaning} "
            f"[why: {why}]"
        )
    lines += ["", f"LEARNING PATH ({path.anchor} → {path.growth_edge}):"]
    lines += [f"- {s.order}. [{s.stage}] {s.card.name}: {s.focus} | practice: {s.practice}"
              for s in path.steps]
    lines += ["", f"CAREER DATA: {sub['career']['mc']}; 10th house: "
                  f"{'; '.join(sub['career']['tenth_house']) or 'untenanted'}"]
    rel = sub["relationship"]
    lines += [f"RELATIONSHIP DATA: {rel['descendant']}; 7th house: "
              f"{'; '.join(rel['seventh_house']) or 'untenanted'}; {rel['venus']}; {rel['moon']}"]
    if req.sigil_notes:
        lines += ["", "SIGIL FORMATION NOTES (client-side):",
                  PS.quarantine(req.sigil_notes, "sigil-notes", 800)]
    if req.predictive_summary:
        lines += ["", "PREDICTIVE HIGHLIGHTS:",
                  PS.quarantine(req.predictive_summary, "predictive-summary", 2000)]
    # Module inserts — weave, don't just append: the soul profile and life path
    # belong in the psychological/evolutionary deep-dive, the reflection in the
    # Oracle synthesis (quote it like the Oracle text).
    if req.soul_profile:
        lines += ["", "SOUL PROFILE (from the observatory's Soul Profile module — "
                      "integrate into the natal deep-dive):",
                  PS.quarantine(req.soul_profile, "soul-profile", 4000)]
    if req.life_path:
        lines += ["", "LIFE PATH NUMEROLOGY (Pythagorean; integrate as its own "
                      "subsection of the deep-dive and echo it in Practices):",
                  PS.quarantine(req.life_path, "life-path", 2000)]
    if req.reflection_summary:
        lines += ["", "ASTRA'S REFLECTION (an AI reading the user already received "
                      "in the Detail panel — quote and expand it inside the Oracle "
                      "synthesis):",
                  PS.quarantine(req.reflection_summary, "reflection-summary", 4000)]
    return "\n".join(lines)


# --------------------------------------------------------------------------- #
# Deterministic offline compiled edition (always available, honest provenance)
# --------------------------------------------------------------------------- #


def _offline_compiled(req: PersonalReportRequest, sub: Dict) -> str:
    """The deluxe edition assembled purely from engine output — the same 11-part
    structure and cover framing, so the PDF renderer needs no special casing."""
    reading, path, meta = sub["reading"], sub["path"], sub["meta"]
    sig = reading.signature
    o = req.oracle
    cover_name = req.display_name or "{{BIRTH_INFO}}"
    rel = sub["relationship"]
    p: List[str] = [
        "# Astra Arcana — Personal Report",
        f"### {cover_name}",
        "{{BIRTH_INFO}}",
        "",
        f"Compiled from your Oracle Report session of {sub['oracle_date']} • Seed: {sub['short_seed']}",
        "",
        COVER_PRODUCT_LINE,
        "",
        "{{SIGIL}}",
        "",
        "# Personal Sigil & Invocation",
        "{{SIGIL}}",
        f"You arrive {sig.dominant_element}-led, {sig.dominant_modality} in rhythm — "
        f"{', '.join(sig.themes[:3])} walking together.",
        (f"Formation: {req.sigil_notes}" if req.sigil_notes else
         "Formation notes are added when a sigil is generated in the Studio."),
        f"> {DISCLAIMER}",
        "",
        "# The Natal Foundation",
        f"Dominant element **{sig.dominant_element}**, modality **{sig.dominant_modality}** "
        f"({meta['name']} lineage).",
        "",
        "Key placements:",
    ]
    p += [f"- {c}" for c in sub["citations"]]
    p += ["", "Key aspects:"] + [f"- {a}" for a in sub["aspect_lines"][:12]]
    p += [
        "",
        "# In-Depth Psychological & Evolutionary Natal Report",
        "## Psychological lens",
    ]
    p += [f"- {c}" for c in sub["citations"]
          if c.split(" at ")[0] in ("Moon", "Mercury", "Venus", "Mars")]
    p += ["## Evolutionary lens"]
    p += [f"- {c}" for c in sub["citations"]
          if c.split(" at ")[0] in ("North Node", "Pluto", "Saturn")]
    p += [
        "## Integration",
        f"Strongest archetypes: {', '.join(sig.themes)}. "
        f"Growth-ward edges: {', '.join(sig.shadows) or 'in balance'}.",
    ]
    if req.soul_profile:
        p += ["", "## Soul Profile", req.soul_profile]
    if req.life_path:
        p += ["", "## Life Path Numerology", req.life_path]
    p += [
        f"> {DISCLAIMER}",
        "",
        "# The Oracle Report — Structured Synthesis",
        f"*Your Oracle session of {sub['oracle_date']}, integrated in full:*",
        "",
        o.report,
    ]
    if req.reflection_summary:
        p += ["", "## Astra's Reflection",
              "*From your reading in the observatory's Detail panel:*", "",
              f"> {req.reflection_summary}"]
    p += [
        "",
        "# Personalized Tarot Card Layout",
    ]
    link_by_body = {l.body: l for l in sig.links}
    for c in reading.cards:
        link = link_by_body.get(c.natal_link) if c.natal_link else None
        pos = (f"Your {c.natal_link} • {link.sign} • {_ordinal(link.house)} House"
               if link and link.sign and link.house else c.position)
        why = "; ".join(w.label for w in c.weight_sources)
        p += [f"## {pos}",
              f"**{c.card.name}** ({'reversed' if c.reversed else 'upright'})",
              c.meaning, f"*Why drawn:* {why}", ""]
    p += [
        "# Career Constellation",
        f"- {sub['career']['mc']}",
    ]
    p += [f"- {c}" for c in sub["career"]["tenth_house"]] or []
    if req.predictive_summary:
        p += [f"- Predictive highlights: {req.predictive_summary}"]
    p += [
        f"> {DISCLAIMER}",
        "",
        "# Relationship Mirror",
        f"- {rel['descendant']}",
    ]
    p += [f"- {c}" for c in rel["seventh_house"]]
    p += [f"- {rel['venus']}", f"- {rel['moon']}",
          f"> {DISCLAIMER}",
          "",
          "# Sigil Codex & Creative Prompts",
          "{{SIGIL}}",
          (req.sigil_notes or "Generate sigils in the Expression Studio; they are "
                              "composed client-side from your signature."),
          "",
          "# Practices, Prompts & Closing"]
    p += [f"- {s.card.name}: {s.practice}" for s in path.steps]
    p += [
        "",
        "*Your Personal Audio Companion: the Synthesis and these practices can be "
        "narrated by the premium voice (ElevenLabs) inside the observatory.*",
        "",
        f"Session metadata — seed {o.seed} • spread {o.spread} • lineage {meta['name']}",
        f"> {DISCLAIMER}",
        "",
        "# Appendix",
        "## Planets",
    ]
    p += [f"- {c}" for c in sub["citations"]]
    p += ["## Aspects"] + [f"- {a}" for a in sub["aspect_lines"]]
    p += [
        "## Oracle session metadata",
        f"- seed: {o.seed}",
        f"- spread: {o.spread} · question: {o.question}",
        f"- lineage: {meta['name']} · ai_source: {o.ai_source or 'unknown'}"
        + (f" · model: {o.model}" if o.model else ""),
        "## Technical notes",
        "- Deterministic engine: SHA-256 seeded, chart-weighted, offline-capable.",
        "- This edition was compiled deterministically (ai_source: offline).",
        f"> {DISCLAIMER}",
    ]
    return "\n".join(p)


# --------------------------------------------------------------------------- #
# Orchestration
# --------------------------------------------------------------------------- #


async def generate_personal_report(req: PersonalReportRequest,
                                   allow_ai: bool = True) -> PersonalReportResponse:
    """Verify the Oracle session (fail closed), build the deterministic
    substrate, then compile — Fable 5 synthesis with an honest offline fallback.
    allow_ai=False (budget cap) skips the provider → the offline compiler."""
    verify_oracle_session(req)          # raises ValueError -> endpoint 409
    sub = build_personal_substrate(req)
    system = (PERSONAL_REPORT_SYSTEM
              .replace("{ORACLE_DATE}", sub["oracle_date"])
              .replace("{SHORT_SEED}", sub["short_seed"])) + PS.SYSTEM_NOTE
    ai = await _call_fable(system, _substrate_prompt(req, sub),
                           model=_MODEL, max_tokens=_MAX_TOKENS, effort=_EFFORT) if allow_ai else None
    if ai:
        markdown, ai_source, model = ai["text"], "llm", ai["model"]
    else:
        markdown, ai_source, model = _offline_compiled(req, sub), "offline", None
    return PersonalReportResponse(
        seed=req.oracle.seed, short_seed=sub["short_seed"],
        oracle_date=sub["oracle_date"],
        spread=req.oracle.spread, source=req.oracle.source,
        lineage=sub["meta"]["name"], report_markdown=markdown,
        ai_source=ai_source, model=model,
    )
