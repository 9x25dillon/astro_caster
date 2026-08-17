"""
checks.py — properties a reading must have, asserted against the TEXT.

Why this file exists
====================
On 2026-08-17 a subscriber's reading ended "- Profound psychological insight an".
Every supporter reading had been ending mid-sentence for the product's entire
history, and 488 backend tests did not notice, because every one of them mocks
the provider. A mock returns whatever the test author typed; it can never be
truncated, never hallucinate a placement, never drift off voice. The unit suite
was measuring the plumbing and calling it the product.

These checks look at what the model actually wrote. That is the whole point, and
it is why they run against recorded (or live) generations rather than fakes.

Adding a check
==============
A check is a pure function `(Generation, Case) -> list[Finding]`. No network, no
provider, no I/O — so the checks themselves are unit-testable, which matters
because a silently broken check is worse than no check at all.

Severity
--------
`fail` is for defects that make the reading not the product: truncation, an
invented placement, a missing required section. `warn` is for drift worth
watching that should not break a build on its own — a reading running long, a
softly-worded prediction. Only `fail` fails the suite.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional

SIGNS = [
    "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio",
    "Sagittarius", "Capricorn", "Aquarius", "Pisces",
]

# Bodies the engine reports and the prose is allowed to make claims about.
BODIES = [
    "Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus",
    "Neptune", "Pluto", "Chiron", "Lilith", "Ascendant", "Midheaven",
    "North Node", "South Node", "Part of Fortune",
]


@dataclass
class Generation:
    """One model output, plus the wire facts that came back with it."""
    text: str
    finish_reason: Optional[str] = None
    model: str = ""
    completion_tokens: Optional[int] = None

    def __post_init__(self) -> None:
        # A provider may answer with content=None (observed live: sonnet-5 at the
        # token ceiling). That is a result the checks must be able to JUDGE, not
        # one they may crash on — a checker that dies on the worst input is no
        # checker at all.
        if self.text is None:
            self.text = ""


@dataclass
class Case:
    """One eval scenario."""
    id: str
    tier: str
    lens: str
    query: str
    # Planet id -> sign, from the real chart the case is cast against. The
    # grounding check reads this; nothing else does.
    placements: Dict[str, str] = field(default_factory=dict)
    # Section headers this tier's prompt REQUIRES, verbatim.
    required_sections: List[str] = field(default_factory=list)
    # Word range the prompt asks for, inclusive.
    words_min: int = 0
    words_max: int = 10_000


@dataclass
class Finding:
    check: str
    severity: str          # "fail" | "warn"
    detail: str

    def __str__(self) -> str:
        return f"[{self.severity}] {self.check}: {self.detail}"


# --------------------------------------------------------------------------- #
# completeness — the check that would have caught the 2026-08-17 defect
# --------------------------------------------------------------------------- #
_TERMINAL = (".", "!", "?", "…", '"', "'", "*", ")", "”", "’")


def check_completeness(gen: Generation, case: Case) -> List[Finding]:
    """A reading must end because the writer finished, not because it ran out.

    Two independent signals, because either can be present without the other:
    the provider's own `finish_reason`, and the shape of the last character. A
    provider that omits finish_reason still cannot fake a sentence ending, and a
    model that stops cleanly at exactly the ceiling is still worth flagging.
    """
    out: List[Finding] = []
    text = gen.text.rstrip()

    if gen.finish_reason == "length":
        out.append(Finding(
            "completeness", "fail",
            "provider reported finish_reason='length' — the writer was cut off"))

    if not text:
        out.append(Finding("completeness", "fail", "empty reading"))
        return out

    if not text.endswith(_TERMINAL):
        tail = text[-60:]
        out.append(Finding(
            "completeness", "fail",
            f"ends mid-sentence, on {text[-1]!r}: ...{tail!r}"))

    # A markdown heading or list marker as the final line means the model was
    # cut off while opening a section it never wrote.
    last_line = text.splitlines()[-1].strip()
    if re.fullmatch(r"(#{1,6}\s+.*|[-*]\s*|\d+\.\s*)", last_line):
        out.append(Finding(
            "completeness", "fail",
            f"ends on an unfilled heading or list marker: {last_line!r}"))

    return out


# --------------------------------------------------------------------------- #
# structure
# --------------------------------------------------------------------------- #
def check_structure(gen: Generation, case: Case) -> List[Finding]:
    """The prompts name their section headers verbatim. Honour them or fail."""
    out: List[Finding] = []
    for section in case.required_sections:
        if section.lower() not in gen.text.lower():
            out.append(Finding(
                "structure", "fail", f"missing required section {section!r}"))
    return out


# --------------------------------------------------------------------------- #
# grounding — the check for invented placements
# --------------------------------------------------------------------------- #
_IN_SIGN = re.compile(
    r"\b(" + "|".join(BODIES) + r")\b[^.\n]{0,40}?\bin\s+(" + "|".join(SIGNS) + r")\b",
    re.IGNORECASE)
_SIGN_FIRST = re.compile(
    r"\b(" + "|".join(SIGNS) + r")\s+(" + "|".join(BODIES) + r")\b",
    re.IGNORECASE)
_RISES_IN = re.compile(
    r"\b(?:rise|rises|rising)\b[^.\n]{0,30}?\b(" + "|".join(SIGNS) + r")\b",
    re.IGNORECASE)


_ANY_BODY = re.compile(r"\b(" + "|".join(BODIES) + r")\b", re.IGNORECASE)


def _canon(name: str) -> str:
    for b in BODIES:
        if b.lower() == name.lower():
            return b
    for s in SIGNS:
        if s.lower() == name.lower():
            return s
    return name


def _binds(text: str, m: re.Match, body_group: int, sign_group: int) -> bool:
    """True when the body and the sign in this match belong to each other.

    The first cut of this matcher allowed anything within 40 characters between a
    body and "in <Sign>", and immediately produced two false positives against
    real readings:

        "...Ascendant) and fierce directness (Mars in Aries"
        "...Uranus, Neptune, all retrograde) and **Pluto in Scorpio"

    In both, the sign belongs to a LATER body that the window swallowed. A
    grounding check that reports those gets switched off inside a week, and then
    it guards nothing — so a claim is only counted when no other body sits
    between the two halves of it.
    """
    between = text[m.end(body_group):m.start(sign_group)]
    return _ANY_BODY.search(between) is None


def check_grounding(gen: Generation, case: Case) -> List[Finding]:
    """Every placement the prose asserts must match the chart it was given.

    This is the class of defect where a model, asked to discuss the Ascendant,
    writes a confident paragraph about a sign the chart does not contain. It is
    the most dangerous failure in the product because the output looks exactly as
    legitimate as a correct one — there is no missing bracket, no stack trace,
    just a different and equally fluent answer.

    Deliberately conservative: it only judges claims it can parse unambiguously,
    and stays silent otherwise. A grounding check that cries wolf gets switched
    off, and then it protects nothing.
    """
    out: List[Finding] = []
    if not case.placements:
        return out

    claims: List[tuple] = []
    for m in _IN_SIGN.finditer(gen.text):
        if _binds(gen.text, m, 1, 2):
            claims.append((_canon(m.group(1)), _canon(m.group(2)), m.group(0)))
    for m in _SIGN_FIRST.finditer(gen.text):
        # Adjacent by construction ("Scorpio Sun") — nothing can intervene.
        claims.append((_canon(m.group(2)), _canon(m.group(1)), m.group(0)))
    for m in _RISES_IN.finditer(gen.text):
        if _ANY_BODY.search(m.group(0)) is None:
            claims.append(("Ascendant", _canon(m.group(1)), m.group(0)))

    for body, sign, phrase in claims:
        actual = case.placements.get(body)
        if actual and actual != sign:
            out.append(Finding(
                "grounding", "fail",
                f"says {body} in {sign}, chart has {body} in {actual} "
                f"— {phrase.strip()!r}"))
    return out


# --------------------------------------------------------------------------- #
# length
# --------------------------------------------------------------------------- #
def check_length(gen: Generation, case: Case) -> List[Finding]:
    """The reading should be roughly the size its prompt asked for.

    Under-length is a `fail` — a paid tier that asks for 800 words and returns
    200 has not delivered. Over-length is a `warn`: verbose is not broken, but it
    is the leading indicator of a budget about to be crossed, which is exactly
    the cliff the product went off.
    """
    out: List[Finding] = []
    words = len(gen.text.split())
    if words < case.words_min:
        out.append(Finding(
            "length", "fail",
            f"{words} words, prompt asks for at least {case.words_min}"))
    elif words > case.words_max:
        out.append(Finding(
            "length", "warn",
            f"{words} words, prompt asks for at most {case.words_max}"))
    return out


# --------------------------------------------------------------------------- #
# voice — the product's standing promise
# --------------------------------------------------------------------------- #
_PREDICTION = re.compile(
    r"\b(you will (?:meet|marry|receive|lose|die|inherit|get)|"
    r"is going to happen|will definitely|guaranteed to|"
    r"on (?:January|February|March|April|May|June|July|August|September|"
    r"October|November|December) \d{1,2}(?:st|nd|rd|th)? you)\b",
    re.IGNORECASE)


def check_voice(gen: Generation, case: Case) -> List[Finding]:
    """Every system prompt in this product says: never predict concrete events."""
    return [
        Finding("voice", "warn", f"reads as literal prediction: {m.group(0)!r}")
        for m in _PREDICTION.finditer(gen.text)
    ]


ALL_CHECKS = [
    check_completeness,
    check_structure,
    check_grounding,
    check_length,
    check_voice,
]


def run_checks(gen: Generation, case: Case) -> List[Finding]:
    findings: List[Finding] = []
    for check in ALL_CHECKS:
        findings.extend(check(gen, case))
    return findings


def failed(findings: List[Finding]) -> bool:
    return any(f.severity == "fail" for f in findings)
