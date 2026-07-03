# Astra Arcana Codebase Review Report
**Date:** 2026-07-01  
**Reviewer:** Grok (via tools + static/dynamic analysis)  
**Scope:** Full workspace review for errors, bugs, broken functions, and broken connections. Focused on runtime, type, integration, logic, and design-vs-code mismatches.  
**Status:** Core functionality is stable. 134 backend tests passing. Frontend builds cleanly. No crashing bugs in exercised paths. However, several incompletenesses and design/code divergences exist, especially around the recently-added Personal Report feature.

## Executive Summary
- **No critical runtime crashes** or failing tests.
- **Strong core**: Oracle Report, entitlements, tier gating (402), seed determinism, offline fallbacks all work as designed.
- **Main issues**: 
  - "Personal Report" (the optional separate deluxe product) has backend + frontend scaffolding and post-Oracle seed verification, but **lacks the "must be purchased separately" enforcement**.
  - Heavy use of private (`_`) functions creates fragility.
  - PDF generation is client-side print/markdown only (design calls for full research-paper renderer).
  - Some observability / rate-limit / purchase flow gaps.
- **Broken connections**: Design/docs/prompts claim full "separate post-Oracle product" with purchase rail; code implements it as "free for oracle-tier users who have a valid oracle result".
- **Recommendations**: Add explicit purchase token gating, harden private API usage, implement server PDF pipeline, expand telemetry.

All findings below are categorized. "Broken" = non-functional or mismatched vs spec/requirements.

## 1. Passing / Healthy Areas
- Backend: `pytest` → **134 passed**.
- Frontend: `npm run build` → success (only chunk-size warning).
- `main.py` import + route registration: 32 `/api/*` routes, including `/api/oracle-report` and `/api/personal-report`.
- Oracle Report flow: 402 for non-oracle, honest `ai_source`, offline fallback, seed reproducibility, tier checks — all verified.
- Personal Report: `test_personal_report.py` → **8 passed**. `generate_personal_report` succeeds with offline path, seed verification (409 path) works, substrate builds.
- Entitlements + `paid_tier`: oracle minting logic, 402 gates, constant-time compares — solid.
- Ratelimit (`ratelimit.py`): in-process sliding window applied to paid paths (`RL.check` in main).
- Frontend Oracle/Personal wiring in `ArcanaModal.tsx`: state management, `loadOracleReport`/`loadPersonalReport`, 402 → Support flow, print/markdown download, narration hooks.
- Privacy: birth data never sent to AI prompts (placeholders used).
- Determinism: `_default_seed` used consistently for verification.

## 2. Critical / High-Severity Issues (Design vs Implementation Mismatches)

### 2.1 Personal Report "Separate Purchase" Not Implemented
**Severity:** High (directly contradicts user requirement + design spec).

- **User spec**: "optional product that must be purchased separately after they have produced output from the oracle".
- **Design** (`docs/design/ASTRO_ARCANA_PERSONAL_REPORT_DESIGN.md`): Explicit "separate payment flow (or one-time report token)", "purchase/ generation option must only be offered after successful `/api/oracle-report`". Two-factor gate (tier + purchase).
- **Current code**:
  - Backend (`main.py:558`, `personal_report.py`): Only checks `tier == "oracle"` (402) + `verify_oracle_session` (409 on seed mismatch). No purchase token/product SKU.
  - Frontend (`client.ts:541`, `ArcanaModal.tsx:219`): `fetchPersonalReport` callable immediately after `oracle` state exists. Button "✦ Compile Personal Report" appears with no purchase step. Directly calls backend.
  - No distinct "personal_report" payment (unlike `donate/verify` for tier).
  - History maps / README / prompts claim it is "complete" with "separate purchase rail".
- **Impact**: Oracle-tier users get the "deluxe" for free after one Oracle call. Breaks the intended monetization (separate from oracle tier).
- **Broken connection**: Design/docs ↔ actual endpoint/UI gating.
- **Evidence**: `loadPersonalReport` has no pre-check for report token; `PersonalReportRequest` has no purchase field.

**Fix suggestion**: Extend entitlements or add a report-specific token (e.g., one-time use minted on successful separate payment). UI should show "Purchase Deluxe Edition" that triggers payment → then enable compile.

### 2.2 Private/Internal API Usage (Fragile)
**Severity:** Medium-High (maintainability / future breakage).

- `personal_report.py:39`: `from oracle_report import _call_fable`
- `personal_report.py:130` + `tarot.py:444`: `TAROT._default_seed(...)` (private).
- `build_personal_substrate` re-uses private oracle internals.
- **Risk**: Any refactor of oracle/tarot seed logic breaks Personal Report.
- **Also seen in**: Client-side `chaosLetters` (ok, exported), but server side relies on underscore.

### 2.3 Incomplete PDF / Research-Paper Renderer
**Severity:** Medium (core product deliverable incomplete).

- Design specifies full research-paper PDF (precise layouts, images, sigils, 24-36 pages, WeasyPrint recommended).
- Reality:
  - Server returns `report_markdown` (11-part structure).
  - Client: `printReport.ts` (browser `window.open` + injected CSS + client-side `sigilSvg` for `{{SIGIL}}` + `{{BIRTH_INFO}}` placeholders filled locally — good privacy).
  - `downloadMarkdown`, preview in `<details>` accordion in ArcanaModal (crude split on `# `).
  - No server-side PDF (no WeasyPrint, reportlab, etc. in deps or code).
  - `lib/printReport.ts` handles basic, but not full typography/grid from design mock.
- **Broken connection**: `docs/prompts/FABLE5_PERSONAL_REPORT_PROMPT.md` + design → actual output is markdown + browser print, not polished PDF.
- Audio companion hooks exist but rely on `speech` lib (ElevenLabs or browser).

## 3. Medium / Functional Gaps & Potential Bugs

### 3.1 Rate Limiting & Observability for Personal Report
- Applied (`RL.check(request, "oracle", ...)` for both oracle-report and personal-report).
- But docs/schedules mention it was "added", and some paths may share buckets.
- AdminPanel / telemetry: `lens="personal_report"` logged, but not confirmed surfaced in UI stats (partial per schedule).
- No dedicated rate limit test isolation visible for personal-report beyond general.

### 3.2 UI Gating / State for Post-Oracle
- `loadPersonalReport` correctly guards `if (!chart || !oracle || personalLoading)`.
- But: if page refresh after Oracle, `oracle` state lost (component state only). User must re-run Oracle to access Personal (even if they "purchased").
- Chart change resets personal/oracle state (intended, per code comment).
- No persistent "I have a valid Oracle session for this chart" indicator outside the modal.

### 3.3 Error Paths & 409/402 Handling
- Backend: Good (402 tier, 409 session mismatch, 400 generic).
- Frontend: Catches via `ApiError`? (see client post), routes 402 to Support.
- Minor: In some places `setErr(String(e))` — raw errors may leak details.
- Personal compile button shows long "this can take minutes" text even for offline.

### 3.4 Model / Data Shape Mismatches (minor)
- `PersonalReportRequest` in frontend sends `oracle: {..., generated_at, ...}` — matches `OracleSessionRef`.
- `report_markdown` vs old `report` — handled.
- In substrate build (personal_report.py), it re-calls oracle paths — good reuse, but adds latency.

### 3.5 Other Code Smells / Minor Bugs
- Long module-level string `PERSONAL_REPORT_SYSTEM` in `personal_report.py` (hard to maintain; ~200 lines of prompt).
- `ratelimit.py`: In-process only (by design; ok for now). Memory bound at 10k keys.
- Synastry: Still has `# TODO (optional)` at top (non-blocking per handoff).
- Frontend bundle: >500kB chunk warning (performance).
- No dedicated endpoint tests exercising the full "genuine Oracle → Personal" happy path beyond unit (the 8 tests are good but limited).
- In `verify_oracle_session`: Assumes `o.date` can be None for non-daily; logic matches `_default_seed`.
- `generate_personal_report` calls `build_report_substrate` (from oracle) — re-does work already done in original Oracle call.

### 3.6 Missing "Separate Purchase" Flow Elements
- No new product type in `donate/verify` or entitlements for "personal_report".
- No UI purchase step (SupportModal or dedicated).
- Telemetry has `personal_report` event, but purchase would need separate tracking.
- `AAE_ORACLE_MIN_WEI` etc. only for tier, not this add-on.

## 4. Recommendations
1. **Implement purchase gating** for Personal Report: Add report-specific token (mint on extra payment), check in `personal_report` endpoint + UI (disable button until purchased).
2. **Export the seed/verify logic** from `tarot.py` (make `_default_seed` public or add `verify_oracle_session` helper) to stop private imports.
3. **Add server PDF generation**: Use the design + markdown + printReport logic in a dedicated renderer (WeasyPrint or similar). Return PDF bytes or hosted URL.
4. **Persist Oracle sessions** lightly (or rely on seed proof + user re-sends the oracle object).
5. Expand tests: Full E2E (Oracle success → Personal request with valid seed).
6. Surface personal_report in AdminPanel telemetry explicitly.
7. Consider moving long Fable prompts to external files or templates.

## 5. Summary of Broken Functions / Connections
- **Broken connection**: Design ("must purchase separately") ↔ Code (direct compile for oracle users).
- **Fragile functions**: `personal_report.verify_oracle_session`, `generate_personal_report` (private `_` deps).
- **Incomplete function**: Full PDF output (only markdown + client print).
- **UI flow gap**: No purchase rail between `fetchOracleReport` success and `fetchPersonalReport`.
- No other crashing broken functions found in core paths.

**Overall health**: Good for a complex symbolic app. The issues are mostly around the new "deluxe post-Oracle product" being partially implemented relative to the clarified requirements and detailed design docs.

Report generated from live inspection (tests, imports, routes, source, runtime calls). All exercised flows succeeded. Fix the gating and renderer for full alignment. 

(End of report. Suggested: Write this to disk and track in `docs/progress/COMPREHENSIVE_TASK_SCHEDULE.md` under follow-ups.)