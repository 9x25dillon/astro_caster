# Resonarium parity — founding constraints

_Status: captured 2026-07-23 from an external verification pass over a
generated report (`hellonerf.pdf`). These are the constraints any
"bit-exact / substrate-independent" claim the resonarium makes must satisfy.
The resonarium itself is still undefined; this file exists so the parity
boundary is decided BEFORE the instrument is built, not retrofitted._

The resonarium's whole point is reproducibility: a third party handed a
specification regenerates the same result. That claim is only as strong as
the specification is complete. Two findings define the boundary.

---

## Constraint 1 — the printed seed must be a complete specification

**Finding.** In the verified report, one aspect will not reproduce from the
printed 2-decimal longitudes. Sun Quintile Part of Fortune:

- from the printed longitudes (Sun 228.78, PoF 156.33): separation
  `72.44999999999999`, orb `0.44999999999998863` → `round(orb, 1) = 0.4`.
- the report printed **0.5**, because it computed the orb from the
  **full-precision** ephemeris longitudes, where the true value sits just
  above the `0.45` tie.

The value is `1.1×10⁻¹⁴` from the tie point. A single further digit of
ephemeris precision flips the rounding. **So the printed 2-dp seed is lossy
relative to engine state** — a third party cannot regenerate the report from
it, and any bit-exact parity claim stated against the printed seed is false
for this aspect.

**Decision required (before resonarium build).** Two fixes; pick one and make
it the parity contract:

1. **Serialize the parity vector at full precision** (`%.17g` on every
   longitude). The printed seed becomes complete; display values are rounded
   only for human reading, never fed back into arithmetic.
2. **Quantize longitudes to display precision (2 dp) BEFORE all downstream
   arithmetic** — orbs, aspects, tallies all computed from the quantized
   values. This makes the *printed* seed a complete specification *by
   construction*: what you see is exactly what any reproduction computes.

**Recommendation: (2) for the human-facing seed, (1) for the machine parity
vector.** (2) is what makes a printed page self-sufficient (the resonarium's
promise to a person); (1) is what the drift-lock test in
`gen_parity_vectors.py` should compare against (the machine promise). They are
not in conflict — the display path quantizes, the parity path keeps full
precision. Adopting (2) changes every orb output and therefore the committed
parity vectors, so it is a deliberate cut, not a mid-stream patch.

**Also part of the contract:** the orb formatter is Python's `round()`, which
is **round-half-to-even** (banker's). Recovered from output: `0.25→0.2`,
`2.25→2.2` (exact binary halves go to even) while `2.05→2.0`, `1.55→1.6`
follow inexact binary storage; half-away-from-zero would have printed `0.3`,
`2.3`. The rounding mode is part of the spec — a reproduction using
half-away-from-zero diverges on the exact-half cases.

---

## Constraint 2 — parity covers the DETERMINISTIC substrate only, never LLM prose

**Finding.** The report's "Fire 38%" is **not** a deterministic engine output.
The engine's `_tally_elements` (a documented 12-body weighted scheme: ten
planets + Asc + MC, luminaries and angles ×2, denominator 16) produces, for
this chart, **Fire 25% / Water 44% (Water-dominant)** — surfaced as
`chart.elements` and `dominant_element`. The report's 38% matches a **13-body
unweighted** tally (ten planets + Asc + MC + Chiron, `5/13 = 38.46%`) that the
code does not implement. That figure came from the **Fable-5 synthesis doing
its own arithmetic over the placement list**, not from the engine.

**Consequence for the resonarium.** The parity boundary is sharp:

- **Reproducible (in-scope for bit-exact parity):** the deterministic
  substrate — chart positions, houses, aspects, patterns, `chart.elements`,
  the tarot draw (MT19937-seeded), forecasts, everything under
  `parity/*.json`.
- **NOT reproducible (out of scope, must be marked):** any statistic, count,
  or claim produced *inside* an AI-synthesised report. The model may tally
  elements over a different body set, round differently, or paraphrase — none
  of it drift-locks. A resonarium that quotes an LLM's "Fire 38%" as a
  substrate fact is quoting the wrong stratum.

**Design rule:** every number the resonarium presents as canonical must trace
to a deterministic function, not to report prose. If a percentage is worth
showing, compute it in the engine (documented body set + weighting) and pass
it to the model as data — never let the model invent it and then treat the
invention as ground truth. `_tally_elements` is now documented explicitly for
exactly this reason.

---

## What this changes now vs later

- **Now (done):** `_tally_elements` documents its actual 12-body weighted set
  (was inferred wrongly as 13-body during verification).
- **Later (resonarium build):** adopt the Constraint-1 contract (display
  quantize + full-precision parity vector), regenerate the drift-lock
  vectors, and mark every report-embedded statistic as non-canonical.
