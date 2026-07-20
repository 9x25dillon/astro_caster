# Astra — Working Report & Repository Guide

_Generated 2026-07-19 from main @ `8a3fb3f` (working tree clean, 0 open PRs, CI green)._

This document is two things in one: a **working report** (what state the project
is in, what's done, what's pending) and an **instructive guide** (what every
file and directory is for, and how to work in the repo). It complements —
does not replace — the living record in `Hand_off.md` and `WORK_JOURNAL.md`.

---

## 1. What this project is

**Astra** ("the Celestial Observatory") is a privacy-first astrology + tarot
divination app: natal charts, chart-weighted tarot, transit forecasts,
relationship charts, predictive timing, and an optional AI Oracle — all
computed from real Swiss-Ephemeris math, running **entirely on-device** as an
installable PWA, with the backend needed only for AI readings.

The load-bearing engineering idea is **parity as a product**: the Python
backend is the reference implementation, the TypeScript `@astra/core` package
reproduces it in the browser, and golden vectors in `parity/*.json` lock the
two together in CI. Divergence is a red build.

Current direction (operator-ratified): **personal instrument** — build what
the owner wants, no store/ship pressure. Store distribution (Capacitor, H2)
is parked with explicit wake conditions.

---

## 2. Repository structure — the instructive map

```
astro-aae/
├── backend/            FastAPI reference engine (Python 3.12)   ~12.8K lines
├── frontend/           React 19 + Vite PWA                      ~15.0K lines src, ~1.2K e2e
├── packages/astra-core/  On-device TS engine, parity-locked      ~3.6K lines (+ WASM vendor)
├── parity/             Golden vectors — the drift lock (8 JSON vectors)
├── resonarium/         Resonarium × Biosentinel instrument (self-documenting)
├── docs/               All non-code docs, organized by lifecycle
├── .github/            CI: backend tests, parity check, e2e, Gitleaks
├── run.sh              One-command dev launch (backend :8787 + frontend :5173)
├── docker-compose.yml / .dev.yml + DEPLOY.md   Container stacks
├── README.md · CHANGELOG.md · TESTING.md · LICENSE (AGPL-3.0)
└── (gitignored at root: astra-vault-phase0.json, *.pdf, oracle_report_*.txt —
     personal-data artifacts, never commit)
```

### 2.1 `backend/` — the reference engine

FastAPI app; every deterministic technique lives in its own module. Entry
point is `main.py` (routes), with:

| Area | Files |
|---|---|
| Ephemeris & charts | `ephemeris.py` (pyswisseph wrapper — Julian Day, zodiacs, houses, angles, Nodes/Chiron/Lilith), `astrology.py`, `patterns.py`, `models.py` |
| Tarot | `tarot.py`, `tarot_data.py`, `tarot_models.py`, `tarot_prompts.py` (chart-weighted, seed-reproducible; RNG is CPython's Mersenne Twister) |
| Forecast & timing | `forecast.py`, `predictive.py` (progressions, returns, eclipses), `advanced.py` (harmonics, midpoints, fixed stars), `synastry.py`, `arcana_calendar.py` |
| AI layer | `ai.py` (multi-provider router: kgirl → ollama → cloud → offline), `oracle_report.py`, `personal_report.py` (long-form Fable 5 reports), `course.py` (personal curriculum), `verify_ai.py` |
| Art & voice | `deck_art.py`, `plate_art.py` (image plates, needs `AAE_OPENAI_API_KEY`), `tts.py` (ElevenLabs / browser fallback) |
| Commerce & ops | `entitlements.py` (signed tokens, tiers), `treasury.py`, `receipts.py`, `ratelimit.py`, `telemetry.py` |
| Data | `ephe/*.se1` (Swiss ephemeris files), `data/receipts.db`, `data/telemetry.db` |
| Tests | `tests/` — 25 test files (~173 tests): astronomy asserted against independently-known values, security fail-closed posture, parity vectors, per-feature suites |
| Tools | `tools/dev.py` — the unified CLI (`unlock` · `token` · `smoke` · `parity` · `test` · `ai set/check/status`); plus `gen_parity_vectors.py`, `mint_test_tokens.py`, `unlock.py`, `smoke_tiers.py`, `make_shelf_vault.py`, `gen_ed25519_key.py` |

Secrets live in `backend/.env` (gitignored): dev token, `AAE_SECRET`, the
Anthropic key. **Back up `.env` + `data/*.db` together.**

### 2.2 `packages/astra-core/` — the on-device engine

Dependency-light TypeScript mirror of the backend's deterministic core:
`ephemeris.ts`, `houses.ts`, `astrology.ts`, `patterns.ts`, `tarot.ts` +
`mt19937.ts` (bit-exact CPython RNG), `forecast.ts`, `synastry.ts`,
`predictive.ts`, `advanced.ts`, `sha256.ts`. `src/vendor/swisseph/` is a
**vendored WASM Swiss Ephemeris** (~700KB) that closed the last body-set gap —
Nodes, Chiron, Lilith now compute in the browser; the drift lock spans **all
17 bodies**. `test/` (10 files, ~30 tests) replays the golden vectors.

### 2.3 `frontend/` — the observatory

React 19 + TypeScript + Vite PWA, Zustand store (`src/store/useStore.ts`),
one API client (`src/api/client.ts`), every backend call degrading to
`@astra/core` with a "☾ computed on your device" badge.

Post-Track-R architecture (the current UI): **eight chapters orbiting a
dial**, not modals.

- **Shell & navigation:** `ChapterDial.tsx` (the orrery-shell navigation —
  nodes at fixed compass positions, drift is decorative only),
  `DetailPanel.tsx` (the **margin glass**: one three-zone margin serving
  every chapter — selection note, `JournalPad.tsx`, Ask pinned at the foot),
  `Starfield.tsx`, `App.tsx`.
- **Chapter surfaces:** `ChartWheel.tsx` (layered D3 SVG wheel),
  `ArcanaModal.tsx`, `ForecastPanel.tsx`, `RelationshipModal.tsx`,
  `PredictiveModal.tsx`, `AdvancedModal.tsx`, `ConstellationPath.tsx`
  (learning path as stars, lit by kept reflections), `MorningPanel.tsx`,
  `LibraryVault.tsx` + `TomeMeter.tsx` (chapter VIII: shelf, journal, vault,
  support, ✦ Generate My Tome with the gilt spine meter).
- **True overlays (only four remain):** Support, Ceremony, Admin, Glossary.
- **`src/lib/`:** `tomeCompile.ts` (corpus → eight-chapter tome; seed of the
  future PB1 book compiler), `tomePrint.ts` + `printReport.ts` (print-CSS
  path; tokens lifted from the design mock), `bookshelf.ts` (IndexedDB
  `astra-bookshelf` v2: sessions by seed + journal), `vault.ts`
  (`astra-vault@3` export/restore, accepts @1–@3), plus astro/tarot copy,
  sigils, numerology, share, speech, error telemetry.
- **`theme.css`:** the material system lives as a deliberate late-override
  block at the END — void glass, phosphor-gold rules, amethyst fields, and
  the **ion trace** (`--ion #7fe7dc`) rationed by law to live computation only.
- **`e2e/`:** 20 Playwright specs × 2 projects (desktop + Pixel-7) = 80
  green, driving real flows including every offline fallback with the API
  severed. New specs must import `test`/`expect` from `./helpers` (skips the
  first-run ceremony overlay) and run from `frontend/`.

### 2.4 `parity/` — the drift lock

8 golden-vector JSON files (natal chart, forecast, tarot draw/reading,
synastry, predictive, advanced, mt19937, arcana-forecast). Generated by
`backend/tools/gen_parity_vectors.py` against the *vendored seas-only*
ephemeris (so CI reproduces byte-identically); `@astra/core` must reproduce
them within a versioned tolerance contract on every commit.
`gen_parity_vectors.py --check` is the tripwire.

### 2.5 `docs/` — lifecycle-organized documentation

- `progress/` — **living**: `Hand_off.md` (session handoff — read this
  first), `WORK_JOURNAL.md` (narrative log, newest first), `NEXT_ARC.md`
  (ratified roadmap), `MOBILE_ROADMAP.md`, `PROJECT_WORK_HISTORY_MAP.md`,
  `COMPREHENSIVE_TASK_SCHEDULE.md`.
- `design/` — visual contracts: personal-report design + printable mock
  (ground truth for `printReport.ts`), `PHYSICAL_TOME_PRODUCT.md` (phased
  tome product), `TOME_PHASE0.md` (**the current runbook**).
- `audits/` — frozen point-in-time: baseline audit, regression audit,
  codebase review.
- `prompts/` — canonical Fable 5 prompt specs for the reports/workflow.
- `archive/` — superseded plans, each bannered with its successor.

### 2.6 `resonarium/`

Self-contained Resonarium × Biosentinel instrument (holographic/cymatic HTML
visualizers, natal-seed parity between JS and Python, a CLI, its own tests
and README). Parallel art-instrument track; not on the app's critical path.

---

## 3. Completion progress

### 3.1 Shipped (all merged, all green)

| Milestone | Status |
|---|---|
| Swiss-Ephemeris core — tropical + sidereal, houses, patterns | ✅ |
| D3 wheel, transit bi-wheel, forecast engine (.ics export) | ✅ |
| Reflective AI (6 lenses, SSE, offline fallback), Oracle Report (Fable 5), TTS | ✅ |
| Astra Arcana — natal tarot, weighted spreads, explainable draws, learning paths, deck-art studio | ✅ |
| Synastry / composite / Davison · progressions · returns · eclipses · harmonics · midpoints · fixed stars | ✅ |
| Entitlements (signed tokens, crypto-verified) · admin telemetry | ✅ |
| **ASTRA-CORE** on-device engine, parity-locked, **all 17 bodies** (WASM Swiss, PR #43) | ✅ |
| Offline-first PWA — every technique degrades on-device; installable; queued asks | ✅ |
| Track 2 (own your data): B1 vault export/import, B2 Bookshelf, B3 backup note | ✅ 2026-07-08 |
| Track 3: P1 Journal, P2 Morning panel | ✅ (#57, #63) |
| The Course — Fable-designed personal curriculum, oracle tier | ✅ (#64) |
| Plate-art plumbing (`/api/deck-art-image`, Studio render) | ✅ (#66, awaiting key) |
| **Track R — full UI reorganization** R-1 dial → R-2 margin glass → R-3 Library/Tome → R-4 material pass | ✅ **COMPLETE** (#67–#70) |
| **Tome Phase 0 press pipeline** — 6×9+bleed interior, full-bleed cover, vault rescue of the July-8 Fable sessions | ✅ (#71) |

Test health at last close: **173 backend pytest · 30 astra-core parity/unit ·
80 e2e (40×2 projects) · parity tripwire green · full-history Gitleaks.**

### 3.2 In flight — the baton is in the operator's hand

**Tome Phase 0 physical order** (runbook `docs/design/TOME_PHASE0.md`).
Everything software-side is done; `astra-vault-phase0.json` sits generated at
repo root. Remaining steps are manual: restore the vault in the Library →
cast the owner's chart → `⎙ press interior (6×9)` + `◈ cover file`
(Save-as-PDF, custom 6.25×9.25in, no margins, background graphics ON) →
order **one** Lulu 6×9 US Trade hardcover. Exit criteria: the two in-hand
verdicts (dark-cover print quality; gift-worthy at $150?). Feedback lands in
`PHYSICAL_TOME_PRODUCT.md`.

### 3.3 Next candidates (no committed order)

- **PB1 book compiler** — corpus → press-ready trim; `tomeCompile.ts` is the
  seed; evaluate **Typst** if the printed object wants running page numbers
  (Chromium print can't do them).
- **P3 plate-art live-verify** — blocked on the operator adding
  `AAE_OPENAI_API_KEY` to `backend/.env`.
- **Live Fable runs** — blocked until **2026-08-01** (Anthropic usage cap
  exhausted; Fable calls return 400; offline compilers serve honestly
  meanwhile).
- **Tome Phase 1** (~5 gift copies) — only after the Phase-0 object passes
  in hand.
- ☐ **Airplane-mode phone test** — last H1 checkbox, owner-only manual.

### 3.4 Parked (with wake conditions)

H2 Capacitor/store distribution (wakes for other people's phones); hardening
backlog — Prometheus, prompt-injection hardening, API versioning, structured
logging, caching (wakes for public deploy). Before any public deploy: set
`AAE_ETH_RPC` / min-wei vars and revisit the git-history birth-data decision
(`AUDIT_REGRESSION.md` §5.1, operator chose LEAVE).

---

## 4. How to work in this repo

### Run & test

```bash
./run.sh                                          # backend :8787 + frontend :5173
backend/.venv/bin/python backend/tools/dev.py     # unified CLI (unlock|token|smoke|parity|test|ai)
cd backend && .venv/bin/pytest -q                 # backend suite
cd packages/astra-core && npm test                # parity vs golden vectors
cd frontend && npm run build && npx playwright test   # tsc + build + e2e (MUST run from frontend/)
cd backend && .venv/bin/python tools/gen_parity_vectors.py --check   # drift tripwire
```

Dev servers are currently **down** (shut at session-15 close) — `./run.sh`
to relight.

### Core invariants — never break

1. **Deterministic AI-free core** — every reading reproducible from a seed.
2. **The disclaimer/refrain travels on every response** (voice canon:
   *"nothing Astra produces is a life sentence — it is a life poem"*).
3. **Fail-closed security** — production refuses to boot on default secrets
   or trust mode.
4. **Parity vectors stay green** — both directions of the drift lock.

### Gotchas that have actually bitten

- `AAE_AI_BASE_URL` must **not** include `/v1` (code appends it).
- Oracle token budget < 2500 truncates readings mid-sentence.
- After dependabot merges: `npm ci` **before** trusting local tsc/build.
- e2e IndexedDB readers open **versionless**; writers pin the schema version.
- Playwright runs from `frontend/` only; specs import from `./helpers`.
- Shell is **fish** — use `bash -c '…'` for loops/conditionals.
- Entitlement tokens copied from wrapped terminal lines break silently.
- `*.pdf`, `oracle_report_*.txt`, `astra-vault-phase0.json` carry personal
  data — gitignored, never commit.
- The operator's browser holds a **minted** oracle token, not the dev token —
  fine everywhere except the deluxe-purchase exemption (`unlock.py` prints
  the rescue link).

### Working style (operator's contract)

Acceptance criteria stated up front; bugs as minimal reproductions; PRs
opened but **merges are the operator's**; sessions close with a `Hand_off.md`
update + narrative `WORK_JOURNAL.md` entry on main, servers down.
