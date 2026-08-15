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
- **Eclipses** (`eclipses.json`): seven solar and four lunar, 1919–2023, from
  Espenak & Meeus' Five Millennium Catalog (NASA GSFC) — instant of greatest
  eclipse, magnitude, and nature. Both Swiss entry points are covered
  (`sol_eclipse_when_glob` and `lun_eclipse_when`), and **every branch of
  `predictive._eclipse_nature` is pinned**: total, annular, annular_total
  (hybrid), partial and penumbral. Read `magnitude_convention_note` before
  comparing any magnitude: the catalog's column is the Moon/Sun **diameter
  ratio** for total, annular and hybrid eclipses but the **obscured-diameter
  fraction** for a partial — Swiss `attr[8]` is the field that switches between
  them, and hardcoding either `attr[0]` or `attr[1]` is caught by an anchor.
  Read `delta_t_column_note` before
  converting any instant: the catalog's own ΔT column is an extrapolation for
  anything after 2006, so the comparison is made in **TD**, converting the
  engine's UT answer with the engine's own `deltat()`.

  **This file carries `measurements` instead of a single `value`.** An eclipse
  is not one number — the instant and the magnitude come from different
  columns, with different uncertainties and different failure modes. The
  provenance and ratchet meta-tests understand both shapes; see
  `_measurements()` in `backend/tests/test_anchors.py`. `nature` sits outside
  `measurements` because it is categorical: it has no tolerance, it is either
  right or wrong.

  **Asymmetric between the engines, deliberately.** The backend asserts instant,
  magnitude and nature. The TS side (`packages/astra-core/test/anchors.test.ts`)
  asserts **nature and calendar date only**: the catalog publishes TD, the TS
  engine returns UT, and the vendored wasm exports no `swe_deltat` to bridge
  them — the same limitation the ΔT coverage note above describes. Magnitude is
  not surfaced by `searchEclipses` at all. The instant is therefore covered
  transitively on that side (backend anchors + A1's cross-engine harness), and
  the TS test says so rather than implying more.

## Why the initial set was small — and why it no longer is

The 2026-08-12 session had a hard network egress policy: JPL Horizons, NASA
GSFC, USNO, IERS and even Wikipedia were unreachable (403 / EGRESS_BLOCKED).
Fabricating anchor values from a model's memory would be worse than none — a
misremembered digit either red-bars correct engines or sanctifies a wrong
value — so everything unreachable was left as a ready-to-fill schema plus the
exact queries in `ACQUISITION.md`.

**That blocker was retested on 2026-08-15 and is gone**: `eclipse.gsfc.nasa.gov`,
`ssd.jpl.nasa.gov` and `aa.usno.navy.mil` all answer. The eclipse anchors were
acquired that day by direct HTTP GET. **Retest egress before deferring anything
else on those grounds** — a recorded blocker is a snapshot, not a standing fact,
and this one outlived its truth by three days.

Still deferred, with reasons in `ACQUISITION.md`: ΔT at 1900 and 2050. The
eclipse set is complete for nature coverage as of 2026-08-15.
