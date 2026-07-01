# COMPREHENSIVE TASK SCHEDULE — Astra Arcana

**Living document.** Incorporates:
- Current project state (fable5-oracle-report branch)
- All prior planning (`IMPLEMENTATION_SCHEDULE.md`, `ASTRA_ARCANA_PLAN.md`, `FABLE5_HANDOFF.md`)
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
- Update this schedule and `PROJECT_WORK_HISTORY_MAP.md` on major progress.
- Use `./run.sh`, explicit venv python, `AAE_ENV=development|test`.

---

## 0. Immediate Priorities (Close Current Branch + Stabilize)

**ID** | **Task** | **Size** | **AC / Done When** | **Deps / Notes**
---|---|---|---|---
**F5-1** | ✅ **DONE 2026-07-01** — Complete Oracle Report frontend integration | M | `fetchOracleReport` is called from ArcanaModal (or dedicated surface); oracle report markdown rendered with sections, ai_source badge, disclaimer, copy/speak controls; 402 routes user to Support; loading + error states; seeded from chart + spread + question + source. Add simple "Oracle Report (Oracle tier)" affordance in Arcana draw or new tab. | Done: `loadOracleReport()` + Draw-tab block; `Interpretation` accordion reused (exported from DetailPanel, `###` subsection rendering added); actual-model badge / offline badge; copyable seed + lineage + disclaimer; typed `ApiError` → 402 opens Support; `oracle_report`/`oracle_report_gated` events; state reset on chart change. Verified: build green, 116 backend tests, 3-tier TestClient smoke (free 402 / supporter 402 / oracle 200, I–V sections). |
**F5-2** | ✅ **DONE 2026-07-01** — Update documentation for Oracle Report / Fable 5 | S | README.md API table includes `/api/oracle-report`; tier routing + `AAE_ORACLE_*` vars documented; CHANGELOG.md has Fable 5 entry; `.env.example` already good. | Done: README API rows (oracle-report + personal-report), tier-routing oracle-minting row, "Oracle Report — Claude Fable 5" config section with cost/retention note, Arcana features bullet; CHANGELOG gained retroactive Oracle-backend entry + F5-2 entry. |
**PR-1** | ✅ **DONE 2026-07-01** — Personal Report backend (deluxe post-Oracle product) | M | `/api/personal-report` compiles the 11-part PDF-ready markdown edition from an oracle session; oracle tier 402; **seed-verified post-Oracle gate** (409 on fabricated/foreign session); prompt privacy (placeholders, no birth data); honest offline fallback; telemetry `lens=personal_report`. | Done: `personal_report.py` (API-tuned system prompt from `FABLE5_PERSONAL_REPORT_PROMPT.md`), models (`OracleSessionRef`, `PersonalReportRequest/Response`), `_call_fable` generalized, `AAE_PERSONAL_REPORT_*` env, 8 tests. **Follow-ups (open):** PDF renderer (design docs ready), separate-purchase rail, frontend surface. |
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
**PDF-1** | ✅ **DONE 2026-07-01** — PDF renderer for the deluxe edition | L | `report_markdown` → styled PDF per the design doc; placeholders filled client-side; mock is the visual contract; works offline | Done via the print-CSS route, zero deps: `lib/printReport.ts` (escape-then-style converter, dark cover, chaos-sigil SVG in `{{SIGIL}}`, local `{{BIRTH_INFO}}` fill, browser print→PDF). Ground-truth verified 11/11 incl. injection escape + sigil determinism. Follow-on (optional): richer tarot-card grid + two-col layouts from the mock. |
**PDF-2** | Separate purchase rail for the deluxe edition | M | A distinct entitlement (or one-shot claim) beyond oracle tier; fail-closed like trust-mode/oracle gates; fresh mini-audit appended to `AUDIT_REGRESSION.md` (new paid surface rule) | **Operator decision needed:** per-product token vs higher `AAE_*_MIN_WEI` threshold vs off-chain receipt.
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

| ID | Task (from IMPLEMENTATION_SCHEDULE + review recs) | Size | AC / Done When | Status |
|----|--------------------------------------------------|------|----------------|--------|
| R1 | Rate limiting on AI + oracle paths (`slowapi` or equivalent) | M | 429 on abuse for `/api/ai-ask*`, `/api/tarot-reading`, `/api/oracle-report`; configurable via env; tests for limits | Open |
| R2 | Observability for new paid path | S | `log_ai` already called for oracle_report; ensure admin stats surfaces "oracle_report" lens + model + cost proxy (tokens or duration) | Partial (telemetry exists) |
| R3 | Prompt injection hardening (user question) | M | Common attack strings neutralized in oracle + ai paths; unit tests | Open |
| R4 | Prometheus `/metrics` (or enhance admin) | M | Key series for charts, AI calls by tier/lens (incl. oracle_report), latency, errors | Open |
| R5 | Containerization basics | L | Dockerfile + compose that runs full app (frontend build + backend); documented | Open |
| R6 | Client error tracking | S | Frontend errors posted to telemetry | Open |

### 1.3 Foundations & Quick Wins (F1–F6 + related)
| ID | Task | Size | AC | Status |
|----|------|------|----|--------|
| F1 | API versioning (`/api/v1/...` + legacy redirects) | S | All routes under v1; frontend updated; 308s for old paths | Open |
| F2 | Structured logging (`structlog` etc.) | M | request_id, tier, model, duration; no raw keys in logs | Open |
| F5 (old) | Externalize tarot meanings to data file | M | `tarot.py` loads JSON/YAML; tests unchanged; i18n-ready | Open (note in schedule) |
| F6 | CI already landed | — | `.github/workflows/ci.yml` + Dependabot present and passing | **Done** (Phase 5) |
| F3/F4 | Precomputed aspects + ephemeris cache | M | Measurable reuse; no perf regression | Open |

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
3. **Tracking discipline**: Maintain `PROJECT_WORK_HISTORY_MAP.md` and this schedule as first-class artifacts. Update on every phase close. This directly addresses "progress can always stay tracked."
4. **Git history PII decision**: Make an explicit recorded decision (see F5-6). Option A: leave + note in audits (current default). Option B: `git filter-repo` + force push + collaborator re-clone. Option C: make repo private temporarily.
5. **Secret & config hygiene**: Real values in `.env` are fine locally (gitignored), but document rotation procedure. Consider a lightweight boot-time check or CI note.
6. **Rate limiting + cost guardrails** before heavy oracle usage (R1). Fable 5 is expensive ($10/50 per MTok range noted in .env.example).
7. **Continue audit culture**: On any new paid surface or entitlement change, produce a mini "regression note" or append to `AUDIT_REGRESSION.md`.
8. **Reconcile old plans**: Many items in `IMPLEMENTATION_SCHEDULE.md` and `ASTRA_ARCANA_PLAN.md` (e.g. classroom as community curriculum, full expression studio depth, synastry optional TODOs) are still relevant. Mark completed items explicitly when done.
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

## 7. Next Steps After Immediate Block

1. Triage remaining R and F items (pick 1-2 highest leverage per sprint).
2. Surface more of the advanced backends (P3, A4, A5) — high user value, backend already done.
3. Address long-horizon items only after reliability foundation (R1–R4).
4. Revisit original `ASTRA_ARCANA_PLAN.md` expression studio / classroom depth if gaps remain in current ArcanaModal.

---

**End of Schedule.**

This document + `PROJECT_WORK_HISTORY_MAP.md` + `CHANGELOG.md` + git history + the two AUDIT files provide complete, self-contained progress tracking.

**Last major update:** 2026-07-01 (session close) — Immediate block COMPLETE: F5-1..F5-6,
PR-1 (Personal Report backend, seed-verified post-Oracle gate), PR-2 (deluxe frontend).
124 backend tests, 32 routes, branch closed as one commit. Next block: §0.1 Personal
Report Productization (PDF-1..PDF-4, R1 pulled forward for cost protection).

---
*To stay on track: Re-read this file + the History Map at the start of every focused session.*
