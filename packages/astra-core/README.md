# @astra/core

The deterministic astrology engines, in dependency-light TypeScript, **drift-locked
to the Python backend** through the golden vectors in [`/parity`](../../parity)
(MOBILE_ROADMAP §3). This is the load-bearing initiative for on-device compute
(H3): the same chart math the server runs, provably equivalent, in the browser.

## v0.1 — the chart module

`calculateChart(req)` reproduces the backend's `ChartResponse`:

- **Ephemeris**: [`astronomy-engine`](https://github.com/cosinekitty/astronomy)
  (MIT, pure TS, ~Moshier-class) — an *independent* implementation from the
  backend's pyswisseph/Moshier, which is exactly what makes the parity test
  meaningful. Positions on the true ecliptic of date; declinations in the
  equator of date; longitude speed by central difference.
- **Houses**: Placidus cusps + Ascendant/Midheaven computed from apparent
  sidereal time (GAST) and true obliquity — ported from the horizon/pole
  formulae, no Swiss dependency. Reproduces `swe.houses_ex` to ~0.001°.
- **Symbolic layer**: signs, dignities, aspects, patterns, element/modality
  tallies — direct ports of `astrology.py` / `patterns.py` (including the
  sorted-iteration determinism fix and both-orientation Kite detection).

### Body coverage & the known gap

Ships: Sun–Pluto, Ascendant, Midheaven, Part of Fortune. **Not yet**: North/
South Node, Chiron, Lilith — astronomy-engine doesn't provide them. The parity
test restricts its comparison to the supported set and filters aspects/patterns
accordingly. Closing the gap is the WASM-Swiss escalation decision tracked in
MOBILE_ROADMAP §3; until then the vectors themselves carry the full body set so
the target never drifts.

### Accuracy (v0.1, vs the committed vectors)

Worst-case longitude delta across both reference charts: **~0.003°** (Uranus),
well inside the parity contract's cross-engine tolerance (±0.01° × 5). Angular
house cusps are exact; intermediate cusps ~0.001°.

## v0.2 — the tarot module

`buildNatalArcanaSignature(chart)` + `weightedDraw(sig, spread, seed)` reproduce
the backend's natal-tarot draw **bit-for-bit**. This is a stronger claim than
the chart: the draw is pure arithmetic plus a seeded PRNG, so parity is exact,
not tolerance-based.

- **`mt19937.ts`** — a CPython-compatible Mersenne Twister. The backend seeds
  `random.Random(int(sha256_hex, 16))`; matching a draw requires the same
  `init_by_array` seeding and `genrand_res53` float. Proven on its own against
  `parity/mt19937.json`.
- Deck order, suits, and planet/sign→trump mappings live in `tarot-data.json`,
  **generated from the Python source** (`gen_parity_vectors.py` side) — no hand
  transcription of 78 cards.
- Gotchas the parity vectors caught: the backend joins seed parts with an
  invisible `U+0001` separator, and rounds weights half-to-even before the draw.

Prose, lessons and learning paths (static lookups) are deferred to a later step.
The seed hash is a dependency-free `sha256Hex` (`src/sha256.ts`, verified
against `node:crypto`), so the whole tarot path — like chart and forecast — is
browser-safe and exported from `browser.ts`.

## v0.3 — the forecast module

`generateForecast(natal, startISO, days, minSig)` scans transits day-by-day —
stations, transit-to-transit and transit-to-natal exactness (Moon at 6h
resolution), hysteresis, and dedup — a port of `forecast.py`. Parity is
tolerance-based (a cross-engine comparison): it reproduces the backend's
~120-event, 60-day forecast matched by event identity within a ±1-day / 0.2°
window (`parity/forecast.json`). Sun–Pluto transits; still synchronous (the
Web-Worker chunking is a UI-integration concern).

## Develop

```bash
npm install
npm test          # parity vs /parity/*.json (chart, mt19937, tarot-draw)
npm run typecheck # tsc --noEmit, strict
```

The parity test reads the SAME `parity/natal-chart.json` the backend generates
and pins itself to; regenerate vectors only via `backend/tools/gen_parity_vectors.py`.
