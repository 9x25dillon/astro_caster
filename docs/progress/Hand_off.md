# Hand_off.md

_Last updated: 2026-07-20 late (session 17 CLOSED — main @ e53a8de + PR #84
green-awaiting-merge; WIP branch `metrics` parked)_

## TL;DR for next session

**A two-PR stack is open, both green, merge IN ORDER:** PR **#84**
(structured logging) then PR **#85** (metrics, stacked on #84's branch).
#85 auto-retargets to main when #84 merges and its diff simplifies to
just the metrics changes. Phase 3 per
**docs/progress/PUBLIC_LAUNCH_SCHEDULE.md**: 3.1 ✅ merged (#82),
3.2 ✅ = #84, **3.3 ✅ = #85**, then 3.5 backups, then 3.6 staging.
Narrative in WORK_JOURNAL.md session 17.

**⚠ WATCH when #85 retargets to main:** CodeQL + the two Analyze jobs do
NOT run on #85 while it targets the `structured-logging` branch — they
fire for the first time on the metrics diff once its base becomes main
(after #84 merges). The metrics code is low-risk (Prometheus label values
are escaped via `_esc` and paths are bounded to `known_paths`/`(other)`),
but confirm CodeQL is green post-retarget the way #81 taught us to.

## WORK ORDER for next session (in this order)

**0. Preconditions.** `git fetch` + `gh pr list` FIRST (the operator
merges fast, sometimes mid-work — sessions 13 and 17 both hit this).
Merge the stack in order (#84 then #85), then `git checkout main &&
git pull`, delete local `structured-logging` and `metrics`. Confirm
#85's CodeQL went green after it retargeted to main (see the WATCH note
above).

**1. Then 3.5 — backups + restore drill.** Scheduled encrypted backup of
`backend/data/*.db` + `backend/.env` (operator's machine = source of
truth; a `backend/tools/backup.py` with tar+age or openssl enc, cron/
systemd-timer instructions in DEPLOY.md), and — the exit criterion — a
RESTORE DRILL actually performed once: back up, blow away a COPY, restore
it, run `dev.py smoke` against the restored state, log the drill in
DEPLOY.md like the §6 rotation drill.

**2. Then 3.6 — staging deploy (BLOCKED on operator).** Needs the D4 VPS
(decision ratified: single VPS + docker-compose behind Cloudflare) —
operator provisions the box + DNS; the session then: compose prod stack
up, TLS via Cloudflare, run the smoke matrix + full e2e against staging,
AND the two deferred verifications that need a live edge: external header
scan (securityheaders.com — Phase 2.5's last open box) and Prometheus
alert rules (error-rate, AI-spend, uptime) in the scraper config.

**3. Riding alongside (any session, cap permitting):**
   - **Aug 1: Anthropic cap returns** — live-verify a Fable Oracle run
     (`dev.py ai check`, then one real report; the offline compilers have
     been serving honestly meanwhile).
   - P3 plate live-verify pattern is proven (one Death plate rendered
     2026-07-19, gpt-image-1, quality=low) — nothing pending unless the
     operator wants more plates.
   - PB1 book compiler (Typst evaluation) waits on the Phase-0 tome
     verdict, which waits on the operator's Lulu order.
   - D1 repo cut: operator-level decision, do NOT execute mid-session.

## Session-17 technical facts you will need

- **API is versioned now**: `API_BASE = "/api/v1"` in client.ts (exported
  — AdminPanel imports it); backend `_VersionPrefixRewrite` (pure ASGI)
  serves every route under both /api/v1/* and bare /api/* (skew
  tolerance for cached PWA shells); /api/v2 404s. e2e specs may NOT use
  exact-path globs like `**/api/oracle-report` — the five that did were
  converted to `url.pathname.endsWith(...)` predicates; write new specs
  that way.
- **Logging (#84)**: `logsetup.py` + `_RequestContext` middleware.
  JSON lines when AAE_ENV=production or AAE_LOG_JSON=1 (\"0\" forces off).
  Request id: contextvar, X-Request-ID echoed, well-formed inbound ids
  honored. **uvicorn's access log is silenced ON PURPOSE** — measured:
  it logs from outside the request's async context so the contextvar is
  invisible to it; OUR access line (logger `aae.access`) carries rid,
  method, path (QUERY STRING STRIPPED — `?entitlement=` must never reach
  logs), status, dur_ms. Privacy is a test:
  `test_structured_logging.py::test_no_birth_data_reaches_the_log_stream`.
- **TTS (#81)**: ElevenLabs transport blips retry once then serve the
  cached voice list; `voice_id` is allowlist-validated (base62 8-64) +
  URL-quoted — CodeQL flagged the unvalidated URL interpolation as
  partial-SSRF the moment the diff touched those lines. Bad ids → 400.
- **CodeQL is a live PR gate now**: it diffs alerts against main, so
  touching a line with a pre-existing taint makes it YOUR alert. Repo
  has 4 open alerts left, all deliberate (2 masked-fingerprint prints in
  operator CLIs, 2 CDN scripts in resonarium art files) — operator may
  dismiss in the Security tab.
- **Boot guard reminder** (bit us live this session): `AAE_ENV` unset =
  production = refuses AAE_DEV_TOKEN. Throwaway uvicorn instances need
  `AAE_ENV=development` explicitly.
- **The current dev token / unlock link**: rotated 2026-07-20 (drill).
  `backend/tools/unlock.py` prints it. Any token memorized before that
  date is dead.
- Dev servers were left RUNNING at close this time (operator was using
  the app: bare `bash run.sh`, NOT personal mode — telemetry on). Kill
  :5173/:8787 before running e2e if they're stale (memory gotcha: e2e
  `reuseExistingServer` + stale vite = local-fallback answers and cache
  specs fail).
- Suite sizes at close: **265 backend / 80 e2e (×2 projects) / 30 core**
  (256 after #84 logging; +9 for #85 metrics).

---
---

_(Previous entry — session 16 close):_

**Session 16 in one line:** the public-launch schedule was ratified and
Phases 1 (Edition P) and 2 (security hardening) both landed whole.

**What Phase 2 actually closed:**
- `AAE_PERSONAL_MODE=1` grants the whole instance oracle tier with no
  tokens/limits/telemetry; `assert_safe_boot` refuses to start if personal
  mode coexists with ANY public-facing signal (prod env, any
  `AAE_TREASURY_*` chain — matched by prefix now, not a hand-enumerated
  list — `AAE_ETH_RPC`, any `AAE_STRIPE_*` key, payment thresholds).
- Prompt quarantine (`backend/promptsafe.py`), CORS pinned to `AAE_CORS`,
  nginx security headers (drift-locked across their 3 duplicated blocks
  by `test_edge_headers.py` — nginx's `add_header` inheritance breaks the
  moment a location sets its own), request size cap, CodeQL in CI.
- `/security-review` ran over the whole Phase 2 range and found one real
  gap (the treasury-signal list above, pre-fix) — fixed and regression
  tested. Everything else came back clean.
- **Secret rotation drill actually performed** (not just documented):
  `AAE_SECRET` + `AAE_DEV_TOKEN` rotated, old dev token verified dead
  against a live server, new one verified live, smoke 24/24 green. If you
  need the current unlock link: `backend/tools/unlock.py` prints it fresh
  (the one memorized from earlier sessions is now dead by design).
- D1 (git-history birth-data decision) — **working-tree half done**: 4
  files that the original Phase-1.2 purge missed (a test fixture, a tool
  docstring, two audit-doc citations) got scrubbed. **Git history itself
  still carries the real values — the actual D1 execution (fresh public
  repo cut, ratified as option (b)) is still an open operator decision,**
  not something to do mid-session.

**Known state worth carrying:**
- Both `AAE_OPENAI_API_KEY` and `AAE_ANTHROPIC_API_KEY` are now SET in
  `backend/.env` (the OpenAI key was the one still missing as of session
  15's close). **Neither was live-verified this session** — P3 plate
  live-verify and a fresh Fable run are both still open threads.
- **Anthropic usage cap was exhausted until 2026-08-01** as of session 15
  — check whether that's lifted before assuming Fable calls will 400.
- Dev servers were shut down at session close — `./run.sh` to relight.
- **Gotcha for next time a branch is merged mid-work:** if you open a
  follow-on PR on the same branch and it conflicts with main, that's
  almost always the mid-work-squash pattern (main got only part of the
  branch's commits) rather than a real logical conflict — `git merge
  origin/main`, resolve by keeping the branch's newer text, done. Don't
  reach for a rebase here; merge is the simpler read on this shape.

**Next candidates:** Phase 3 (API versioning, structured logging, metrics,
backups, staging deploy on the D4 VPS target — this is where a live header
scanner finally has a host to point at) is the natural next arc per the
schedule. Standing threads that ride alongside, unaffected by the Q-track
work: PB1 book compiler, P3 plate live-verify, the operator's Phase-0 tome
order (still his hands — see the previous entry below), Phase 1 gifts only
after that object passes in hand.

---
---

_(Previous entry — session 15 close, still accurate for the tome/Track-R
state it describes):_

_(Previous entry — R-4, merged as #70):_ **The material pass. TRACK R COMPLETE.**
Four commits on `track-r-material`: (1) void glass — panels/surfaces become
translucent instrument glass over the starfield (backdrop blur + scanline),
phosphor-gold section rules, gradient border-fields (amethyst esoteric /
gold working) — all as a late-override block at the END of theme.css.
(2) The ion trace (--ion #7fe7dc), rationed to live computation ONLY:
on-device badges, streaming caret/spinner/margin-foot, Oracle/deluxe/
Course/plate mid-flight (`.is-live`), forecast events landing today
(`.fc-event--today`). (3) Constellation path — ConstellationPath.tsx
replaces the classroom's numbered list; stars publish lessons to the margin;
a star stays LIT when its journal reflection exists (seed
`path:${anchor}→${growth_edge}`, position `${order} · ${name}`); chapter
bloom = ONE 240ms clip-path radial wipe on the keyed .chapter-host, surface
entrances retired inside chapters. (4) The seven per-module `.arc-disclaimer`
renders collapsed into the chapter refrain footer (backend still sends the
field; frontend stopped rendering it). e2e/material.spec.ts drives
star→margin→reflection→lit-star end-to-end.

**After Track R:** next candidates from the roadmap — tome Phase 0 (dogfood
ONE printed POD copy, dark-cover test), PB1 book compiler (corpus →
press-ready book-trim PDF; tomeCompile.ts is its seed), P3 plate art
live-verify (operator adds AAE_OPENAI_API_KEY first), Anthropic usage cap
returns 2026-08-01 (live Course/Oracle runs possible again).

_(Previous entry — R-3, merged as #69):_ **R-3, the Library.** Built same-session right after
#68 merged. Four commits: (1) LibraryVault joins the shelf in chapter VIII —
vault export/restore moved from the profile bar, support & unlock live
there; masthead pill = identity, walks to the Library; the voice-canon
refrain runs at the foot of every chapter. (2) ✦ Generate My Tome:
lib/tomeCompile.ts maps the corpus onto the dial's eight chapters (chart→I,
sessions→II with deluxe preferred whole, courses→VI, journal→VIII;
III/IV/V/VII honestly wait), TomeMeter renders the spine (gilt segments
widen with material) + compile via the print-CSS path, refrain as colophon.
(3) Oracle + Soul fold into chapter II beneath the Arcana; Controls
launchers deep-scroll to them; remaining overlays = Support/Ceremony/Admin/
Glossary exactly. (4) **Layout truth found by driving: `.app` was
height:100vh so tall chapters overflowed their grid tracks and the sticky
margin glass vanished on deep scroll — grid is now height:auto/min-height:
100vh and the margin stays pinned everywhere.** 76 e2e green (38×2; new
library.spec.ts incl. tome-compile popup asserted to the colophon;
vault.spec drives the Library now).

**Then R-4 — the material pass, the last Track R PR:** void glass, phosphor
gold structure, amethyst fields, the ION trace (only live computation),
constellation-drawn learning path, motion budget (2.5°/min dial drift, one
240ms bloom, reduced-motion). Wireframes artifact §"The material system":
https://claude.ai/code/artifact/b42a9765-4e12-42fb-93fb-a4472c4d8102
Also worth folding into R-4: sweep the five scattered `disclaimer` render
sites now that the refrain runs as chapter footer (dedupe, don't double).

_(Previous entry — R-2, merged as #68):_ **R-2, the margin glass.** Built to the artifact's
build sheet (§"R-2 mockup", fig. 5), four commits: (1) the six chapter
components unwrapped — no .modal-overlay/✕/own-Escape; ForecastPanel's prop
renamed `onHome` (jump/Ask genuinely navigate to chapter I); the
.chapter-host neutralization CSS deleted; surfaces lost their modal-era
max-height caps (the host is the only scroll container). (2) `MarginNote` +
`marginContent` store slot; ten publish sites (natal links, drawn cards,
transit days, path steps, forecast events, eclipses, inter-aspects,
midpoints, star hits, shelf sessions) wear `.mg-sel`; DetailPanel renders
notes generically, chart detail is chapter I's fallback; leaving a chapter
clears the note. (3) DetailPanel = three-zone margin glass, Ask pinned at
the foot in every chapter, `/` focuses it; sticky + viewport-capped on
desktop (the stage's rows outgrow 100vh — measured, not assumed), stacks
under 1100px. (4) JournalPad in zone 2 keyed to the selection (explicit
session keys where they exist → prompted/overwrite-in-place with existing
text restored; derived freeform key otherwise; chart selections too).
**Found by driving:** the mini dial rail's viewport corner now belongs to
the Ask foot on wide screens → the rail pins to the STAGE's bottom-right
(`@media (min-width:1101px)` in theme.css). 68 e2e green (34 × 2 projects;
new margin publish/clear test; journal.spec scoped to the shelf's own pad
since the margin adds a second pen).

**Then R-3 (the Library):** Shelf/journal/vault as chapter VIII proper +
✦ Generate My Tome with the spine meter; fold Oracle/Soul overlays into
chapter II. **R-4 (material pass) stays LAST.** Wireframes artifact:
https://claude.ai/code/artifact/b42a9765-4e12-42fb-93fb-a4472c4d8102

**Session-14 facts you need:**
- **Anthropic usage cap EXHAUSTED until 2026-08-01** — Fable calls 400;
  offline compilers serve honestly meanwhile (course verified live that way).
- **The operator's image key is an OPENAI key** — plumbing shipped in #65
  (`/api/deck-art-image`, Studio "◈ render plate"). **Key still NOT in
  backend/.env** — operator adds `AAE_OPENAI_API_KEY=sk-...`, then live-verify
  ONE plate.
- **Voice canon (operator, verbatim): "nothing Astra produces is a life
  sentence, it is a life poem."** Governs all copy; R-2+ should collapse the
  five DISCLAIMER variants into this refrain as a chapter running-footer;
  it's the tome colophon. Copy test: does the line open a door or close one?
- The Course: backend/course.py + POST /api/course (oracle tier) + Classroom
  composer; 4.1 learning-path inversion FIXED (path departs anchor, descends
  when needed). Plates: backend/plate_art.py, oracle tier, honest 503 sans key.
- Dial (R-1): ChapterDial.tsx — nodes at fixed compass positions and they
  NEVER move (the drift lives on a decorative dashed ring; a drifting node
  broke both Playwright stability and the ergonomic law). e2e enters chapters
  via helpers.openChapter().
- Issue #54: every accepted item merged; close-out comment posted; operator
  may close it.

---
---

### (previous TL;DR, still accurate below)

**Direction: personal instrument** (operator decision — build what the owner
wants, close gaps; no store/ship pressure). Everything through **PR #44 is
merged**. The three big 2026-07-08 landings:

1. **Premium AI is live.** `AAE_ANTHROPIC_API_KEY` is set and verified
   (`dev.py ai check`); the in-depth Oracle Report and deluxe Personal Report
   compile on **Claude Fable 5** (with the Opus 4.8 server-side fallback), not
   the offline compiler. First real run produced a 13k-char Oracle report and
   a 47k-char Personal Report against the owner's chart.
2. **Full on-device body set** (PR #43): North/South Node, Chiron and Lilith
   compute in the browser via a vendored WASM Swiss Ephemeris
   (`packages/astra-core/src/vendor/swisseph/`). Parity vectors are pinned to
   the same committed seas-only ephemeris config on both stacks; the drift
   lock now spans all 17 bodies. No remaining §3 gaps — the on-device engine
   is body-for-body identical to the backend.
3. **H1 exit gate recorded** (PR #44): wheel touch pass (pinch-zoom,
   long-press popover, responsive svg), lazy leaflet, Lighthouse
   accessibility 100. **One manual item remains: the owner's literal
   airplane-mode phone test** (roadmap §6 checkbox).

## How to run / test

```bash
./run.sh                                    # backend :8787 + frontend :5173
backend/.venv/bin/python backend/tools/dev.py   # unified dev CLI:
#   unlock | token | smoke | parity | test | ai set/check/status
cd backend && .venv/bin/pytest -q           # 173 tests
cd packages/astra-core && npm test          # 30 parity/unit tests
cd frontend && npm run build                # typecheck + build
cd frontend && npx playwright test          # 46 e2e (23 × desktop/Pixel-7)
cd backend && .venv/bin/python tools/gen_parity_vectors.py --check  # tripwire
```

## Environment reality

- **Premium key is SET** in `backend/.env` — Oracle/Personal reports bill real
  Fable 5 tokens (~$0.80/$1.60 worst-case per report). `dev.py ai status` to
  confirm; `ai check` live-verifies (also catches the ZDR-retention 400).
- Parity vectors and the backend **test session** run against the *vendored*
  seas-only ephemeris (`SE_EPHE_PATH` forced in `tools/gen_parity_vectors.py`
  and `tests/conftest.py`) — committed, so CI reproduces byte-identically.
  Production (`run.sh`/.env) still uses the full `backend/ephe/` file set.
- Tests isolate their receipts ledger (`AAE_RECEIPTS_DB` → temp dir in
  conftest). The real ledger at `backend/data/receipts.db` contains whatever
  fixture txs leaked before 2026-07-08; harmless, but don't be surprised by it.
- Trust mode still OFF by default; `AAE_TRUST_MODE=1 ./run.sh` to exercise the
  purchase rail in the UI.
- **Backups (B3):** server-side state lives in `backend/.env` (secrets — dev
  token, AAE_SECRET, the Anthropic key) and `backend/data/*.db` (receipts +
  telemetry). Copy both when backing up the machine; the browser side is
  covered by the Vault export (⇓ Vault in the profile bar).

## Open threads / next candidates

- **☐ Airplane-mode phone test** (the last H1 checkbox, owner-only): install
  the PWA, toggle airplane mode, open → last cast renders, tarot draw +
  forecast work.
- **H2 (Capacitor wrapper / store distribution): parked** under the
  personal-instrument direction. The roadmap keeps the plan if the direction
  ever changes.
- **Hardening backlog parked** (same reason): Docker (R5), Prometheus (R4),
  prompt-injection hardening (R3), API versioning (F1), structured logging
  (F2), tarot-data externalization (old F5), aspect/ephemeris caching (F3/F4).
  R6 (client error telemetry) and the R2 remainder (deluxe purchases in admin
  stats) closed 2026-07-08.
- Before any public deploy (not currently planned): set `AAE_ETH_RPC`,
  `AAE_ORACLE_MIN_WEI`, `AAE_REPORT_MIN_WEI`; revisit the git-history
  birth-data decision (`docs/audits/AUDIT_REGRESSION.md` §5.1, operator chose
  LEAVE 2026-07-01).
- Ideas shelf: **EMPTY as of 2026-07-08** — all-bodies WASM Swiss (tolerances
  collapsed, astronomy-engine retired), sidereal on-device, and the tome's
  tarot plate grid (PDF-1 follow-on) all landed the same day.

## Known gotchas (carried forward)

- **After the operator merges dependabot PRs: `npm ci` BEFORE trusting local
  tsc/build** — stale node_modules masked the TypeScript 7 breakage (TS7
  hard-errors TS2882 on side-effect CSS imports; fixed by the once-missing
  `frontend/src/vite-env.d.ts`).
- **IndexedDB in e2e: readers open versionless** (`indexedDB.open(name)`) —
  an explicit lower version than the live DB throws VersionError and reads
  resolve null forever (bit the B2 spec when the journal bumped the DB to v2).
  Writers/seeders pin the current schema version.
- The bookshelf DB is `astra-bookshelf` v2: `sessions` (keyed by seed) +
  `journal` (keyed by id, seed-indexed). Vault format `astra-vault@3`
  (localStorage + bookshelf + journal); restore accepts @1–@3.

- **Base-URL bug:** `AAE_AI_BASE_URL` must NOT include `/v1` (code appends it).
- **Oracle token budget:** 2500+ tokens or readings truncate mid-sentence.
- Shell here is **fish** — use `bash -c '...'` for loops/conditionals.
- The raw oracle seed is a signature STRING (ends with the question); display
  uses `short_seed`, binding/minting uses the raw value.
- `npx playwright test` MUST run from `frontend/` (repo root has no config and
  collides with the astra-core node:test files).
- **New e2e specs import `test`/`expect` from `./helpers`**, not
  `@playwright/test` — helpers skips the first-run ceremony overlay, which
  otherwise intercepts real clicks (synthetic `dispatchEvent`s bypass
  hit-testing and mask the problem).
- Tokens copied from a wrapped terminal line break silently — use the
  `.replace(/\s+/g,"")` console snippet or `dev.py token`.
- `*.pdf` and `oracle_report_*.txt` are gitignored (print/report artifacts
  carry personal data; never commit them).

## Working-style notes

- Acceptance criteria up front ("done = tests green, committed, PR open") let
  work land in one pass.
- Bug reports travel fastest as a minimal reproduction: exact click path or
  verbatim console/error text.
- Multi-part asks are welcome as short numbered lists; each item gets verified
  independently.
- Merges are the operator's: open the PR, leave the button alone.
