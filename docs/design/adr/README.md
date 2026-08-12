# Architecture Decision Records

Short, dated notes recording a decision that would otherwise be re-litigated
or, worse, quietly reversed. One file per decision, numbered, never edited
after acceptance — a later ADR supersedes an earlier one and says so.

## When one is required

Most changes need no ADR. Two situations demand one:

1. **Widening a bound in `parity/tolerance.contract.json`.** Enforced
   mechanically by `backend/tools/check_tolerance_ratchet.py` in CI: the
   build fails until an ADR lands in the same change. Tightening never needs
   one.
2. **Reversing a ratified decision** recorded in `docs/progress/` — the
   editions split, the fail-closed posture, the AI-free deterministic core.

Anything else is optional and usually better as a comment next to the code.

## Format

```
docs/design/adr/NNNN-short-slug.md

# NNNN — Title
Date · Status: accepted | superseded by NNNN

## Context      what was true that forced a choice
## Decision     what we chose, stated so it can be checked
## Consequences what this costs, and what it makes harder
## Alternatives what was rejected, one line each with the tradeoff
```

Write the Consequences section honestly. An ADR that lists only benefits is
marketing, and the next reader will discover the cost the expensive way.
