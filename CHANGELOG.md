# Changelog — Astra Arcana Production Hardening

Per-phase log for the Production Hardening & Symbolic Intelligence Expansion pass.
Baseline: `d9afc4b` (36 backend tests, clean frontend build).

## Lazy-load @astra/core + chunk split — smaller initial bundle (2026-07-05, lazy-astra-core)

The offline engines were shipping in the main bundle even though they're only
needed when the backend is down. Deferring them (and splitting vendors) roughly
halves the app chunk and clears the long-standing >500 kB chunk-size warning.

- **`@astra/core` is now dynamically imported** in `client.ts` (`import()`),
  so Vite emits it as its own async chunk (`browser-*.js`, ~161 kB incl.
  astronomy-engine + card data) loaded on **first offline use**, not on boot.
  The four `local*` fallbacks (`localChart`, `localTarotReading`,
  `localForecast`, `localNatalArcana`) became async; their callers `await`.
- **Vendor split** (`manualChunks`): react/react-dom/zustand/react-spring,
  leaflet, and d3 each get a long-cached chunk. Result: main app chunk
  **635 kB → 237 kB**, no chunk over 500 kB, warning gone.
- **`ephemeris.ts`** picks the astronomy-engine namespace via a computed key so
  the bundler stops warning about a missing `default` on the ESM build.
- Verified: 28 e2e pass (the offline fallbacks load the lazy chunk on demand;
  precached by the SW so they still work fully offline); 25 core parity tests.

## Offline natal-arcana signature on-device (2026-07-05, offline-natal-arcana)

Mobile roadmap H1: the Arcana Natal tab now builds its signature on-device when
the backend is down — completing the offline Arcana surface.

- **`@astra/core` `buildLocalSignature(chart)`**: the frontend-shaped
  `NatalArcanaSignature` — links (now carrying `sign`/`house` + full card
  objects), themes (top-weighted trumps), and shadows (weakest-element trumps,
  ported from `build_natal_arcana_signature`), plus the disclaimer.
- **Parity**: the `tarot-reading.json` vector now also carries the backend
  signature; `buildLocalSignature` reproduces its links, themes, shadows, and
  dominants **exactly** (asserted in `tarot-reading.test.ts`).
- **Frontend**: `client.localNatalArcana()` + an ArcanaModal Natal-tab fallback.
  `e2e/arcana-offline.spec.ts` now also asserts the Natal-tab links render with
  the backend severed. 28 e2e; 25 core parity; 171 backend green.

## Offline transit forecast on-device (2026-07-05, offline-forecast)

Mobile roadmap H1: the ForecastPanel now lists upcoming transits with the
backend down, scanning on-device via `@astra/core`'s forecast engine.

- **`client.localForecast(natal, days, minSig)`**: casts the natal chart
  locally, runs `generateForecast` over Sun–Pluto transits, and enriches the
  structural events with display fields (glyphs, aspect colors, meaning) the
  backend serves server-side. Reduced body set (no Chiron / lunar Node),
  flagged in the panel.
- **ForecastPanel `load()`** falls back to `localForecast` on a backend
  failure and shows a "☾ on-device (offline)" tag. Frontend-only; the forecast
  engine and its parity vector already shipped in §3.3.
- `e2e/forecast-offline.spec.ts`: backend severed → open Forecast → events
  list + offline tag. 28 e2e pass; frontend build clean.

## Offline tarot readings on-device (2026-07-05, offline-tarot)

Mobile roadmap H1: the Arcana Draw tab now deals a full spread with the backend
down — the same cards the server's offline reading gives, computed in the
browser.

- **`@astra/core` gains the reading assembly** (`tarot.ts` `buildLocalReading`):
  ports the deterministic half of the backend's `build_reading_core` — the seed
  string (`defaultSeed`, banker's-rounded body longitudes), the dealt cards,
  per-card meaning template, and natal-link notes (signature now carries
  `links` + `HOUSE_THEMES`). Full 78-card display data generated from the Python
  source into `tarot-cards.json`. AI interpretation and the lesson/activity
  generators are backend enrichment, left empty offline.
- **New parity vector `tarot-reading.json`**: proves `buildLocalReading`
  reproduces the backend's offline reading **exactly** — seed, cards, and
  meanings (natal-link notes included) — for the reference charts across three
  spreads. `gen_parity_vectors.py` now emits five files.
- **Frontend**: `client.localTarotReading()` + an ArcanaModal `draw()` fallback
  — a network failure deals on-device (AI-gated 402s still surface normally).
  `e2e/arcana-offline.spec.ts`: backend severed → open Arcana → Draw → three
  cards with meanings render. 26 e2e pass; 25 core parity tests; build clean.

## @astra/core tarot goes browser-safe — isomorphic SHA-256 (2026-07-05, tarot-browser)

The last Node-only dependency in the engines. `tarot.ts` seeded its MT19937
from `node:crypto`'s sha256, keeping it out of the browser bundle.

- **`src/sha256.ts`** — a dependency-free, synchronous FIPS 180-4 SHA-256
  (Web Crypto is async, `node:crypto` is Node-only; the seed needs a sync
  digest). Verified byte-for-byte against `node:crypto` across empty, ASCII,
  multibyte UTF-8, the tarot U+0001 separator, and 55/56/64-byte block
  boundaries (12 cases).
- `tarot.ts` now seeds from `sha256Hex` — the tarot parity vectors still match
  exactly (the hash is bit-identical), and tarot joins chart + forecast in
  `browser.ts`. All four engines are now browser-capable; the core's draw path
  has zero Node dependencies. 23 core parity tests green; frontend build clean.
- UI wiring (offline tarot in ArcanaModal, pairing the local draw with the
  frontend's existing `tarotCopy.ts` prose) is the next step.

## @astra/core wired into the frontend — offline chart casting (2026-07-05, wire-astra-core)

Mobile roadmap H1 payoff: the observatory now casts charts **on-device** when
the backend is unreachable, no cache required — the deterministic engines built
in §3 doing real work in the browser.

- **Isomorphic engine load.** `ephemeris.ts` now pulls astronomy-engine via a
  static **namespace** import (`import * as`, taking `.default` under Node) —
  no `createRequire` (absent in browsers) and no top-level await (forbidden by
  the build target), yet still dodging the package's named-export detection bug
  on Node < 24. Works identically under `tsx --test` and Vite/esbuild.
- **Browser entry** `packages/astra-core/src/browser.ts` exposes the Node-free
  engines (chart + forecast); the frontend aliases `@astra/core` to it (Vite
  alias + tsconfig path). Tarot stays out of the browser bundle until its
  `node:crypto` sha256 gets an isomorphic swap (follow-up).
- **`client.localChart(birth)`** casts via `calculateChart`; the store's
  `generate()` gains a third offline tier — **API → same-birth cache →
  on-device compute** — with a distinct badge ("cast on your device" vs
  "showing your last cast"). On-device charts carry the reduced body set
  (no lunar Node / Chiron / Lilith), which the badge signals.
- astronomy-engine is bundled (precache 930 KiB), so the `no-external` guarantee
  holds and it works fully offline. `offline-shell.spec.ts` updated: a fresh
  offline boot now renders an on-device chart (was: error); the cache test
  waits for a real backend cast first (a cold backend would otherwise let the
  fallback answer). 24 e2e pass; 11 core parity tests; frontend build clean.

## @astra/core/forecast v0.3 — transit scanner (2026-07-05, astra-core-forecast)

Mobile roadmap §3 step 3 — the CPU-heavy engine. A faithful port of
`forecast.py`'s day-by-day scan: stations (speed-sign zero-crossing via
bisection), transit-to-transit and transit-to-natal aspect exactness with the
Moon sampled at 6-hour resolution, the 0.03°/0.02° hysteresis, the last-day
approaching-aspect pass, and the 10-day same-signature dedup.

- **`src/forecast.ts`** + a shared `eclipticLonSpeed(jd, name)` primitive
  exported from `ephemeris.ts` so the scanner reuses the chart's exact frames.
- **Parity**: reproduces the backend's ~120-event, 60-day forecast for both
  reference natals (`parity/forecast.json`), matched by event **identity**
  (type, planet, aspect, target, direction) within a **±1-day date window and
  0.2° orb** — like the chart, this is a cross-engine comparison
  (astronomy-engine vs pyswisseph), and near-midnight stations / flat-minimum
  aspects can legitimately land a day apart. Passed first run, both cases.
- The vector is generated with the backend restricted to Sun–Pluto transits
  (no Chiron / lunar Node — astronomy-engine lacks them), so it's exactly what
  @astra/core v0.1 reproduces. `gen_parity_vectors.py` now emits four files;
  CI `--check` covers all. 11 TS parity tests; 171 backend tests green.

## @astra/core/tarot v0.2 — bit-exact natal draw (2026-07-05, astra-core-tarot)

Mobile roadmap §3 step 2. The tarot draw is deterministic and must match the
backend *exactly* (not within tolerance — it's arithmetic + a seeded PRNG), so
this is a stronger parity claim than the chart.

- **`packages/astra-core/src/mt19937.ts`** — a Python-compatible Mersenne
  Twister. The backend seeds `random.Random(int(sha256_hex, 16))` and consumes
  `.random()`; reproducing a draw on-device means matching CPython bit-for-bit:
  `init_by_array` seeding from the 256-bit digest and the 53-bit
  `genrand_res53` float. Proven against a dedicated `parity/mt19937.json`
  (Python-generated sequences, compared with `===`) independently of tarot.
- **`src/tarot.ts`** — natal-arcana signature (chart → weighted major/minor
  emphasis) and `weightedDraw` (seeded, no-replacement, per-position reversal),
  ports of the draw-relevant core of `tarot.py`. Deck order, suits and
  planet/sign→trump mappings are generated from the Python source into
  `tarot-data.json` (DRY, no transcription). Proven against
  `parity/tarot-draw.json` — signatures + every seeded spread draw, exact.
- **Two determinism traps caught by parity** (both silent until the vector
  disagreed): the backend joins seed parts with an **invisible U+0001**
  separator (`"\x01".join(parts)` renders as `""`), and it rounds weights with
  **Python's round-half-to-even** before they feed the RNG comparison — a naive
  round drifts the cumulative-weight pick at boundaries. `pyRound` matches.
- **Generator** `gen_parity_vectors.py` now emits three files (chart + mt19937 +
  tarot-draw); the CI `--check` byte-drift tripwire covers all three, and the
  tarot vector targets the v0.1 supported body set (documented) so it's exactly
  what @astra/core can reproduce. 9 TS parity tests; 171 backend tests green.

## @astra/core/chart v0.1 — ASTRA-CORE lands (2026-07-05, astra-core-chart)

Mobile roadmap §3 step 1: the first deterministic engine ported to TypeScript
and **drift-locked to the Python backend** through the committed golden vectors
(the parity methodology finally has a consumer on the other side).

- **`packages/astra-core/`** — dependency-light TS package. `calculateChart(req)`
  reproduces the backend `ChartResponse`: ecliptic positions via
  `astronomy-engine` (MIT, pure TS, an *independent* Moshier implementation
  from the backend's pyswisseph, which is what makes parity meaningful),
  Placidus houses + Asc/MC computed from scratch (GAST + true obliquity, no
  Swiss dependency), and direct ports of `astrology.py` / `patterns.py` for the
  symbolic layer (carries the sorted-iteration determinism fix and both-
  orientation Kite detection).
- **Parity is the referee**: `test/parity.test.ts` reads the SAME
  `parity/natal-chart.json` the backend generates and reproduces both reference
  charts within the file's cross-engine tolerance — worst longitude Δ ~0.003°
  (Uranus), house cusps ~0.001°. CI job `astra-core` (typecheck + parity) gates
  every commit.
- **Getting there** surfaced the Placidus subtlety worth recording: our horizon
  formula `asc1` leads Swiss Ephemeris's `Asc1` by 90° (cos vs sin numerator),
  so the Ascendant is `asc1(armc)` directly and the intermediate-cusp RA offsets
  are Swiss's minus 90 (−60/−30/+30/+60). Angular cusps then fall out exact.
- **Known gap (documented, tracked)**: North/South Node, Chiron, Lilith aren't
  computable with astronomy-engine — the parity comparison restricts to the
  supported body set (Sun–Pluto, Asc, MC, Part of Fortune) and filters
  aspects/patterns accordingly. Closing it is the WASM-Swiss escalation in
  roadmap §3; the vectors keep the full body set so the target never drifts.

## Receipt ledger — deluxe purchase replay closed (2026-07-05, receipt-ledger)

Closes the one accepted security limitation on the books
(docs/audits/AUDIT_REGRESSION.md §6): stateless report claims let a single
qualifying tx mint deluxe claims for *different* Oracle sessions.

- **backend/receipts.py**: stdlib-SQLite ledger beside the telemetry db
  (AAE_RECEIPTS_DB, default data/receipts.db, covered by the existing
  backend/data/*.db gitignore). Atomic redemption via BEGIN IMMEDIATE;
  tx hashes normalized (strip + lowercase).
- **/api/personal-report/purchase** redeems after payment verification,
  before minting: first redemption wins; the SAME seed stays idempotent
  (recompiles, lost-claim recovery); a different seed 402s naming the reuse;
  a broken/unavailable ledger FAILS CLOSED — a paid surface never mints
  unrecorded.
- **/api/donate/verify deliberately unchanged**: tier re-verification is the
  documented recovery path (lost localStorage, AAE_SECRET rotation) and has
  no cross-seed amplification.
- 9 tests (test_receipts.py, unit + endpoint incl. fail-closed); 171 backend
  tests green.

## Offline app shell — last cast survives losing the network (2026-07-04, offline-shell)

Mobile roadmap §7.4. The static shell (js/css/html/svg/woff2) was already
fully precached by the service worker after the fonts work; this adds the
dynamic half so a network-dead reload still boots a living observatory.

- **`useStore.generate()`**: every successful cast persists
  `{birth, chart}` to `localStorage["aae.last_chart"]` (best-effort, label
  excluded from identity); on API failure it restores the cached chart —
  **only when the birth data matches** — instead of showing a dead wheel,
  and sets `chartFromCache`.
- **`.offline-note` badge** over the wheel ("☾ offline — showing your last
  cast", amethyst pill, `role="status"`) so a cached view is never mistaken
  for a live compute. No cache → the honest error path, unchanged.
- **`e2e/offline-shell.spec.ts`**: online visit → sever `/api/**` → reload →
  wheel restored + note visible; fresh profile offline → error surfaced,
  no note. Runs in both desktop and mobile projects.

## Parity vectors — ASTRA-CORE drift lock begins (2026-07-04, parity-vectors)

Mobile roadmap §7.3 / §3: golden vectors as a product, not a QA step.

- **`backend/tools/gen_parity_vectors.py` → `parity/natal-chart.json`**
  (schema `astra-parity/natal-chart@1`): the full ChartResponse for the two
  reference charts the suites already lean on (Einstein/Ulm 1879, Greenwich
  noon J2000) — planets, cusps, angles, aspects, patterns, weighted tallies,
  julian day — with the roadmap §3 **tolerance contract embedded in the file**
  (longitudes ±0.01°, cusps/angles ±0.02°, orbs ±0.01°, categorical fields
  exact) and the generating ephemeris engine stamped (`moshier`).
- **`tests/test_parity_vectors.py`** — roadmap §3 step 5 arrives early: the
  Python backend now pins itself to the committed vectors (circular angle
  comparison, exact aspect/pattern sets, ×5 tolerance widening only across
  engine changes). The future `@astra/core` runs the same comparison against
  the same file. CI additionally runs `gen_parity_vectors.py --check` as a
  byte-drift tripwire. 149 backend tests green.
- **Determinism fix in `patterns.py`** (found by the vectors' own `--check`
  round-trip): sets of frozensets iterate in per-process hash order, so
  pattern order and description wording varied between server restarts —
  violating the deterministic-core invariant — and **Kite detection was
  genuinely random**: the single arbitrary pair-unpack checked only one
  orientation of each opposition, missing the kite whenever the trine member
  landed in the second slot. All pattern iteration/unpacking is now sorted and
  Kites check both orientations.

## Ed25519 dual-issue spike (2026-07-04, ed25519-spike)

Mobile roadmap §7.5 / §4.2 — the asymmetric-verification groundwork for
on-device tier checks. (Landed in parallel with the offline-shell entry; see
its section for §7.4.)

- **`AAE_SIGN_ALGO=ed25519`** (+ `AAE_ED25519_SEED`, 32-byte hex) switches
  token MINTING to Ed25519: signature carried as `e1` + 128 hex chars, so it
  can never be confused with a 64-char HMAC digest. `verify_token()` is
  scheme-detecting and **accepts both kinds regardless of the active algo** —
  flipping the flag in either direction never strands outstanding tokens.
  Report claims ride the same `_sign` path, so PDF-2 purchase tokens dual-
  issue for free.
- **`ed25519_public_key_hex()`** exports the verify-only key a client embeds;
  the test suite proves a signature checks out with *only* the public key —
  exactly the on-device flow. Keygen: `tools/gen_ed25519_key.py` (prints env
  lines + public key + rotation semantics).
- **Fail-closed**: production boot refused when `AAE_SIGN_ALGO=ed25519` with
  a missing/invalid seed (mirrors the AAE_SECRET guard); minting raises a
  clear error in dev. Key material is read per call, not at import, so tests
  and rotation don't fight module state. HMAC remains the default; retirement
  is an H3 decision per roadmap §4.2.
- New dep `cryptography==49.0.0`; 13 new tests (162 backend total).

## E2E foundation + self-hosted fonts (2026-07-04, e2e-foundation)

Mobile roadmap §7 items 1–2 — the observability foundation and the last
external request.

- **Playwright harness in `frontend/e2e/`** (the scratchpad suites from the
  resonarium session didn't survive /tmp, so rebuilt fresh in-repo): two
  projects — Desktop Chrome + **Pixel 7 emulation** — against the real stack;
  the config's `webServer` boots `run.sh` itself and tears it down with
  `gracefulShutdown: SIGTERM` (run.sh setsids its children, so the default
  SIGKILL orphaned uvicorn/vite and teardown hung on their inherited pipes).
  Suites: app shell (boot → auto-cast → populated wheel; module pills open
  their overlays; forecast panel), glossary (entry-height floor — the 4px
  flex-crush regression — and search narrowing), and the mobile
  `?entitlement=` URL unlock (clear / invalid-token-cleared-by-validation /
  real minted token → supporter chrome). Global setup mints genuine tokens via
  `backend/tools/mint_test_tokens.py`; token tests skip when the venv is
  absent. `npm run e2e`; TESTING.md §3.5. 20 checks, ~21 s, zero AI spend.
- **Fonts self-hosted** (`frontend/public/fonts/`): EB Garamond
  (400–600 + italic 400) and Cormorant Garamond (500–600) vendored as latin +
  latin-ext woff2 — both are variable fonts, so the per-weight files Google
  serves were byte-identical and deduped to 6 files (~370 KB) declared with
  `font-weight` ranges. Google Fonts `<link>`/preconnects removed from
  `index.html`; `woff2` added to the PWA precache glob (14 entries, 870 KiB)
  so the offline shell keeps its typographic voice.
- **`no-external.spec.ts`** locks the property in: app boot makes **zero
  requests off 127.0.0.1/localhost** (fails listing offenders), and
  `document.fonts` proves EB Garamond actually loads from the vendored files.

## Mobile roadmap + URL entitlement unlock (2026-07-03, resonarium-biosentinel-integration / PR #20)

- **`?entitlement=<token>` URL parameter** (`frontend/src/store/useStore.ts`): phone
  browsers (the Termux workflow) have no devtools console for the localStorage
  tier-unlock snippet, so the store now accepts the token on boot — stored
  identically to the console path, param scrubbed from the address bar via
  `history.replaceState`, `?entitlement=clear` returns to free tier. Startup
  validation still clears invalid/expired tokens. Documented in `TESTING.md` §2.
  Verified in headless Chromium.
- **`docs/progress/MOBILE_ROADMAP.md`** — living, owner-reviewed three-horizon
  plan (H1 hardened PWA → H2 Capacitor wrapper → H3 on-device **ASTRA-CORE**),
  building the mobile counterpart on the golden-vector parity methodology proven
  by `resonarium/natal_seed.{py,js}`. Records the architecture decision, rejected
  alternatives, subsystem plans, systemic multi-year risks, phase gates, and
  immediate next actions. Indexed in `docs/README.md`.

## Resonarium × Biosentinel — natal-seeded local instrument (2026-07-02, resonarium-biosentinel-integration)

Standalone, local-only audiovisual instrument in `resonarium/` (not wired into the
FastAPI app or React client). Three commits: shared deterministic natal seed layer
(Python + JS), versioned state schema + headless CLI, and the Sentinel Mode browser
app with a parity + safety test suite.

- **Bit-exact natal seed across Python and JS** (`natal_seed.py` / `natal_seed.js`):
  canonical chart serialization → SHA-256 → 64-bit seed (first 8 bytes big-endian)
  → mulberry32 PRNG, with intention sanitization, safety clamps, and a trace privacy
  guard. Same chart + intention ⇒ identical seed on both sides (vector
  `86813727ef5b4048`).
- **Sentinel Mode overlay** (`resonarium-enhanced.html`) over an immutable natal
  bedrock — ghost oscillators/rings only; turning it off restores the pure natal
  output exactly. All Biosentinel randomness is seeded from the natal seed.
- **Headless controller** (`resonarium_biosentinel_cli.py`) + versioned
  `state_schema.json` (`1.0.0`); CLI ⇄ browser state sync via redacted JSON.
- **Safety / privacy:** visual modulation hard-capped at 2.5 Hz (below the 3–30 Hz
  photosensitive zone), audio clamped 20 Hz–18 kHz; raw chart/intention live in page
  memory only (never localStorage, trace, console, or default export); HTML CSP
  `default-src 'none'; connect-src 'none'`. **Not a medical device.**
- **38-test verification suite** (`resonarium/tests/`, stdlib `unittest`) including
  a `TestBrowserParity` class that runs the JS side via Node (skips if absent);
  scans all shipped files for network tokens.

## Alchemical UI + transit fixes (2026-07-02, main)

- **Alchemical UI layer** — metals seal, correspondence card, sigil marks
  (`frontend/src/lib/alchemy.ts`, `sigil.ts`, `AlchemySigil.tsx`); transmutation
  cast flare, metal-tinted glyphs, alchemy print appendix in the deluxe report.
- **Transit datetime fix** — blanking input, UTC drift, and the dead-end jump on
  transit navigation.

## PDF-2 — Separate purchase rail for the deluxe edition (2026-07-01, reliability-pdf)

Operator decision recorded: **off-chain `personal_report` receipt/token** (over a
per-product `MIN_WEI` tier or a payment-system rebuild) — reuses the repo's
existing payment primitive (HMAC-signed stateless tokens minted off a verified
treasury tx).

- New `POST /api/personal-report/purchase`: oracle tier required (the product only
  exists post-Oracle), rate-limited on the `oracle` bucket **before** any RPC work.
  Verifies the tx via the existing `verify_eth_payment_details` path, then applies
  the fail-closed product policy (`entitlements.report_purchase_allowed`):
  on-chain purchases qualify **only** when `AAE_REPORT_MIN_WEI` is explicitly set
  (>0) and met — unset means purchases are disabled; unverified acceptance can only
  come from dev trust mode, which `assert_safe_boot` makes impossible in production.
- Mints a **report token bound to ONE Oracle session seed** (`mint_report_token`,
  product-tagged, `AAE_REPORT_TOKEN_DAYS` default 30) — a stateless one-shot claim:
  recompiles of the same session stay allowed; any other session needs a new
  purchase. A tier entitlement token can never pass as a claim (no `product`
  field), and a claim can never grant a tier (no `tier` field).
- `/api/personal-report` now enforces the claim: 402 whose detail names
  "purchase" (the frontend branches on it) unless the caller holds the dev/admin
  token. Gate order proven by test: purchase claim ≠ genuine-session proof — a
  claim for a fabricated seed still 409s.
- Frontend: purchase rail in the deluxe block (tx-hash input → `✧ Verify deluxe
  purchase`), claims persisted per-seed in `localStorage["aae.report_tokens"]`
  (the seed is deterministic, so a purchase survives refresh + identical re-runs);
  stale/expired claims are dropped on a purchase-402 so the rail reappears; a
  ghost "already unlocked? compile" path keeps dev-token compiles working.
- Telemetry: `report_purchase` tier-event; `personal_report_purchase` /
  `personal_report_purchase_gated` feature events.
- Tests: +10 in `test_personal_report.py` (144 green) — free-ride 402, foreign-seed
  claim, token-kind confusion both ways, expiry, dev bypass, purchase rail tier
  gate, fail-closed no-RPC/no-trust, missing seed, price threshold matrix, and the
  full trust-mode purchase → seed-bound claim → compile happy path.
- Known limitation (recorded in the AUDIT_REGRESSION mini-audit): claims are
  stateless, so one paid tx can be replayed across different session seeds until a
  receipt ledger lands (R2-adjacent follow-up).

## R1 + PDF-1 — Cost protection & print renderer (2026-07-01, reliability-pdf)

### R1 — Rate limiting on the AI paths
- New `backend/ratelimit.py`: dependency-free in-process **sliding-window** limiter,
  keyed by client IP + entitlement digest (a hot token can't hide behind rotating IPs;
  a shared office IP isn't starved by one token). 429 + `Retry-After`; bounded key map.
- Enablement mirrors the trust-mode philosophy: **ON by default in production, OFF in
  dev/test**, `AAE_RATE_LIMIT_ENABLED=1/0` overrides explicitly. Budgets:
  `AAE_RATE_LIMIT_AI` (default 20/window) for `/api/ai-ask`, `/api/ai-ask-stream`,
  `/api/suggestions`, and `/api/tarot-reading` **only when `include_ai`** (the
  deterministic draw is never throttled — offline-first invariant);
  `AAE_RATE_LIMIT_ORACLE` (default 5/window) for the two paid Fable endpoints,
  checked **before** tier/verification work. `AAE_RATE_LIMIT_WINDOW_S` (default 60).
- Tests: `test_ratelimit.py` (10) — enablement semantics, budget exhaustion +
  Retry-After, sliding window (mocked clock), per-entitlement keying, endpoint 429s,
  deterministic-path immunity, suite-default untouched. Test-authoring lesson: the
  first version of the ai-ask test hit a **real** LLM (local `.env` key) — the AI layer
  is now faked in tests; noted as a suite-wide pattern to enforce.
- Docs: README "Rate limiting (cost protection)" section; `.env.example` block.
- R2 (Redis) remains the horizontal-scale upgrade; call sites won't change.

### PDF-1 — Print renderer for the deluxe edition (client-side)
- New `frontend/src/lib/printReport.ts`: `report_markdown` → styled, paginated print
  document (browser dialog → "Save as PDF"). **Zero dependencies** — print CSS lifted
  from the visual contract (`docs/design/Astro_Arcana_Report_Design_Mock.html`): Georgia
  serif, cream/ink/amethyst/gold palette, Cinzel-style part headers, dark-gradient
  cover page, gold pull-quotes, disclaimer styling, `@page` 8.5×11.
- **Privacy invariant completed:** `{{BIRTH_INFO}}` is filled **in the browser** from
  local store state (formatted birth line) — birth details never reached the server or
  the AI, and now render only at print time. `{{SIGIL}}` slots are filled with a real,
  deterministic **chaos-sigil SVG** (`lib/sigil.ts` construction, seeded by the Oracle
  question) inside the mock's gold ring styling.
- **Injection-safe:** every text fragment is HTML-escaped before styling tags are
  applied (the markdown embeds model output + user questions). Verified by compiled
  ground-truth assertions: 11/11 (cover/page split, placeholder fill, sigil embed +
  determinism, list/bold/italic/blockquote, `<script>` escaped, disclaimer classed).
- UI: "⎙ print / save as PDF" button in the deluxe block (popup-blocked hint;
  `personal_report_print` telemetry).

## PR-2 — Deluxe-edition frontend + branch close (2026-07-01, fable5-oracle-report)

- **"✦ Compile Personal Report"** affordance beneath a successful Oracle Report
  (Draw tab): `loadPersonalReport()` echoes the **exact session context** — the
  Oracle call now passes its local date explicitly and stores `{date, generatedAt}`
  (`oracleCtx`) so the server's seed re-derivation verifies; regenerating the Oracle
  clears any stale deluxe edition; chart change clears both.
- Client: `fetchPersonalReport` (builds the `OracleSessionRef` wire shape),
  `PersonalReportResponse` type, `localToday` exported.
- Render: provenance badges (actual serving model / "Deterministic offline edition"),
  "Compiled from your Oracle session of [date] · seed […]" line, collapsible preview
  of the 11 top-level parts, **↓ download .md** (PDF-ready markdown), copy, recompile,
  disclaimer. 402 → support flow; **409 → "generate a fresh Oracle Report first"**
  (session/chart mismatch). Telemetry: `personal_report`, `personal_report_gated`.
- F5-5: secret-rotation note in `.env.example` (`AAE_SECRET`/`AAE_DEV_TOKEN`; rotation
  invalidates issued entitlement tokens). F5-4/F5-6: single-commit strategy recorded;
  git-history PII residual stays Option A (leave + audit note) pending explicit go/no-go.
- Verified: full backend suite + frontend build green; branch closed as **one commit**.

## PR-1 — Personal Report: deluxe compiled edition (2026-07-01, fable5-oracle-report)

- **New optional post-Oracle product** — `backend/personal_report.py` +
  `POST /api/personal-report` → PDF-ready markdown deluxe edition (11 parts: cover,
  sigil & invocation, natal foundation, psychological/evolutionary deep-dive, the
  Oracle I–V core, chart-referenced tarot layout, Career Constellation, Relationship
  Mirror, sigil codex, practices, appendix). API-tuned system prompt derived from
  `docs/prompts/FABLE5_PERSONAL_REPORT_PROMPT.md`; renders against
  `docs/design/ASTRO_ARCANA_PERSONAL_REPORT_DESIGN.md`.
- **Gated twice, fail closed:** oracle tier (402 for free *and* supporter), plus a
  stateless **post-Oracle gate** — the server re-derives the Oracle session's
  deterministic seed from (chart, spread, question, date, source) and 409s any
  fabricated/foreign/empty session reference. The seed is the proof of purchase-path.
- **Privacy invariant extended:** the Fable prompt carries symbolic data only
  (sign/degree/house citations, cards, weights); user birth details never enter the
  prompt — the cover uses `{{BIRTH_INFO}}`/`{{SIGIL}}` placeholders the renderer fills.
  Proven by test (`birth_summary` supplied, asserted absent from prompt).
- **Honest fallback:** without the AI layer, `_offline_compiled` assembles the same
  11-part structure deterministically (`ai_source: "offline"`, `model: null`), cover
  framing included ("Compiled from your Oracle Report session of [date] • Seed: […]",
  "Deluxe Compiled Edition — Optional Post-Oracle Product").
- `oracle_report._call_fable` generalized with per-call `model`/`max_tokens`/`effort`
  overrides (oracle path behavior unchanged); Personal Report uses
  `AAE_PERSONAL_REPORT_*` env knobs (default 32K tokens for the 24–36-page target).
- Telemetry: `lens="personal_report"`. Docs: README (API row + product section),
  `.env.example`.
- Tests: `test_personal_report.py` (8) — tier gates, seed-mismatch/foreign-params/empty
  -report rejection, offline structure (cover lines + 11 parts in order + embedded
  Oracle text + disclaimer), substrate determinism, prompt privacy.
- **Not yet built (flagged follow-ups):** PDF renderer (design + mock exist under
  `docs/`), separate-purchase payment rail (today's gate = oracle tier + verified
  session; entitlements are tier-based), frontend surface for the deluxe edition.

## F5-2 — Docs sync: Oracle Report / Fable 5 (2026-07-01, fable5-oracle-report)

- README: `/api/oracle-report` + `/api/personal-report` rows in the API table; tier
  routing table now documents oracle-tier minting (`AAE_ORACLE_MIN_WEI`, on-chain
  verified only — trust mode never mints oracle); new "Oracle Report — Claude Fable 5"
  configuration section (env vars, honest-provenance contract, server-side fallback)
  with a **cost & requirements** note (~$10/$50 per MTok, 30-day retention, minutes-long
  calls, rate-limiting advice); Arcana features section gained the Oracle Report bullet
  (Draw-tab trigger, badges, seed, 402 → support flow).
- CHANGELOG: backend Oracle Report entry added below (the feature predates this sync).

## Oracle Report backend — Claude Fable 5 (2026-07-01, fable5-oracle-report)

_Recorded retroactively for completeness (built earlier on this branch)._
- `backend/oracle_report.py` + `POST /api/oracle-report` (oracle tier, 402 fail-closed
  before any work): deterministic substrate first (signature + chart-weighted spread +
  learning path, zero AI), then a streamed Claude Fable 5 synthesis via the official
  Anthropic SDK — no `thinking` param, no sampling params, `output_config.effort`,
  server-side fallback to Opus 4.8 (`server-side-fallback-2026-06-01`), refusal
  handling, honest `ai_source`/`model`, disclosed reproducible `seed`.
- Oracle-tier minting: `AAE_ORACLE_MIN_WEI` (on-chain-verified value only).
- Tests: `test_oracle_report.py`; env docs in `.env.example`.

## F5-1 — Oracle Report frontend integration (2026-07-01, fable5-oracle-report)

- **Wired the Oracle Report into the UI** (the last gap on this branch — the build
  was failing on the unused scaffolding until now). New `loadOracleReport()` in
  `ArcanaModal.tsx` (modeled on `loadDeckArt`), using the pre-declared
  `oracleLoading` so the Draw button stays usable during a long Fable 5 call.
- **Placement:** a dedicated "✧ Generate Oracle Report" block at the foot of the
  **Draw** tab — reuses the tab's spread/lineage/question controls; works pre- or
  post-draw (the backend rebuilds its own deterministic substrate). Framed as the
  observatory's deepest offering, labeled **Oracle tier only**.
- **Rendering:** reuses `DetailPanel`'s `Interpretation` accordion (now exported) —
  the `## I..V` sections render as collapsible cards with per-section 🔊 Speak
  (via `useSpeech` + `speakableText`) and ↓ Copy. New `renderBody` upgrade renders
  `### ` per-card subsections as styled subheadings instead of literal text
  (benefits the deep AI report too).
- **Provenance honesty:** badge shows the *actual serving model*
  (`ORACLE_MODEL_LABELS`: Claude Fable 5 / Claude Opus 4.8 — fallback-served
  reports are labeled as Opus, never claimed as Fable) or a clearly-titled
  "Deterministic offline report" badge when `ai_source === "offline"`.
- **Reproducibility:** the deterministic `seed` is displayed (select-all `<code>`)
  with a copy button; `lineage` shown in the header; full `disclaimer` rendered.
- **Tier gate UX:** new typed `ApiError` (carries HTTP status; message format
  unchanged so existing `String(e)` callers unaffected) — on **402** the modal
  shows "Oracle tier required…" and opens the Support flow (`openSupport(true)`),
  tracked as `oracle_report_gated`. Success tracked as `oracle_report`
  {spread, source, ai, model}.
- Oracle state resets on chart change (a report never displays against another
  chart). Whole-report copy + speak/stop + regenerate controls.
- **Verified:** frontend build green (was red); backend 116 passed; end-to-end
  TestClient smoke with the exact frontend body shape — free **402**, supporter
  **402** (no leak), oracle **200** with all rendered fields, exactly the five
  `## I..V` sections + `###` subsections, honest offline provenance.

## Tracking Infrastructure (2026-07-01, fable5-oracle-report)

- Created `docs/progress/PROJECT_WORK_HISTORY_MAP.md`: comprehensive, updateable timeline of waves, branches, phases (0–6), feature status, audit brackets, and maintenance commands so progress can always be tracked from git + docs.
- Created `docs/progress/COMPREHENSIVE_TASK_SCHEDULE.md`: living prioritized schedule merging prior plans (`docs/archive/IMPLEMENTATION_SCHEDULE.md`, `docs/archive/ASTRA_ARCANA_PLAN.md`, `docs/archive/FABLE5_HANDOFF.md`), review recommendations, Fable 5 completion tasks (F5-1..F5-6), reliability (R*), foundations, and strategic backlog with explicit ACs and verification commands.
- These two files + `CHANGELOG.md` + `AUDIT_*` + git now form the canonical progress record. Update them on every phase or branch close.

---


## Phase 1 — Critical security & correctness (the hard gate)

### 1.1 — Closed the donation trust-mode bypass (Critical)
- Trust mode (accepting an unverified tx hash without an on-chain check) is now
  gated behind **explicit enablement** (`AAE_TRUST_MODE`) **and** a recognized
  **non-production** environment (`AAE_ENV`). Fails closed: unset/malformed flags
  deny the entitlement.
- `entitlements.verify_eth_payment` no longer grants on any non-empty hash when
  `AAE_ETH_RPC` is unset; new `accept_offchain_payment` gates the non-EVM path.
- `entitlements.assert_safe_boot()` refuses to boot in production with trust mode
  enabled, or with an unset/blank/default `AAE_SECRET` (forgeable tokens). Called
  at `main.py` import.
- `run.sh` declares `AAE_ENV=development` for the local path; `.env.example`
  documents `AAE_ENV` / `AAE_TRUST_MODE`.
- Tests: `backend/tests/test_entitlements.py` (10 cases) + `conftest.py` pinning
  the suite to a non-prod env. Fail-before/pass-after.

### 1.2 — Purged real personal birth data
- Real coords/time (`34.935,-117.199` · 1987-11-11, labeled "the user's chart")
  replaced with public **Einstein** data across `test_tarot.py`, `test_advanced.py`,
  `test_predictive.py`, `test_synastry.py`.
- Frontend `DEFAULT_BIRTH` (`useStore.ts`) — was the same real location — replaced
  with an obviously-synthetic sample (Y2K noon, Greenwich), kept distinct from
  `PLACEHOLDER_BIRTH` so `ForecastPanel`'s "no personal chart" detection still works.
- Two predictive tests were re-grounded off the removed data: the progressed-Sun
  test now asserts the ~1°/yr invariant against the fixture's *actual* age (not a
  hardcoded 38-yr range); the solar-return month is Einstein's (March), not the
  real Nov birthday.
- ⚠️ **Residual:** the real data remains in **git history** (commits `b1bdd5f`→).
  A full purge needs a history rewrite (`git filter-repo`/BFG) + force-push —
  destructive, deferred to an explicit operator decision. Tracked in
  `docs/audits/AUDIT_REGRESSION.md`.

### 1.3 — Resolved the arcana-lens type contract
- Decision: **Arcana is a separate endpoint** (`/api/tarot-reading` via
  `interpret_arcana`), not a selectable `/api/ai-ask` lens. README already leaned
  this way; the codebase now tells one story.
- Removed the phantom `_LENS_GUIDANCE["arcana"]` entry (dead — `interpret_arcana`
  builds its own prompt from `tarot_prompts.ARCANA_SYSTEM` and never read it). Added
  a guard comment so it isn't re-added. `main.py`'s `lens="arcana"` telemetry label
  is descriptive metadata and kept.
- README wording tightened: the 6 lenses are the only `/api/ai-ask` values.
- Test `test_lens_contract.py` locks `_LENS_GUIDANCE` keys == `AIRequest.lens`
  union (fails if they drift or a phantom lens returns).

### 1.4 — Timezone & start-date control (determinism = local day)
- `TarotReadingRequest.date` (ISO local date) for daily draws; `ArcanaForecastRequest.start_date`
  + `timezone` (IANA) for forecasts. All optional; defaults reproduce prior behavior.
- New `tarot.resolve_local_date(start_date, timezone)` — explicit date wins, else
  "today" in the querent's zone, else server today. Bad date/tz → 400.
- `_default_seed` is now a pure function of (signature, resolved local date, spread,
  question, **source system**). The daily branch folds in the local date so a draw is
  reproducible for a given local date regardless of the server clock. `_DEFAULT_SOURCE`
  contributes nothing to the seed, so existing seeds stay reproducible (Phase 2.2-ready).
- `main.arcana_forecast` resolves the start via `resolve_local_date`, not `date.today()`.
- Added `tzdata==2026.2` (verified on PyPI) for minimal-container tz safety.
- Tests: `test_timezone_seed.py` (7) — seed purity, legacy reproduction, source-wiring,
  endpoint-level daily reproducibility.

### 1.5 — Daily cards are actually daily
- `daily_arcana_from_events` now takes the natal `signature` and fills gap days:
  a date with no transit event gets a deterministic, natal-weighted trump labelled
  "Quiet sky — an integration day." An N-day request returns **exactly N** cards.
- Refactored the per-day dict build into `_arcana_day_dict`; added `_quiet_day_card`
  (natal-weighted single-trump draw, stable per seed+date+signature).
- `main.arcana_forecast` builds and threads the signature.
- Tests: `test_daily_forecast.py` (3) — exact-N with gaps, all-quiet, determinism.

### 1.6 — Security sweep of touched files (and neighbors)
- **Response security headers** (new middleware): `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`,
  `Referrer-Policy: no-referrer`, `Strict-Transport-Security`.
- **Async errors:** background telemetry no longer swallows exceptions — new `_spawn`
  wrapper logs any unretrieved task exception (all 6 `create_task(TEL.*)` sites migrated).
- **Constant-time auth:** dev/admin token compared via `ENT.check_dev_token`
  (`hmac.compare_digest`) in both `entitlement_status` and `/api/admin/stats`; removed
  the now-dead `main._DEV_TOKEN`.
- **Verified clean:** no shell/eval/path-traversal on user input; `telemetry.py` SQL is
  parameterized (the internal `ts>{threshold}` interpolations are server-computed ints,
  not user input — noted informational); frontend `Math.random`/`Date.now` are decorative
  or local IDs, not security tokens; SHA-256 is seed-only; all deps real/known (automated
  CVE scan wired in Phase 5.3).
- Tests: `test_security.py` (3) — headers present, admin auth, token semantics.

## Phase 2 — Explainability & sourcing

### 2.1 — Arcana explainability panel
- New `WeightSource` model; `NatalArcanaSignature.weight_sources` (per major card) and
  `DrawnCard.weight_sources` (per drawn card). Each explains *why* a card was likely
  ("The Sun emphasised by natal Sun in Pisces", "Cups weighted by Water balance (34%)").
- Built in lockstep with `major_weights` from the SAME accumulation that feeds the draw —
  a major card's sources **sum to its draw weight**, so the panel and the seed can never
  disagree (asserted by test). Minors are explained by suit bias.
- Frontend: a "why this card" list renders beside every drawn card in `ArcanaModal`.

### 2.2 — Source-system selector
- `SourceSystem` = Golden Dawn / Rider-Waite-Smith / Thoth / psychological-Jungian.
  `source` on `TarotReadingRequest` + `ArcanaForecastRequest`, echoed on the response.
- Threaded into (a) the determinism **seed** — a different lineage yields a different
  draw; the default (`golden_dawn`) contributes nothing, so existing seeds reproduce —
  and (b) **interpretation**: offline prose names the lineage; the AI prompt carries the
  lineage lens (`SOURCE_SYSTEMS[...]['lens']`).
- Frontend: a "Lineage" selector in the draw controls; the reading header names the
  lineage. Client also now sends the browser timezone / local date (completes the
  Phase 1.4 hookup so daily draws & forecasts use the querent's local day).
- Tests: `test_explainability.py` (5) — panel-sums-to-weights, per-card derivation,
  minor suit-bias, source-in-seed (default reproduces / others differ), lineage in prose.

## Phase 6 — Regression audit & consolidated docs (closing gate)

- **`docs/audits/AUDIT_REGRESSION.md`** closes the audit bracket opened by `docs/audits/AUDIT_BASELINE.md`:
  control-by-control verdicts on every security-sensitive diff since `d9afc4b`
  (no control weakened; trust gate, boot guard, token verification, dev token,
  headers, `_spawn`, input validation, seeding all strengthened or intact);
  token validation confirmed complete (signature + expiry, constant-time, no
  alg-confusion surface); the W3 synastry seam re-inspected against the changed
  types (byte-identical, backward-compatible boundary); IDOR re-confirmed N/A
  (no per-user owned resources added); the **deferred git-history purge** logged
  with its procedure and interim mitigation.
- **README consolidated pass:** CI badge; `AAE_ENV`/`AAE_TRUST_MODE` documented
  and the **stale pre-fix trust-mode description corrected** (`AAE_ETH_RPC` row
  claimed any non-empty hash mints a token — no longer true); arcana feature
  section rewritten for source systems, explainability, local-date determinism,
  exactly-N forecasts, learning paths, `.ics` export, and the deck-art studio;
  API table completed (arcana + synastry + predictive + advanced routes); tests
  section reflects the 105-test suite and the CI gate; roadmap brought current.

## Phase 5 — Test & CI hardening

### 5.1/5.2 — Endpoint behavioral coverage
- New `test_api_endpoints.py` (15) — TestClient contracts, extending (not
  duplicating) `test_entitlements` / `test_security` / `test_arcana_calendar`:
  natal-arcana determinism; tarot-reading offline contract + endpoint-level
  determinism + input validation; **tier gate fails closed** (free tier never
  even *attempts* the AI call — asserted with a recording fake), supporter and
  oracle unlock, tampered token → free, AI failure → honest `offline` flag with
  deterministic prose retained; `/api/entitlement` valid/tampered/expired token
  lifecycle; forecast exactly-N with the no-event fallback (deterministic),
  days clamp, bad timezone/date → 400; learning-path contract.
- **Fix found by the new coverage:** `/api/tarot-reading` accepted an
  unparseable `date` (e.g. `"not-a-date"`) and silently folded it into the
  determinism seed, returning 200. `build_reading_core` now validates the ISO
  date, so the endpoint returns 400 — consistent with the forecast path.
  Fail-before/pass-after. Valid dates are passed through unchanged (seed
  strings for all previously-valid inputs are untouched).

### 5.3 — CI
- `.github/workflows/ci.yml`: backend (pip install, `pytest -q`, an app-boot
  smoke check asserting the route table, **and a prod-boot-guard check** that
  re-proves `assert_safe_boot` refuses an insecure production config on every
  run), frontend (`npm ci`, `tsc -b && vite build`), and a full-history
  Gitleaks secret scan. `AAE_ENV=test` is set at the job level so boot steps
  never depend on pytest's conftest. (`backend/.env` is gitignored/untracked,
  so CI genuinely runs the fail-closed path; swisseph falls back to its
  built-in ephemeris without `SE_EPHE_PATH`.)
- `.github/dependabot.yml`: weekly pip / npm / github-actions update + CVE sweep.

## Phase 4 — Deck-Art Prompt Studio

- New `deck_art.py` + `POST /api/deck-art` → `DeckArtResponse`. **Image PROMPTS
  only — no image generation in-engine.** Each prompt is an art-direction brief
  composed from the engine's own substrate: the card's keywords/astrology/element
  and Golden Dawn title (`tarot_data`), the querent's natal signature (natal
  context names the body, sign, and `HOUSE_THEMES` house theme when a trump lives
  in the chart), and an element-derived palette accented by the dominant element.
- **Deterministic:** a prompt is a pure function of (natal signature, card,
  source system). Composition/atmosphere "character" comes from `tarot._seed_rng`
  (the one sha256 seeding implementation — reused, not duplicated) so identical
  inputs yield the identical prompt, offline, zero LLM tokens.
- **Lineage shapes the imagery:** per-source style lenses (Golden Dawn ceremonial
  plate / Waite-Smith pictorial scene / Thoth energetic abstraction / Jungian
  depth-psychological dreamscape) — asserted distinct by test.
- `card_id` set → one prompt (major or minor); omitted → the "soul deck" (every
  natal-signature trump, canonical Sun-first order, deduped). Unknown card → 400;
  unknown source → 422 (closed Literal). `DISCLAIMER` on the response.
- Frontend: Studio tab gains a "Deck-art prompts" section (card selector incl.
  whole soul deck, lineage selector, per-prompt copy + negative-prompt line).
- Tests: `test_deck_art.py` (12) — determinism (unit + endpoint), four-lineage
  distinctness, substrate-derived motifs/palette, natal-context presence/absence,
  soul-deck exactness, minor-card support, 400/422 rejection, disclaimer.

## Phase 3 — Learning paths & temporal systems

### 3.1 — Classroom as a generated learning path
- New `POST /api/learning-path` → `LearningPathResponse`. A deterministic archetypal
  sequence anchored to the querent's strongest archetype (**anchor**) ascending through
  emphasis-weighted intermediate trumps toward an underdeveloped shadow (**growth edge**),
  e.g. High Priestess → Justice → Death → Temperance.
- `tarot.build_learning_path` — reproducible from (natal signature, source system);
  stages labelled Anchor / Bridge / Growth edge; each step carries focus + practice + journal.
- Frontend: the Classroom tab now leads with the generated path (auto-loaded), above the
  static archetype reference.
- Tests: `test_learning_path.py` (6) — determinism, ascending trump order, stages,
  major-only content, source influence, step-count clamping.

### 3.2 — Arcana calendar (.ics export)
- New `arcana_calendar.py` — a dependency-free, **RFC 5545-correct** iCalendar writer:
  line folding (≤75 octets, UTF-8 boundary-safe), TEXT escaping, all-day VEVENTs
  (`DTSTART;VALUE=DATE` + exclusive `DTEND`), CRLF endings, **stable SHA-256 UIDs** so
  re-imports update rather than duplicate.
- New `POST /api/arcana-calendar` → `text/calendar` attachment. One ritual (or journal)
  per day over the forecast window; event dates are the querent's **local** dates
  (`start_date`/`timezone`, Phase 1.4). Exactly-N events (Phase 1.5 guarantee).
- Frontend: "Export to calendar (.ics)" — Rituals / Journal buttons in the Transit tab;
  client sends the browser timezone and triggers a file download.
- Tests: `test_arcana_calendar.py` (7) — well-formed structure, all-day dates, stable
  UIDs, escaping+folding invariant, kind selection, endpoint returns N events. ICS also
  hand-traced (unfolded → every VEVENT carries UID/DTSTAMP/DTSTART/DTEND/SUMMARY).
