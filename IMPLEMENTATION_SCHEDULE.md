# Implementation Schedule — Astra AAE

_Generated 2026-06-30. Turns the enhancement backlog into a sequenced, dependency-aware plan._

## How to read this
- **Cadence:** 2-week sprints. Dates are relative ("S0" = first sprint). Slide to your real calendar.
- **Size:** `S` ≈ ≤1 day · `M` ≈ 2–4 days · `L` ≈ 1 sprint+ · `XL` ≈ multi-sprint.
- **§ref** points back to the original backlog section.
- **Sequencing rule:** anything *reused by other work* or that *makes future changes cheaper*
  goes first. Features that depend on a foundation are scheduled after it.

## What today's work already bought us
The 2026-06-30 session shipped backend foundations for several "roadmap" items, so their
remaining lift is mostly **frontend + integration**, not net-new computation:
- `synastry.py` → Synastry bi-wheel is now a rendering task (§2.1, §4 Phase 2)
- `predictive.py` → Progressions/solar-return math exists; needs the bi-wheel + "Progressed" lens (§2.3)
- `advanced.py` → Harmonics, midpoint trees, fixed stars computed; need UI surfaces (§2.3)

---

## Sprint 0 — Foundations & "do-it-now" unblockers  (highest leverage)
_These are cheap now and expensive later. They de-risk everything downstream._

| ID | Task | §ref | Size | Depends | Done when |
|----|------|------|------|---------|-----------|
| F1 | **API versioning** — prefix all routes `/api/v1/`, add redirect from legacy paths | §1.2 | S | — | All endpoints under `/api/v1`; frontend base URL updated; old paths 308→new |
| F2 | **Structured logging** — `structlog` with `request_id`, `tier`, `model`, `duration_ms`; redact API keys | §1.2, §3.3 | M | — | No raw `print`; keys never appear in logs; request_id traces one call end-to-end |
| F3 | **Precomputed aspect tables** — build planet-pair aspect matrix once per cast; reuse in lenses/patterns/arcana | §1.1, §5 | M | — | Single aspect table threaded through; no duplicate angular recompute (verify via profiler) |
| F4 | **Ephemeris result cache** — in-memory TTL (10s) keyed on date+location+house-system | §1.1, §5 | M | — | Repeat identical cast hits cache; measured CPU drop on transit re-render |
| F5 | **Externalize tarot meanings** — move hardcoded card data to JSON/YAML | §1.4, §5 | M | — | `tarot.py` loads from data file; tests pass unchanged; file is i18n/community-ready |
| F6 | **CI pipeline** — GitHub Actions: `pytest` + `tsc -b` on every push | §3.1 | S | — | PRs blocked on red; badge in README |

**Exit criteria for S0:** versioned API, structured logs, cached/precomputed ephemeris path,
data-driven tarot, green CI on every push.

---

## Sprint 1–2 — Reliability & cost protection
_Protect the service and your OpenRouter spend before opening the feature floodgates._

| ID | Task | §ref | Size | Depends | Done when |
|----|------|------|------|---------|-----------|
| R1 | **Rate limiting** — `slowapi`, per-IP + per-token on `/ai-ask` & `/tarot-reading` | §1.2, §3.3 | M | F1 | 429s on abuse; limits configurable via env |
| R2 | **Redis cache** — entitlement validation + request dedup (keep SQLite for stats) | §1.2 | L | F4 | Entitlement checks served from Redis; SQLite retains telemetry |
| R3 | **AI prompt-injection sanitization** — strip system-override attempts from user questions | §3.3 | M | F2 | Injected "system:" payloads neutralized; unit tests cover common attacks |
| R4 | **Prometheus `/metrics`** — `prometheus-fastapi-instrumentator`: chart count, AI latency, error rate by tier, token usage | §3.2 | M | F2 | `/metrics` scrapeable; key series present |
| R5 | **Containerization** — multi-stage Dockerfile (frontend build → nginx + FastAPI); `docker-compose.yml` w/ optional Redis + Ollama sidecars | §3.1 | L | R2 | `docker compose up` serves full app; image builds in CI |
| R6 | **Client error tracking** — `window.onerror` → `/api/v1/telemetry/error` (or Sentry) | §3.2 | S | F1 | D3 render errors captured server-side |

---

## Sprint 3–4 — Feature velocity (Phase 2 quick wins)
_Low-effort/high-impact, riding the backends we already have._

| ID | Task | §ref | Size | Depends | Done when |
|----|------|------|------|---------|-----------|
| P1 | **Chart comparison mode** — side-by-side natal wheels + shared transit ring | §2.1 | M | — | Two charts render side-by-side; shared transit ring animates both |
| P2 | **Synastry bi-wheel** — natal + partner overlay reusing `ChartWheel` | §2.1, §4 | M | P1, `synastry.py` | Bi-wheel renders synastry aspects from existing endpoint |
| P3 | **Progressions bi-wheel + "Progressed" lens** — overlay progressed on natal; feed progressed-to-natal aspects to forecast | §2.3 | L | `predictive.py` | New lens selectable; forecast includes progressed aspects |
| P4 | **Shared reading URLs** — base64(chart+lens)+sharing token → deep link | §2.2 | M | F1 | Link opens app at exact chart/lens read-only |
| P5 | **Tarot seed nonce** — add re-roll nonce, return seed to frontend for provable fairness | §1.4 | S | F5 | Same question re-rollable; seed shown in UI |
| P6 | **Transit animation timeline** — "play" button animating ring/aspects over a range | §2.1 | M | — | Smooth playback across selected date range |

---

## Sprint 5–6 — Frontend architecture & astrological depth
_Pay down frontend perf debt; surface the advanced backends._

| ID | Task | §ref | Size | Depends | Done when |
|----|------|------|------|---------|-----------|
| A1 | **Zustand slices** — split into chart/forecast/arcana/entitlement slices; selectors; keep store serializable (no D3 selections) | §1.3, §5 | L | — | Slices lazy-loaded; heavy recompute debounced on slider drag |
| A2 | **Web Workers** — offload ephemeris processing + D3 layout math | §1.3 | L | A1 | Main thread free during bi-wheel + arcana overlay render |
| A3 | **Virtualized forecast list** — `react-window`/`virtuoso` for 90-day events | §1.3 | S | A1 | Hundreds of events scroll without jank |
| A4 | **Fixed-star overlay** — labeled conjunctions (1–2°) w/ mythological notes | §2.3 | M | `advanced.py` | Notable stars plotted on wheel with hover notes |
| A5 | **Harmonic chart selector** — 1st–13th harmonic on demand | §2.3 | M | `advanced.py` | Harmonic picker renders selected-harmonic wheel |
| A6 | **PWA background sync** — cache-first static + Moshier data; sync forecast offline | §1.3 | M | — | Forecast available after going offline post-load |
| A7 | **78-card decan mapping** — assign Minor Arcana per planet decan from chart | §1.4, §4 | L | F5 | Full 78-card spread derives from decan correspondences |

---

## Backlog — Phase 3/4 (strategic, schedule after above lands)

| ID | Task | §ref | Size | Notes |
|----|------|------|------|-------|
| S1 | **AI response metadata chunks** — structured SSE (`{"type":"lens_change",...}`) for smooth transitions | §1.2 | M | Builds on existing SSE stream |
| S2 | **AI-guided interactive tarot** — ask→reply loop, re-interpret spread | §1.4 | L | Turns one-shot into conversation |
| S3 | **Local LLM fallback** — bundle quantized 1–2B via `llama.cpp`/Ollama sidecar when no cloud key | §1.2 | L | `AAE_OLLAMA_MODEL` already hints at this |
| S4 | **User accounts (client-side encrypted vaults)** + optional WebDAV sync | §2.2 | XL | Stays serverless-first |
| S5 | **Daily email digest** — subscription endpoint (encrypted email+chart) + cron service | §2.2 | L | Separate service; needs S4-style storage |
| S6 | **AI cost dashboard** — cumulative OpenRouter cost by model/day in admin | §3.2 | M | Depends on R4 metrics |
| S7 | **WebGL celestial sphere** — `three.js` orbits, retrograde loops, fixed stars (beta → full) | §2.1, §4 | XL | Start minimal (orbits only), expand later |
| S8 | **HMAC token key-versioning** — `v1` prefix for graceful supporter-token rotation | §3.3 | M | Only if rotation becomes unavoidable |
| S9 | **Arcana classroom as community JSON curriculum** — PR-extendable lessons | §1.4 | M | Enables user-contributed content |
| S10 | **i18n** — arcana classroom + fallback prose | §4 | L | Unblocked by F5 (data-driven content) |
| S11 | **Custom deck art (DALL·E/SD)**, **API marketplace (HMAC-metered)** | §4 | XL | Tier-gated, opt-in; long-horizon |

---

## Code-level refactors (fold into the sprint that touches each file)
- `ephemeris.py`: memoize zodiac sign boundaries for fast sign lookups (with F3/F4).
- `forecast.py`: turn Moon-substep logic into a **generator** yielding events progressively (with P3).
- `forecast.py`: make Moon substep **configurable** (e.g. 3h) or use `swe_rise_trans` for exact ingress (§1.1) (with P3).
- `tarot.py`: data-driven meanings (this is F5).
- `ai.py`: abstract each lens into a `Lens` class with `build_prompt(chart, question)` (with P3/S1).

---

## Suggested milestones
- **M1 (end S0):** Versioned, observable, cached foundation + green CI.
- **M2 (end S2):** Rate-limited, metered, containerized, Redis-backed service.
- **M3 (end S4):** Comparison + synastry + progressions + shareable readings live.
- **M4 (end S6):** Refactored frontend, harmonics/fixed-stars/78-card depth shipped.
- **M5 (backlog):** Strategic bets (WebGL, accounts, local LLM, marketplace).
