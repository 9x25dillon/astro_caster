# Continuation instructions — correctness sweep & the day's queue

_Written 2026-07-09 by the Fable 5 session, for a Sonnet 5 session to
continue. Read this whole file before touching code. The operator merges all
PRs; you open them and leave the merge button alone._

## Where you are

> **UPDATE (same day, Fable session continued): Task 1 is DONE.** Commit
> `2ace751` completed the @astra/core ports, frontend changes and backend
> regression tests — backend 183 green, astra-core 33 green, 56 e2e green,
> vector tripwire ok, PR open. **Start at Task 2** (security sweep), then
> Task 3 (P2 Morning panel), then Tasks 4/5. Task 1's text is kept below
> only as reference for how the dual-stack contract works.

Branch **`correctness-sweep`** (off `main` @ 740a644). Commit `a26964f`
contains the **complete backend half** of the issue-#54 correctness sweep
(the work order is the triage comment on issue #54 — read it:
`gh issue view 54 --comments`).

## Task 1 — port the backend fixes to @astra/core (finish PR 1)

Every change below mirrors a backend change in commit `a26964f`. Diff that
commit (`git show a26964f -- backend/`) when unsure — the TS must reproduce
the backend bit-for-bit; the regenerated `parity/*.json` files are the
contract. **Do not regenerate vectors again** unless you find a genuine
backend bug; the committed ones are correct.

### 1a. `packages/astra-core/src/types.ts` — Aspect.applying

`applying: boolean` → `applying: boolean | null`. (Backend: `models.py`
Aspect.applying is now `Optional[bool]`; None = both points static.)

### 1b. `packages/astra-core/src/ephemeris.ts`

1. **`isApplying`** (line ~233): add a `freezeB = false` param, mirror
   backend `_is_applying`:
   ```ts
   function isApplying(a: PlanetData, b: PlanetData, targetAngle: number, freezeB = false): boolean | null {
     const speedB = freezeB ? 0 : b.speed;
     if (a.speed === 0 && speedB === 0) return null;
     const sepNow = angularSeparation(a.longitude, b.longitude);
     const sepNext = angularSeparation(a.longitude + a.speed * 0.01, b.longitude + speedB * 0.01);
     return Math.abs(sepNext - targetAngle) < Math.abs(sepNow - targetAngle);
   }
   ```
2. **`aspectsBetween`** (line ~279): call `isApplying(t, n, ad.angle, true)`
   (natal side frozen — issue 2.7).
3. **Sidereal frame option on `eclipticLonSpeed`** (line ~111): add an
   optional third param `frame?: { zodiac?: string; ayanamsha?: number }`.
   When `frame?.zodiac === "sidereal"`: `const r = calcSwissBody(jd, sweId, true)`
   and return `lon: norm360(r.lon + shift)` where `shift =
   AYANAMSHA_SHIFT[frame.ayanamsha ?? 1]` (throw the same error string
   `calculateChart` uses for an unsupported ayanamsha). This mirrors exactly
   how `calculateChart` builds sidereal planet longitudes (FB mode + shift).
   NOTE: `AYANAMSHA_SHIFT` is declared later in the file than
   `eclipticLonSpeed` — either move the table up or reference it from inside
   the function body (hoisting makes the latter fine for `const` only if the
   call happens after module init — it does, but moving the table above
   `eclipticLonSpeed` is safer and cleaner).
4. **Export a chart-frame offset helper** (for fixed stars, issue 2.4):
   ```ts
   /** Effective tropical→chart-frame longitude offset at the chart's JD (0 for tropical). */
   export function chartFrameOffset(req: ChartRequest): number {
     if (req.zodiac !== "sidereal") return 0;
     const shift = AYANAMSHA_SHIFT[req.ayanamsha ?? 1];
     if (shift === undefined) throw new Error(/* same unsupported-ayanamsha message */);
     return siderealOffset(julianDayUtc(req), shift);
   }
   ```
5. **Polar house fallback** (issue 2.6): the C `swe_houses` returns ERR and
   silently computes Porphyry for Placidus/Koch beyond the polar circles;
   the backend now falls back to **whole-sign ("W")** instead. In
   `swisseph.ts` `calcSwissHouses` (line ~122): capture the ccall return
   value (`const ret = m.ccall(...) as number`). If `ret < 0 && hsys !== "W"`,
   recurse with `"W"` and mark the result: add an optional `fellBack?: boolean`
   to the return object. In `ephemeris.ts` `calculateChart`: when
   `h.fellBack`, set `meta.house_system = "W"` and
   `meta.house_fallback = \`${req.house_system ?? "P"} undefined at this latitude; whole-sign used\``
   — the string must match the backend's format exactly:
   `"{req} undefined at this latitude; whole-sign used"`.

### 1c. `packages/astra-core/src/predictive.ts`

1. **`solarReturnJd`**: accept an optional frame param and pass it to
   `eclipticLonSpeed(jd, "Sun", frame)`.
2. **`solarReturn`**: pass `natal` as the frame (`ChartRequest` structurally
   satisfies `{zodiac, ayanamsha}`) — the root-find then compares sidereal
   natal Sun against sidereal transiting Sun (issue 2.1).
3. **`eclipseTimeline`** (line ~200): the luminary longitude must be in the
   chart's frame: `eclipticLonSpeed(e.jd, e.is_solar ? "Sun" : "Moon", natal)`
   (issue 2.4).

### 1d. `packages/astra-core/src/forecast.ts`

Mirror `backend/forecast.py` exactly (diff the backend file to be sure):

1. **`sigT2t`**: first check
   `if ((p1 === "Sun" && p2 === "Moon") || (p1 === "Moon" && p2 === "Sun")) return "medium";`
   (lunations rank medium).
2. **Orb state maps become `Map<string, [number, boolean]>`** (prev orb +
   `wasDecreasing`). Add the shared step helper, used at ALL FOUR detection
   sites (daily t2t, daily t2n, moon t2t, moon t2n):
   ```ts
   const BIG = 999.0;
   function minimumStep(state: Map<string, [number, boolean]>, key: string, curr: number, threshold: number): number | null {
     const [prev, decreasing] = state.get(key) ?? [BIG, true];
     const fired = decreasing && prev < threshold && curr > prev ? prev : null;
     let dec = decreasing;
     if (curr < prev) dec = true;
     else if (curr > prev) dec = false;
     state.set(key, [curr, dec]);
     return fired;
   }
   ```
   Replace every `prev < threshold && curr > prev + 0.03` (and `+ 0.02`)
   block with `const minOrb = minimumStep(...); if (minOrb !== null) {...}`,
   passing `minOrb` as the event's orb. Thresholds unchanged (t2t: aspect
   threshold; t2n daily: `INNER ? 1.0 : 1.5`; moon t2n: `1.0`).
3. **Moon block** (line ~325): drop the `bodyNames.indexOf(n2) <= moonIdx`
   guard — every non-Moon body pairs with the Moon (this is the lunation
   fix, issue 2.5). `moonIdx` becomes unused; remove it.
4. **Init block** (line ~242): skip any pair involving Moon in the
   symmetric init (`if (j <= i || !(n2 in prevPos) || n1 === "Moon" || n2 === "Moon") continue;`)
   and add a separate init that seeds `Moon|${n2}|${asp}` keys for ALL
   `n2 !== "Moon"` from the pre-range Moon position (backend does exactly
   this — a symmetric `Sun|Moon` entry would go stale and emit a phantom
   final-pass event).
5. **Final pass**: unpack `[finalOrb, decreasing]` and **skip entries whose
   trend is not decreasing** (`if (fired.has(key) || !decreasing) continue;`)
   — the final pass only captures aspects still approaching exactness.

### 1e. `packages/astra-core/src/advanced.ts`

1. `DIAL_ANGLES`: remove the `[270, "square"]` entry; simplify
   `const target = ang <= 180 ? ang : 360 - ang` to just use the angle
   (backend renamed the tuple var to `target`). Contact `angle` field =
   the target.
2. **`fixedStarHits`**: `const off = chartFrameOffset(natal);` (import from
   `./ephemeris.js`), then `const starLon = norm360(starLongitude(lon2000, year) - off);`
   (issue 2.4 — stars into the chart's frame).

### 1f. Run the TS suite

```bash
cd packages/astra-core && npm test 2>&1 | tail -20   # target: all green
npm run typecheck
```

Known risk: the **advanced parity test asserts fixed-star `star_longitude`
EXACTLY** (`test/advanced-parity.test.ts:96`) and the sidereal case compares
a backend true-Lahiri ayanamsha against the TS FB+J2000-constant offset
(they agree to ~1e-6°; the value is rounded to 3 dp). If exactly one star
longitude lands on a rounding boundary and fails: relax **that assertion
only** to a ≤0.002 tolerance with a comment saying why (cross-stack
ayanamsha paths differ at the 1e-6 level). Same logic applies if a
`predictive` sidereal `return_iso` differs by ±1s (the test already allows
±2s — should be fine).

The predictive parity test (`test/predictive-parity.test.ts:96`) builds the
solar-return chart request from the vector — it copies `zodiac` but **not
`ayanamsha`**; the default (`?? 1` = Lahiri) matches the sidereal case, so
no change needed. If you add other ayanamshas ever, fix that.

### 1g. Frontend (same PR)

1. `frontend/src/types.ts:39` — `applying: boolean | null`.
2. Render the null state ("static" pairs like Asc–MC):
   - `DetailPanel.tsx:319`: `{a.applying == null ? "·" : a.applying ? "↗" : "↘"}`
   - `DetailPanel.tsx:365`: `{a.applying == null ? "Static" : a.applying ? "Applying" : "Separating"}`
   - `ChartWheel.tsx:768` and `:786`: `` `Orb ${a.orb}°${a.applying == null ? "" : a.applying ? " · applying" : " · separating"}.` ``
3. `frontend/src/api/client.ts` `localForecast` (line ~366): it feeds
   chart-frame natal longitudes into the tropical scanner — mirror the
   backend's `_tropical_natal_map` (main.py): if the local chart's
   `meta.zodiac === "sidereal"`, compute
   `shift = norm360(tropicalSunLon - chartSunLon)` where `tropicalSunLon`
   comes from `core.eclipticLonSpeed(parseFloat(meta.julian_day), "Sun")`
   (no frame arg = tropical), and add the shift to every natal longitude
   fed to `generateForecast`. Export whatever tiny helper you need from
   `@astra/core`'s `browser.ts` if `eclipticLonSpeed` isn't already exported
   there (check `packages/astra-core/src/browser.ts`).
4. Build + e2e:
   ```bash
   cd frontend && npm run build
   npx playwright test        # MUST run from frontend/ (repo-root run collides with node:test files)
   ```
   E2e gotchas: helpers import (`./helpers`, not `@playwright/test`); kill
   any stale :5173/:8787 before running or the webServer reuses a backendless
   vite and cache tests fail.

### 1h. Backend regression tests (small, same PR)

Add to `backend/tests/` (follow the existing style — `sys.path.insert`
header, plain asserts):

- `test_predictive.py`: sidereal solar return — build the Einstein request
  with `zodiac="sidereal", ayanamsha=1`, assert `return_iso` starts
  `"2026-03"` (it was landing ~24 days off before) AND the SR Sun's
  longitude equals the sidereal natal Sun within 0.05°.
- New `test_forecast_events.py` (or fold into an existing forecast test
  file): `generate_forecast({}, dt.date(2026,1,1), days=35, min_sig="medium")`
  contains a `("Moon","Sun")` Conjunction (new moon 2026-01-19 ± a day) and
  an Opposition (full moon 2026-01-03 ± a day).
- `test_chart.py`: polar chart (lat 70, house_system "P") does not raise;
  `meta["house_system"] == "W"`; `meta["house_fallback"]` present; planets
  spread over >1 house.
- `_jd_to_utc` carry: pick a jd whose seconds round to :60
  (e.g. assert `predictive._jd_to_utc(jd) == datetime(...)` for a value you
  compute — construct one: `jd` for 23:59:59.7 must land on the NEXT day
  00:00:00, not 23:59:59).

Run `cd backend && .venv/bin/pytest -q` → everything green, and
`.venv/bin/python tools/gen_parity_vectors.py --check` → all "ok".

### 1i. Open PR 1

```bash
git push -u origin correctness-sweep
gh pr create --title "Correctness sweep: issue-#54 astronomy fixes, dual-stack" --body "..."
```

Body: summarize per issue number (2.1/2.2/2.4/2.5/2.6/2.7/2.8/2.3), state
the dual-stack + vector-regen contract, list test counts, link issue #54
("Closes nothing — partial; security items follow in a second PR"). End the
body with the standard footer:
`🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
Comment on issue #54 that the astronomy half has a PR, security half next.

## Task 2 — security/telemetry PR (issue #54 items 3.2/3.3/3.4 + §1 ruff)

Branch off **main** (`git checkout main && git checkout -b security-sweep`)
— independent of PR 1, minor conflict risk only in `ai.py`/`main.py` if the
operator hasn't merged PR 1 yet (if both touch the same lines, rebase after
the merge).

1. **3.3 telemetry privacy**: `backend/telemetry.py` `log_chart`
   (lines ~122-136) stores exact birth `year/month/day/hour/minute` +
   lat/lng rounded to 1 dp; `ai_events` stores a 120-char `query_preview`.
   Nothing in AdminPanel uses them (verify: grep `frontend/src/components/AdminPanel.tsx`
   and `telemetry.summary()`). Stop storing: drop the birth fields and
   preview column writes (keep the row counts/timestamps that the summary
   uses; keep schema columns nullable or migrate them out — simplest is to
   write NULLs and stop reading). Align the README privacy claim.
2. **3.4**:
   - `entitlements.py assert_safe_boot`: when `AAE_ENV=production`(-ish
     posture — look at how the existing prod guards detect prod; follow the
     same convention) and `AAE_DEV_TOKEN` is set → refuse boot (or hard
     warn, matching the strictness of the existing ed25519 prod guard).
   - Admin/entitlement token via header: `main.py:330` (`/api/entitlement`)
     and `:430` (`/api/admin/stats`) accept `?token=` — accept an
     `X-AAE-Token` header FIRST, keep the query param as a deprecated
     fallback (the frontend AdminPanel and `validateEntitlement` in
     `client.ts` must switch to the header; grep for `admin/stats` and
     `entitlement?token` in `frontend/src`).
   - Generic error details: `main.py` handlers do
     `HTTPException(400, f"... {exc}")` — log the full exception
     (`logging.exception`), return a generic detail string. Keep the
     "purchase" string in the 402 detail for `/api/personal-report` — the
     frontend branches on it (grep `"purchase"` in client code before
     touching any 402 path).
3. **3.2 event-loop blocking**: `ai.py:76-93 _reachable` does sync
   `httpx.get` on the async path → make the probe async (`httpx.AsyncClient`)
   or run it via `asyncio.to_thread` (check callers — `_resolve_provider`
   may be sync; to_thread from the async caller is the low-risk route).
   `main.py` `/api/generate-chart` (~line 194) and `/api/transits` (~206):
   wrap `E.calculate_chart` / transit calc in `await asyncio.to_thread(...)`.
4. **§1 ruff**: add `[tool.ruff]` to a new `backend/pyproject.toml`
   (target py312, line-length ~100, select at least `F`), run
   `ruff check --fix` (F401 auto-clears; `advanced.py`'s were already fixed
   in PR 1 — branch from main means you may re-fix them here; fine, git
   sorts it out at merge). Hand-fix the two F841s: `ai.py:627` dead
   `rng = random.Random(...)` (delete the assignment — do NOT change output
   text) and `tests/test_tarot.py:131` unused `chart`. Add ruff to CI
   (`.github/workflows/*` — follow the existing job style) only if a ruff
   binary is available in the venv (`pip install ruff` into backend
   requirements-dev if there is one; otherwise skip CI wiring and say so in
   the PR body).
5. Tests green, PR 2 open, comment on issue #54.

## Task 3 — P2 Morning panel (after PR 1 exists; build ON TOP of `correctness-sweep` if unmerged, else main)

The ratified contract is `docs/progress/NEXT_ARC.md` Track 3 — **read it
first**. Composition, not engineering: an at-a-glance boot surface showing
(a) today's daily arcana card (the `arcana-forecast` engine / its local
fallback `client.localArcanaForecast` — check the exact local fn name in
`client.ts`) and (b) today's tightest transits (forecast events filtered to
today, sorted by orb — lunations now exist, which is why the sweep came
first). Both engines run offline; the panel must degrade the same way the
modals do (`.arc-ondevice` badge pattern). Mount at boot in `App.tsx` above
the wheel (dismissible, remembers dismissal per local date via
`aae.morning_dismissed` or similar). New e2e spec (import from `./helpers`);
run desktop + Pixel-7 projects. Open as its own PR.

## Task 4 — Fable-designed educational course (operator request, 2026-07-09)

Operator: "add a fable designed educational course for the premium product
package users, a good use of that resource." Design intent:

- **Tier**: oracle (premium). Gate exactly like `/api/oracle-report`
  (`require_tier("oracle")` pattern in main.py — copy its 402 semantics).
- **Engine**: a new `backend/course.py` + endpoint `POST /api/course`
  following `oracle_report.py`'s Fable 5 posture EXACTLY: 
  `client.beta.messages.stream`, `output_config={"effort": ...}`,
  `betas=["server-side-fallback-2026-06-01"]`,
  `fallbacks=[{"model": "claude-opus-4-8"}]`, NO temperature/top_p/thinking
  (400s on Fable 5). Env: reuse `AAE_ANTHROPIC_API_KEY`; add
  `AAE_COURSE_MODEL` (default `claude-fable-5`) + `_MAX_TOKENS` (~24000) +
  `_EFFORT=high`, mirroring the oracle-report vars.
- **Content**: a personalized multi-lesson curriculum ("Your Chart as
  Curriculum"): N lessons (6–8), each anchored to a real feature of the
  user's natal chart (stellium, dominant element, anchor/growth arcana from
  `build_learning_path` — reuse `tarot.py`'s deterministic learning-path as
  the SKELETON so the course exists OFFLINE too, with Fable enriching each
  lesson when the key is set). Offline degrade = the deterministic skeleton
  + existing `lib/tarotCopy.ts` classroom prose. `ai_source`/`model`
  honesty fields like the reports.
- **Persistence**: save generated courses to the Bookshelf (IndexedDB,
  `lib/bookshelf.ts` — sessions are keyed by seed; a course should key by
  `course|<chart short_seed>` — check the existing key scheme and vault@3
  export so courses survive backup).
- **UI**: extend the Classroom tab in `ArcanaModal.tsx` — "✶ Generate my
  course" (oracle-gated; 402 → support modal, same branch the reports use).
  Lesson list → expandable lessons; a "resume" cursor in localStorage.
- Cost note in the PR body (~$1–2/course at 24k output tokens).
- Backend tests (offline path deterministic; gating 402s) + one e2e
  (offline skeleton renders).

## Task 5 — UI rearrangement (Track R redesign; operator request same day)

Per the ratified blueprint: **wireframes FIRST, as an artifact/HTML mock,
before moving code**. Audit buried features (deck-art studio, arcana
calendar, learning path, eclipses — all live behind modal tabs), design a
layout that surfaces: Morning panel (Task 3), "Generate My Tome" entry,
the Shelf, and the course (Task 4). Do NOT restructure components in the
same PR as any feature work. If the operator is away, produce the wireframe
mock + a written proposal (docs/design/TRACK_R_WIREFRAMES.md) and STOP for
sign-off — layout taste is his call.

## Standing gotchas (bite hard, read twice)

- **fish shell**: use `bash -c '...'` for anything with loops/heredocs;
  `echo ===` after `;` breaks fish — put separators in quotes.
- Playwright from `frontend/` only. E2e helpers import. Kill stale :5173/:8787.
- `npm ci` in BOTH `frontend/` and `packages/astra-core/` after the operator
  merges dependabot (TS7/stale-tree gotchas).
- Vector regen: ONLY from `backend/tools/gen_parity_vectors.py` (it pins
  `SE_EPHE_PATH` to the vendored seas dir). Never hand-edit `parity/*.json`.
- The operator merges PRs — never merge, never delete remote branches.
- `*.pdf`, `oracle_report_*.txt` gitignored (carry birth data) — inspect
  `git status` before blanket `git add`.
- Memory notes live at `~/.claude/projects/-home-kill-astro-aae/memory/` —
  update `project_aae_state.md` + `Hand_off.md` at session end (see the
  existing style).
