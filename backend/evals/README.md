# evals/ — quality gate on what the model wrote

The backend test suite mocks the provider. That is correct for testing the
plumbing, and it is why the plumbing has 500 tests and no defects. But a mock
returns whatever the test author typed: it cannot be truncated, cannot invent a
placement, cannot drift off voice, and cannot run long. Everything that makes an
LLM product bad is invisible to it.

On **2026-08-17** a subscriber's reading ended:

> `- Profound psychological insight an`

Every supporter reading had ended mid-sentence for the product's entire history.
`finish_reason` was read nowhere in `ai.py`, so nothing detected it, and 488
passing tests reported a healthy system. This directory exists so that class of
defect fails a build instead of reaching a reader.

## Running it

```bash
python -m evals.runner              # replay recorded generations, check, report
python -m evals.runner --record     # call the live provider, re-record (COSTS MONEY)
python -m evals.runner --case oracle:angles
python -m evals.runner --json report.json
```

CI runs the replay form on every push. `pytest tests/test_evals.py` runs the same
checks plus the regression fixtures.

## Replay vs record

A cassette in `cassettes/` is a **real generation**, saved. Replay checks those:
no network, no spend, deterministic, so CI can run it on every push — which is
the only way a quality gate actually holds a line.

Re-record when you change **a prompt, a model, or a token budget**. Those are
exactly the three things that alter what comes out, and the diff on the cassettes
is then a readable before/after of the product itself.

## The checks

| check | severity | catches |
|---|---|---|
| `completeness` | fail | truncation — `finish_reason="length"`, mid-word endings, empty output, a heading the model never filled |
| `structure` | fail | a prompt's named sections going missing |
| `grounding` | fail | placements the chart does not contain |
| `length` | fail under / warn over | a paid tier returning a stub; verbosity approaching the ceiling |
| `voice` | warn | literal event prediction, which every system prompt here forbids |

Only `fail` fails the suite.

**`grounding` is the one to understand.** It parses placement claims out of the
prose and compares them to the computed chart. A model asked about an Ascendant
it was not clearly told will write a fluent, confident paragraph about the wrong
sign — and that output looks exactly as legitimate as a correct one. There is no
stack trace, no missing bracket; just a different answer, equally well written.
That is the most dangerous failure this product can have.

It is deliberately conservative. Its first draft flagged two *correct* readings
because it let another body sit between a planet and its sign:

```
"...Ascendant) and fierce directness (Mars in Aries"
"...Uranus, Neptune, all retrograde) and **Pluto in Scorpio"
```

Both signs belong to the later body. A check that cries wolf gets switched off,
and then it guards nothing — so a claim now counts only when nothing intervenes.
`test_grounding_does_not_cry_wolf` pins both phrasings.

## Fixtures that must FAIL

`regressions/` holds known-bad readings, and `tests/test_evals.py` asserts the
checks **reject** them. A quality suite that passes everything is
indistinguishable from no suite and drifts there quietly, one loosened check at a
time. If someone waters down `check_completeness`, these go green and the test
file goes red.

- `supporter_null_content_2026_08_17.json` — recorded live at the pre-fix 3,000
  budget. `finish_reason="length"`, `content=None`, the whole budget spent.
  Recording this is what revealed that `None.strip()` was a 500 on a call the
  reader had already paid for.
- `supporter_midsentence_derived.json` — the shape that reached the reader.
  **Derived, not recorded**, and labelled so in the file: live re-recording at
  the old ceiling kept returning null content instead, so this shape could not be
  captured on demand.

## Adding a check

A check is a pure function `(Generation, Case) -> list[Finding]` in `checks.py`,
added to `ALL_CHECKS`. No network, no I/O — so checks are themselves unit
testable, which matters, because a silently broken check is worse than none.

Before adding one, write the reading that should fail it and put it in
`regressions/`. If you cannot produce an example that fails, the check is not yet
specific enough to be worth running.

## What this does not cover

Nothing here judges whether a reading is *good* — insightful, well-written, worth
paying for. These are floor conditions: complete, structured, grounded in the
chart, in voice. A reading can pass every check and still be dull.
