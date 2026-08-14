# Vendored Swiss Ephemeris (WASM)

Swiss Ephemeris **2.10.03** compiled to WebAssembly, taken from the
`@swisseph/browser` npm package **v1.1.1** (https://github.com/swisseph-js/swisseph,
AGPL-3.0 — see `LICENSE`). This repository is itself AGPL-3.0, so the licenses
are compatible.

| File | What it is |
| --- | --- |
| `swisseph.js` | Emscripten glue (MODULARIZE factory, `export default SwissEphModule`) |
| `swisseph.wasm` | Swiss Ephemeris C core, curated export set (`swe_calc_ut_wrap`, `swe_houses_wrap`, `swe_julday_wrap`, eclipse search, `swe_set_ephe_path_wrap`, …) |
| `seas_18.se1` | Swiss asteroid ephemeris 1800–2400 — **Chiron** |
| `sepl_18.se1` | Swiss planetary ephemeris 1800–2400 — Sun and planets |
| `semo_18.se1` | Swiss lunar ephemeris 1800–2400 — the Moon |

All three `.se1` files are byte-identical to the canonical upstream
(`github.com/aloistr/swisseph`, `ephe/`), verified by sha256 when vendored.
The backend reads the same directory, so both engines answer from one file set.

**Until 2026-08-14 only `seas_18.se1` was vendored**, and every other body fell
back to the built-in Moshier model. That was deliberate — Moshier is bit-identical
between this wasm build and pyswisseph, which kept the two engines in exact
agreement — but it meant the whole product ran on an analytic approximation while
`/api/health` reported `swiss-files`, and nothing in the repository could see it.
Track A3's JPL Horizons anchors measured the cost: up to 3.13″ (Pluto at 1800),
2.05″ (Neptune at 1800), 1.25″ (the Moon at 2020).

The subset is not a safe middle ground. Swiss treats a missing class as a silent
Moshier fallback, so shipping these files to one engine and not the other would
put the two back out of step — and because the tarot seed is built from
longitudes rounded to 0.01° (`backend/tarot.py:396`), a sub-arcsecond
disagreement near a rounding boundary changes the seed string and therefore the
entire spread. Measured at 3.4% of charts. **Add or remove these files from both
engines together, or not at all.**

## Why vendored instead of an npm dependency

The published package is unusable as-is (verified 2026-07-07):

1. Its high-level wrapper (`dist/swisseph-browser.js`) is broken — an esbuild
   pass mangled an import into `(void 0)`, so `calculatePosition()` throws.
2. Its `exports` map exposes only the broken entry — the working low-level glue
   is not importable by subpath under Node ESM.
3. The glue's Node file-read branch is compiled out (web-only `readAsync`), so
   the wasm bytes must be handed to the factory as `wasmBinary` — which is what
   `src/swisseph.ts` does, isomorphically (fs in Node, fetch in the browser).

We therefore pin the two working artifacts here. `src/swisseph.ts` is the only
consumer. To upgrade: bump the package in a scratch dir, re-run the parity
suite, and replace these files + this version note.

## Parity

With `seas_18.se1` mounted and `SEFLG_SWIEPH` requested, True Node / Lilith /
Chiron reproduce the backend's pyswisseph values to ≤2×10⁻⁸ ° (Chiron) and
≤0.006° (True Node, Moshier-vs-Swiss-file lunar theory — inside the ±0.01°
parity tolerance; Lilith is analytic and exact). Drift-locked by
`parity/natal-chart.json` like every other engine.
