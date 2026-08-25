# Session opener — Astra Arcana (astro-aae)

You are picking up a solo-operator production product. Read this whole block before
running anything. It was written at the close of session 34 (2026-08-20) and every
number in it was measured, not remembered. Re-derive anyway — see step 0.

The operator is **xar**. How they work, and what they will not tolerate:
lead with the probe, not the prose. Do not re-read them their own documentation —
they wrote it. Get the motivating case before designing anything. When they state an
invariant, an acceptance criterion, or prior art, it is binding, not a suggestion.
Answer with what you measured and the command that measured it.

---

## 0. The orientation, in order. Do these before forming any opinion.

```bash
cd /home/kill/astro-aae
git fetch --prune --tags && git status -sb          # trust nothing above this line first
curl -s https://app.astra-arcana.com/api/health | jq '.status, .ephemeris, .ai.mode'
gh run list --workflow=CI --limit 3 \
  --json conclusion,headSha -q '.[] | "\(.conclusion) \(.headSha[0:7])"'
```

That third command is the one previous sessions skipped, and it is why this handoff
exists. Keep reading.

---

## 1. THE CENTRAL FACT ABOUT THIS PROJECT'S WORKFLOW

**There are three different truths here and they drift apart independently.**
Sessions keep collapsing them into one word — "green" — and shipping the confusion.

| layer | what it means | how you check it |
|---|---|---|
| **local** | your machine's venv and node_modules | `pytest`, `npm run build` |
| **CI** | what GitHub Actions enforces on `origin/main` | `gh run list --workflow=CI` |
| **production** | what a paying reader actually receives | curl probes + `ssh` |

A commit can be locally green, CI-red, and correctly deployed all at once. That is
the **current state**, exactly. When you report status, name the layer. "Green" with
no layer attached is the failure mode this document exists to prevent.

Corollary, learned expensively: **a deployed commit is not a working product.**
Probes prove code shipped; only a real generated reading proves a subscriber gets
what they paid for. Oracle tier costs ~$0.10 a reading. Spend it.

---

## 2. Verified state at handoff (session 34, 2026-08-20)

```
main = origin/main = 42a2301   clean, 0 ahead / 0 behind
production HEAD    = a8c2b34   tree clean, both containers healthy
origin has exactly ONE branch. Tags: archive/session-26-handoff, v1.0.0/1/3/4/5
```

- **659 pytest passed** (7.2s), **11/11 evals on replay**, frontend `tsc -b && vite build`
  clean, `@astra/core` golden vectors, resonarium Python↔JS parity, parity-vector and
  gazetteer tripwires, tolerance ratchet, boot smoke (**49 /api routes**) — all pass.
- Production externally: `swiss-files` ephemeris, ai mode `llm`, key `sk-or-…f973`,
  tiers free=`claude-haiku-4-5` / supporter=`claude-sonnet-5` / oracle=`claude-opus-5`,
  spread Literal has **12** members, `/api/replay/{key}` answers from the handler,
  bundle `index-BhuUU9_T.js`, apex byte-identical to `landing/index.html`.
- **Production is 4 commits behind `main` and that is CORRECT.** The delta is docs,
  evals, tests — plus `backend/ephemeris.py`, which is a `_NON_ASPECTING` →
  `NON_ASPECTING` rename with a comment. Behavior-identical. **Do not deploy to
  "catch up."** Deploy when there is product code to ship.

---

## 3. THE BLOCKING ISSUE — start here unless told otherwise

**CI has been red on `origin/main` for 14 consecutive runs**, since
`983c0f5` at 2026-08-20T05:44Z. Last green was `fccd6be`, 2026-08-19T19:24Z.
Every session since has reported "green" while meaning *local*.

One job, one test, deterministic, reproduces locally in 3 seconds:

```
job:  E2E — Playwright (desktop + mobile emulation)     211 passed, 1 failed, 12 skipped
test: frontend/e2e/arcana-offline.spec.ts:79   [mobile-chromium only]
      expect(new Set(areas).size).toBe(10)     Expected: 10   Received: 1
```

Reproduce it:
```bash
cd frontend && npx playwright test e2e/arcana-offline.spec.ts \
  --project=mobile-chromium -g "Celtic Cross" --reporter=list
```

**Root cause — commit `1c18a1e` (2026-08-19) added both halves of a contradiction:**

- `frontend/src/theme.css:2304` — `@media (max-width: 720px)` sets
  `.arc-cards-row--geo .tarot-card { grid-area: auto !important; }`, deliberately
  collapsing the Celtic Cross tableau to one column. The comment says why:
  *"ten panels across four columns on a phone is four unreadable ones."*
- `arcana-offline.spec.ts:79` — asserts all ten cards hold **distinct named grid
  areas**, on *every* Playwright project. `mobile-chromium` is Pixel 7 (412px wide).
  The assertion is unsatisfiable there by construction.

The `mobile-chromium` project has existed since `5870911` (2026-07-04), so this was
red the moment it landed. **The CSS is right. The test is wrong.** Fix shape: make
the geometry assertion viewport-aware — assert the cross on desktop, assert the
honest single-column stack on mobile. Do **not** delete the assertion; it catches a
real failure (a card silently dropping into the implicit grid, symptom = crooked
spread, no error). Do **not** weaken it to `>= 1`.

---

## 4. Open product work, after CI is green

- **Eval finding 3** — *"With Mars square your Ascendant"* where the chart holds an
  Opposition at 3.82° is a REAL model error and the check correctly caught it. It
  will not be "fixed."
- **Eval finding 4 (the design work)** — `evals/runner.evaluate` requires *every*
  cassette to pass, so a recording containing one genuine model error cannot be
  committed at all. The only escapes are re-rolling until the model happens not to
  err (converts a quality gate into a slot machine) or blunting the check. **Neither
  is acceptable.** The suite needs a third state: a cassette may carry *accepted
  findings*, recorded with a reason, that do not fail the build but stay visible in
  the report. `evals/regressions/` is the same discipline pointed the other way.
  **Design this BEFORE re-recording.**
- **8 stale cassettes** predate `reasoning: {"effort": "medium"}` and need re-recording
  (~$1.50): `supporter:{whole-chart,angles,pluto-8th,celtic-cross}`,
  `oracle:{whole-chart,angles,pluto-8th,twelve-house}`. The three `free__*` are
  already accurate — haiku is deliberately sent no reasoning parameter.

---

## 5. Gotchas that have each cost a session

1. **`ruff` is not installed locally** and is not in `backend/.venv`. CI `pip install
   ruff` per run. You cannot verify lint locally without installing it — do not
   report "ruff clean" from memory.
2. **The prod boot guard cannot be exercised locally.** `backend/.env` supplies a real
   64-char `AAE_SECRET`, so `import main` legitimately succeeds. CI has no `.env`,
   which is the only condition under which the guard is meant to fire. A local
   "GUARD FAILED" is expected and is not a finding.
3. **Compose env passthrough** — a var absent from `docker-compose.yml`'s
   `environment:` never reaches the container (this has bitten three times). And
   adding it as `${VAR:-}` sets it *empty*, which crash-loops on `int("")`.
4. **`resonarium/resonarium/astro_caster/backend/ephemeris.py` still carries
   `_NON_ASPECTING`** (lines 298/309/370) — a vendored copy that no longer moves
   when the real one does. It compiles and its parity job passes. Know it exists.
5. **Production and `backend/.env` share the OpenRouter key.** Cassette recording
   draws down the same balance that serves paying readers; at zero, paid tiers fall
   back to offline prose. Check balance via `/api/v1/credits` — **never**
   `/api/v1/key`, which reports a different number and looks fine.
6. **`~/Downloads` holds charts at three offsets** (+7/−7/−8) and two times. The
   operator's confirmed data is **1987-11-11, 1:09 PM, UTC−8**, 34.0591/−117.9124.
   Older readings describe a different sky. Do not grade against them.
7. **The apex is load-bearing.** The signed APK's `PURCHASE_URL` is the immutable
   string `https://astra-arcana.com/#support`. `landing/index.html` must stay
   byte-identical to what the apex serves.
8. **`DEPLOY.md` §3.3 is stale** — it reads as though TLS-to-origin is unresolved.
   The frontend publishes 80 and 443; it was resolved.

---

## 6. Dating a deployment from OUTSIDE (do this before touching the box)

The API tells you its own version if you ask the right question. A router 404 and a
handler 404 are identical in the status code and nowhere else:

```bash
# the SpreadType Literal, read out of a 422 — 12 members = session 31 or later
curl -sS -X POST https://app.astra-arcana.com/api/tarot-reading \
  -H 'Content-Type: application/json' -d '{"chart":{},"spread":"__probe__"}' | jq -r '.detail[]|select(.loc[-1]=="spread").msg'

curl -sS https://app.astra-arcana.com/api/replay/anykey
# {"detail":"Not Found"}                  <- router: route ABSENT (pre-session-30)
# {"detail":"Replay sync needs a key…"}   <- handler: route PRESENT
```

Frontend dating is the same idea against the bundle: fetch `/assets/index-*.js` and
grep for a string a known commit introduced. **Grep the CSS class, not the TS
identifier** — `offsetWarning` minifies away, `tz-warning` survives.

## 7. Deploying, when there is something to ship

**Pre-flight first. This is the difference between a pull and an outage:**
```bash
git diff <deployed-sha>..HEAD -- .env.example docker-compose.yml \
    frontend/nginx.conf frontend/Dockerfile backend/Dockerfile
```
Empty (or dependency bumps only) means no new required env var, so gotcha #3 does not
apply. Then:
```bash
ssh -i ~/.ssh/astra_hetzner "astra@$ORIGIN_IP" \   # ORIGIN_IP from ops/origin.env (gitignored)
  'set -e; cd /home/astra/astro-aae; git pull --ff-only origin main;
   docker compose up -d --build; docker compose ps'
```
`set -e` matters: a failed fast-forward must abort *before* the rebuild, or you serve
a half-updated stack. Verify from outside afterward, then buy one real oracle reading.

## 8. Branch hygiene

There are ~13 local branches and `origin` has one. All are patch-contained in `main`
(`git cherry` shows no unmatched `+`) except `session-26-handoff`, whose unique commit
is archived at tag `archive/session-26-handoff`, pushed. They are safe to delete.
The order, always: **salvage → verify the salvage is on `origin/main` → archive →
delete.** Verify *after* pushing, not before. `git cherry` cannot see through a
squash, so probe `main` for CONTENT, not for hashes.

## 9. Tools you have

`bash ops/production_report.sh [--e2e] [--ssh]` runs every CI gate locally, probes production from outside, and diffs the
deployed SHA against `main`, flagging any non-docs file in the delta. Exit 0 only if
every attempted gate passed. Run it first; it answers most of section 2 in 40 seconds.

**Close ritual:** `Hand_off.md` + a narrative `WORK_JOURNAL.md` entry, both committed
to `main`, dev servers down.
