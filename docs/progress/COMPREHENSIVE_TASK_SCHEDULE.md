# COMPREHENSIVE TASK SCHEDULE — Astra Arcana

**Living document.** Incorporates:
- Current project state (fable5-oracle-report branch)
- All prior planning (`docs/archive/IMPLEMENTATION_SCHEDULE.md`, `docs/archive/ASTRA_ARCANA_PLAN.md`, `docs/archive/FABLE5_HANDOFF.md`)
- Hardening phase outcomes
- Review recommendations & suggestions from 2026-07-01 filesystem review

**Goal:** Keep progress visible, prioritized, and trackable. Use checkboxes, clear acceptance criteria (AC), and explicit "done when" statements.

**Current Context (2026-07-01):**
- Branch: `fable5-oracle-report` (uncommitted Oracle Report work)
- Backend tests: 116 passing
- Core Arcana + predictive + advanced + synastry shipped and hardened
- **Oracle Report (Fable 5)**: Backend + tests + models + entitlements + client types complete. **Frontend UI integration incomplete.**
- Invariants (must survive all work): Deterministic AI-free core; `DISCLAIMER` on every response object; fail-closed security.
- Open historical items: Git history PII residual (deferred), many items from old IMPLEMENTATION_SCHEDULE still open.

**Working style (from handoffs):** 
- Acceptance criteria upfront. "Done = tests green + relevant docs updated + (PR merged)".
- Branch before committing to main.
- Update `CHANGELOG.md` per logical phase.
- Update this schedule and `docs/progress/PROJECT_WORK_HISTORY_MAP.md` on major progress.
- Use `./run.sh`, explicit venv python, `AAE_ENV=development|test`.

---

## 0. Immediate Priorities (Close Current Branch + Stabilize)

**ID** | **Task** | **Size** | **AC / Done When** | **Deps / Notes**
---|---|---|---|---
**F5-1** | ✅ **DONE 2026-07-01** — Complete Oracle Report frontend integration | M | `fetchOracleReport` is called from ArcanaModal (or dedicated surface); oracle report markdown rendered with sections, ai_source badge, disclaimer, copy/speak controls; 402 routes user to Support; loading + error states; seeded from chart + spread + question + source. Add simple "Oracle Report (Oracle tier)" affordance in Arcana draw or new tab. | Done: `loadOracleReport()` + Draw-tab block; `Interpretation` accordion reused (exported from DetailPanel, `###` subsection rendering added); actual-model badge / offline badge; copyable seed + lineage + disclaimer; typed `ApiError` → 402 opens Support; `oracle_report`/`oracle_report_gated` events; state reset on chart change. Verified: build green, 116 backend tests, 3-tier TestClient smoke (free 402 / supporter 402 / oracle 200, I–V sections). |
**F5-2** | ✅ **DONE 2026-07-01** — Update documentation for Oracle Report / Fable 5 | S | README.md API table includes `/api/oracle-report`; tier routing + `AAE_ORACLE_*` vars documented; CHANGELOG.md has Fable 5 entry; `.env.example` already good. | Done: README API rows (oracle-report + personal-report), tier-routing oracle-minting row, "Oracle Report — Claude Fable 5" config section with cost/retention note, Arcana features bullet; CHANGELOG gained retroactive Oracle-backend entry + F5-2 entry. |
**PR-1** | ✅ **DONE 2026-07-01** — Personal Report backend (deluxe post-Oracle product) | M | `/api/personal-report` compiles the 11-part PDF-ready markdown edition from an oracle session; oracle tier 402; **seed-verified post-Oracle gate** (409 on fabricated/foreign session); prompt privacy (placeholders, no birth data); honest offline fallback; telemetry `lens=personal_report`. | Done: `personal_report.py` (API-tuned system prompt from `docs/prompts/FABLE5_PERSONAL_REPORT_PROMPT.md`), models (`OracleSessionRef`, `PersonalReportRequest/Response`), `_call_fable` generalized, `AAE_PERSONAL_REPORT_*` env, 8 tests. **Follow-ups (open):** PDF renderer (design docs ready), separate-purchase rail, frontend surface. |
**F5-3** | ✅ **DONE 2026-07-01** — Verify full suite + security on fable5 changes | S | `pytest -q` (all 116+), `npm run build`, manual boot with `AAE_ENV=development`, run `test_oracle_report.py` + `test_security.py` + `test_entitlements.py` explicitly. Confirm oracle tier never leaks to lower tiers. | Done: 124 passed; 32-route boot; build green; 3-tier smoke proved free/supporter 402 on both paid endpoints. |
**F5-4** | ✅ **DONE 2026-07-01** — Branch hygiene & commit decision | S | Confirm strategy (one commit or split). Add `Co-Authored-By` trailer on commits. Disposition of untracked planning files documented. | **Decision (operator): ONE commit** for the whole branch (oracle backend + F5-1 UI + docs + Personal Report backend/frontend + planning docs). Planning docs committed per §6 disposition rules. |
**F5-5** | ✅ **DONE 2026-07-01** — Secret hygiene pass | S | Confirm `.env` is gitignored (yes); add rotation note for `AAE_SECRET` / `AAE_DEV_TOKEN`. | Done: rotation note in `.env.example` (incl. "rotation invalidates issued entitlement tokens"). Boot guard from Phase 1 already refuses default/blank secrets in prod. |
**F5-6** | ✅ **RECORDED 2026-07-01** — Reconcile open operator decisions | S | Explicit decision recorded for (1) git-history PII purge, (2) commit strategy. | (1) **PII: Option A stands** (leave history + audit note; working tree clean since Phase 1.2) — no explicit purge go-ahead has been given; revisit before making the repo public. (2) **Commit: single commit** (see F5-4). |
**PR-2** | ✅ **DONE 2026-07-01** — Deluxe-edition frontend | M | Post-Oracle "Compile Personal Report" affordance; exact session-context echo (date/generatedAt) for the seed check; provenance badges; 11-part preview; `.md` download; 402→support, 409→regenerate-Oracle message; telemetry; state hygiene on chart change / Oracle regen. | Done — see CHANGELOG PR-2. |

**Exit criteria for Immediate block:** ✅ **MET 2026-07-01** — F5-1..F5-6 + PR-1 + PR-2 complete, 124 tests green, docs updated, branch closed as one commit.

---

## 0.1 Next Block — Personal Report Productization (proposed priorities)

**ID** | **Task** | **Size** | **AC / Done When** | **Deps / Notes**
---|---|---|---|---
**PDF-1** | ✅ **DONE 2026-07-01** — PDF renderer for the deluxe edition | L | `report_markdown` → styled PDF per the design doc; placeholders filled client-side; mock is the visual contract; works offline | Done via the print-CSS route, zero deps: `lib/printReport.ts` (escape-then-style converter, dark cover, chaos-sigil SVG in `{{SIGIL}}`, local `{{BIRTH_INFO}}` fill, browser print→PDF). Ground-truth verified 11/11 incl. injection escape + sigil determinism. Follow-on ✅ Done 2026-07-08 (`tome-tarot-grid`): plates page + two-col readings per the mock. |
**PDF-2** | ✅ **DONE 2026-07-01** — Separate purchase rail for the deluxe edition | M | A distinct entitlement (or one-shot claim) beyond oracle tier; fail-closed like trust-mode/oracle gates; fresh mini-audit appended to `docs/audits/AUDIT_REGRESSION.md` (new paid surface rule) | **Operator decision (2026-07-01): off-chain `personal_report` receipt/token.** Done: `POST /api/personal-report/purchase` verifies a treasury tx against `AAE_REPORT_MIN_WEI` (unset ⇒ purchases disabled, fail closed; dev trust mode = unverified mint, impossible in prod) and mints an HMAC report token **bound to one Oracle session seed** (`AAE_REPORT_TOKEN_DAYS`, default 30). `/api/personal-report` now requires the claim (402 names "purchase"; dev token exempt). UI: purchase rail in the deluxe block; claims persisted per-seed in `aae.report_tokens`. 10 new tests (144 green). Known limit → mini-audit: stateless claims mean one paid tx can be replayed across sessions until a receipt ledger lands (R2-adjacent follow-up).
**PDF-3** | Audio companion (ElevenLabs) | M | "Narrate Synthesis + practices" from the deluxe edition via existing `/api/tts` (supporter-gated); chunking for long text; UI in the deluxe block | Rides existing TTS; no new provider.
**R1** | ✅ **DONE 2026-07-01** — Rate limiting on paid AI paths | M | 429s on `/api/oracle-report` + `/api/personal-report` + `/api/ai-ask*`; env-configurable; tests | Done: `ratelimit.py` sliding window (IP+entitlement-digest key), prod-on/dev-off auto default, `Retry-After`, deterministic paths never throttled; 10 tests. R2 (Redis) = horizontal-scale upgrade later. |
**PDF-4** | Sigil data pipeline | S | Studio sigil generation can pass `sigil_notes` (formation summary) into `fetchPersonalReport` so the codex section is personalized | Frontend-only wiring; `lib/sigil.ts` already generates.

---

## 1. Phase / Sprint Structure (Updated from Prior Plans)

Use this as the ongoing cadence. Triage old IMPLEMENTATION_SCHEDULE items into these buckets (many F* and R* items remain open).

### 1.1 Current / Next (Fable 5 Completion + Polish) — Target: 1–3 days
- F5 items above.
- Quick wins: Add oracle report to AdminPanel telemetry if missing; ensure `/api/health` or status surfaces Fable routing.
- Security: Re-confirm paid_tier + oracle endpoint gate with fresh test run.

### 1.2 Reliability & Cost Protection (R1–R6 from old schedule)
Prioritize before exposing more paid oracle usage widely.

**Sweep 2026-07-08 (operator direction = PERSONAL INSTRUMENT, chosen over
ship/store/harden):** items whose payoff is public-deploy hardening are
**PARKED**, not open — revisit only if the direction changes.

| ID | Task (from IMPLEMENTATION_SCHEDULE + review recs) | Size | AC / Done When | Status |
|----|--------------------------------------------------|------|----------------|--------|
| R1 | Rate limiting on AI + oracle paths (`slowapi` or equivalent) | M | 429 on abuse for `/api/ai-ask*`, `/api/tarot-reading`, `/api/oracle-report`; configurable via env; tests for limits | ✅ Done 2026-07-01 (`ratelimit.py`, sliding window, prod-on/dev-off) |
| R2 | Observability for new paid path | S | `log_ai` already called for oracle_report; ensure admin stats surfaces "oracle_report" lens + model + cost proxy (tokens or duration) | ✅ Done 2026-07-08 — oracle_report lens/model in AI-by-lens/model; deluxe purchases split (verified/trust) in summary + AdminPanel KPI |
| R3 | Prompt injection hardening (user question) | M | Common attack strings neutralized in oracle + ai paths; unit tests | ⏸ Parked (personal instrument — the only user is the operator) |
| R4 | Prometheus `/metrics` (or enhance admin) | M | Key series for charts, AI calls by tier/lens (incl. oracle_report), latency, errors | ⏸ Parked (AdminPanel covers the single-operator need) |
| R5 | Containerization basics | L | Dockerfile + compose that runs full app (frontend build + backend); documented | ⏸ Parked (no deploy target; `run.sh` is the runtime) |
| R6 | Client error tracking | S | Frontend errors posted to telemetry | ✅ Done 2026-07-08 (`lib/errorTelemetry.ts` → feature_events, trimmed + deduped, e2e-locked) |

### 1.3 Foundations & Quick Wins (F1–F6 + related)
| ID | Task | Size | AC | Status |
|----|------|------|----|--------|
| F1 | API versioning (`/api/v1/...` + legacy redirects) | S | All routes under v1; frontend updated; 308s for old paths | ⏸ Parked 2026-07-08 (single first-party client; churn without payoff) |
| F2 | Structured logging (`structlog` etc.) | M | request_id, tier, model, duration; no raw keys in logs | ⏸ Parked 2026-07-08 (telemetry.db covers the single-operator need) |
| F5 (old) | Externalize tarot meanings to data file | M | `tarot.py` loads JSON/YAML; tests unchanged; i18n-ready | ⏸ Parked 2026-07-08 (card data already generated to JSON for @astra/core; i18n not planned) |
| F6 | CI already landed | — | `.github/workflows/ci.yml` + Dependabot present and passing | **Done** (Phase 5) |
| F3/F4 | Precomputed aspects + ephemeris cache | M | Measurable reuse; no perf regression | ⏸ Parked 2026-07-08 (chart compute is ~30 ms; no observed need) |

### 1.4 Feature Velocity (P1–P6)
Ride existing backends:
- P1 Chart comparison mode
- P2 Synastry bi-wheel (rendering only)
- P3 Progressed bi-wheel + lens + forecast integration
- P4 Shareable reading URLs
- P5 Tarot seed nonce + UI display
- P6 Transit animation timeline

Many have backend math; frontend surfaces missing or partial.

### 1.5 Frontend Architecture & Depth (A1–A7)
- A1 Zustand slices
- A2 Web Workers for heavy math
- A3 Virtualized forecast
- A4–A5 Fixed stars + harmonics UI (backend ready)
- A6 PWA background sync
- A7 78-card decan mapping (extend Minor Arcana)

### 1.6 Strategic Backlog (S1–S11 + original ASTRA_ARCANA_PLAN)
- Interactive tarot conversations
- Local LLM first-class fallback
- WebGL celestial sphere
- Community lessons (JSON)
- i18n
- User accounts / vaults (client-side first)
- Email digests, cost dashboards, marketplace (long horizon)

---

## 2. Detailed Recommendations & Suggestions (Incorporated)

These come directly from the 2026-07-01 review + cross-referenced handoff/audit docs. Prioritize them into the schedule above.

**High Priority Recommendations:**
1. **Oracle Report UI completeness (F5-1)**: The most visible gap on current branch. Backend is excellent (substrate first, honest fallback, privacy-safe prompt, strict tier gate). Make the paid experience discoverable and polished inside ArcanaModal (or add a dedicated "Oracle Report" surface). Include lineage/source selector reuse, question input, and clear "Oracle tier only" messaging + upgrade path.
2. **Docs sync (F5-2)**: README and CHANGELOG lag on Fable 5. Keep user-facing truth current.
3. **Tracking discipline**: Maintain `docs/progress/PROJECT_WORK_HISTORY_MAP.md` and this schedule as first-class artifacts. Update on every phase close. This directly addresses "progress can always stay tracked."
4. **Git history PII decision**: Make an explicit recorded decision (see F5-6). Option A: leave + note in audits (current default). Option B: `git filter-repo` + force push + collaborator re-clone. Option C: make repo private temporarily.
5. **Secret & config hygiene**: Real values in `.env` are fine locally (gitignored), but document rotation procedure. Consider a lightweight boot-time check or CI note.
6. **Rate limiting + cost guardrails** before heavy oracle usage (R1). Fable 5 is expensive ($10/50 per MTok range noted in .env.example).
7. **Continue audit culture**: On any new paid surface or entitlement change, produce a mini "regression note" or append to `docs/audits/AUDIT_REGRESSION.md`.
8. **Reconcile old plans**: Many items in `docs/archive/IMPLEMENTATION_SCHEDULE.md` and `docs/archive/ASTRA_ARCANA_PLAN.md` (e.g. classroom as community curriculum, full expression studio depth, synastry optional TODOs) are still relevant. Mark completed items explicitly when done.
9. **Data-driven tarot** (F5 old): Move more hardcoded logic to JSON for maintainability/i18n.
10. **Observability for oracle**: Ensure `lens="oracle_report"` is visible in AdminPanel and telemetry summaries.
11. **Frontend perf & architecture**: Tackle A1–A3 before adding more heavy modals or large datasets.
12. **Long-term**: Keep "mathematics first, visualization second, reflection always." Never let AI paths bypass deterministic substrate + disclaimer.

**Suggestions for Process:**
- Every task should have: ID, size, AC, "done when", explicit test or verification command.
- After completing a logical group (e.g. F5 block), append a summary section to `CHANGELOG.md`, update the History Map, and bump this schedule's "Last major milestone".
- Use the existing test patterns: fail-before/pass-after where possible for security/correctness.
- Run full verification (`pytest`, build, manual smoke with oracle tier token) before opening PRs.
- For new AI providers or models: add to health endpoint + admin stats + docs.

---

## 3. Task Tracking Format (Use This Pattern)

When adding new tasks:

```markdown
**NEW-42** | Short title | Size (S/M/L/XL) | Priority (P0/P1/P2)
**Description:** ...
**AC:** 1. ... 2. ...
**Verification:** `command here`
**Deps:** F5-1
**Status:** Open / In Progress / Done (date)
**Owner / Notes:**
```

Mark with `- [x]` in tables above when complete.

---

## 4. Suggested Milestones (Updated)

- **M-F5 (now)**: Oracle Report fully integrated + docs + branch merged. History map + this schedule updated.
- **M1 (Reliability)**: Rate limiting + structured logs + basic metrics in place; oracle path protected.
- **M2 (Velocity)**: Synastry bi-wheel, progressed lens, shareable links live.
- **M3 (Architecture)**: Zustand slices + workers; major frontend surfaces for advanced math.
- **M4 (Depth)**: Fixed stars, harmonics UI, more arcana polish, data-driven tarot.
- **M5 (Strategic)**: Interactive features, i18n, containerization, community extensions.

---

## 5. Verification & Health Commands (Always Current)

```bash
# 1. Backend
cd backend
.venv/bin/python -m pytest -q

# 2. Frontend
cd ../frontend
npm run build

# 3. App smoke (with env)
AAE_ENV=development ../run.sh   # or manual uvicorn + npm run dev

# 4. Oracle-specific
cd backend
.venv/bin/python -m pytest tests/test_oracle_report.py tests/test_security.py tests/test_entitlements.py -q --tb=line

# 5. History snapshot
git log --oneline -5
git status --porcelain -b
```

---

## 6. Disposition Rules for Files & Work

- Planning docs (this schedule, history map, handoffs): Keep at root or move to `docs/`. Commit them.
- `.env`: Never commit. Use `.env.example`.
- On completing a phase: Update CHANGELOG, History Map, this file. Run full tests + build. Branch/PR.

---

## 6.5 GAZ — Offline city gazetteer (scoped 2026-08-03, NOT STARTED)

_Scoped at the operator's request on `claude/astro-caster-mobile-test-nnwle1`.
This is **step 1 of `MOBILE_ROADMAP.md` §4.2.2's proposed staged path** — the
one item worth doing **before** any H2/store decision, because it pays off even
if H2 never wakes. §4.2.2 itself is PROPOSED, NOT RATIFIED; this scope inherits
that status._

**Why:** `LocationPicker.tsx` makes the app's only two remaining per-device
external calls — CARTO basemap tiles (`:54`) and OSM Nominatim geocoding
(`:85`). Retiring them (a) removes two third-party usage-policy exposures that
only bite at store install volumes (`MOBILE_ROADMAP.md` §4.2.1 landmine 2),
(b) upgrades the "zero external requests" claim from *boot-only* to *always*,
and (c) makes the privacy claim fully structural rather than procedural.

**Two findings that shape the work (verified 2026-08-03):**

1. ⚠️ **`no-external.spec.ts` only tests boot.** It asserts zero external
   requests through chart-cast + fonts-settled, and never opens the map — so
   today's CARTO/Nominatim calls are **invisible to the gate**. Any fix that
   doesn't also extend this spec will silently regress. GAZ-5 is therefore not
   optional polish; it is the part that makes the rest hold.
2. ✅ **Leaflet can be deleted, which pays for much of the data.** `d3-geo@3.1.1`
   is *already installed* (transitively via `d3`), and the project is already a
   D3-SVG shop. Rendering a coastline map in D3 removes `leaflet` +
   `@types/leaflet` + `leaflet.css` — **163,913 B raw / ~50 KB wire** measured
   in `dist/` (148,818 JS + 15,095 CSS).

**ID** | **Task** | **Size** | **AC / Done When** | **Deps / Notes**
---|---|---|---|---
**GAZ-1** | Vendored gazetteer dataset + generator | M | `tools/gen_gazetteer.py` (or `.ts`) transforms an upstream GeoNames dump into a committed, trimmed artifact; `--check` byte-drift tripwire in CI; provenance + licence recorded in a sibling `README.md` | **Follows the `parity/` precedent exactly** (generator → committed artifact → `--check` tripwire), the pattern already proven in §3 of the mobile roadmap. Source: GeoNames `cities*.txt`, **CC-BY 4.0** — attribution required, FOSS-compatible, no F-Droid anti-feature. Fields: name, asciiname, country, admin1, lat, lng, population, IANA tz. Drop everything else. **Coverage tier is an operator decision — see Open questions.**
**GAZ-2** | Dependency-free search index | S | Diacritic-folded prefix/substring match ("Zurich" → "Zürich"), ranked by population, disambiguated by country + admin1 in the result row; ties resolve deterministically; unit-tested | Linear scan over ~26k rows is <5 ms — **no index library, no new dependency** (matches `@astra/core`'s posture). Determinism matters: same query ⇒ same order, per the project's invariants.
**GAZ-3** | Offline coastline map replacing Leaflet + CARTO | M | Click-to-place on a D3-rendered world map with **zero network**; visually consistent with the wheel (same dark/gold canon); `leaflet` + `@types/leaflet` removed from `package.json`; the `leaflet` manualChunk entry in `vite.config.ts` deleted | Natural Earth **110m coastline/admin-0, public domain** (~30–100 KB simplified GeoJSON — ship pre-simplified to avoid adding `topojson-client`). Uses the already-present `d3-geo`. Precision note: a 110m coastline is for **coarse placement**; the numeric lat/lng inputs stay authoritative, and search is the precise path.
**GAZ-4** | Wire into LocationPicker + CeremonyModal | S | `LocationPicker.tsx` has **no `fetch` to any external host**; search resolves against the local gazetteer; "not found" copy stays honest; `⊕ use my location` (pure `navigator.geolocation`, no network) is unchanged | Both call sites already lazy-load the picker (`Controls.tsx:7`, `CeremonyModal.tsx:6`) — keep that. The CARTO attribution control goes with the tiles; **add GeoNames + Natural Earth attribution** wherever the app credits its sources.
**GAZ-5** | Close the test gap (**the gate**) | S | `no-external.spec.ts` gains a case that **opens the map and runs a search**, asserting zero external requests across that path; green in both desktop + mobile projects | Without this the finding above recurs. Consider asserting on the *whole* ceremony flow rather than just the map, so future surfaces inherit the guarantee.

**Budget (estimates — verify at GAZ-1, do not treat as measured):** a trimmed
`cities15000` (~26k rows) lands ~1.0–1.2 MB raw / ~350–420 KB wire gzipped.
Against the ~164 KB raw / ~50 KB wire freed by deleting Leaflet, expect a **net
~+330 KB wire** and a precache moving ~1.74 MB → ~2.8 MB raw. That is a real
increase, not a wash — it is the price of the offline claim, and the coverage
tier below is the dial.

**Open questions — operator decisions, do not default them:**

1. **Coverage vs. size.** `cities15000` (~26k) is the compact choice but
   **will miss small birth towns** — and birthplaces are exactly where the long
   tail lives. `cities5000` (~55k) roughly doubles the payload; `cities1000`
   (~150k) is likely out of budget. This is a product call about how often
   "I can't find where I was born" is acceptable, not a technical one.
2. **Precache vs. lazy.** Precaching preserves the offline claim on a user's
   *first ever* ceremony but spends the budget up front; runtime-caching on
   first use is cheaper but fails an offline first run. Precedent points at
   precache — §3 chose exactly that for the WASM Swiss engine (lazy chunk,
   still in the precache glob).

**Adjacent — deliberately NOT in scope, now scoped separately as §6.6 (TZ).**
GeoNames rows carry an IANA timezone name, and there is a latent correctness
bug next door: `CeremonyModal.tsx:45` defaults `tz_offset` to `-5`, and `:95`
sets it from **the browser's current offset** on geolocate — i.e. today's DST
state, not the DST state at the birth moment. GAZ-1's zone-name field is the
prerequisite; **TZ is a hard dependent of GAZ-1** and must not ride along
inside GAZ. Note the follow-on examination found it needs *no* tzdata bundle
(the platform ICU already carries historical rules) and *no* engine change —
see §6.6.

---

## 6.6 TZ — Historical timezone resolution (scoped 2026-08-03, NOT STARTED)

_Scoped at the operator's request, immediately after §6.5. **Depends on GAZ-1**
(needs the IANA zone name per city). Flagged as out-of-scope inside GAZ
precisely so it would not ride along unexamined — this is that examination._

**The bug.** `CeremonyModal.tsx:45` defaults `tz_offset` to `-5`, and `:95`
sets it from **the browser's current offset** on geolocate. That is today's DST
state, not the DST state at the birth moment, and it is wrong outright when
casting someone else's chart in another zone. For an instrument whose identity
is deterministic accuracy, a silently-wrong offset shifts every house cusp and
the Ascendant — the most visible numbers on the wheel.

**Three findings that make this far cheaper than it looks (verified 2026-08-03):**

1. ✅ **The engines need no changes at all.** `tz_offset` is a pure *input* on
   both stacks — `ephemeris.py:95` and `ephemeris.ts:94` each just subtract it
   to reach UTC, and `models.py:39` already states the contract: *"The frontend
   resolves this from a place/timezone picker; the backend just [consumes it]."*
   The fix is **entirely client-side**, and because the offset stays a number on
   the wire, **no parity vectors need regenerating** and the Python↔TS parity
   contract is untouched. Keep it that way — see TZ-4.
2. ✅ **The data costs 0 KB.** The platform ICU tzdb already carries historical
   transitions, verified empirically in this session via `Intl.DateTimeFormat`
   + `formatToParts`: Ulm 1879-03-14 resolves to **+00:53:28** (true Berlin LMT,
   pre-1893-reform), Berlin 1893 → +01:00, New York 1975 → −04:00 summer /
   −05:00 winter, and Kathmandu 1985 → **+05:30** *not* +05:45 (Nepal's switch
   was 1986 — a clean proof it applies historical rules rather than modern
   ones). **No tzdata bundle is required.**
3. ✅ **Persistence already exists.** `useStore.ts:100` lists `tz_offset` among
   the persisted keys, so a resolved offset already travels with the profile.
   That is exactly the determinism guard TZ-3 needs.

**ID** | **Task** | **Size** | **AC / Done When** | **Deps / Notes**
---|---|---|---|---
**TZ-1** | Wall-clock → UTC resolver with a documented ambiguity policy | M | `resolveOffset(localWallClock, ianaZone, lng) → hours` using `Intl` only, no new dependency; **fall-back** (local time occurs twice, e.g. 01:30 on DST-end) and **spring-forward** (local time never occurs, e.g. 02:30) each resolve by a policy that is *written down and unit-tested*, not incidental | `Intl` computes an offset **from a UTC instant**, so the wall-clock direction is an inverse solve (2-pass converge). This is precisely where naive implementations break, and **birth times land on DST-change nights in the real world.** Policy suggestion: fall-back → earlier (first) occurrence; spring-forward → shift forward into real time; both surfaced to the user, never silent. **Takes `lng` because of TZ-0** — below the zone's first transition it returns longitude LMT, not the zone offset.
**TZ-1b** | Pre-standard-time branch (implements TZ-0) | S | `firstTransition(zone)` binary-searches `Intl` for the zone's earliest offset change and is memoized per zone; births before it resolve to `lng / 15`; the substitution is **visible in the UI** with a one-tap switch to the zone offset; the four zones in the TZ-0 table are pinned as unit tests | Deterministic and dependency-free. **Do not gate on a year cutoff**, and do not revive either rejected discriminator (TZ-0). The Cork-1900 over-application is accepted and handled by disclosure, not by more logic.
**TZ-2** | Fractional-offset handling (LMT) | S | A pre-1900 birth carrying an LMT offset such as +00:53:28 (**0.8911 h**) round-trips through the form, the wire, and both engines without loss or visual mangling; `CeremonyModal.tsx:191`'s `step={0.25}` no longer implies quarter-hour granularity; the readout at `:307` renders minutes/seconds, not `UTC +0.8911h` | Backend accepts it already (`models.py:41` is a `float`, `ge=-14 le=14`). ⚠️ Note `useStore.ts:91`'s Ulm reference uses `tz_offset: 0.67` — Ulm's *own* longitude-derived LMT (9.9876°/15 = 0.6658 h), not Berlin's zone. That is a defensible choice for an 1879 birth and is baked into existing fixtures: **do not "correct" it.** See TZ-5.
**TZ-3** | Determinism guard — resolve once, persist the number | S | A chart cast today reproduces byte-identically on a device with a different tzdb vintage; the resolved offset is persisted (and carried by Vault export) rather than re-derived at render time | ⚠️ **The real risk in this whole item.** ICU tzdb version varies by browser/OS/WebView age (this container: `2025c`), and tzdb releases *do* amend historical data. Re-resolving on every load would mean the same birth data yielding different charts on different devices — a direct violation of the project's core invariant. `useStore.ts:100` already persists `tz_offset`, so the guard is mostly *not regressing* it: **resolve at the ceremony, store the number, never silently re-resolve.** Any later re-resolution must be an explicit, visible user action.
**TZ-4** | Keep resolution client-side (contract preservation) | XS | The backend still never resolves zones; no IANA zone name is added to `ChartRequest`; `tzdata==2026.3` in `requirements.txt` remains a *server-locale* dependency, not a chart input | Guards finding 1. If a zone name were ever sent and resolved server-side, the client's ICU and the server's `zoneinfo` could disagree and reintroduce Python↔TS drift — the exact class of failure the parity CI (`MOBILE_ROADMAP` §3) exists to prevent.
**TZ-5** | Migration posture for existing charts | S | Existing profiles, the shelf/bookshelf, and `parity/*.json` fixtures are **untouched**; the new resolution applies to *newly entered* birth data only; if an existing chart's stored offset differs from what resolution would now produce, the user is *offered* a correction, never given one silently | Charts already generated are historical artifacts — the Bookshelf reprints them, and the seed determinism in `parity/tarot-draw.json` and friends depends on inputs not moving under it. **Silent recomputation would corrupt the shelf.**

**Test vectors to pin (suggested, from the 2026-08-03 probe):** Ulm
1879-03-14 → +00:53:28 · Berlin 1893-06-01 → +01:00 · New York 1975-07-15 →
−04:00 · New York 1975-01-15 → −05:00 · Kathmandu 1985 → +05:30 (not +05:45) ·
Kolkata → +05:30. Add one fall-back and one spring-forward case per TZ-1.

### TZ-0 — RATIFIED 2026-08-03: longitude LMT before standard time

**Operator decision: use the birthplace's own longitude LMT for
pre-standard-time births.** Recorded with the reassessment that produced it,
because the *trigger* was amended in the process.

**Is it warranted? Yes — measured, not assumed.** For the Ulm reference,
`Europe/Berlin`'s LMT is **+00:53:28** (Berlin's meridian) while Ulm's own
longitude gives **+00:39:57** — a **13.52-minute** gap. At the MC's 0.25°/min
that is **~3.38° of Ascendant and Midheaven**: enough to move house cusps and,
near a boundary, to change the rising sign. Well past noise; the zone's LMT is
simply the wrong meridian for anyone not born in the zone's reference city.

⚠️ **The trigger is NOT a year cutoff.** "Pre-1900" was the framing in the
question; it is wrong in both directions, because standardization dates vary
enormously. Verified by binary-searching `Intl` for each zone's first offset
transition (2026-08-03), all matching known history:

| Zone | LMT | First transition |
|---|---|---|
| `America/New_York` | −04:56:02 | **1883-11-18** (railroad standard time) |
| `Europe/Berlin` | +00:53:28 | **1893-03-31** |
| `Europe/Dublin` | −00:25:21 | **1916-05-21** |
| `Asia/Kathmandu` | +05:41:16 | **1919-12-31** |

**The exact rule: substitute longitude LMT while the birth instant precedes
the zone's first offset transition.** This is structural, not heuristic —
**every IANA zone begins with an LMT record by construction**, so "still in the
first record" *is* "before standard time here." Detection is a binary search
over `Intl` offsets (~40 calls, memoize per zone; deterministic).

Two discriminators were **tested and rejected** — do not revive them:
- *"offset is not a multiple of 15 min"* → misclassifies historical **legal**
  offsets as LMT (`Europe/Dublin` 1900 reads −00:25:21 and is not round, yet
  Dublin Mean Time was statutory clock time).
- *"ICU exposes an `LMT` abbreviation"* → it does not; `timeZoneName` returns
  `"GMT+0:53:28"`, offering no marker to switch on.

⚠️ **Known limit, accepted:** the rule over-applies where a country adopted a
national mean time *without* an offset change registering. A Cork 1900 birth
sits before `Europe/Dublin`'s first transition, so the rule substitutes Cork's
longitude (−00:33:53), but the wall clock legally read Dublin Mean Time
(−00:25:21) — an ~8.5 min / ~2.1° error. There is **no clean automatic rule
here**, and birth records of that era are themselves ambiguous about which time
they recorded. **Mitigation is transparency, not cleverness:** when the
substitution fires, say so plainly ("before standard time here — using local
mean time for Ulm, +00:39:57") and offer a one-tap switch to the zone offset.
Consistent with the project's existing posture — the offline badge and the
honest `ai_source` are the precedent: never be silently clever.

**Fixture note (not a bug):** the resolver yields **+00:39:57** (0.6658 h) for
Ulm, while `useStore.ts:91` stores **0.67** — a ~15-second rounding. Per TZ-5
the fixture stays untouched; expect a newly-entered Ulm birth to differ from
the stored reference by that hair, and do not "fix" either to match the other.

---

## 7. Next Steps After Immediate Block

1. Triage remaining R and F items (pick 1-2 highest leverage per sprint).
2. Surface more of the advanced backends (P3, A4, A5) — high user value, backend already done.
3. Address long-horizon items only after reliability foundation (R1–R4).
4. Revisit original `docs/archive/ASTRA_ARCANA_PLAN.md` expression studio / classroom depth if gaps remain in current ArcanaModal.

---

**End of Schedule.**

This document + `docs/progress/PROJECT_WORK_HISTORY_MAP.md` + `CHANGELOG.md` + git history + the two AUDIT files provide complete, self-contained progress tracking.

**Last major update:** 2026-07-01 (session close) — Immediate block COMPLETE: F5-1..F5-6,
PR-1 (Personal Report backend, seed-verified post-Oracle gate), PR-2 (deluxe frontend).
124 backend tests, 32 routes, branch closed as one commit. Next block: §0.1 Personal
Report Productization (PDF-1..PDF-4, R1 pulled forward for cost protection).

---
*To stay on track: Re-read this file + the History Map at the start of every focused session.*
