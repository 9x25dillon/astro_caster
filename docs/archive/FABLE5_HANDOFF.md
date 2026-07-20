> **Archived.** This mid-flight handoff (2026-07-01, production hardening phases 0-3) was completed and closed out; the current session handoff is [`docs/progress/Hand_off.md`](../progress/Hand_off.md). Kept for historical reference.

# Astra Arcana — Handoff for Fable 5 (Production Hardening, mid-flight)

_Written 2026-07-01, end of an Opus 4.8 session. You are picking up a **partially
completed** Production Hardening & Symbolic Intelligence Expansion build. Phases 0–3
are done and verified; Phases 4–6 remain. Nothing is committed — all work is in the
working tree on `main`._

---

## 0. What this project is

Astra Arcana is a symbolic-intelligence system: a deterministic, offline-first,
AI-free tarot engine (`backend/tarot.py`) layered over a natal-astrology app
(FastAPI backend + React/Vite/Zustand frontend). Two invariants are **non-negotiable**
and must survive every change:

1. **The deterministic core stays AI-free.** AI enrichment is a removable outer layer;
   the offline engine produces identical output for identical seeds with the network
   unplugged.
2. **The safety disclaimer travels with the data, not the UI.** `DISCLAIMER` in
   `tarot_models.py` is a field on every response object. It must remain on every
   response you add or modify. (As of Phase 3 it also rides the `.ics` body.)

Operating principle: **do not trust the appearance of correctness.** Trace every
execution path and data flow to its resolution; prove correctness with a test that
would have failed before the fix. Treat this as an AI-generated codebase — the
perimeter (endpoints, entitlements, the "grok-engineered" synastry draft) is where
contracts were assumed rather than honored.

---

## 1. Current state (verified at handoff)

- **Branch:** `main`. Session started clean at commit `d9afc4b`. **All Phase 0–3
  work is uncommitted in the working tree.** (See §6 for the commit decision.)
- **Backend tests:** `78 passed` (was 36 at baseline). Run from `backend/`:
  `.venv/bin/python -m pytest -q`
- **Frontend:** `npm run build` clean (tsc + vite). Run from `frontend/`.
- **Boot:** `AAE_ENV=development .venv/bin/python -c "import main"` → 33 routes.
- **Remote:** `github.com/9x25dillon/astro_caster`.

### Deliverables already produced
- `docs/audits/AUDIT_BASELINE.md` (Phase 0 topology map, AI-authorship markers, orphan sweep,
  confirmed findings at audit severity). **Read this first** — it's the map.
- `CHANGELOG.md` (per-phase log of exactly what changed and why). **Read this second.**
- 8 new backend test modules + `backend/tests/conftest.py`.
- `backend/arcana_calendar.py` (RFC 5545 .ics writer).

---

## 2. What's DONE (Phases 0–3) — do not redo, but honor the decisions

**Phase 1 (Critical gate) — all six landed, each with fail-before/pass-after tests:**
- **1.1** Trust-mode entitlement bypass closed. Trust mode now requires explicit
  `AAE_TRUST_MODE` **and** non-prod `AAE_ENV`; fails closed. `entitlements.assert_safe_boot()`
  refuses to boot in prod with trust mode on or an unset/blank/default `AAE_SECRET`
  (called at `main.py` import). `run.sh` sets `AAE_ENV=development`.
- **1.2** Real birth data purged from working tree → **Einstein** (1879-03-14, Ulm
  `48.4011,9.9876,tz 0.67`) in tests; synthetic Y2K/Greenwich frontend default.
  ⚠️ Data **still in git history** — see §6.
- **1.3** Arcana-lens contract resolved. **DECISION: Arcana is a SEPARATE endpoint
  (`/api/tarot-reading`), NOT a lens.** Removed the phantom `_LENS_GUIDANCE["arcana"]`.
  **Do not re-add "arcana" to `_LENS_GUIDANCE` or `AIRequest.lens`** — a test
  (`test_lens_contract.py`) locks the 6-lens union == guidance keys.
- **1.4** Timezone/start-date control. `TarotReadingRequest.date`,
  `ArcanaForecastRequest.{start_date,timezone}`. `tarot.resolve_local_date()`.
- **1.5** Daily cards always daily — gap days get a deterministic natal-weighted
  "quiet sky / integration day" trump. N days → exactly N cards.
- **1.6** Security headers middleware, logged (non-swallowed) background tasks
  (`_spawn`), constant-time dev-token (`ENT.check_dev_token`).

**Phase 2 — Explainability & sourcing:**
- Every card carries `weight_sources` explaining *why* it was drawn, **derived from the
  actual draw weights** (a major's sources sum to its draw weight — enforced by test;
  if the panel and seed ever disagree that's a correctness bug).
- `SourceSystem` = `golden_dawn` (default) / `rws` / `thoth` / `jungian`, threaded into
  the determinism seed AND interpretation.

**Phase 3 — Learning paths & .ics:**
- `POST /api/learning-path` — deterministic archetypal sequence (anchor → growth edge).
- `POST /api/arcana-calendar` — RFC 5545 .ics export, local dates, stable UIDs.

### The determinism seed (memorize this)
`tarot._default_seed` is now a pure function of
**(natal signature, resolved local date [daily only], spread, question, source system)**.
The default source (`golden_dawn`) and an unset local date contribute nothing to the
seed string, so **pre-existing seeds stay reproducible**. Any new seed input you add
MUST default to a no-op to preserve this.

---

## 3. What's LEFT — your work (Phases 4–6)

### Phase 4 — Deck-Art Prompt Studio
Generate image prompts (prompt generation ONLY — no image generation in-engine) from
the querent's natal archetypes, house themes, and per-card symbolism, composed from the
same symbolic substrate the engine already models (`tarot_data.py`, the natal signature,
`HOUSE_THEMES`, per-card `keywords`/`astrology`/`element`). A given
`chart + card + source system` must yield a **stable, characterful** prompt (deterministic).
- There is already a **"Studio" tab** in `ArcanaModal.tsx` and offline generators in
  `frontend/src/lib/tarotCopy.ts` (`EXPRESSION_KINDS`, `generateArtifact`). Check whether
  deck-art belongs there or as a new backend endpoint (recommend backend for determinism
  + testability, mirroring the other arcana endpoints).
- Thread `source` into the prompt so lineage shapes the imagery. Add a test asserting
  determinism per (chart, card, source).

### Phase 5 — Test & CI hardening
- **5.1** FastAPI `TestClient` endpoint tests: `/api/natal-arcana`, `/api/tarot-reading`,
  `/api/arcana-forecast`, entitlement behavior across tiers (free/supporter/oracle),
  bad-spread validation, the no-event forecast fallback. **The trust-mode gate is already
  covered** (`test_entitlements.py`), and `test_security.py`/`test_arcana_calendar.py`
  already use `TestClient` — extend, don't duplicate.
- **5.2** Behavioral coverage, not presence-checking. Don't accept tests that only assert
  a function runs.
- **5.3** GitHub Actions CI: `pytest` (backend) + `tsc -b && vite build` (frontend) on
  every PR. Optionally wire Gitleaks/TruffleHog + a CVE check (Dependabot/Snyk).
  **Note:** CI must set `AAE_ENV` (e.g. `test`) or the backend refuses to boot — but
  `conftest.py` already sets `AAE_ENV=test` for pytest collection, so `pytest` is fine;
  it's any *app-boot* step in CI that needs the env var.

### Phase 6 — Regression audit (closing gate)
- Produce **`docs/audits/AUDIT_REGRESSION.md`**: review every security-sensitive diff (trust-mode
  gate, entitlement checks, input validation, seeding) for silently-weakened controls;
  confirm token validation is complete (signature + expiry checked — see
  `entitlements.verify_token`); re-inspect the producer/consumer boundaries flagged in
  `docs/audits/AUDIT_BASELINE.md` §3 now that types changed.
- **Consolidated README update** (deliverable): arcana-lens decision, the new request
  fields (`date`/`start_date`/`timezone`/`source`), source-system selection, calendar
  export, CI status badge. (README was only minimally touched in 1.3; the full pass is
  owed here.)

### Definition of Done (the rubric — this is your acceptance criteria)
No swallowed async errors; no hardcoded secrets; resource-level authz server-side (no
IDOR — note: current model is stateless bearer entitlements with no per-user owned
resources, so re-confirm if you add any); no orphan state; every dependency real/CVE-clean;
complexity ceilings (flag cyclomatic >10 / cognitive >15); behavioral coverage on new
code; **determinism intact** (identical inputs → identical draws, offline); disclaimer on
every response; CI green (`pytest` + `tsc -b && vite build` on clean checkout).

---

## 4. How to run / test (environment gotchas — READ THESE)

```bash
./run.sh          # backend :8787 + frontend :5173 (sets AAE_ENV=development)
```
- **The venv has NO `pip`** (uv-created). Install deps with:
  `cd backend && VIRTUAL_ENV=.venv uv pip install -r requirements.txt`
- **Run tests / python** via the venv python explicitly:
  `cd backend && .venv/bin/python -m pytest -q`
- **Shell is `fish`.** Use `bash -c '...'` for loops/conditionals. The Bash-tool working
  directory persists between calls and can drift — always `cd` to an absolute path first
  (I got bitten by a `frontend`→`backend` drift mid-session).
- **Boot guard:** `main.py` calls `ENT.assert_safe_boot()` at import. With no `AAE_ENV`
  set it treats the environment as **production** (fail-closed) and, with the default
  secret, **refuses to import**. Always run app/boot steps with `AAE_ENV=development`
  (or `test`). `backend/.env` currently supplies a real `AAE_SECRET`, and `conftest.py`
  sets `AAE_ENV=test` for pytest — so tests and `run.sh` work as-is.
- Frontend: `cd frontend && npm run build` (typecheck + build) or `npm run dev`.

---

## 5. Known gotchas carried from project memory
- **Base-URL bug** and **oracle token budget** — see project memory `project_aae_state.md`
  before touching AI/oracle paths (`backend/ai.py`). Frontend API base is `/api` (relative;
  Vite proxy in dev, same-origin in prod).
- `verify_ai.py` is a standalone diagnostic script with no live callers (intentional, not
  dead — leave it, don't wire it into CI).

---

## 6. Open operator decisions (ASK THE USER — do not act unilaterally)
1. **Git-history purge:** the real birth data (values redacted from this doc 2026-07-20) is scrubbed
   from the working tree but **remains in git history** (commits `b1bdd5f`→). Full removal
   needs a destructive rewrite (`git filter-repo`/BFG + force-push). **Deferred pending an
   explicit go/no-go.** Log the outcome in `docs/audits/AUDIT_REGRESSION.md`.
2. **Commit/branch strategy:** everything is uncommitted on `main`. The user's PR workflow
   is: **branch before committing to `main`**, then open a PR. Confirm branch name /
   whether to split Phases 1–3 into logical commits before you add Phase 4+.

---

## 7. Working-style notes (from the user, make the session faster)
- Give **acceptance criteria up front**; "done = tests green + PR merged" style.
- State the **disposition of ambiguous files explicitly** (commit vs restore vs ignore).
- The user is comfortable with **batched multi-step requests**.
- End git commit messages with the required `Co-Authored-By` trailer; branch before
  committing to `main`; use `gh` for PRs.
- Track work with the task tools; update `CHANGELOG.md` per phase; keep the two audit
  docs (`docs/audits/AUDIT_BASELINE.md`, and the owed `docs/audits/AUDIT_REGRESSION.md`) as the audit bracket.

---

## 8. First moves when you start
1. Read `docs/audits/AUDIT_BASELINE.md` then `CHANGELOG.md` (full context in ~5 min).
2. `cd backend && .venv/bin/python -m pytest -q` → confirm `78 passed`.
3. `cd frontend && npm run build` → confirm clean.
4. Ask the user the two §6 decisions (git history, commit strategy).
5. Begin **Phase 4** (deck-art prompt studio) — extend the existing arcana substrate,
   keep it deterministic, prove it with a test, put the disclaimer on the response.
