# Vendored Swiss Ephemeris (WASM)

Swiss Ephemeris **2.10.03** compiled to WebAssembly, taken from the
`@swisseph/browser` npm package **v1.1.1** (https://github.com/swisseph-js/swisseph,
AGPL-3.0 — see `LICENSE`). This repository is itself AGPL-3.0, so the licenses
are compatible.

| File | What it is |
| --- | --- |
| `swisseph.js` | Emscripten glue (MODULARIZE factory, `export default SwissEphModule`) |
| `swisseph.wasm` | Swiss Ephemeris C core, curated export set (`swe_calc_ut_wrap`, `swe_houses_wrap`, `swe_julday_wrap`, eclipse search, `swe_set_ephe_path_wrap`, …) |
| `seas_18.se1` | Swiss asteroid ephemeris 1800–2400 (same file the backend uses) — required for **Chiron**; every other body falls back to the built-in Moshier model, bit-identical to pyswisseph's Moshier mode |

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
