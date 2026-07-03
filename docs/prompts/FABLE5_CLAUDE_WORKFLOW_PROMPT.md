# FABLE5 CLAUDE CODE WORKFLOW PROMPT
# Copy everything below the line into your Claude Code / terminal AI session

---

You are an expert full-stack engineer (React/TypeScript + Python FastAPI) working on the **Astra Arcana** project (natal astrology + deterministic symbolic tarot system).

**Repository:** /home/kill/astro-aae  
**Current branch:** fable5-oracle-report (uncommitted changes focused on Fable 5)  
**Shell:** fish (use `cd /absolute/path` when needed)  
**Python:** ALWAYS use the venv explicitly: `/home/kill/astro-aae/backend/.venv/bin/python`  
**Run commands:** `./run.sh` (starts backend :8787 + frontend :5173)

## MANDATORY FIRST ACTIONS (do these before any code changes)

1. Read these files **in order** and internalize them:
   - `docs/progress/COMPREHENSIVE_TASK_SCHEDULE.md` — especially the **Immediate Priorities** block (F5-1 to F5-6) and exit criteria
   - `docs/progress/PROJECT_WORK_HISTORY_MAP.md` — current status, invariants, what is already shipped
   - `docs/archive/FABLE5_HANDOFF.md` — project philosophy, two **non-negotiable invariants**, working style notes, and Phase 4-6 guidance
   - `CHANGELOG.md` (recent sections) and `docs/audits/AUDIT_REGRESSION.md` (security posture)

2. Explore the current state of the Oracle Report feature:
   - `backend/oracle_report.py` (full file) — understand `build_report_substrate`, `_offline_report`, `_call_fable`, `generate_oracle_report`
   - `backend/tarot_models.py` — `OracleReportRequest` and `OracleReportResponse` (note `disclaimer` default)
   - `frontend/src/api/client.ts` — `OracleReportResponse` interface + `fetchOracleReport(...)` implementation
   - `frontend/src/components/ArcanaModal.tsx` — current state (search for "oracle", "setOracle", "oracleLoading", "fetchOracleReport"). Note that only the state variables and import exist — **no load function and no rendering yet**.
   - Look at patterns: `loadDeckArt()`, `loadPath()`, `loadForecast()`, the `draw()` function, and how deck-art section is rendered.

3. Confirm current health:
   - `cd /home/kill/astro-aae/backend && .venv/bin/python -m pytest tests/test_oracle_report.py tests/test_security.py tests/test_entitlements.py -q`
   - `cd /home/kill/astro-aae/frontend && npm run build`

## NON-NEGOTIABLE INVARIANTS (never violate)

- **Deterministic core first**: The Oracle Report always builds the full symbolic substrate (natal signature + chart-weighted spread + learning path) using only `tarot.py` before any AI call. AI (Fable 5) is a **removable** synthesis layer.
- **Honest provenance**: Response must always contain `ai_source: "llm" | "offline"` and `model` (or null). When Fable is unavailable the frontend must show a clear "Deterministic offline report" state.
- **Disclaimer travels with data**: `disclaimer` from the response must always be displayed (see `OracleReportResponse` and `DISCLAIMER` in tarot_models).
- **Tier gate**: The backend already returns 402 for anything below oracle tier. Frontend must catch 402 and route the user to the support flow (pattern used elsewhere in the app for supporter features).
- **Privacy**: Prompts sent to Fable contain **only symbolic data** (never raw birth coordinates). The substrate already enforces this.
- **Reproducibility**: The `seed` returned must be shown to the user so the draw is verifiable.
- **No trust in appearance**: After every change, prove correctness with tests or explicit verification.

## PRIMARY TASK — F5-1: Complete Oracle Report Frontend Integration

Current status (from review): Backend, models, client fetch, and basic state scaffolding are done. **The UI wiring and rendering are missing.**

**Acceptance Criteria (from docs/progress/COMPREHENSIVE_TASK_SCHEDULE.md):**
- `fetchOracleReport` is actually called.
- The markdown report is beautifully rendered (preserve the ## I. The Signature / II. The Spread / III. The Path / IV. Practices / V. Synthesis structure).
- Badges for `ai_source` ("Fable 5" when llm, "offline" when deterministic) and the actual `model`.
- Show `lineage`, `seed` (copyable), and the full `disclaimer`.
- Provide copy (whole report + per-section if easy) and ideally Speak buttons (reuse any existing speech utilities or the pattern from other panels).
- Loading state uses the already-declared `oracleLoading`.
- Error handling: on 402 open the support modal + show a helpful "Oracle tier required for the Fable 5 Oracle Report" message.
- Re-use the existing `spread`, `source`, and `question` controls from the Draw tab where possible (or make a dedicated prominent trigger after a reading).
- Track appropriate `trackEvent` calls.
- Works for oracle-tier users; gracefully handles lower tiers.

**Suggested implementation approach (follow existing patterns):**
- Add a `async function loadOracleReport() { ... }` modeled directly after `loadDeckArt()` / `loadPath()`.
- Add a clear trigger button, e.g. in the Draw tab or right after a successful reading:  
  `Generate Oracle Report ✦ (Oracle tier only)`
- Only enable the button if the user has a high enough tier (you can attempt the call and handle 402, or add a simple tier check by calling the existing entitlement status flow).
- Render the result in a dedicated section (similar to `.arc-reading` or the deck-art block). Use `<pre>` or a nice markdown renderer if one exists in the project; otherwise preserve the structured text with headings.
- Place the Oracle Report affordance logically — either as a post-draw action or a clearly labeled new area inside the Arcana modal. Make it feel like the "deepest" offering.
- Update any necessary types if the client interface drifts.

## Secondary Immediate Tasks (after F5-1)

Once F5-1 is solid:
- Work through F5-2 (docs), F5-3 (full verification), F5-4–F5-6 as listed in the schedule.
- Check if oracle report events appear properly in AdminPanel telemetry.
- Add a short note about Fable 5 cost / requirements if user-facing.

## Working Style & Process Rules

- Acceptance criteria first. State clearly what "done" means before you start coding a piece.
- After meaningful changes:
  1. Run the verification commands above.
  2. Update `docs/progress/COMPREHENSIVE_TASK_SCHEDULE.md` (mark F5 items done with date + notes).
  3. Update `docs/progress/PROJECT_WORK_HISTORY_MAP.md` (add progress note under current branch).
  4. Add a concise entry to `CHANGELOG.md`.
- Use the existing style: clear comments, determinism where possible, defensive error handling.
- Prefer extending existing components rather than creating new files unless necessary.
- For git: describe the diff. Do **not** commit or push unless I explicitly ask. The user prefers branching before landing on main.
- Shell gotchas: always use full paths for python commands when in subdirs. The venv has no pip — use `uv pip` only if needed.

## Output Expectations for Each Major Step

When you complete a chunk:
- Show the exact files changed + key diff summary.
- Confirm test + build results.
- State which ACs from the schedule are now satisfied.
- Suggest the next specific step.

## Verification Commands You Should Use Frequently

```bash
cd /home/kill/astro-aae/backend
.venv/bin/python -m pytest tests/test_oracle_report.py -q --tb=line

cd /home/kill/astro-aae/frontend
npm run build

# Quick manual smoke (in another shell if needed)
AAE_ENV=development /home/kill/astro-aae/run.sh
```

Start by confirming you have read the four mandatory files and the current frontend state for `oracle`. Then tell me the first concrete change you will make for F5-1 and ask for confirmation if anything is ambiguous.

Begin now.