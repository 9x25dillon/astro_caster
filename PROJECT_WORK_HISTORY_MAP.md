# PROJECT WORK HISTORY MAP — Astra Arcana (astro-aae)

**Purpose:** A living, queryable record of the project's evolution so progress can always be tracked, audited, and resumed cleanly. Update on every major phase, PR, or significant change.

**Last Updated:** 2026-07-01 (session close — branch committed as ONE commit)
**Current Branch:** `fable5-oracle-report` (F5 block + Personal Report complete; single commit)
**Remote:** github.com/9x25dillon/astro_caster (inferred from history/docs)
**Verification Snapshot (at branch close):**
- Backend tests: **124 passed** (`cd backend && .venv/bin/python -m pytest -q`)
- Frontend: `tsc -b && npm run build` clean
- Boot: **32** `/api/*` routes (incl. `oracle-report`, `personal-report`)
- Ephemeris: Swiss files present + Moshier fallback
- Core invariants preserved: deterministic AI-free core, disclaimer on responses,
  fail-closed security, **post-Oracle gating (seed re-derivation)**, prompt privacy
  (symbolic data only; `{{BIRTH_INFO}}`/`{{SIGIL}}` placeholders)
- **Product positioning locked:** the Personal Report is an *optional, separately
  purchasable, post-Oracle* deluxe compiled edition — never bundled into the Oracle
  Report, never available without a genuine prior Oracle session.

---

## 1. High-Level Timeline & Waves

| Period / Wave | Key Commits / PRs | Focus | Status |
|---------------|-------------------|-------|--------|
| Initial / Observatory Base (W1) | `b1bdd5f` → `f3b9531` | Ephemeris, chart, forecast, AI lenses (6), TTS, entitlements, basic UI, PWA | Shipped (merged) |
| Astra Arcana Introduction (W2) | PR #1 (`0cef0bd`), PR #3 (`ca4c053c` / `e543af0`) | Natal tarot engine, ArcanaModal, deterministic signature & spreads | Shipped |
| Minor Arcana + Synastry (W3) | PR #4 (`d9afc4b` merge) incl. `56e5c35` ... `f17d42e` | 78-card deck, synastry (cross aspects, composite, Davison, synastry-tarot), frontend relationship/predictive/advanced modals | Shipped |
| Predictive + Advanced | `d39eec6`, `cd816fb` etc. (part of PR4) | Progressions, solar returns, eclipse timeline, harmonics, midpoint trees, fixed stars | Shipped |
| Production Hardening (Phases 0-6, W4) | `production-hardening` branch → `b0f3786` (PR #5 merge) | See Phase table below. Audit bracket, security gates, explainability, Deck-Art, CI, tests to 105+ | Shipped & merged |
| Fable 5 — Oracle Report + Personal Report (W5) | `fable5-oracle-report` — **closed as ONE commit 2026-07-01** (hash: `git log -1` on the branch) | Oracle Report (Claude Fable 5 paid tier: `/api/oracle-report`, oracle minting via `AAE_ORACLE_MIN_WEI`, offline fallback, full ArcanaModal UI w/ provenance badges + copyable seed + 402→support); **Personal Report** — the *optional, separately purchasable, post-Oracle deluxe compiled edition* (`/api/personal-report`, seed-verified session gate 409, prompt privacy w/ placeholders, 11-part PDF-ready markdown, offline compiled fallback, frontend compile/preview/download affordance); docs sync (README API+config+cost note, CHANGELOG, `.env.example` incl. rotation note); tracking artifacts | **Complete** (124 tests, 32 routes). Open follow-ups → schedule §0.1: PDF renderer, separate purchase rail (operator decision), audio companion, rate limiting (R1), sigil pipeline |

**Git Graph Snapshot (top of history):**
```
*   b0f3786 (HEAD -> fable5-oracle-report, main) Merge PR #5 production-hardening
|\
| * 9d46133 Phase 6: regression audit + README
| * 9378fc6 Phase 5: endpoint coverage + CI
| * d7924a0 Phase 4: Deck-Art Prompt Studio
...
*   d9afc4b Merge PR #4 minor-arcana-and-synastry
...
* b1bdd5f Initial commit
```

---

## 2. Production Hardening Phase Map (Phases 0–6)

Phases executed on `production-hardening` branch and merged.

| Phase | Title | Key Deliverables | Tests Added / Changes | Audit Notes |
|-------|-------|------------------|-----------------------|-------------|
| Phase 0 | Audit Baseline | `AUDIT_BASELINE.md`, topology map, seam identification (esp. synastry draft), orphan sweep, confirmed findings (trust mode, real PII, arcana-lens contract, server-clock dates) | Baseline 36 tests | Identified risks at AI-authorship seams and perimeter |
| Phase 1 | Critical security & correctness (1.1–1.6) | Trust-mode dual gate + `assert_safe_boot()`, real birth data → Einstein + synthetic default, arcana-lens contract resolution (separate `/api/tarot-reading`), local date/timezone control + `resolve_local_date`, exactly-N daily cards, security headers + `_spawn` + constant-time dev token | `test_entitlements.py`, `test_security.py`, `test_lens_contract.py`, `test_timezone_seed.py`, `test_daily_forecast.py` | Fail-before/pass-after tests for each gate |
| Phase 2 | Explainability & sourcing | `weight_sources` (sum-to-weight invariant), `SourceSystem` (golden_dawn/rws/thoth/jungian) in seed + prose/prompts | `test_explainability.py` | Panel and seed can never disagree |
| Phase 3 | Learning paths & temporal | `POST /api/learning-path`, `POST /api/arcana-calendar` (RFC 5545 .ics, local dates), frontend integration | `test_learning_path.py`, `test_arcana_calendar.py` | Deterministic path from anchor → growth edge |
| Phase 4 | Deck-Art Prompt Studio | `deck_art.py`, `/api/deck-art`, deterministic prompts from substrate + lineage, Studio tab updates | `test_deck_art.py` (12 tests) | Prompts only — no image gen |
| Phase 5 | Test & CI hardening | `test_api_endpoints.py` (behavioral contracts, tier gates, offline honesty), `.github/workflows/ci.yml` (pytest + boot smoke + prod guard + full Gitleaks), Dependabot | 15+ new endpoint tests; total ~105 at close | Fix: unparseable date now 400 |
| Phase 6 | Regression audit + docs | `AUDIT_REGRESSION.md` (control-by-control verdicts — no regressions), consolidated README, CI badge | Audit bracket closed | Re-inspected boundaries; git history PII residual logged |

**Definition of Done (from FABLE5_HANDOFF / audits):** No swallowed errors; no hardcoded secrets; no IDOR; no orphans; determinism intact; disclaimer on every response; CI green.

---

## 3. Core Feature Implementation Status (Cross-Referenced)

**Deterministic Core (AI-free, always available):**
- Natal chart, transits, forecast (Moon sub-steps, exactly-N), patterns, 8 house systems, tropical + sidereal — Complete
- Astra Arcana: signature, weighted seeded draws (SHA-256), source systems, explainability, learning paths, transit cards, deck-art prompts, .ics calendar — Complete (Phases 2-4)
- Predictive & Advanced: progressions, solar returns, eclipses, harmonics, midpoints, fixed stars, synastry/composite/Davison + synastry-tarot — Complete

**AI / Enrichment Layers (tier-gated, removable):**
- 6 lenses + SSE streaming + offline fallback — Complete
- Arcana AI enrichment (supporter/oracle) — Complete
- **Oracle Report (Fable 5)** — Backend + tests complete on current branch; UI not yet wired

**Entitlements & Monetization:**
- Stateless HMAC tokens, `mint`/`verify`, dev token (constant-time)
- On-chain verify (EVM), trust-mode (strictly dev + explicit)
- **Oracle tier minting** (`AAE_ORACLE_MIN_WEI` + verified only) — Added on fable5 branch
- Premium features list — Complete

**Frontend:**
- ChartWheel (5 SVG layers + popovers), TransitSlider, ForecastPanel (search/bookmark/export), ArcanaModal (tabs: natal/draw/transit/classroom/studio + deck-art)
- Modals: Relationship, Predictive, Advanced, Support, Admin (telemetry), Ceremony, SoulProfile, Glossary
- **OracleModal.tsx** = numerology + sigils (separate from Oracle Report)
- Zustand store, PWA — Complete
- **Oracle Report integration** — **Complete (F5-1, 2026-07-01):** Draw-tab block →
  `loadOracleReport()`; `Interpretation` accordion reused from DetailPanel (exported;
  `###` subsections now styled); actual-model / offline badges; copyable seed;
  lineage + disclaimer; typed `ApiError` 402 → Support flow; speak/copy/regenerate;
  telemetry (`oracle_report`, `oracle_report_gated`); state reset on chart change.
  Verified via build + 116 tests + 3-tier TestClient smoke.

**Infrastructure & Quality:**
- CI: pytest + frontend build + boot smoke + prod boot guard + Gitleaks (full history)
- Tests: 116 passing, many behavioral + invariant + security
- Security headers, `_spawn`, input validation, privacy banner
- `.env` gitignored; `.env.example` maintained

**Unimplemented / Partial (from plans):**
- Many items in `IMPLEMENTATION_SCHEDULE.md` (API v1, structured logs, rate limiting, Redis, containers, Web Workers, virtualization, WebGL, i18n, accounts, etc.)
- Full data-driven tarot meanings (F5 note in schedule)
- Oracle Report full UI (current gap)
- Oracle Report in README / consolidated docs

---

## 4. Branch & Artifact Map

- `main`: Stable baseline (post-PR #5)
- `production-hardening`: Hardening phases (merged)
- `fable5-oracle-report`: Current work (Oracle Report backend complete; frontend partial; uncommitted files listed below)
- Planning artifacts (untracked or root-level in working tree):
  - `FABLE5_HANDOFF.md`, `Hand_off.md`, `IMPLEMENTATION_SCHEDULE.md`, `ASTRA_ARCANA_PLAN.md`
  - `AUDIT_BASELINE.md`, `AUDIT_REGRESSION.md`, `CHANGELOG.md`
- Key generated: `docs/screenshots/` (17 UI captures), `backend/data/telemetry.db`, ephe/*.se1

**Uncommitted on fable5-oracle-report (as of review):**
- Modified: `backend/.env.example`, `entitlements.py`, `main.py`, `requirements.txt`, `tarot_models.py`, `frontend/src/api/client.ts`, `frontend/src/components/ArcanaModal.tsx`
- New/untracked: `FABLE5_HANDOFF.md`, `Hand_off.md`, `IMPLEMENTATION_SCHEDULE.md`, `backend/oracle_report.py`, `backend/tests/test_oracle_report.py`

---

## 5. Audit Brackets (Security & Correctness)

- **Opened:** `AUDIT_BASELINE.md` (Phase 0) — before any hardening changes.
- **Closed:** `AUDIT_REGRESSION.md` (Phase 6) — control verdicts, boundary re-inspection, DoD rubric, open items (git history purge deferred).
- Ongoing practice: Re-audit on any security-sensitive change (entitlements, tier gates, seeding, new paid endpoints).

**Tracked Residuals:**
- Git history contains pre-Phase 1.2 real birth data (mitigation: working tree clean; interim: keep repo private if concerned). **F5-6 decision 2026-07-01: Option A stands (leave + audit note)** — no explicit purge go-ahead given; revisit before making the repo public.
- New paid surfaces (`/api/oracle-report`, `/api/personal-report`) have no rate limiting yet — R1 pulled forward in the schedule before wide traffic.

---

## 6. How to Maintain This Map (for Future Tracking)

1. After any significant work (phase, PR, major feature):
   - Append a row to the Timeline table.
   - Update the Phase or Feature Status tables.
   - Record test count, route count, and key commit hashes.
   - Update "Current Snapshot" and "Last Updated".
2. Run these commands and paste key output:
   ```bash
   git log --oneline --graph --decorate --all -30
   cd backend && .venv/bin/python -m pytest -q
   cd frontend && npm run build
   python -c "import main; print(len([r for r in main.app.routes if r.path.startswith('/api')]))"
   git status --porcelain -b
   ```
3. Reference source-of-truth docs: `CHANGELOG.md` (per-phase), `AUDIT_*` (security brackets), `README.md` (user-facing).
4. When closing a branch (e.g. fable5-oracle-report), add a "Branch Closed" entry with merge commit.
5. Keep the two invariants visible: deterministic core + disclaimer on data.

**Update cadence recommendation:** After every merged PR + at start/end of any focused session.

---

## 7. Snapshot Commands for Quick Status

```bash
# Project health
cd backend && .venv/bin/python -m pytest -q && echo "BACKEND OK"
cd ../frontend && npm run build && echo "FRONTEND OK"

# Feature surface
python -c "
import os, main
os.environ.setdefault('AAE_ENV', 'test')
print('Routes:', len([r.path for r in main.app.routes if str(r.path).startswith('/api')]))
print('Oracle report present:', any('oracle-report' in str(r.path) for r in main.app.routes))
"

# History view
git log --oneline -10
git branch -vv
```

**End of Map.** This document + git + CHANGELOG + audits = complete progress record.

---
*Generated from local filesystem review on 2026-07-01. Keep this file at repo root for discoverability.*
