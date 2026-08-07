# Data discrepancies — a study record

_Opened 2026-08-07. A running catalogue of places where **what the repository
recorded** and **what was actually true** came apart, kept as a training
resource rather than a blame log._

Each entry follows the same shape: what was recorded, what was true, how the gap
was found, and — the part worth generalising — **the check that would have
caught it earlier**. The entries are grouped by failure *mode*, because the
modes recur while the specifics never do.

Every claim here was verified at the time of writing; commands are included so
the entries can be re-checked rather than believed.

---

## A. Scope-of-evidence errors

**The pattern:** a narrow measurement gets recorded with a broad name, and the
broad name is what everyone downstream reads.

### A1. "Astra makes zero external requests" — proven for boot, claimed for everything

| | |
|---|---|
| **Recorded** | "Zero external requests", asserted at the H1 exit gate and repeated into a **published privacy policy** |
| **Actually true** | True *of boot only*. The birthplace picker sent the typed place name to `nominatim.openstreetmap.org` and map-tile requests to `basemaps.cartocdn.com` on every use |
| **Lifetime** | From the H1 gate until GAZ-4 (2026-08-07) |
| **Found by** | Reading `no-external.spec.ts` and noticing it never opens the map |

The test was correct. Its *name* was correct. The summary of it was not — and the
summary is what travelled into a legal document. The leaked datum was the worst
possible one: a search for your birthplace usually *is* your birthplace.

**The check:** state a test's scope in the test, not just its title, and make the
claim that cites it quote the scope. `no-external.spec.ts` now opens with a
`SCOPE:` paragraph for exactly this reason. When a test's result is promoted into
a user-facing promise, the promotion should name the test.

### A2. The corollary — a guardrail that was never allowed to be green

The fix for A1 (`GAZ-5`) was written **before** the code that would satisfy it,
deliberately, and its failing CI runs were the objective baseline that the leak
was real. That is good practice, and it is recorded here as the counter-example
that *worked*. See G1 for the cost of leaving it red too long.

---

## B. Estimates that hardened into facts

**The pattern:** a figure is written down with a caveat; the caveat is dropped on
the next read.

### B1. Gazetteer sizing was low by 1.3–1.8×

`COMPREHENSIVE_TASK_SCHEDULE.md` §6.5 explicitly flagged its numbers
_"estimates — verify at GAZ-1, do not treat as measured"_. Measured at GAZ-1:

| | estimated | measured | error |
|---|---|---|---|
| `cities15000` rows | ~26,000 | **34,078** | +31% |
| `cities15000` wire | 350–420 KB | **630 KB** | +50–80% |
| `cities5000` rows | ~55,000 | **69,577** | +27% |
| `cities5000` wire | ~2× the above | **1,299 KB** | — |

The caveat did its job: the numbers were measured before the coverage decision,
and the decision (cities5000) was taken against real figures. **This entry is
here as the success case** — an estimate labelled as an estimate survived
contact with a decision. Compare A1, where a scoped result lost its scope.

**The check:** write the caveat *into the number*, not into surrounding prose.
"~26k (estimated, unverified)" survives copy-paste; a paragraph three lines up
does not.

---

## C. Assumed-present dependencies

### C1. "The project is already a D3-SVG shop"

| | |
|---|---|
| **Recorded** | §6.5: "`d3-geo@3.1.1` is *already installed* (transitively via `d3`), and the project is already a D3-SVG shop" |
| **Actually true** | `d3` was declared in `package.json` and **imported nowhere**. No d3 chunk was ever emitted |
| **Found by** | `grep -rn "from ['\"]d3" --include="*.tsx" --exclude-dir=node_modules .` → no matches; `ls dist/assets \| grep d3` → nothing |

The conclusion drawn from it (use `d3-geo`, delete Leaflet) happened to be
right. The reasoning was wrong, and a wrong reason that reaches a right answer
is the kind that survives to be reused.

Consequence: an unused ~250 KB dependency sat in the tree as supply-chain
surface. Removed at GAZ-3, with `d3-geo` declared directly so the barrel import
cannot creep back.

**The check:** "we already use X" is a claim about imports, not about
`package.json`. Grep for the import before relying on it.

---

## D. Loss without a removal event

**The pattern:** git records who *added* a thing and no one who *removed* it,
because nobody did — a merge simply failed to carry it.

### D1. The frontend rendered a blank page for ~30 commits

| | |
|---|---|
| **Recorded** | Nothing. No issue, no note; the handoff described the app as working |
| **Actually true** | `App.tsx` read `isCurrentSky` and `birth` while declaring neither. `ReferenceError` on first render → blank page |
| **Found by** | Running `npm run build` while trying to *verify* M1, not build it |

The archaeology is the interesting part:

```bash
git log -S 'const isCurrentSky = useStore' -- frontend/src/App.tsx
# -> exactly ONE commit: 1c07bec, which ADDED the lines. None removed them.
```

`1c07bec` (PR #107) added the declarations on its branch and *is* an ancestor of
`main` — but not on `main`'s first-parent line. The merge resolution kept the
usages it introduced and dropped the declarations. No commit "removed" them, so
every removal-shaped search returns nothing.

**The check:** `git log -S` answers "who changed this string on this line of
history", not "does this exist". For a bad merge, bisect the *state* instead:

```bash
for c in $(git rev-list --first-parent A..B); do
  git show $c:path/to/file | grep -q 'the thing' || echo "absent at $c"
done
```

**The deeper check:** the build gate already reported this failure on every run.
See G1 for why nobody saw it.

---

## E. Handoffs describing a world that has moved

### E1. "ahead 3, unpushed" was also "behind 48"

`Hand_off.md` (session 21) recorded `main` as 3 commits ahead of `origin/main`
and not pushed. Accurate when written. By the time it was read, `origin/main` had
advanced **48 commits** — the operator merges fast, which the handoff itself
warns about elsewhere. A plain `git push` would have been rejected; acting on the
recorded state without re-deriving it would have wasted the first move.

**The check:** `git fetch` before trusting any recorded branch state, and record
branch positions as *commands to re-run* rather than as answers. The handoff got
this right in form — it said "run `git log --oneline origin/main..main` for the
exact set" — and that instruction is what made the drift visible immediately.

---

## F. Diagnoses recorded without being run

### F1. The biosentinel scoring bug was misdiagnosed in the handoff

| | |
|---|---|
| **Recorded** | "references `g_correct` / `g_total` / `g_streak` … but **has no elements with those ids**" |
| **Actually true** | The elements exist. They are `id="g-correct"`, `id="g-total"`, `id="g-streak"` — **hyphenated**, while the JS referenced **underscored** bare identifiers |
| **Found by** | `grep -n 'g-correct\|g_correct' biosentinel-field.html` |

Same symptom, different cause, and the difference changes the fix. The recorded
diagnosis implies "add the missing elements"; the real one is "a hyphenated id
is not a valid JS identifier, so the named-element-global shorthand can never
resolve it — use `getElementById`."

**The check:** a diagnosis is a hypothesis until it is executed. This one was
never run — the file was `ReferenceError`-ing in a browser the whole time, and
one console line would have shown `g_correct is not defined` rather than a
missing element.

---

## G. Signal decay — when red stops meaning red

### G1. A deliberately-red test masked a genuinely-red build

`no-external.spec.ts:121` was red **on purpose** (see A2) and correctly so. But
it stayed red for weeks, so the CI badge was red for weeks, for a reason
everyone knew and discounted.

Meanwhile `Frontend — tsc + vite build` was **also** failing — for D1, a real
blank-page bug — and was indistinguishable from the accepted noise. Both were red
dots on the same run.

**The check:** a test that is expected to fail must not fail the *build*. Mark it
`test.fail()` (Playwright inverts it: red-when-passing, green-when-failing, and
it flips loudly the moment the fix lands), or skip it with a tracking issue.
Intentional red is a fine TDD device for one commit and a broken smoke alarm
after a week.

---

## H. Artifacts whose labels misdescribe them

### H1. A PR described as a stacked-PR attempt was pointed backwards

PR #133 was believed to be a stacked PR left alone to avoid breaking something.
Inspected:

```
head: main  ->  base: tz-resolver-parked        # the direction is reversed
54 of 54 commits already on main
```

It proposed merging `main` *into* a parked WIP branch. It could not have affected
`main`, and nothing in it was orphaned — the opposite of the
"stacked-PR-orphan-trap" the repo had previously recorded, and which the label
invoked. The real risk was the reverse: merging it would have dumped `main` onto
a parked branch.

### H2. A file whose name contradicts its own contents

`resonarium_hologram enhanced.html` and `resonarium_hologram_cymatic_nodal_4D.html`
were byte-identical (`md5 1f59baee…`). The first is named "enhanced" while its
own `<title>` reads *Resonarium • Cymatic Nodal 4D*. Its provenance is a lone
web-UI `Create …` commit; the other arrived via a deliberate
`Update and rename rhe.html to …`.

**The check for both:** read the artifact's own metadata (`base`/`head`,
`<title>`, `git log --follow`) before its filename or its description. Names are
authored once and rarely re-checked; contents are the thing.

---

## I. Provenance changes that look like data changes

### I1. "Frozen raw data" was modified — but no measurement had changed

`~/substrate-comm` had an uncommitted change to `data/raw_measurements.json`, a
file one of its own commits calls *frozen raw data*. The textual diff looked
alarming. A semantic comparison found:

```
.provenance.git_rev:      a5b65fc… -> 4a7ed55…
.provenance.generated_utc: 01:05:46 -> 06:30:31
.psychophysics.rows[4].margin_hi:     nan -> nan
.psychophysics.rows[4].demand_value:  nan -> nan
.psychophysics.rows[4].margin_lo:     nan -> nan
```

Two real differences, both provenance metadata; the rest of the file was a
re-serialisation with a different key order. **Zero measurement values changed.**

The three `nan -> nan` lines are a second, smaller trap: `NaN != NaN`, so a naive
recursive comparison reports every NaN as a difference forever.

**The check:** diff structured data *structurally*, not as text — and make the
comparator NaN-aware before trusting its output. A key-order change and a value
change look identical to `git diff`.

---

## J. Belief about configuration vs the configuration

### J1. "I already set up Stripe with a live key"

Accurate about the Stripe **dashboard**; not about this repository. Checked
without printing any secret material:

```bash
grep -oE "^[#[:space:]]*AAE_STRIPE_[A-Z_]+=(sk_live|sk_test|whsec)?" backend/.env*
```

Every key present locally is `sk_test`/`whsec`. The only `sk_live_` strings in
the tree are a test fixture (`"sk_live_x"`), a validation branch, and
documentation telling you not to use one yet.

The belief and the reality were both true — of different systems. Worth an entry
because "it's already configured" is a claim that spans machines, and the
machine it refers to is usually left implicit.

**The check:** verify configuration *where it will run*, and phrase the check so
it can be answered without echoing a secret (grep for the key *prefix*, never the
value).

---

## The through-line

Nine of these ten are the same shape: **something was verified once, then
summarised, and the summary outlived the conditions that made it true.** The
summaries were not careless — A1's test was well written, B1's estimate was
correctly labelled, E1's handoff said exactly how to re-derive itself. What
failed was the hop from a scoped result to an unscoped sentence.

The two entries that resisted (B1, E1) share a property worth copying: **they
carried their own re-verification instructions.** "verify at GAZ-1, do not treat
as measured" and "run `git log --oneline origin/main..main` for the exact set"
are both claims that tell you how to check them. That is the cheapest known
defence, and it costs one clause.
