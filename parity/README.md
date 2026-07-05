# parity/ — ASTRA-CORE golden vectors

Committed, versioned outputs of the Python engine (MOBILE_ROADMAP §3). The
future TypeScript engine (`@astra/core`) must reproduce every case within the
tolerance contract **stored inside each file**; the Python backend pins itself
to the same files via `backend/tests/test_parity_vectors.py`. Divergence on
either side is a red build, not a bug report.

| File | Schema | Covers |
|---|---|---|
| `natal-chart.json` | `astra-parity/natal-chart@1` | Full `ChartResponse` for the two reference charts (Einstein/Ulm 1879, Greenwich noon J2000): planets, cusps, angles, aspects, patterns, tallies, julian day |

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
