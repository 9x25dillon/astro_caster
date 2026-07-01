# Changelog — Astra Arcana Production Hardening

Per-phase log for the Production Hardening & Symbolic Intelligence Expansion pass.
Baseline: `d9afc4b` (36 backend tests, clean frontend build).

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
  from the visual contract (`docs/Astro_Arcana_Report_Design_Mock.html`): Georgia
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
  `FABLE5_PERSONAL_REPORT_PROMPT.md`; renders against
  `docs/ASTRO_ARCANA_PERSONAL_REPORT_DESIGN.md`.
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

- Created `PROJECT_WORK_HISTORY_MAP.md`: comprehensive, updateable timeline of waves, branches, phases (0–6), feature status, audit brackets, and maintenance commands so progress can always be tracked from git + docs.
- Created `COMPREHENSIVE_TASK_SCHEDULE.md`: living prioritized schedule merging prior plans (`IMPLEMENTATION_SCHEDULE.md`, `ASTRA_ARCANA_PLAN.md`, `FABLE5_HANDOFF.md`), review recommendations, Fable 5 completion tasks (F5-1..F5-6), reliability (R*), foundations, and strategic backlog with explicit ACs and verification commands.
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
  `AUDIT_REGRESSION.md`.

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

- **`AUDIT_REGRESSION.md`** closes the audit bracket opened by `AUDIT_BASELINE.md`:
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
