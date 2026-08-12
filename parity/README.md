# parity/ — ASTRA-CORE golden vectors

Committed, versioned outputs of the Python engine (MOBILE_ROADMAP §3). The
future TypeScript engine (`@astra/core`) must reproduce every case within the
tolerance contract **stored inside each file**; the Python backend pins itself
to the same files via `backend/tests/test_parity_vectors.py`. Divergence on
either side is a red build, not a bug report.

| File | Schema | Match | Covers |
|---|---|---|---|
| `natal-chart.json` | `astra-parity/natal-chart@1` | tolerance | Full `ChartResponse` for the two reference charts (Einstein/Ulm 1879, Greenwich noon J2000): planets, cusps, angles, aspects, patterns, tallies, julian day |
| `mt19937.json` | `astra-parity/mt19937@1` | **exact** | CPython `random.Random(int(sha256,16))` sequences — the tarot RNG, proven bit-for-bit independently of tarot |
| `tarot-draw.json` | `astra-parity/tarot-draw@1` | **exact** | Natal-arcana signatures + every seeded spread draw (v0.1 supported body set) |
| `forecast.json` | `astra-parity/forecast@1` | identity + ≤1-day date window + orb tol | Transit scan events (stations, t2t, t2n) over 60 days for each reference natal, Sun–Pluto transits |
| `tarot-reading.json` | `astra-parity/tarot-reading@1` | **exact** | Offline `build_reading_core` — seed + dealt cards + per-card meaning + natal signature (links/themes/shadows) |
| `synastry.json` | `astra-parity/synastry@1` | tolerance (positions) + **exact** (grid, tarot) | Relational engine for the Einstein × Greenwich pair: inter-aspects, house grid, composite (midpoint), Davison, synastry-tarot bond (v0.1 supported body set) |
| `predictive.json` | `astra-parity/predictive@1` | tolerance | Predictive engine: secondary progressions, solar return, and an 8-eclipse timeline per reference natal. The return instant is a Sun-longitude root-find (cross-engine sensitive), so its chart is compared at the shared instant; eclipses use the same Swiss search on both stacks — exact dates/natures/longitudes/activations |
| `advanced.json` | `astra-parity/advanced@1` | tolerance (harmonic ×N) + **exact** (star catalogue) | Advanced engine: harmonic chart (N=5), midpoint tree (90° dial), fixed-star contacts per reference natal |

`natal-chart`, `forecast` and the position fields of `synastry` are
engine-comparisons (astronomy-engine vs pyswisseph) so they carry tolerances;
`mt19937`, `tarot-draw`, `tarot-reading` and the categorical fields of
`synastry` (house grid, tarot spread) are arithmetic and match with `===`.

## Regenerating

```bash
cd backend
.venv/bin/python tools/gen_parity_vectors.py           # rewrite
.venv/bin/python tools/gen_parity_vectors.py --check   # byte-drift tripwire (CI)
```

Regeneration must be **reviewed, not routine**: the vectors only change when
the engine intentionally changes. Each file records the ephemeris source
(`engine`). Since 2026-07-08 **both stacks run the same Swiss Ephemeris C**
(pyswisseph on the backend, the vendored wasm build in @astra/core) against
the same committed seas-only data — so the TS suite compares near-exactly
(~1e-6, the vectors' 6-dp float rounding) and the ×5 cross-engine widening
that the astronomy-engine era needed is retired. The tolerances stored in
the files remain the contractual outer bound.

## The four layers of the lock

The vectors above are one layer of four, and they are the weakest one on
their own. Each layer catches what the others structurally cannot:

| layer | what it proves | what it CANNOT prove |
|---|---|---|
| **`parity/*.json`** — 9 committed vectors | the two engines agree at 9 known points | anything between those points; and nothing at all about correctness, since `gen_parity_vectors.py` writes the backend's own output |
| **`backend/tools/parity_property.py`** (Track A1) | the two engines agree across 2000 freshly-sampled cases per CI run, oversampling polar latitudes, sidereal frames, retrograde stations, the JD rollover and local midnight | that either engine is right — it is still engine-vs-engine. And random sampling essentially never lands within a hair of a boundary, which is where classifications actually flip |
| **`backend/tools/parity_boundary.py`** + **`tolerance.contract.json`** (Track A2) | the two engines make the same CATEGORICAL decision — sign, house, aspect membership, retrograde — at constructed distances from every boundary | anything about values away from boundaries; it is deliberately blind to the bulk of the space A1 covers |
| **`parity/anchors/`** (Track A3) | each engine independently matches values published OUTSIDE this repository | broad coverage — the set is deliberately small and grows only by acquisition |

The middle layer earned its place on its first run: it found a real bug the
nine vectors could never have seen — sidereal **whole-sign** cusps in
`@astra/core` were the tropical sign boundaries shifted into the sidereal
frame, landing ~5° mid-sign instead of snapping to the sidereal boundaries
the way `swe_houses_ex` does. Every sidereal whole-sign chart had all twelve
cusps wrong, and roughly one body in three fell in the wrong house. No golden
vector covered sidereal whole-sign, so nothing was red.

```bash
cd backend
.venv/bin/python tools/parity_property.py --n 2000 --seed 12345   # CI passes the run id
.venv/bin/python tools/parity_property.py --seed 12345 --index 44 # replay one case
.venv/bin/python tools/parity_property.py --case '{"year":2000,...}'
```

Every red run prints its seed, the failing case, a **shrunk** minimal
reproduction, and the one-line replay command. Failures are reproducible
locally from the CI run id alone.

## The tolerance contract, and what a bound actually means

`parity/tolerance.contract.json` is the machine-readable, versioned contract:
per quantity, the unit, the bound, the product-level justification, and **the
categorical decision that bound exists to protect**.

A bound is **the half-width of the band around a boundary in which the two
engines may classify differently.** Outside that band, agreement is mandatory
and a disagreement is a defect. This definition is the point: it is what makes
a tolerance checkable rather than decorative, and it is why the boundary suite
can be strict without being flaky. Demanding agreement *at* a boundary is
unsatisfiable — at exactly 30.000000° one engine says 29.999999° (Aries) and
the other 30.000001° (Taurus), and neither is wrong.

```bash
cd backend
.venv/bin/python tools/parity_boundary.py                  # 253 constructed cases
.venv/bin/python tools/parity_boundary.py --kind sign -v   # one kind, per-probe
.venv/bin/python tools/parity_boundary.py --inject-bias-deg 0.0167   # must go RED
.venv/bin/python tools/check_tolerance_ratchet.py          # widening needs an ADR
```

**Widening a bound fails CI** unless the same change adds an ADR under
`docs/design/adr/`. Tightening is always free — that asymmetry is what makes
it a ratchet. Tolerances that drift upward to make builds green are how a
drift lock dies.

## Comparison rules (mirror these in any consumer)

- Angle-valued fields compare **circularly** (359.99° vs 0.01° = 0.02°).
- Aspect and pattern **sets** must match exactly (keyed by sorted members +
  type); orbs/separations within tolerance.
- Signs, houses, retrograde flags, dignities, element/modality tallies, and
  `meta.julian_day` are exact — they're categorical or pure arithmetic.
- Pattern `description`/`extra` prose is informative, not contractual.
