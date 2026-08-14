# parity/anchors/ — external ground truth (Track A3)

The golden vectors under `parity/` prove the two engines **agree**; they
cannot prove either is **right** — `gen_parity_vectors.py` writes the
backend's own output, which makes the backend an unfalsifiable oracle. The
files in THIS directory break that circle: values sourced from **outside this
repository**, checked in, and

> **never regenerated, recomputed, or "corrected" by any tool in this
> repository. Ever.**

Both engines are asserted against these anchors independently
(`backend/tests/test_anchors.py`; the TS side inherits ΔT transitively — see
"Coverage paths" below). Neither engine is permitted to be the reference for
the other in this suite.

## The guard

CI (`anchors-guard` in `ci.yml`) fails any PR that touches a non-Markdown
file under `parity/anchors/` unless a commit in the PR carries an
`ANCHOR-CHANGE:` trailer with a provenance note. A tolerance that drifts to
make a build green is how a drift lock dies; an anchor that drifts the same
way is worse, because it redefines "true".

## Anchor record contract

Every anchor records, verbatim from its source:

| field | meaning |
|---|---|
| `source` | the publishing institution/work (JPL Horizons, NASA GSFC canon, IERS…) |
| `url` | the exact page or API query |
| `citation` | the quoted text or table row the value came from |
| `retrieved` | date of retrieval |
| `uncertainty_*` | the SOURCE's stated (or conservatively estimated) uncertainty |
| `engine_allowance_*` | the additional slack legitimately-different models may claim, justified in `note` |

The test tolerance is `uncertainty + engine_allowance` — never widened
in the test itself. Widening either field is an anchor change and trips the
guard.

## Coverage paths

- **ΔT** (`delta_t.json`): asserted against backend `swe.deltat()` directly.
  The vendored wasm build exports no `swe_deltat`, so the TS engine's ΔT is
  covered transitively: A1's generative harness holds TS planetary longitudes
  to ≤0.01° of the backend's, and a ΔT error large enough to matter moves the
  Moon ~0.55″/s — the planetary-longitude anchors bind both engines once
  their data lands.
- **Planetary longitudes** (`planet_longitudes.json`): 10 bodies × 4 epochs
  (1800, 1900, J2000, 2020) from JPL Horizons, asserted against both engines
  independently (`test_anchors.py` + `test/anchors.test.ts`). Read the file's
  `moshier_finding` before trusting `/api/health`'s `ephemeris` field, and its
  `delta_t_prediction_finding` before adding a future epoch.
- **Ayanamsa** (`ayanamsa.json`): Lahiri at J2000 (mean) and the 1956 vernal
  equinox (true). `frame` is per-anchor — mean and true differ by nutation,
  ~14-17″, larger than every tolerance here.
- **Eclipses**: schema and acquisition steps in `ACQUISITION.md`; runners land
  with the data.

## Why the initial set is small

This session's environment has a hard network egress policy: JPL Horizons,
NASA GSFC, USNO, IERS and even Wikipedia are unreachable (verified 403 /
EGRESS_BLOCKED on 2026-08-12). Fabricating anchor values from a model's
memory would be worse than none — a misremembered digit either red-bars
correct engines or sanctifies a wrong value. The one anchor checked in is the
one whose exact printed value WAS verifiable through a quoted search snippet
of the source page. Everything else is a ready-to-fill schema plus the exact
queries in `ACQUISITION.md` — deferred to a session (or the operator) with
open egress, with reasons written down, per the work-order's own rule.
