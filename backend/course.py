"""
course.py
=========
The Course — a Fable-designed personal curriculum (oracle tier).

Same architecture as the Oracle Report (oracle_report.py): the DETERMINISTIC
engine builds the whole curriculum skeleton with zero AI — the chart-anchored
learning path (anchor → growth edge), the natal arcana signature, and each
step's lesson corpus. Claude Fable 5 is a removable enrichment layer that
turns that skeleton into a written course; when the AI layer is unavailable
(no key, network down, safety refusal) a deterministic offline course with the
identical section structure and honest ai_source is returned instead.

The lesson sequence is reproducible from (chart, source, lessons): the same
student gets the same curriculum, and `course_id` (a digest of the substrate)
keys the local Bookshelf entry so a generated course is never lost.

Privacy: the prompt carries only SYMBOLIC data (trump links, themes, path
steps, house themes) — never raw birth coordinates or timestamps.

Env:
    AAE_ANTHROPIC_API_KEY     enables the Fable layer (unset => offline course)
    AAE_COURSE_MODEL          default claude-fable-5
    AAE_COURSE_MAX_TOKENS     default 24000 (a full course runs long)
    AAE_COURSE_EFFORT         default high (low|medium|high|xhigh|max)
The server-side Opus 4.8 fallback and timeout are shared with the Oracle
Report (oracle_report._call_fable).
"""

from __future__ import annotations

import hashlib
import os
from typing import Dict

import tarot as TAROT
from oracle_report import _call_fable
from tarot_models import CourseRequest, CourseResponse, LearningPathRequest
from tarot_prompts import ARCANA_SYSTEM

import promptsafe as PS

_COURSE_MODEL = os.environ.get("AAE_COURSE_MODEL", "claude-fable-5")
_MAX_TOKENS = int(os.environ.get("AAE_COURSE_MAX_TOKENS", "24000"))
_EFFORT = os.environ.get("AAE_COURSE_EFFORT", "high")

COURSE_SYSTEM = ARCANA_SYSTEM + """

You are writing THE COURSE — a personal study curriculum for this one student,
built from their natal learning path. You are a patient, precise teacher: the
goal is that the student finishes able to READ THEIR OWN CHART through these
archetypes, not that they feel dazzled.

Produce a long-form markdown course with exactly this structure:

## Orientation — how to study this course
One page: what the path from their anchor to their growth edge means, how the
lessons build on each other, and how to pace the work (one lesson per sitting).

## Lesson N — <Card Name>
One section per path step, IN THE GIVEN ORDER, each with exactly these
subsections:
### The archetype        (the card's teaching in this lineage)
### In your chart        (why THIS student meets it here — cite the natal
                          links, dominant element/modality, or path position)
### Practice             (build on the given practice; small and concrete)
### Journal              (deepen the given journal question)

## Commencement — carrying the path forward
Close the arc: how the growth-edge archetype changes how the student now reads
their anchor, plus one integrative exercise that uses at least three lesson
archetypes together.

Every claim must cite the specific card, natal link, or signature fact it
rests on. Do not add or reorder lessons; do not predict events.
""" + PS.SYSTEM_NOTE


# --------------------------------------------------------------------------- #
# Deterministic substrate (AI-free, reproducible, testable)
# --------------------------------------------------------------------------- #


def build_course_substrate(req: CourseRequest) -> Dict:
    """Everything the course is made of, from the deterministic engine only."""
    path = TAROT.build_learning_path(LearningPathRequest(
        chart=req.chart, source=req.source, steps=req.lessons,
    ))
    signature = TAROT.build_natal_arcana_signature(req.chart)
    lessons = [TAROT.lesson_for_card(s.card.id) for s in path.steps]
    return {
        "path": path,
        "signature": signature,
        "lessons": lessons,
        "meta": TAROT.source_meta(req.source),
    }


def _substrate_prompt(sub: Dict, focus: str) -> str:
    """Textual form of the substrate for the model — symbolic data only."""
    path, sig, meta = sub["path"], sub["signature"], sub["meta"]
    lines = [
        "STUDENT'S FOCUS:",
        PS.quarantine(focus, "focus", 600),
        f"INTERPRETIVE LINEAGE: {meta['name']} — {meta['lens']}",
        "",
        "NATAL ARCANA SIGNATURE:",
        f"- Dominant element {sig.dominant_element}, modality {sig.dominant_modality}",
        f"- Strongest archetypes: {', '.join(sig.themes)}",
        f"- Growth-ward / shadow archetypes: {', '.join(sig.shadows) or 'in balance'}",
    ]
    lines += [f"- {link.note}" for link in sig.links]
    lines += ["", f"THE PATH ({path.anchor} → {path.growth_edge}), one lesson per step:"]
    for step, lesson in zip(path.steps, sub["lessons"]):
        lines += [
            f"- Lesson {step.order} [{step.stage}]: {step.card.name}",
            f"  why here: {step.focus}",
            f"  archetype: {lesson['summary']} {lesson['mythic']}".rstrip(),
            f"  psyche: {lesson['psychological']}",
            f"  shadow: {lesson['shadow']}",
            f"  given practice: {step.practice}",
            f"  given journal: {step.journal}",
        ]
    return "\n".join(lines)


def _offline_course(sub: Dict, focus: str) -> str:
    """Deterministic course assembled purely from engine output. Always available."""
    path, sig, meta = sub["path"], sub["signature"], sub["meta"]
    parts = [
        "## Orientation — how to study this course",
        f"A curriculum for **{focus}**, read through the **{meta['name']}** "
        f"lineage. Your chart leans **{sig.dominant_element}** in a "
        f"**{sig.dominant_modality}** rhythm; this path departs from "
        f"**{path.anchor}** — where you are already strong — and studies "
        f"toward **{path.growth_edge}**, your growth edge. Take one lesson "
        "per sitting, in order; each ends with a practice and a journal "
        "question that prepare the next.",
        "",
    ]
    for step, lesson in zip(path.steps, sub["lessons"]):
        parts += [
            f"## Lesson {step.order} — {step.card.name}",
            "### The archetype",
            " ".join(x for x in (lesson["summary"], lesson["mythic"]) if x),
            "### In your chart",
            step.focus,
            "### Practice",
            step.practice,
            "### Journal",
            step.journal,
            "",
        ]
    parts += [
        "## Commencement — carrying the path forward",
        f"Having walked from {path.anchor} to {path.growth_edge}, return to "
        f"your anchor once more: how does {path.growth_edge} change what "
        f"{path.anchor} means in your chart? Write the answer as one page, "
        "citing at least three of the lessons above.",
    ]
    return "\n".join(parts)


def course_id(sub: Dict, req: CourseRequest) -> str:
    """Deterministic identity for this (chart, source, lessons, focus) course —
    the Bookshelf key. Derived from the substrate so a regenerated course
    overwrites its shelf entry idempotently."""
    raw = "\x00".join([
        req.source, str(req.lessons), req.focus,
        _substrate_prompt(sub, req.focus),
    ])
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:12]


# --------------------------------------------------------------------------- #
# Generation — Fable synthesis with an honest offline fallback
# --------------------------------------------------------------------------- #


async def generate_course(req: CourseRequest) -> CourseResponse:
    sub = build_course_substrate(req)
    path = sub["path"]
    ai = await _call_fable(
        COURSE_SYSTEM, _substrate_prompt(sub, req.focus),
        model=_COURSE_MODEL, max_tokens=_MAX_TOKENS, effort=_EFFORT,
    )
    if ai:
        course, ai_source, model = ai["text"], "llm", ai["model"]
    else:
        course, ai_source, model = _offline_course(sub, req.focus), "offline", None
    return CourseResponse(
        course_id=course_id(sub, req),
        source=req.source, lineage=sub["meta"]["name"],
        anchor=path.anchor, growth_edge=path.growth_edge,
        focus=req.focus, lessons=len(path.steps),
        course=course, ai_source=ai_source, model=model,
    )
