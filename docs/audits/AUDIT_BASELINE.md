# AUDIT_BASELINE.md — Astra Arcana

_Phase 0 reconnaissance. Produced before any feature or fix code. Read-only pass._
_Baseline commit: `d9afc4b` (main, clean tree). Backend: 36 tests passing. Frontend: builds clean._

> This is the pre-work map. It records the topology, the AI-authorship seams, the
> orphan candidates, and the confirmed Phase 1 findings at their true severity. It is
> the "before" half of the audit bracket; `docs/audits/AUDIT_REGRESSION.md` (Phase 6) is the "after".

---

## 1. Iteration-depth estimate (from git history)

23 commits across ~4 distinct generation waves (each a probable separate session — the
seams between them are the highest-risk sites for silent contract drift):

| Wave | Commits | What it added | Seam risk |
|------|---------|---------------|-----------|
| W1 — Observatory base | `b1bdd5f`…`f3b9531` | Ephemeris, chart, forecast, AI lenses, TTS, entitlements | Foundational; stable |
| W2 — Astra Arcana | `0cef0bd`, `e543af0` (PR #1/#3) | `tarot.py`, `tarot_data.py`, `tarot_models.py`, ArcanaModal | Core is well-tested |
| W3 — Minor Arcana + Synastry | `56e5c35`…`c299a9f` (PR #4) | 78-card deck, `synastry.py` ("grok-engineered, reviewed" `f17d42e`) | **Highest** — explicit multi-author DRAFT lineage |
| W4 — Predictive + Advanced | `d39eec6`, `cd816fb`, `8511611` | `predictive.py`, `advanced.py` | Recent; less test coverage on perimeter |

**Read:** the tarot *core* (W2) is proven; the *perimeter* wired in W3/W4 (synastry draft,
API endpoints, entitlement path) is where contracts are most likely to have been assumed
rather than honored. Phase 1 lives almost entirely in this zone.

---

## 2. Structural / topology map

### Backend (`backend/`, 5,766 LOC)

| Module | LOC | Exports (key) | Imports from | Notable consumers |
|--------|-----|---------------|--------------|-------------------|
| `main.py` | 597 | FastAPI `app`, 27 `/api/*` routes | **15 modules** ⚠️ | ASGI entry |
| `ai.py` | 698 | `interpret`, `interpret_stream`, `interpret_arcana`, `_LENS_GUIDANCE`, `ai_status` | os, httpx | main |
| `synastry.py` | 632 | `compute_synastry`, `composite_midpoints`, `davison_chart`, `synastry_tarot` | ephemeris, models, tarot | main |
| `tarot_data.py` | 628 | `FULL_DECK`, `MAJOR/MINOR_ARCANA`, `*_BY_ID`, `PLANET_MAJOR`, `SIGN_MAJOR`, sourcing docs | — (pure data) | tarot, synastry |
| `forecast.py` | 493 | `generate_forecast` | ephemeris, astrology | main, tarot(arcana-forecast path) |
| `tarot.py` | 469 | `build_natal_arcana_signature`, `weighted_draw`, `build_reading_core`, `daily_arcana_from_events`, `arcana_for_event` | astrology, models, tarot_data, tarot_models | main, synastry |
| `ephemeris.py` | 387 | `calculate_chart`, `calculate_transiting_planets`, `aspects_between`, `julian_day_from_iso` | (swisseph) | main, forecast, synastry, predictive, advanced |
| `predictive.py` | 301 | progressions, solar return, eclipse timeline | ephemeris, astrology, models | main |
| `advanced.py` | 237 | harmonics, midpoint tree, fixed stars | ephemeris, astrology, models | main |
| `telemetry.py` | 236 | `log_*`, `summary` (SQLite) | sqlite3 | main |
| `entitlements.py` | 163 | `mint_entitlement`, `verify_token`, `entitlement_status`, `verify_eth_payment`, `PREMIUM_FEATURES` | httpx, treasury | main |
| `astrology.py` | 162 | `SIGNS`, `ELEMENTS`, constants | — | tarot, forecast, predictive, advanced |
| `models.py` | 151 | Pydantic request/response schemas, `AIRequest` (lens union) | pydantic | main, tarot_models, everything |
| `patterns.py` | 150 | aspect-pattern detection | astrology | ephemeris/chart path |
| `tarot_models.py` | 130 | tarot Pydantic schemas, `DISCLAIMER` | models | main, tarot, synastry |
| `tts.py` | 126 | `synthesize`, `list_voices`, `tts_status` | httpx | main |
| `treasury.py` | 85 | `treasury_info` | os | main, entitlements |
| `tarot_prompts.py` | 67 | `ARCANA_SYSTEM`, `build_arcana_user_prompt` | — | main |
| `verify_ai.py` | 54 | standalone script | ai | **none** (orphan — see §4) |

**God-module flag:** `main.py` imports from **15 modules** (>5 threshold). Expected for a
FastAPI aggregator, but it means every cross-cutting concern (auth gating, CORS, error
shape, telemetry) is centralized here — Phase 1 and Phase 5 both concentrate on this file.

**Highest-priority shared dependencies (imported by >4 consumers):**
- `models.py` / `ephemeris.py` / `astrology.py` — foundational; a contract change here
  ripples everywhere. Touch with care and re-run the full suite.
- `tarot_data.py` — pure data, consumed by `tarot.py` and `synastry.py`. Phase 2.2
  (source-system selector) and Phase 4 (deck-art) both extend this substrate.

### Frontend (`frontend/src/`)

| File | LOC | Role |
|------|-----|------|
| `api/client.ts` | 510 | All fetch calls; base-URL resolution (⚠ see gotcha) |
| `store/useStore.ts` | 286 | Zustand store; **holds the default chart with real coords** (§ Phase 1.2) |
| `components/ArcanaModal.tsx` | 296 | Natal Arcana / Draw / Transit / Classroom / Studio surfaces |
| `types.ts` | 112 | Mirrors `models.py`; **`Lens` union = 6 values, no `arcana`** (§ Phase 1.3) |
| `lib/tarotCopy.ts` | 176 | Static tarot display copy |
| 20 other components | — | Chart wheel, modals, panels, pickers |

---

## 3. AI-authorship markers (context-loss seams)

| Marker | Location(s) | Interpretation |
|--------|-------------|----------------|
| Explicit multi-author lineage | commit `f17d42e` "grok-engineered, reviewed"; `f17d42e` "synastry DRAFT skeleton" | W3 synastry was drafted by a different model and hand-finished across ≥4 follow-up commits — classic context-loss seam. |
| `# TODO (optional)` cluster | `synastry.py:12` (per handoff) | Nice-to-haves left dangling; confirm none are load-bearing. |
| Phase-number comments as section headers | `tarot.py` ("Phase 1", "Phase 2", "Phase 7"), `main.py` "(Phase 7)" | Generation-session bookmarks; harmless but confirm the phase numbering doesn't imply removed intermediate logic. |
| Dangling capability with no reachable caller | `ai.py:154` `_LENS_GUIDANCE["arcana"]` exists but `AIRequest.lens` (models.py:64) can't be `"arcana"` | **Contract-boundary defect → Phase 1.3.** One module offers a lens the request schema forbids. |
| Duplicated real-coords fixture | `test_tarot.py:21`, `test_advanced.py:20`, `test_predictive.py:21`, `test_synastry.py:19`, `useStore.ts:35` | Same personal birth data copy-pasted across 5 files → Phase 1.2 is repo-wide, not single-file. |

---

## 4. Orphan sweep (logged, NOT yet fixed)

| Candidate | Type | Disposition (proposed) |
|-----------|------|------------------------|
| `verify_ai.py` | Module with zero live importers (standalone diagnostic script) | Keep as dev tool; confirm not wired to CI. Document as intentional, not dead. |
| `daily_arcana_from_events` skip-on-no-event | Conditionally-produced state read as if complete (`if ev is None: continue`, `tarot.py:449`) | **Latent defect → Phase 1.5.** A 7-day request can return <7 cards. |
| `_default_seed` daily-branch date source | `_dt.date.today()` (server-local) written into the determinism seed unconditionally | **→ Phase 1.4.** Seed depends on server clock, not the querent's local day. |
| `arcana-forecast` start date | `dt.date.today()` (main.py:443) | **→ Phase 1.4.** Same server-clock coupling. |
| `docs/archive/IMPLEMENTATION_SCHEDULE.md`, `docs/progress/Hand_off.md` | Untracked planning docs at repo root | Context artifacts. Keep untracked or move to `docs/`; not source. |

_No modules with zero callers other than `verify_ai.py`. No dead API routes detected._

---

## 5. Confirmed Phase 1 findings (traced, at audit severity)

| # | Finding | Evidence | Severity |
|---|---------|----------|----------|
| 1.1 | **Trust-mode entitlement bypass.** `verify_eth_payment` returns `ok=True` for any non-empty tx hash when `AAE_ETH_RPC` is unset; the non-EVM branch in `donate_verify` grants on any non-empty hash. No production gate, no fail-closed, no boot-time refusal. | `entitlements.py:136-137`, `main.py:208-219` | **Critical** (auth bypass) |
| — | **HMAC secret default fallback.** `_SECRET = os.environ.get("AAE_SECRET", "aae-dev-secret-change-me")` — in prod with the var unset, entitlement tokens are forgeable by anyone reading the source. | `entitlements.py:38` | **Critical** (hardcoded secret / forgeable auth) — fold into 1.1's fail-closed boot assertion |
| 1.2 | **Real personal birth data in a public repo.** Real coords + birth date/time (values redacted from this doc 2026-07-20) in 4 test files labeled "the user's chart", and the same location as the frontend default chart. | 5 files (§3) | **High** (PII exposure) |
| 1.3 | **Arcana-lens contract split.** `ai.py` offers an `arcana` lens; `models.py`/`types.ts` forbid it in `AIRequest.lens`; README says arcana is a *separate* path. Story is inconsistent. | `ai.py:154`, `models.py:64`, `types.ts:97`, `README:189` | **Medium** (context-boundary integrity) |
| 1.4 | **No timezone / start-date control.** Daily seed and `/api/arcana-forecast` both start from server-local `date.today()`. Determinism is a function of server clock, not the querent's local day. | `tarot.py:313`, `main.py:443` | **High** (correctness of the meaning unit) |
| 1.5 | **Daily cards aren't daily.** `daily_arcana_from_events` skips dates with no forecast event → an N-day request can return <N cards. | `tarot.py:449-450` | **Medium** (contract violation) |
| 1.6 | **Security sweep of touched files.** Missing response security headers (no CSP/X-Frame-Options/X-Content-Type-Options/HSTS); wildcard CORS default (mitigated by `allow_credentials=False`); several fire-and-forget `asyncio.create_task(TEL.log_*)` swallow task exceptions; SHA-256 confirmed non-security-load-bearing (seed only — correct). No IDOR surface in the current stateless bearer-entitlement model (no per-user owned resources), but this must be re-confirmed if any owned resource is added. | `main.py:115-123`, multiple `create_task` sites | **High/Medium** mix |

### Invariants to preserve (verified present at baseline)
- **Deterministic core is AI-free.** `build_reading_core` produces a full reading with
  `ai_source=None`; AI enrichment is layered only in `main.py` and falls back silently.
  ✔ (`test_reading_core_offline_complete`)
- **Disclaimer rides on the data.** `DISCLAIMER` is a field on `NatalArcanaSignature`,
  `TarotReadingResponse`, `ArcanaForecastResponse` in `tarot_models.py`. ✔
- **SHA-256 seeding, never `hash()`.** `_seed_rng` uses `hashlib.sha256`. ✔

---

## 6. Open decisions requiring the operator (before Phase 1 execution)

1. **1.3 direction** — add `arcana` end-to-end (backend + frontend union), OR formalize
   "Arcana uses a separate endpoint" and remove the dangling `_LENS_GUIDANCE["arcana"]`
   ambiguity. README already leans *separate*; recommend that (lower blast radius).
2. **1.2 synthetic fixture** — Einstein's public natal data (1879-03-14, Ulm) proposed as
   the replacement everywhere the real coords appear.
3. **Determinism-seed evolution** — 1.4 (local date) and 2.2 (source system) both change
   the seed inputs. Existing seeds stay reproducible only if new inputs default to today's
   behavior. Confirm: the seed becomes a pure function of
   `(natal signature, resolved local date, spread, source system)` with defaults that
   reproduce current output.

---

_End of Phase 0 baseline. No source modified in this pass._
