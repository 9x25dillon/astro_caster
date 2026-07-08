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
| `predictive.json` | `astra-parity/predictive@1` | tolerance | Predictive engine: secondary progressions, solar return, and an 8-eclipse timeline per reference natal. The return instant is a Sun-longitude root-find (cross-engine sensitive), so its chart is compared at the shared instant; eclipses use astronomy-engine's own search and match the Swiss one on date/nature/longitude/activations |
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
(`engine`); consumers apply the strict tolerances same-engine and may widen
them (×5) across engines (moshier ↔ swiss-files differ by up to ~1 arcmin).

## Comparison rules (mirror these in any consumer)

- Angle-valued fields compare **circularly** (359.99° vs 0.01° = 0.02°).
- Aspect and pattern **sets** must match exactly (keyed by sorted members +
  type); orbs/separations within tolerance.
- Signs, houses, retrograde flags, dignities, element/modality tallies, and
  `meta.julian_day` are exact — they're categorical or pure arithmetic.
- Pattern `description`/`extra` prose is informative, not contractual.
