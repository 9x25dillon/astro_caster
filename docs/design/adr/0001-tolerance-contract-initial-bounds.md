# 0001 — The tolerance contract and its initial bounds

2026-08-12 · Status: accepted

## Context

The parity vectors carried a `tolerances` block per file, and that block was
the whole contract: a set of numbers with no stated unit rationale, no record
of which product decision each one protected, and nothing stopping a future
session from nudging one upward to turn a build green.

Two problems with that, both named in the Track A work order:

1. **The unit was wrong for the product.** Arcseconds measure agreement about
   a float. Astra's output is categorical — a sign, a house, an aspect that is
   either in the reading or not. Two engines agreeing to 0.5″ can still
   disagree about which house a planet occupies, and the reader never sees the
   0.5″; they see a reading that contradicts the one they got yesterday.
2. **Nothing was falsifiable.** A tolerance with no stated justification
   cannot be argued with, only obeyed or quietly changed.

## Decision

`parity/tolerance.contract.json` is the versioned, machine-readable contract.
Per quantity it records the unit, the bound, the **product-level**
justification for that bound, and — the part that matters — the categorical
decision the bound exists to protect.

A bound is defined as **the half-width of the band around a categorical
boundary in which the two engines are permitted to classify differently.**
Outside that band, classification must be identical; a disagreement there is
a defect. This definition is what makes the number checkable rather than
decorative, and `backend/tools/parity_boundary.py` checks it by constructing
cases at measured distances from real boundaries.

Initial bounds are carried over unchanged from the values already in
`parity/natal-chart.json`, so this ADR introduces **no behavioural change** —
it documents and constrains what was already there. Their provenance is
honest about itself: they were chosen by earlier sessions against the
astronomy-engine/pyswisseph split and were never re-derived after both stacks
moved to the same Swiss C. `planet.latitude_deg` in particular matches
longitude "for consistency rather than for an independent reason", and the
contract says so in the file rather than implying a measurement that never
happened.

## Consequences

- Widening any bound now requires an ADR (enforced by
  `check_tolerance_ratchet.py`). That is friction, and it is the point:
  widening excuses divergence that was a defect the day before.
- The bounds are now load-bearing in a second place. Changing one changes
  which boundary probes are considered "outside the band", so a widening
  silently reduces the boundary suite's sensitivity as well as the vector
  suite's strictness. The ratchet is the only thing making that visible.
- The empirical grounding is still missing. These bounds are inherited, not
  measured. Track C4 (an ephemeris divergence map) is what would replace
  "carried over from the vectors" with "measured across epochs", and until
  that lands the justifications are reasoning, not data. Stated here so the
  gap is on the record rather than discovered later.

## Alternatives

- **Leave the tolerances in the vector files.** Rejected: no single place to
  state what a number protects, and no hook for a ratchet.
- **Derive the bounds from measurement now.** Rejected as sequencing, not as
  an idea — the measurement is C4, and blocking A2 on it would leave the
  contract unwritten and the ratchet unbuilt for longer than necessary.
- **Demand exact categorical identity at boundaries.** Rejected: two distinct
  implementations cannot agree about a value sitting exactly on a boundary,
  so the suite would be permanently flaky, and a flaky suite gets muted. This
  repo already has that scar — a deliberately-red test sat red for weeks and
  masked a genuinely broken build.
