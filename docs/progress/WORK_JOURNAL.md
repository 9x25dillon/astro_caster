# Work Journal — the observatory's log

_Narrative entries, newest first. The mechanics live in Hand_off.md and the
PR bodies; this is the story. Started session 15 at the operator's request._

---

## Session 24 · 2026-08-11 — the day it went live, and four things that were only pretending to work

The operator arrived with a domain, no VM, and $100 of API credit. By the end
Astra was serving real readings at astra-arcana.com to anyone who typed it.
Almost none of the day was spent building the product. It was spent finding
things that looked like they worked.

The first was the deploy layout, parked since session 23 as an M4 decision. The
landing page assumed it sat at `/` with the app at `/app/`; nginx did the
opposite. What settled it was not preference but two independent facts, either
one fatal: the app's service worker registers with scope `/`, so on a shared
origin it would answer navigations to `/` from its precached shell and silently
eat the landing page for every returning visitor — and `frontend/dist` doubles
as Capacitor's webDir inside the *signed* APK, so rebasing Vite to `/app/` would
make a binary nobody can cheaply re-sign fetch `/app/assets/*` against a root
with no such prefix. Two origins cost one DNS record and dodge both.

Then the test suite turned out to be spending money. `pytest` had been making
live Fable-5 calls — five course generations at a 24k-token budget per run —
because `conftest.py` neutralises personal mode, trust mode, the ephemeris and
the receipts DB "so a local run matches CI", and never neutralised the provider
keys. `test_course.py` documented the gap as an *assumption* in its docstring:
"no Anthropic key in the test env". True on CI, which has no `.env`. False on
the operator's machine. It had been invisible for months because an unfunded key
fails instantly and looks exactly like the offline path working; funding the
account is what turned a silent no-op into spend. The suite went from six
minutes and two failures to 370 passed in 4.75 seconds.

Buying the server was its own education. Hetzner's price list quotes machines it
cannot sell. `cx33` lists at $8.99 and is provisionable in no EU location;
Falkenstein reported zero available types of *any* kind. Only
`/v1/datacenters[].server_types.available` knows, and nothing says so until the
create call returns `error during placement` — after the SSH key and firewall
already exist. Two wrong recommendations were given to the operator on the
strength of a price list before that was understood. Prices are also USD despite
the EU locations, and US regions run about 5.8x EU for the same specs. The
preflight now asserts all of it.

The deploy came up clean and was wrong in three ways. Cloudflare runs `full`,
meaning it speaks HTTPS to the origin, and nginx listened on 80 only — the first
real request would have been a 502. The compose file's enumerated environment
block had drifted and never passed `AAE_ANTHROPIC_API_KEY`, `AAE_OPENAI_API_KEY`
or `AAE_CORS`, so every paid tier would have run permanently on the offline
compiler while `/api/health` said `ok`. And `backend/ephe/` is gitignored, so a
fresh clone — which every deploy is — has no ephemeris; `COPY . .` produced an
image without it, the backend fell back to Moshier, and **Chiron vanished from
every chart**. Sixteen bodies instead of seventeen, every other position
bit-identical, nothing logged. The lesson worth keeping is that `/api/health`
returning `ok` proves almost nothing; the fields that matter are `ephemeris`,
`personal_mode` and `ai.configured`.

The offline game was the operator's idea and the best one of the day. TAPBLADE
now answers failed navigations on the landing page, exactly as Chrome's dinosaur
does. It could not go in the app: the observatory already works completely
offline, so there is no void to fill, and a game in front of a working
instrument would be replacing something with nothing. The worker shipped with a
bug that passed a casual test — a plain `fetch(request)` while offline is
answered from the browser's *own* HTTP cache, resolves, and never reaches
`.catch()`, so the fallback worked only for pages a visitor had never opened.
It would have failed for precisely the returning visitors who have a worker
installed. Caught only because the test asserted `/` and not just the
convenient case.

A branch audit was meant to be housekeeping. `git cherry` cannot see through a
squash, and reverse-applying each branch's diff fails on all of them once main
has moved, so it took a line-level content probe across 26 branches to get an
answer. Twenty-five were absorbed. One was not: `tz-resolver-parked` carried a
fix main never received, and the bug was live. `zoneOffsetMsAt` probed
`Intl.formatToParts` with millisecond-bearing instants, producing
fractional-second offsets, and `firstTransition` binary-searches on exact
equality — so the end of local mean time came out as 1881-04-02 for New York
instead of 1883-11-18. Every birth in that 2.6-year window got a zone offset
where it should have got LMT, and the chart looked entirely plausible. All 46
existing tests passed throughout, because nothing exercised the pre-1883
boundary.

One branch had to stay dead. `track-e1b-ask` looked orphaned — it carried a
"your birth data never leaves this browser" claim and matching tests. That claim
is false: charts are computed server-side by default. Main had already replaced
it with an accurate one and added `expect(claim).not.toContainText(...)` to keep
it gone. The audit's most useful output was knowing what *not* to recover.

M0 finally ran, five sessions after it was first scheduled, and passed — against
the real deployment rather than localhost. Four defects stood in front of it and
none were in the rail: compose forwarded no `AAE_STRIPE_*`; it forwarded no
`AAE_PUBLIC_URL`, whose default would have redirected paying customers to
`127.0.0.1:5173`; the fix for those crash-looped the entire API, because
`${VAR:-}` *sets* a variable to empty and `os.environ.get(k, default)` only
falls back when a key is absent, so `float("")` raised at import time and
uvicorn could not load the app at all. `budget.py` had carried a tolerant
helper for exactly this all along — which is why the cost controls survived the
identical passthrough while the Stripe rail did not. The fix was to adopt the
idiom already in the codebase.

The fourth was in the runbook. M5 said to refund the test purchase and confirm
revoke. Refunding left `tier: supporter` intact; only cancelling produced
`tier: free`. The mint stores `ref = payment_intent OR subscription OR
session_id`, so a subscription's ref is `sub_…`, while `charge.refunded` gives
`py_…` — different namespaces, so the lookup can never match. That is
defensible behaviour, and correct for one-time purchases. What was not
defensible was a runbook that would have had the operator discovering it during
his first real transaction.

The day closed by taking the payment rail back down. Test keys on a public
instance mean anyone can mint a genuine 365-day entitlement with card 4242 — the
rail mints on a completed session regardless of key mode. The roadmap warns
loudly about live keys arriving too early and says nothing about test keys
staying too long.

Nine PRs merged. The observatory is live, it computes seventeen bodies, it
answers in Fable's voice, and it cannot yet take money — which is now the only
thing left.

---

## Session 23 · 2026-08-08 — a price list mistaken for a wiring diagram

The session was asked to finish two things a closed terminal had interrupted: a
landing page and an APK. Both finished. The day's actual work started with a
question the operator asked in passing — what happens when the API calls fail —
and ended with three cost controls that were present, plausible, documented, and
doing nothing.

The APK first, because it was supposed to be impossible. #150 had recorded that
no APK could be built on this machine: java and adb, no SDK, no gradle. That was
true when written and had quietly stopped being true — the SDK was installed at
22:25 the previous night, `cap add android` ran at 22:28, and then the terminal
died before anything was built. So the work was less "build an APK" than "notice
that the blocker had already been removed."

What stood between here and a signed artifact was the JDK, which fails in three
different ways depending on which one you have. JDK 17 says `invalid source
release: 21`, which at least names the problem. JDK 26 gets further, launches
Gradle fine, and then dies inside AGP's `JdkImageTransform` running `jlink`
against `android-36` — an error that names `jlink` and reads like a corrupt SDK.
The machine had 17 and 26 and neither works; 21 does. Two failed builds to learn
one number, which is now written down in three places.

Then the part worth being embarrassed about. The reader-mode shell hardcodes
where a user goes to subscribe, and it pointed at `astra-arcana.com/#support`.
The landing page's only anchor was `#pricing`. That is a dead link, obviously,
so it was fixed to `#pricing`, the bundle rebuilt, the project re-synced, the
release APK rebuilt, and the whole thing re-signed — and then `App.tsx:101`
turned up, routing `#support` to the Support panel, which is the buy surface.
The original link was correct. Two full build-and-sign cycles spent on a `grep`
that would have taken four seconds.

The recovery was better than either starting position, which is the only
consolation on offer. Whether `#support` or `#pricing` resolves depends entirely
on the deploy layout, and the deploy layout is an M4 decision nobody has made:
today's nginx serves the *app* at `/`, while the landing page assumes it lives
there itself. Neither anchor was safe, and an APK is the one artifact you cannot
quietly re-point after it is distributed. So the landing page grew an
`id="support"` anchor and the URL stayed, and now the link works under both
layouts. A signed binary no longer depends on an unmade decision.

Then the operator asked how he would know when to top up the AI balance, and the
answer turned out to be that he wouldn't. `metrics.py` counts successful
provider calls — deliberately, with a comment explaining that the point is
spend, which is correct for a spend metric. The consequence is that when the
provider dies, the counter stops going up. A counter that stops going up is
byte-for-byte what "nobody used the product" looks like. Those two readings
demand opposite responses — fix your billing, or fix your marketing — and the
ambiguity is sharpest exactly when it is most expensive, in the days after a
launch when traffic is high and an exhausted balance is likely. Every visitor in
that window silently receives the offline compiler instead of the product, and
nothing anywhere records that it happened.

Pulling that thread found the real thing. `budget.py` defines `"ask": 3000` and
`"tarot": 1200` in its nominal-cost table. The kinds are there. They were
designed in. Nothing has ever called them: `/api/ai-ask` never invoked
`allow_call`, and neither did the streamed ask or the tarot reading. So the
global daily cap — which `PRICING_MODEL` §6 names "the actual ceiling and it
already exists", in a section titled *the free tier is the only real leak* — did
not cover the free tier. The one path with no revenue against it was the one
path the ceiling missed, and setting `AAE_GLOBAL_DAILY_USD` would not have
bounded a cent of it.

Two more of the same shape sat underneath. Every tokenless caller keyed to the
literal string `"anon"`, so the *per-user* cap behaved as one collective
allowance for the entire internet — bounding the bill but not the damage, since
one abuser clearing local storage in a loop drains the day and every honest
visitor gets the offline compiler. And the address that both that bucket and the
rate limiter key on was, in production, the proxy's. nginx sets
`X-Forwarded-For`; the backend runs as a bare `uvicorn main:app --host 0.0.0.0`,
and uvicorn only believes forwarding headers from `127.0.0.1`. Under compose
nginx connects from the bridge network, so the header arrives, is correct, and
is ignored. The per-IP sliding window was one global window that a Sybil
attacker simply disappeared into. That one was already broken before today; it
was only found because it would have made the new bucketing pointless.

The unifying disease is one layer deeper than session 22's. That day the
*summaries* had outlived their evidence. Today the summaries were fine and the
*code* was the thing describing a system more finished than it was — a nominal
cost table read as a wiring diagram, an env var read as a ceiling. A cost
control is not verified by reading the module that implements it. It is verified
by finding its call site on the path you care about.

The payload work at the end was supposed to be the day's multiplier and turned
out to be a correction. `PRICING_MODEL` §1 measured the chart at 5,646 tokens
from `parity/natal-chart.json` — the full chart, which the prompt never carried,
since `_build_context` discards 72% of it first. And §6 predicted trimming would
bring a free reading "to well under a cent", which no input optimisation could
ever do: 700 output tokens cost $0.0105 by themselves. Output was already about
three quarters of the cost and the prediction was arithmetically impossible. The
real result is a 73% smaller chart block and a 24% cheaper reading — worth
having, not the fivefold thing the document implied. The first attempt at
measuring it was made against the same wrong file, which is a good argument for
writing the lesson down in the imperative: measure the string the model
receives, not the file it was derived from.

The day closed on a merge conflict that was not one. PR #152 was squash-merged
while three more commits were still being pushed to the branch, so main received
a *prefix* of the work and the next merge conflicted in six places. All six had
the same shape — our side a strict superset, because main's version of those
lines came from our own earlier commits. The tempting resolution was the
dangerous one: accepting both sides on three of them would have kept two copies
of `BUDGET.record(...)`, charging every paid call twice and halving the very cap
the day had been spent installing.

## Session 22 · 2026-08-07 — the summaries that outlived their evidence

The session was asked for as housekeeping: push main, delete a duplicate, fix a
small dead readout, start the purchase UI. Four of those were done in the first
twenty minutes. The fifth turned into the whole day, because starting the
purchase UI meant first checking whether it existed — and it did, and the app
it was supposed to live in did not run.

`main` had been rendering a blank page for about thirty commits. `App.tsx` read
`isCurrentSky` and `birth` and declared neither: bare identifiers, no binding in
any scope, `ReferenceError` on the first render. Not a subtle degradation — a
white screen. PR #107 had added those two lines on its branch, and the merge
that brought it in kept every usage it introduced and dropped the declarations.
Nobody removed them, which is why every removal-shaped search comes back empty;
`git log -S` finds the commit that *introduced* them and no commit that took
them away. You can only find it by bisecting the state.

The build gate had been reporting this on every single run. Nobody saw it,
because the CI badge was already red for a reason everyone knew: a test that was
deliberately failing. `no-external.spec.ts:121` had been written on purpose
against the unfixed site, to record that the birthplace map really did leave the
origin before anyone claimed it had stopped. That is good practice — it is the
only kind of green worth having — and it worked exactly as designed. But it sat
red for weeks, and a red dot next to a red dot is one red dot. The intentional
failure gave the real failure somewhere to hide.

So the second half of the day was making red mean red again, which meant
actually paying the debt the test existed to record. Typing a birthplace into
Astra sent it to Nominatim. Opening the map told CARTO which part of the world
you were looking at. For a birthplace picker those are not incidental requests;
a search for where you were born usually *is* where you were born, and the app
had been telling two companies about it while a published privacy policy said
zero external requests. That claim was never a lie. It was a true statement
about boot that got summarised without its scope and then quoted into a legal
document.

Retiring it took a vendored gazetteer — 69,577 cities from GeoNames, searched
on-device with diacritic folding so `tromso` finds Tromsø — and a world map
drawn from a Natural Earth outline instead of tiles fetched from a CDN. Leaflet
came out. The guardrail flipped red to green with no edit to its assertion; the
only thing that changed in that file was the handle used to open the map,
because the map is a different component now. The whole e2e suite is green for
the first time: 138 of 138, nothing red on purpose, no noise left for the next
real failure to hide in.

Two things worth keeping from the way it went. The scoping doc had labelled its
size estimates *"do not treat as measured"* — so they were measured, and they
were low by half, and the operator got to make the coverage call against real
numbers instead of optimistic ones. That one clause did its whole job. Against
it, the same doc asserted the project was "already a D3-SVG shop"; `d3` was
declared in `package.json` and imported nowhere at all.

Nine of the ten discrepancies catalogued today are the same shape. Something
was verified once, correctly. Then it was summarised. Then the summary outlived
the conditions that made it true. The two that survived contact — the size
estimate and the handoff's branch state — both carried instructions for
re-deriving themselves, which is a defence that costs one clause and would have
caught most of the rest.

---

## Session 21 · 2026-08-06 — everything unlocked, refusing to start

The operator's words were "a personal app is useless if I have to frikin pay
for its use." Fair, and it sounds like a paywall problem. It wasn't one. There
was no paywall anywhere near him.

Edition P — the unrestricted personal build — already existed, complete, and
had for weeks. `./run.sh --personal` grants oracle tier to every request with
no tokens, no purchase gates, no rate limits, no telemetry. The problem was
that it had been *refusing to boot*. Six live `AAE_STRIPE_*` keys sat in
`backend/.env`, and the fail-closed interlock in `assert_safe_boot()` does
exactly what it was built to do: it will not let the unrestricted build start
on a configuration that looks public-facing. Edition P must never be reachable
by paying strangers, so it fails closed rather than trusting anyone's
discipline. Correct design. Working perfectly. And the practical result was
that the operator's own machine quietly fell back to the gated public edition,
because the interlock only speaks once, at process start, into a log nobody
reads.

The trail was in our own handoff. Session 19 documented the Stripe live-test
toggle in careful detail and ended the instruction with *"Reverse the toggle
after."* A later session flipped it and never flipped it back. Two toggles left
in the Edition Q position, and a month of a personal instrument that wouldn't
open. The `.env` file's own comment block said what to do. Nobody re-read it,
because nothing failed loudly enough to send anyone back to it.

That is the shape of the whole day, in both repos: not locks, but things unable
to start. The Resonarium suite was the same story in a different mechanism —
twenty-four HTML files that are really sixteen instruments, eleven of them
loading three.js and p5 and Tone from cdnjs and their fonts from Google. Not
gated, not paid, just quietly dependent on somebody else's uptime, and
announcing his IP to Cloudflare and Google on every launch. An instrument you
can't play on a plane. So the libraries came local, and `serve.py` rewrites the
CDN references *in flight* — the HTML on disk is never touched, which means the
change is undone by simply not running it. Verified in a real browser rather
than by grep: `THREE.REVISION === 134` resolving from `vendor/`, canvas
rendering, zero off-host requests.

Then the part that wasn't asked for. Checking my own exclusions with a
`git add -A --dry-run`, the output ran long — `AURIC_OCTITRICE/`, eighty-four
gigabytes, eighteen embedded git repositories, model weights, private research,
sitting untracked in a working tree whose remote is public. One careless
`git add -A` from being published, with a broken gitlink for every embedded
repo on the way in. Ten seconds of dry-run on work I'd already finished. The
habit worth keeping isn't the fix, it's running the check after you think
you're done.

I also cut a hole and caught it in the same hour. Splitting the Stripe keys
into `backend/.env.public` created a secret file that `.gitignore` did not
cover, because the rule was the literal path `backend/.env` and matched that
one filename only. Globbed it, verified every sibling, committed it — and then,
switching branches, watched the secrets reappear as untracked, because
`.gitignore` is per-branch content and protects nothing on a branch that
predates it. The committed fix is the right fix; the thing that actually
protects him today is four lines in `.git/info/exclude`, which is
branch-independent and never leaves the machine. Which is also why the
Resonarium tooling lives there and not in `.gitignore` — a `.gitignore` rule is
itself a committed file, and "this should exist only on this machine" is not
satisfied by a rule that travels.

The morning had been elsewhere, in `substrate-comm`, and its best output was
subtraction. Three claims died under measurement: that the payload's structure
lives beyond the power spectrum (a composition-matched iAAFT surrogate is not
separated by the grammar statistic — which is what pure point diffraction
*means*, so the honest claim is the weaker one); that four unrelated codes had
been tested (four decoder/signal pairs read each other at zero error, sharing a
framing layer); and that the count code is clean at 0 dB (single-seed luck; the
ensemble says marginal). A harness whose headline numbers only ever go up isn't
measuring anything. Retiring three of them in one session is the day's actual
result, and both the report and the spec now lead with them rather than bury
them.

Servers down. Nothing pushed in either repo. The one branch worth merging is
four lines of `.gitignore`.

---

## Session 19 · 2026-07-24 — a label that lied, and a door that opens outward

The session began "let's pick up from yesterday," and the handoff said clean
slate: Phase 4 all merged. Git disagreed. Two of the four Phase-4 PRs — #100
(the Stripe rail) and #101 (the cost controls) — showed **MERGED** on GitHub
but were nowhere on main. They'd been stacked on `phase4-entitlements`, so
when #99 squash-merged to main first it orphaned that branch, and #100/#101
then merged *into the dead branch*. `stripe_rail.py` and `budget.py` didn't
exist on main. The label lied; only `git merge-base --is-ancestor` told the
truth. The whole task the operator picked — 4.3, "wire the deluxe purchase to
the Stripe rail" — was standing on a rail that wasn't there.

So first we recovered. Both orphaned squashes isolated perfectly (each a single
commit against its base), cherry-picked onto a fresh branch cut from main with
zero conflicts, and the suite came back to **319** — the exact number session
18 had recorded. That number was the proof: the recovery *was* the intended
state, nothing lost, nothing altered. Then 4.3 on top: the deluxe report as a
one-time Stripe purchase, bound to one Oracle session by the seed's **hash** —
because the raw seed ends with the user's question, only the hash rides in
Stripe metadata; the question never leaves the observatory.

Then the operator said the thing that mattered most, and it came from being
burned: *make sure a customer can actually cancel — stop auto-pay, remove the
sub — because I'm dealing with that missing from another company right now and
I won't ship it.* That's not a feature request, it's a values statement, and it
got built as one: Stripe's hosted Customer Portal behind `POST
/api/billing/portal`, a "Manage or cancel subscription" button in the Support
panel, the Stripe customer recorded at mint so the entitlement can find its own
portal, and the cancellation flowing back through the webhook to revoke access
at period end. A subscription you can't leave isn't shippable. Now you can
leave it in two clicks, no email to anyone.

Two more honesty passes rode along: CodeQL caught a partial-SSRF the moment the
new claim endpoint fed a user-supplied `session_id` into a Stripe URL path —
fixed with the same allowlist pattern the repo used for `voice_id`. And the
high dependabot alert (`brace-expansion` ReDoS) got its patch. Both PRs (#104,
#105) went green and the operator merged them — #104 onto main first-parent
clean this time, so the trap that started the day did not get to repeat itself.

We ended trying to *watch* it work: Stripe CLI installed, `.env` flipped into a
reversible Edition-Q test mode, `stripe listen` forwarding to a live backend, a
real test-mode checkout link handed over. The operator stepped away mid-test
(and, in parallel, finished their Stripe account verification and business
review — live payments are unlocked next). Servers down, `.env` restored to the
personal instance, the live click-through still pending their hands. The code
is proven by 339 tests; what's left is the ceremony of seeing the card charge
and the cancel revoke, whenever they sit down to it.

The session closed on two acts of orientation rather than code. First a README
rewrite — the old one described the app beautifully but said nothing about
monetization, the P/Q editions, or *how the work is organized*; the new one adds
a "How the project is organized" section (repo layout, the parity discipline,
the phase roadmap, the `docs/progress` living-doc system, how a change lands).
Then, at the operator's request, an intricate **launch engineering roadmap**
(`LAUNCH_ENGINEERING_ROADMAP.md`): M0 validate-in-test → M1 Track E-3 (the
purchase UI + pricing surface — the real blocker, since the rail has no
redirect-return handler yet) → M2 UX → M3 policies → M4 deploy → M5 go-live,
with the live key gated firmly to the very end. The operator has decided the
direction — the revenue app — and finished their Stripe account verification;
the last honest thing I did was tell them the live key's time is **not yet**, and
mean it. A good day: a lie in the ledger corrected, a promise (you can always
cancel) made real, and a clean map for the road ahead.

---

## Session 18 · 2026-07-23 — the till, the predicate, and a lossy seed

Three arcs, and they rhymed: each one was about making a claim honest before
anyone leans on it.

**Phase 4 — the observatory grew a till.** The whole monetization spine
landed and merged in one sitting: **4.1** the entitlement lifecycle (#99) —
revocation, renewal, device re-link, admin tooling, built as a stateful
jti-keyed ledger sitting under the existing stateless HMAC/Ed25519 tokens so
a token can be killed or renewed without breaking the offline-verifiable
shape; **4.2** the Stripe rail (#100) — checkout sessions, and a webhook
whose signature we verify by hand to Stripe's own scheme
(`HMAC_SHA256(secret, "{t}.{body}")`, 300s tolerance, constant-time compare)
so a refund event walks straight through to a revocation; **4.4** the cost
controls (#101) — an output-token-dominated cost estimate gating every AI
endpoint against per-user and global daily USD caps, a spend alarm gauge, and
— the part that matters — a graceful degrade, `allow_ai=False` dropping the
oracle/course/personal compilers back to their honest offline selves rather
than erroring when the cap is hit. The fail-closed interlock from Phase 2
still holds the line: any `AAE_STRIPE_*` or `AAE_TREASURY_*` key refuses to
coexist with personal mode. 319 backend tests green. The operator merged the
stack fast, as the handoff warned he does.

**substrate-comm — the predicate was wrong, and the fix is the deliverable.**
Over in the physics project the diffraction classifier was calling
Thue-Morse a Pisot case and nearly labelling it pure-point. The bug was
conceptual, not arithmetic: the code tested whether the sub-dominant
eigenvalue sits inside the unit circle, and for Thue-Morse it does (λ₂ = 0),
so the wrong test passed. The real disqualifier is that the characteristic
polynomial is *reducible* — `x(x−2)` factors, and reducibility is what breaks
the pure-point diffraction, with the true spectrum singular continuous
(Kakutani). So `pisot()` now requires `charpoly_irreducible()` via sympy, and
the predicate finally matches the mathematics rather than a proxy for it.
Fibonacci stays pure-point (`x²−x−1`, irreducible), Thue-Morse falls out to
singular continuous, period-doubling still resolves via Dekking. Committed
and pushed (`ce83b30`).

**The verification pass — a lossy seed, and a number that was never ours.**
The operator ran an external verification over `hellonerf.pdf`, his own natal
report, and handed back findings. Two got acted on (#103, merged), and the
second one changed how we should think about the not-yet-built resonarium.
The first, #1: the printed 2-decimal longitudes are *lossy*. Sun Quintile
Part of Fortune computes an orb of `0.44999…` from the printed seed — rounds
to 0.4 — but the report printed 0.5 because the engine had the full-precision
longitude, which sits `1.1×10⁻¹⁴` above the tie. So a printed page is not a
complete specification, and any bit-exact parity claim stated against it is
false for that aspect. Captured as a founding constraint before the
instrument exists: display-quantize before arithmetic so the printed seed
*is* the spec, keep the machine parity vector at full precision, and note
that `round()` is ties-to-even and that too is part of the contract.

The third, #3, started as "state the body set explicitly" and turned into
something sharper. Documenting `_tally_elements` meant computing it — and the
engine gives **Fire 25%, Water-dominant** for that chart, not the report's
**Fire 38%**. The 38% matches a 13-body unweighted tally the code does not
implement; it was the Fable synthesis doing its own arithmetic over the
placement list. So the report's statistic was never a substrate fact. That
became the second founding constraint in `RESONARIUM_PARITY.md`: parity
covers the *deterministic* substrate only — positions, houses, aspects,
`chart.elements`, the seeded tarot draw — and never LLM prose. The resonarium
must never quote a model's percentage as ground truth. The boundary got drawn
exactly where it belongs, and it came for free from a mismatch the operator
surfaced.

---

## Session 17 · 2026-07-20 — a live log becomes a productionization sprint

The session opened not with a plan but with evidence. The operator pasted
the terminal from a real sitting with the observatory — charts casting,
forecasts running, the arcana and the learning path and the harmonics all
answering — and buried in the healthy stream, one ugly stack trace: a
`GET /api/tts/voices` that had come back 502 because ElevenLabs dropped the
connection mid-request. Nothing was broken; an earlier call in the same run
had succeeded. It was just weather. But the observatory had turned weather
into a scary traceback for what amounts to a dropdown of voice names.

That became the shape of the whole session: take what the running system
actually does under real conditions and make it production-honest.

**#81 — TTS resilience, and a critical alert it uncovered.** The voice list
learned to retry once on a transport blip and then serve the last-known-good
list rather than erroring — a picker should never 502 over an upstream
hiccup. Synthesis got the same single retry per chunk so one drop doesn't
waste already-billed audio. And the API port's bare `GET /`, which the log
showed a browser hitting and getting a 404, now answers with a friendly
pointer. Then CodeQL, which is a live PR gate now, did exactly its job: the
moment the retry touched the synthesis line, it flagged the ElevenLabs URL
as partial SSRF — `voice_id` came from the request body straight into the
upstream path, unvalidated. The taint predated the PR; the diff just made it
visible. Fixed by allowlisting the id to the base62 shape every real
ElevenLabs id has, and URL-quoting it. Two critical alerts cleared, plus a
sweep of the fixable pre-existing ones (a `Math.random` session id, two
ReDoS-prone regex passes bounded, a stream error that had been leaking
`str(exc)` to the client).

**#82 — the API grew a version.** A pure-ASGI prefix rewrite now serves
every route under `/api/v1/*` and, on purpose, under bare `/api/*` too — an
installed PWA may be running a shell cached from before a backend upgrade,
and it should keep working. Pure ASGI, not `BaseHTTPMiddleware`, because the
latter would buffer the SSE stream. Unknown versions 404 rather than
pretending to honor a contract we never wrote. The frontend moved to
`/api/v1`; five e2e specs that had matched exact `/api/<endpoint>` globs —
which a version prefix silently breaks — were converted to suffix
predicates. The whole app was then driven end to end through `/api/v1`, 80
tests green.

**#84 — the logs learned to speak JSON, and to keep a secret.** Structured
lines in production, human in dev, a request id on every record and echoed
as `X-Request-ID` for cross-referencing a user's report with the server's
side of it. The subtle part was the access line: uvicorn's own logs from
outside the request's async context, so the request-id contextvar is
invisible to it — measured, not assumed. So uvicorn's access log is silenced
and the app emits its own, which is better anyway because it strips the query
string before logging the path. That last detail is the one that matters:
`?entitlement=` carries a token, and a token must never reach a log. The
no-birth-data-in-logs promise stopped being a promise and became a test that
drives real endpoints with a distinctive fake birth and greps every record
for a leak.

By the close the session had walked Phase 2 into Phase 3 and gotten most of
the way through it: 3.1 versioning merged, 3.2 logging green and awaiting the
merge button, and 3.3 metrics — which had briefly been parked as an honest
"do not merge" WIP when the operator stepped in mid-turn — picked back up
and finished in the same sitting: the finished registry got its wiring
threaded through the logging middleware and all eight AI-spend sites, a
`/metrics` endpoint gated to the operator and held deliberately off the
public prefix, and nine tests plus a live scrape to prove the counters
move and the scan-path folding holds. It went out as PR #85, stacked on
the logging PR, green. Phase 3 stood at 3.1–3.3 done, backups and staging
ahead. The observatory was left running because the operator was still in it.

---

## Session 15 · 2026-07-11 → 07-12 — Track R lands whole, and the book gets its press

This was the session the redesign stopped being wireframes. Four PRs went
from build sheet to merged main in one continuous arc — the operator
merging each as it went green — and by the end the observatory had become
the thing the artifact mockup promised: a holographic instrument with
eight chapters orbiting a wheel, one margin that serves everything, a
Library with a book that thickens as you read, and a material language
where nothing glows unless it's alive.

**R-2 — the margin glass (#68).** The six chapter surfaces shed their
modal chrome — overlay wrappers, ✕ buttons, per-component Escape handlers,
all the apparatus of windows pretending to float over an app that no
longer works that way. In their place: one margin, three zones. Chapters
publish whatever is selected — a drawn card, an eclipse, a fixed star, a
shelf session — into a single generic note the margin renders, with a
JournalPad beside every selection and Ask pinned at the foot of every
chapter. Two truths only driving the app revealed: the stage's rows
outgrow the viewport so the margin had to learn to ride sticky, and the
mini dial rail's corner had to yield to the Ask foot.

**R-3 — the Library (#69).** Chapter VIII grew from a bare shelf into the
Library proper: the vault moved in from the profile bar, support & unlock
took residence, and ✦ Generate My Tome arrived with its spine meter — a
book's edge that fills with gilt segments as sessions, courses, and
reflections accumulate, honest about the chapters still waiting. Oracle
and Soul folded into the Reading, leaving exactly four true overlays. The
voice canon landed as copy: one refrain at the foot of every chapter.
The deep layout bug of the day: the app grid was pinned at 100vh, so tall
chapters overflowed their tracks and the sticky margin silently vanished
past the fold — the grid learned to grow.

**R-4 — the material pass (#70).** Deliberately last, deliberately a
late-override block: void glass over the starfield, phosphor-gold
structure, amethyst border-fields, and the ion trace — one new color spent
under one law, *only what is computing or live right now wears it*. The
Study's learning path became a constellation: lessons as stars on a
dashed line, each star lit not by a progress bar but by the reflection you
actually kept for it. The seven scattered clinical disclaimers collapsed
into the refrain. Mid-build the tooling's own safety classifier had an
outage; the work continued through file tools and read-only commands, and
the only scar is two planned commits landing as one.

**Tome Phase 0 (#71).** With Track R closed, the physical book got its
press: a 6×9-plus-bleed trim on the proven print path, a separate
full-bleed cover file the way POD vendors want it, and a rescue tool that
wraps the July-8 Fable sessions — which predate the Bookshelf and lived
only as loose text files — back onto the shelf where the compiler binds.
Verification went all the way to the artifact: both files rendered
headless to PDF and measured at exactly 450×666pt, the cover plate read
and judged genuinely giftable on screen. Whether it survives ink on
near-black stock is precisely the question the one ordered copy exists to
answer.

The session closed with a small live diagnosis — the deluxe purchase gate
correctly refusing a minted oracle token that wasn't the dev token — and
the right call made: don't recompile under the exhausted Fable cap, rescue
the real July-8 edition instead. The vault file was generated; the
remaining steps are the operator's hands: restore, cast, print, order.

Numbers for the record: 4 PRs (#68–#71), e2e suite grew 66 → 80 (×2
projects), zero regressions, every acceptance criterion from the build
sheets asserted in tests. The observatory ended the session shut down on
purpose, waiting for its book.

---

## Session 16 · 2026-07-19 → 07-20 — the observatory decides to go public

This was the session the direction changed. The operator ratified a plan
that had been implicit for a while but never named: build a public,
monetized product without giving up the personal instrument that already
existed. The schedule that resulted — docs/progress/PUBLIC_LAUNCH_SCHEDULE.md
— is now the map. Two editions, one codebase: **P** stays his, unlocked,
never paying, never metered; **Q** is the stranger-facing product with
tiers, rate limits, and a Stripe rail still to come.

**Phase 1 — Edition P as a boot mode, not a workaround (#75).** The dev
token had been standing in for "give me everything" since the earliest
sessions; it became `AAE_PERSONAL_MODE=1` instead — instance-wide oracle
tier, no tokens, no purchase gates, no rate limits, no telemetry. The part
that matters more than the unlock itself is the refusal: `assert_safe_boot`
now checks for public-facing signals (production env, treasury addresses,
Stripe keys, payment thresholds) and **refuses to start** if personal mode
and any of them coexist. The unrestricted build can't become the public one
by accident — that was the whole point of building it as an interlock
instead of documentation.

**Phase 2 — the public gate (#77, then #78/#79 closing what #77 opened).**
Prompt quarantine so user text can't reach a privileged path unescaped,
CORS pinned to a configured origin instead of a wildcard, nginx security
headers, CodeQL wired into CI, a secret-rotation runbook written into
DEPLOY.md. Then `/security-review` ran over the whole range looking for
what the build missed, and it found something real: the interlock's
public-signal list named the ETH and BTC treasury variables by hand and
left out Solana — a donation-collecting instance running personal mode
non-production would have booted fully unlocked, silently outside the
control's own stated contract. Small fix, prefix-matching instead of an
enumerated list, but exactly the kind of gap that a hand-written allowlist
produces and a hardening pass exists to catch. Coverage now happens by
construction: any future `AAE_TREASURY_*` chain is safe by default.

The same pass closed out what Phase 2 had marked half-done or aspirational:
a rotation drill *performed*, not just documented — `AAE_SECRET` and the
dev token actually rotated, the old token verified dead against a live
server, the new one verified live, smoke green. A drift-lock test so
nginx.conf's three duplicated header blocks (an nginx quirk — `add_header`
inheritance breaks the moment a location sets one of its own) can't
silently diverge again. The one item 2.5 listed but nothing had built —
a request size cap — got added. And four files that Phase 1.2's original
birth-data purge had missed, still carrying the operator's real
coordinates and birthdate in a test fixture and a couple of docs, got
found and scrubbed. Git history still has it — that's D1's other half,
staying an operator decision on purpose.

**A mid-work merge, and what it teaches.** The operator merged #78 partway
through — a known pattern by now, flagged in earlier sessions' gotchas —
capturing only the first two commits of a longer branch. The remaining
work reappeared as a fresh PR against the now-moved main and immediately
conflicted with itself: the doc file both sides had touched, textually
diverged rather than logically. Resolved by merging main back in and
keeping the newer text throughout — no judgment calls, just recognizing
which side of each conflict was the same content further along. Worth
naming as a pattern rather than an incident: branches that outlive a
partial merge need this same move, and it isn't dangerous once you know
what you're looking at.

**State at close:** main @ ce827f3, 0 open PRs, 233 backend tests green,
CI clean end to end (CodeQL, Gitleaks, parity, full e2e matrix). Phase 2
is exited except two items that were never going to close from a laptop
session: the D1 repo-cut itself (needs the operator's go — new GitHub
repo, hosting, what stays private) and a live external header scan
(needs Phase 3.6's staging host to exist before there's an edge to point
a scanner at). Both `AAE_OPENAI_API_KEY` and `AAE_ANTHROPIC_API_KEY` are
present in `backend/.env` now — worth noting since the last journal entry
had the OpenAI key still missing; neither was live-verified this session,
that's still open work. Dev servers shut down on purpose at close.

---
