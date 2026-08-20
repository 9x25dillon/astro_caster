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
    # Set for an ARCANA case (a tarot spread reading) — the spread id, e.g.
    # "celtic_cross". None means the chart-reading path. The two go through
    # different prompts and different budgets, so the runner needs to know which
    # it is recording; everything downstream of the text is identical, which is
    # why the checks needed no changes to cover both.
    spread: Optional[str] = None
    # "Planet in Sign" strings the DECK asserts about its own cards, e.g.
    # "Saturn in Leo" for the Five of Wands. A minor arcana card IS a decan, so
    # an honest tarot reading names planet-in-sign constantly without making any
    # claim about the querent's chart. Empty for chart-reading cases, where
    # every such phrase is about the querent by construction.
    card_attributions: List[str] = field(default_factory=list)
    # Aspects the chart actually contains, as {"Body|Body": "type"} with the
    # pair sorted so lookup does not care which way round the prose says it.
    # Empty means "this case was not given aspects", and the aspect check stays
    # silent rather than failing every claim.
    aspects: Dict[str, str] = field(default_factory=dict)


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


# A body introduced as the OBJECT of "of" is being referred to, not placed:
# "Venus, ruler of your Ascendant, floating alone in Gemini" says Venus is in
# Gemini, and Venus is. Caught on a live recording 2026-08-19, where this check
# read the appositive as the subject and accused a correct reading of putting the
# Ascendant in the wrong sign. _binds already guards the mirror case — a sign
# belonging to a LATER body — and this is the same error pointing backwards.
_REFERENT = re.compile(r"\bof\s+(?:your\s+|the\s+|his\s+|her\s+|their\s+)?$",
                       re.IGNORECASE)


def _is_referent(text: str, at: int) -> bool:
    return _REFERENT.search(text[max(0, at - 24):at]) is not None


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
    if _is_referent(text, m.start(body_group)):
        return False
    between = text[m.end(body_group):m.start(sign_group)]
    return _ANY_BODY.search(between) is None


# How far back to look for the word that turns a decan into a claim about the
# reader. One clause: "your natal Mercury in Cancer" binds, a sentence that
# mentioned "your" thirty words earlier does not.
_QUERENT_WINDOW = 40
_QUERENT = re.compile(r"\byour\b|\bnatal\b|\byou\b", re.IGNORECASE)


def _about_the_querent(text: str, at: int) -> bool:
    """True when this placement is being asserted about the READER.

    THE HOLE THIS LEAVES, stated rather than implied: a reading that says
    "Saturn in Leo" with no possessive nearby, about a chart whose Saturn is in
    Capricorn, is now let through IF Saturn-in-Leo is also some card's decan.
    That is a real gap and it is the deliberate price of the check surviving
    contact with tarot at all. The half that matters — a placement claimed as
    the reader's own — is still caught, and that is the half a reader would
    act on.
    """
    return _QUERENT.search(text[max(0, at - _QUERENT_WINDOW):at]) is not None


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
            claims.append((_canon(m.group(1)), _canon(m.group(2)), m.group(0), m.start()))
    for m in _SIGN_FIRST.finditer(gen.text):
        # Adjacent by construction ("Scorpio Sun") — nothing can intervene.
        claims.append((_canon(m.group(2)), _canon(m.group(1)), m.group(0), m.start()))
    for m in _RISES_IN.finditer(gen.text):
        if _ANY_BODY.search(m.group(0)) is None:
            claims.append(("Ascendant", _canon(m.group(1)), m.group(0), m.start()))

    attributions = {a.lower() for a in case.card_attributions}
    for body, sign, phrase, at in claims:
        actual = case.placements.get(body)
        if not actual or actual == sign:
            continue
        if f"{body} in {sign}".lower() in attributions and not _about_the_querent(gen.text, at):
            # The card's own decan, not a claim about this chart. Recorded live
            # 2026-08-19: "Saturn in Pisces, Hod of Briah — the Golden Dawn
            # called it *abandoned success*" is the Eight of Cups being named,
            # and flagging it would have made this check useless on every tarot
            # reading the product serves.
            continue
        out.append(Finding(
            "grounding", "fail",
            f"says {body} in {sign}, chart has {body} in {actual} "
            f"— {phrase.strip()!r}"))
    return out


# --------------------------------------------------------------------------- #
# aspect grounding — the check for an aspect the chart does not contain
#
# Added 2026-08-19 with the aspect-aware arcana prompt. Handing a model a list of
# aspects opens a failure the sign-based grounding check cannot see: a fluent
# sentence about "your Saturn square Venus" in a chart where those two are not in
# aspect at all. It reads exactly as authoritative as a true one.
#
# Two ways to be wrong here, and only one of them is recoverable:
#   * Miss a fabricated aspect and the product ships confident astrology it made
#     up.
#   * Flag a true one and the check gets switched off within a week, after which
#     it guards nothing — the reasoning _binds already records for signs.
# So this is deliberately narrow. It judges only the five Ptolemaic aspects
# named as an explicit verb between two bodies, and stays silent on everything
# else it cannot read unambiguously.
# --------------------------------------------------------------------------- #

# The aspect words a reading actually uses as a verb. Minor aspects are excluded
# on purpose: "quincunx" and "semisextile" are rare in prose and their orbs are
# tight enough that near-misses would generate argument rather than signal.
_ASPECT_VERBS = {
    "conjunct": "Conjunction", "conjunction": "Conjunction",
    "opposite": "Opposition", "opposition": "Opposition", "opposing": "Opposition",
    "opposes": "Opposition",
    "trine": "Trine", "trines": "Trine",
    "square": "Square", "squares": "Square", "squaring": "Square",
    "sextile": "Sextile", "sextiles": "Sextile",
}

_ASPECT_CLAIM = re.compile(
    r"\b(" + "|".join(BODIES) + r")\b(?:['\u2019]s)?\s+"
    r"(?:is\s+|sits\s+|lies\s+)?"
    r"\b(" + "|".join(sorted(_ASPECT_VERBS, key=len, reverse=True)) + r")\b\s+"
    r"(?:to\s+|with\s+|your\s+|the\s+|natal\s+){0,2}"
    r"\b(" + "|".join(BODIES) + r")\b",
    re.IGNORECASE)


def aspect_key(a: str, b: str) -> str:
    """Order-independent key for a pair of bodies.

    The prose says "Moon square Mercury" and the chart stores "Mercury square
    Moon" as readily; an aspect is a relationship, not a direction.
    """
    return "|".join(sorted((_canon(a), _canon(b))))


# Two trumps are named after bodies: The Sun and The Moon. In a spread reading
# "The Moon opposite The Sun" is overwhelmingly about two CARDS facing each other
# on the cloth — the Celtic Cross has positions that literally do — and reporting
# it as a fabricated aspect is the cry-wolf failure that gets a check deleted.
#
# The rule is narrow on purpose: only skip when BOTH sides are written in card
# form, capital "The" included. One side in card form and the other a bare body
# ("The Moon trine Saturn") is still judged, because that is how a reading writes
# a natal claim, not how it writes a card. The residual gap — a genuinely
# fabricated aspect phrased entirely in card form — is the price, and it buys the
# check's survival on every tarot reading the product serves.
_CARD_NAMED_BODIES = {"Sun", "Moon"}

# A trailing possessive turns the second body into a modifier: "Pluto's sign",
# "Saturn's house", "Venus's ruler". The sentence is then about that thing, not
# about an aspect to the planet.
_POSSESSIVE = re.compile(r"['\u2019]s\b")


def _in_card_form(text: str, at: int, body: str) -> bool:
    return _canon(body) in _CARD_NAMED_BODIES and text[max(0, at - 4):at] == "The "


def check_aspect_grounding(gen: Generation, case: Case) -> List[Finding]:
    """Every aspect the prose names must be one the chart actually has."""
    out: List[Finding] = []
    if not case.aspects:
        return out
    seen = set()
    for m in _ASPECT_CLAIM.finditer(gen.text):
        body_a, verb, body_b = m.group(1), m.group(2).lower(), m.group(3)
        if _canon(body_a) == _canon(body_b):
            continue                      # "Mercury square Mercury" — a parse artefact
        if (_in_card_form(gen.text, m.start(1), body_a)
                and _in_card_form(gen.text, m.start(3), body_b)):
            continue                      # two trumps on the cloth, not two bodies
        if _POSSESSIVE.match(gen.text, m.end(3)):
            # "Lilith conjunct Pluto's SIGN" is a claim about a sign, not about
            # Pluto. Caught on a live recording 2026-08-19, where the model was
            # being careful — it wrote "nearly kissing Pluto's sign" in the same
            # paragraph — and this check called it a hallucination. Lilith and
            # Pluto really are 12° apart and really are both in Scorpio; the
            # reading said so correctly and the checker read past the apostrophe.
            continue
        key = aspect_key(body_a, body_b)
        claimed = _ASPECT_VERBS[verb]
        actual = case.aspects.get(key)
        if actual == claimed:
            continue
        if (key, claimed) in seen:
            continue                      # report each distinct claim once
        seen.add((key, claimed))
        if actual is None:
            out.append(Finding(
                "aspect-grounding", "fail",
                f"says {_canon(body_a)} {claimed.lower()} {_canon(body_b)}, "
                f"chart has no major aspect between them — {m.group(0).strip()!r}"))
        else:
            out.append(Finding(
                "aspect-grounding", "fail",
                f"says {_canon(body_a)} {claimed.lower()} {_canon(body_b)}, "
                f"chart has {actual.lower()} — {m.group(0).strip()!r}"))
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
    check_aspect_grounding,
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
