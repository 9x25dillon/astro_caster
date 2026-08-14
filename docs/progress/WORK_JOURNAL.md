# Work Journal — the observatory's log

_Narrative entries, newest first. The mechanics live in Hand_off.md and the
PR bodies; this is the story. Started session 15 at the operator's request._

---

## Session 27 · 2026-08-14 — agreement is not correctness

The observatory has always been built on two engines agreeing. A backend in
Python and a core in TypeScript, drift-locked by nine golden vectors, a
generative harness that draws two thousand cases a run, and a boundary suite
that checks not the number but the decision the number makes. All of it asks
one question, thousands of times, very well: *do these two agree?*

None of it can ask whether they are right. The vectors are generated from the
backend's own output, so the backend is an unfalsifiable oracle there. The
harness compares the two engines to each other. Both stay green if both are
wrong in the same direction — and since both now sit on Swiss Ephemeris, that
stopped being a theoretical concern some time ago and nobody noticed.

`parity/anchors/` exists to ask the other question. It held one value this
morning: ΔT in the year 2000. By evening it held the sidereal frame and forty
planetary positions, and it had found that the whole product was computing the
sky with an analytic approximation while every instrument on the box reported
otherwise.

The ayanamsa came first because A1 had already proved the sidereal frame was
where real bugs lived. The Lahiri constant turned up in one peer-reviewed
paper, hedged with "it is reliably learnt", from a paper careless enough
elsewhere to compute Lahiri as a linear drift from 285 AD and get a figure
identical to its Raman column. A number like that has to earn its place. It
did, by predicting something it was never fitted to: propagated back to the
Calendar Reform Committee's 1956 equinox it lands 16.11 arcseconds under the
decreed 23°15′00″, and nutation in longitude at that instant is 16.67. A
residual of −0.56, inside the accuracy of the series used to check it. One
constant reproducing a government decree from 1955 across a distinction
(mean versus true) that neither source stated outright.

Then the engine agreed with it to **0.000 arcseconds**, and that was the most
suspicious result of the day. Exact agreement is not a triumph; it is equally
consistent with the published constant having come from Swiss Ephemeris
somewhere up its own citation chain — the circularity the whole directory
exists to break, restored by the back door. It could not be settled by
reading: the vendored Swiss is compiled WebAssembly and the published docs do
not print their Lahiri base. So the 1956 decree went in as a second anchor, at
a looser tolerance and with worse provenance, purely because a 1955 Government
of India publication *cannot* have been derived from Swiss Ephemeris. The
engine reproduces it to 0.14 arcseconds. That is evidence circularity could not
have manufactured, and it is why an independent anchor at a loose bound beats a
precise one that might be a mirror.

The planetary longitudes went in next, forty of them from JPL Horizons, and
they immediately did the job. Seven failed. The 2100 epoch failed hardest on
the Moon — 13.83 arcseconds, ten times anything else — and the shape of that
is the answer: divide each body's miss by its own angular speed and the Sun,
Moon, Mercury and Venus all resolve to the same quantity, 19.9, 23.7, 21.4 and
20.5 seconds. Four independent bodies agreeing on twenty-one seconds is not a
position error. It is two ephemerides predicting different ΔT for a year whose
Earth rotation has not happened yet. ACQUISITION.md had already written that
warning down for the 2050 ΔT anchor without noticing it infects any
UT-argument *position* anchor at a future epoch. The 2100 column was withdrawn
on evidence and replaced with 2020.

What remained could not be explained away, and it was the finding of the day.
The planets were not coming from Swiss data files at all. The only `.se1` ever
vendored was `seas_18` — asteroids, which is where Chiron comes from — and
Swiss does not error when a class is missing. It answers from Moshier and says
nothing. `/api/health` could not see it either, because `_USING_FILES` tested
that a *directory existed*, not that anything was in it. The endpoint had been
reporting `swiss-files` to every check for months, and it reported it twice
more to me while I verified two production deploys earlier the same day.

Nothing about a reading was wrong. Three arcseconds is an order of magnitude
inside the arcminute that moves a body across a cusp; no chart changed, no card
changed, nobody was ever misread. What was wrong is that the system had no way
to know. The two engines shared the configuration, so they agreed with each
other perfectly while both sat a few arcseconds off the sky — the exact fault
the anchors were built for, found the first time they were pointed at
something.

Shipping the fix was more interesting than it should have been. The files were
gitignored: `*.se1` is a blanket rule and `seas_18` was only ever tracked
because somebody once forced it in. `git add -f` would have worked in ten
seconds and left the next person to rediscover the whole thing, silently, the
way this started — so the rule got the exception instead, one filename at a
time, so that adding an ephemeris stays a deliberate act with a size somebody
has to look at.

They had to go to *both* engines, and the reason is the tarot. The seed is
built from longitudes rounded to two decimals, so moving the ephemeris moves
some charts across a rounding boundary and a different seed is a different
spread. I estimated forty per cent of charts, said so out loud, then measured
it at 3.4 — one in thirty. An order of magnitude wrong, in the alarming
direction, stated before checking. The measurement was one command. Estimate to
decide whether to measure; never to report.

The last thing the change broke was the most instructive. Two forecast parity
cases went red on orbs differing by exactly 0.001 — in both directions, which
rules out a rounding-mode cause — while the engines themselves proved
bit-identical to 5.7e-14 degrees, closer than double precision can express a
difference. The vector's tolerance was 1e-6 against orbs *stored rounded to
three decimals*: it was demanding that two three-decimal numbers be bit-equal,
and it had held for a year purely because no orb had ever happened to land on a
boundary. A test can be green for its whole life and be measuring nothing. That
is the same sentence as the healthcheck with a failing streak of 11,527, and
the same sentence as a health endpoint describing a folder, and by the third
time in one day it stopped being a coincidence and started being the theme.

Underneath it, a real defect: `forecast.ts` and `advanced.ts` each kept a
private `Math.round(x*1e3)/1e3` where the backend rounds half-to-even. A1 had
caught that exact class once before in `ephemeris.ts`; the fix never reached the
other two copies, and the old ephemeris values had never sat close enough to a
boundary to expose them.

Production now agrees with JPL Horizons to 0.138 arcseconds, verified against
the live API rather than a local build — Saturn at 0.017, the Moon at 0.138,
everything else between. The residual is not noise: a near-uniform half
arcsecond across every body at 1800 decaying to nothing by 2000, which is a
precession model disagreeing, not an ephemeris. That is tomorrow's thread.

The APK is still v1.0.3 and still carries the old engine. The website and the
phone now disagree about the sky, which is a strange sentence to end on, and
the reason the handoff opens with a build.

---

## Session 26 · 2026-08-12 — reading someone else's work, and the failures that look like success

The session began as a review. Another model had spent a day on Track A and
left three pull requests behind it, each with a PR body making specific,
checkable claims: this harness goes red under a one-arcminute bias, this
ratchet refuses a widened bound, this suite is 253 for 253. The temptation with
a document like that is to read it and believe it, because it is written by
something that sounds confident and is mostly right.

So the claims got run instead of read. All of them held. The generative
harness really does go to 0/5 under an injected arcminute and really does exit
1. The boundary suite really is green and really does go red. The sidereal
whole-sign fix is real — checked not against its own test but against
pyswisseph directly, which puts the cusps at 150/180/210 where the old code
would have put them at 126.14/156.14/186.14, six degrees into every sign. The
hand-rolled `fixedHalfEven` matches Python across fourteen thousand values,
four thousand of them exact ties, where plain `toFixed` diverges on 1,501.
That is a good day's work by any measure, and it was right to say so.

Two things were wrong, and they were wrong in the same way: they failed open.

`decodeURIComponent` sat one line outside a try block, so a link truncated
mid-percent-escape threw instead of returning a note, the throw escaped the
store action entirely, and the caller's spinner never came down. The field
died mid-verify with no message and no recovery but a reload — on the one
surface, the APK, where that paste field is the *only* route a key has. A dead
field is a dead purchase.

The ratchet was the sharper one, because a ratchet that reports success is
worse than no ratchet. On a push to `main` its base resolved to `HEAD`, so it
compared the tolerance contract against its own copy and printed "no bound
widened — ok". A bound widened fivefold and pushed straight to main sailed
through; that was reproduced in a clone rather than argued from the code. And
an unresolvable base exited 0 with the same reassuring sentence as the
legitimate first-appearance case, which means the gate would have quietly
vanished in exactly the conditions that break ref resolution. Both now fail
loudly, and both were falsified in all four directions afterward.

Then the release, which had been waiting on a machine rather than on code. The
signing keystore was here all along. v1.0.2 built, signed, certificate
fingerprint matching v1.0 exactly — and then sat unpublished while the session
turned to the features the operator asked for next.

The daily oracle rests on one observation: a daily draw is already a pure
function of (chart, date). `defaultSeed` folds the local date in, and the draw
is the parity-locked MT19937 over it. Which means the app can compute sixty
days ahead, hand the results to the notification scheduler and to Android's
SharedPreferences, and let two surfaces that cannot run our JavaScript — a
notification firing at 8am, a widget redrawing while the app is closed — read
a plain string later. No push service. No FCM token. Nothing about a birth
chart leaving the phone for a feature whose entire content is derived from
one. It also kept Android from becoming a third engine under a parity lock
that has two, which is the version of this that would have rotted.

The phone found three things the browser and the full CI matrix both missed.
Capacitor's `registerPlugin` returns a Proxy, and resolving any promise with it
makes the runtime probe for `.then` — which the Proxy dutifully forwards to
native as a method call named "then". The global `input {width:100%}` applies
to checkboxes, so the daily toggle claimed its entire row and shoved its own
label off the screen. And a VectorDrawable can compile, package into
`drawable-v24/`, and still fail to inflate on device, dropping the whole
adaptive icon to Android's robot placeholder with nothing in logcat naming it.
That last one was not solved, only bisected and routed around; the dead end is
written into the PR so the next person does not spend the afternoon on it.

The icon is the part worth remembering. It was found by accident — the daily
notification delivered correctly and then sat in the shade under a generic blue
X, and the question "why is that not our mark?" turned out to have the answer
"because it never was". Astra had shipped the stock Capacitor template logo as
its face since v1.0: on the home screen of everyone who installed it, in the
notification shade, beside every reading. Nobody had looked, because nobody had
had a reason to look at a notification before. The caduceus that was already in
the masthead and the favicon is now the icon, extracted as a real outline from
Noto Sans Symbols rather than set as text.

The release went out as **v1.0.3**, not the v1.0.2 four documents had
predicted, because the session-26 features merged before the build was cut and
a version name should follow the artifact rather than the plan. Its checksum
was taken from the file downloaded back off GitHub, not from the local build
that made it — signing embeds timestamps, and "the file I built" and "the file
they get" are the same bytes only if you check.

What is left is the smallest and most annoying thing in the session: the
landing page still advertises v1.0.1. The edit is written and reviewed; the
live site serves the old page until someone runs two commands on the origin
box. The release is out and the people it is for cannot see it yet.

---

## Session 25 · 2026-08-12 — the last mile, and the cards learn to turn over

The session opened with a sweeping work order — twenty-odd deliverables across
parity, privacy, determinism, and hardening, written from the README alone and
honest enough to say so. Its own first instruction was to check it against the
live state before building anything, and the check mattered: the order
prescribed a launch the repository had already performed the day before. The
reconciliation is written down (`RECONCILIATION_2026-08-12.md`); its most
useful finding is what NOT to do — three of the order's items would quietly
reverse decisions the operator ratified on purpose, the MT19937 retirement
chief among them, since the parity lock and the tarot widget's own acceptance
both depend on that RNG staying bit-exact. The genuinely open work it names —
generative parity sampling, external ground-truth anchors — is real and now
recorded as the strongest post-launch engineering candidate.

What actually got built was the operator's own ratified order from session 24,
both halves, one bundle. The paste field first, because it is the difference
between the APK signposting a purchase and honoring one: the Library's Vault
now takes a pasted key or the entire unlock link, squeezes out the whitespace
that wrapped pastes always carry, and asks the backend to verify before
anything is stored. The verify-first ordering is the whole design — a bad
paste, a mistyped key, or a dead connection all leave the browser exactly as
it was, with a sentence explaining itself instead of a silent failure that
surfaces three screens later as a locked feature someone paid for.

The tarot widget went in second and stayed deliberately shallow: presentation
over an engine nobody touched. A dealt spread now lands face-down — an
engraved back drawn inline, nothing fetched — and each card turns on its own
tap, one flip per intent, instantly for anyone who asked their device for
reduced motion. The tap that turns a card also publishes it to the margin
glass, which cost one disambiguation in an old spec (two pens on the page
once the margin holds a card) and bought the phone user a tap. The parity
suites passed untouched afterward, which is the point: the same cards, in the
same order, from the same seed — they just arrive the way a reading actually
arrives, face-down and one at a time.

The suites: 374 backend, 48 core, 25 frontend unit, the full e2e matrix green
including the no-external ledger and the offline draw. The bundle is ready
for the one APK cycle session 24 specified — build, sign, v1.0.2,
versionCode 3 — which needs the operator's machine, because the signing key
lives outside every repo, exactly as designed.

Then the operator said to start Track A, and the second half of the day was
about the difference between a test that passes and a test that could fail.

The argument for a generative parity harness had been made in the abstract:
nine fixed vectors cannot cover twelve technique families, and point samples
miss precisely where implementations diverge. It took the harness about
ninety seconds of real running to stop being an abstract argument. Fifty
stratified cases, four of them red, and every red one carried the same
signature — every house cusp off by the same amount, four or five degrees,
on sidereal charts using whole-sign houses. That is not float noise. Float
noise does not move twelve cusps by exactly the same distance.

What it was: whole-sign houses put a cusp on each sign boundary, and Swiss
Ephemeris snaps them in the frame of the chart you asked for. The TS engine
was computing the tropical cusps and then subtracting the ayanamsha along
with everything else — which is exactly right for Placidus, where the cusps
are anchored to the angles and the frame shift moves them rigidly, and
exactly wrong for whole-sign, where the cusps are anchored to the sign
boundaries themselves. Shifting them left them stranded five degrees into
each sign, which is the ayanamsha mod 30. Roughly a third of the bodies in
any such chart landed in the wrong house, and the chart looked entirely
plausible, and it had been shipping in the signed APK since the first build.

The shrinker earned its keep here. The first failing case was a 2073 birth
at latitude 40.86, longitude 151.03, at 12:37:36 with a 7¾-hour offset — six
irrelevant details wrapped around one relevant pair. It reduced to noon on
15 June 2000 at latitude 41, longitude 0, offset zero, whole-sign, sidereal.
Everything that survived the shrink was load-bearing, and the diagnosis was
readable off the minimal case rather than dug out of the original one.

Then the harness got pointed at itself. A test suite that has never failed
is indistinguishable from a test suite that cannot fail, so the bridge grew
a knob that adds a fixed bias to every longitude after computation, and a
single arcminute — the work order's stated bar — turns it red on every case
it draws. After the fix: two seeds, thirty-five hundred independent cases,
all green, including the compound path where a polar latitude forces the
whole-sign fallback *and* the chart is sidereal.

The anchors were the honest half. The point of `parity/anchors/` is that its
contents come from outside this repository, because `gen_parity_vectors.py`
writes the backend's own output and a backend regression would simply
regenerate its own alibi. The infrastructure went in whole — the provenance
contract, a CI guard that fails any anchor diff lacking an `ANCHOR-CHANGE:`
trailer, and two runners that assert each engine independently so neither can
stand in as the other's reference. The data mostly did not, because JPL
Horizons, NASA GSFC, USNO, IERS and even Wikipedia are all blocked by this
environment's egress proxy. One anchor survived that: ΔT at both ends of the
year 2000, whose exact published figures were quotable, cross-checked three
ways against the era's polynomial and drift rate, and written down *before*
the engine was asked — which is the ordering that separates an anchor from a
rationalisation. The backend answers 63.8285 and 64.0906 against a published
63.83 and 64.09.

The rest is a runbook with exact queries and a stated reason, which is what
the work order asks for when something is deferred. Inventing the numbers
was the available alternative and it was the worse one: a misremembered digit
either red-bars a correct engine, or blesses a wrong one and does it in
silence.

Then A2, which was a lesson in how comfortable a useless test feels.

The premise is that arcseconds are the wrong unit for this product. Astra's
output is categorical — a sign, a house, an aspect that is either in the
reading or not — and two engines agreeing to half an arcsecond can still put
Mars in different houses. So A2 builds a suite that constructs the hostile
case rather than waiting to stumble into it: root-find the exact instant the
Moon sits eleven thousandths of a degree short of the Aries boundary, then ask
both engines which sign it is in.

The first question was what to assert, and it is the question the whole track
turns on. "The classifications must be identical" is unsatisfiable at a
boundary: at exactly thirty degrees one engine says 29.999999 and the other
30.000001, and neither is wrong. A suite that demands identity there is flaky
forever, and a flaky suite gets muted — this repository has that scar already,
a deliberately-red test that sat red for weeks and hid a genuinely broken
build behind its noise. So the contract states the width of the band instead:
inside it, disagreement is excused and counted; outside it, disagreement is a
defect. That single definition is what turns a tolerance from decoration into
something you can check, and it is why the contract now records, for every
bound, the categorical decision that bound exists to protect.

Then the suite passed under a one-arcminute injected bias, which is the exact
acceptance criterion it was built to satisfy. It had no teeth and it looked
perfect. The knob that falsifies A1 perturbs the reported longitude after the
engine has already decided the sign, so A1 — which compares longitudes — goes
red, and A2 — which compares decisions — never notices. A falsification hook
is only valid for the comparison it sits upstream of, and nothing about the
green output said otherwise.

Moving the injection upstream of every decision did not fix it either, and the
second cause was worse. The probes were not near the boundaries at all. The
root-finder had been searching for the signed distance to the *nearest*
thirty-degree multiple, a quantity that jumps from plus fifteen to minus
fifteen at every sign midpoint, and the bisector had been dutifully converging
onto those cliffs. Every probe was sitting fifteen degrees from anything
interesting, the counts looked healthy, and the suite reported success in the
same shape it would have used if it were working. Targeting one boundary at a
time fixed the geometry; discarding any probe that failed to land where it was
aimed fixed the silence, which was the more important half. Keeping a probe
and measuring it after the fact had felt like the careful choice, and it was
precisely what let a broken generator look like a working one.

Even then the sensitivity was wrong by a factor of nothing dramatic and
everything sufficient. A probe sitting a given distance from a boundary only
flips when the injected error exceeds that distance, so the suite could only
detect a bias larger than its smallest probe outside the excused band. The
distances ran one band, then two; the floor was therefore twice the band,
comfortably above the arcminute it was supposed to catch. Two intermediate
distances closed it.

Three failures, all of them silent, all of them in the test rather than the
code under test. The suite is green now at two hundred and fifty-three
constructed cases and red under an arcminute, and CI runs the injection as a
step that fails the build if the suite survives it — because the one thing
this day established is that a suite claiming to have teeth should be made to
prove it on every run.

And then, within the hour, A1 proved its own worth by going red on the pull
request that contained all of this.

One case in two thousand, and only one field: the Julian day, differing by
exactly a millionth. Everything else agreed. The cause turned out to be sitting
in every rounded field the TypeScript engine produces. JavaScript's Math.round
rounds halves upward; Python's round rounds them to even. Longitude, latitude,
declination, speed, the angles, the cusps — all of them carried the mismatch,
and all of them hid it, because a tie costs a millionth of a degree and those
fields are compared at a hundredth. The Julian day is the single field compared
as an equality check, which is why it was the only one that could ever have
told us. On negative values the two rules do not merely differ in magnitude,
they differ in direction.

The repository had already written this bug down. RESONARIUM_PARITY.md records
the same round-half-to-even dependency for orb formatting, and says plainly
that the rounding mode is part of the specification. It was a known shape,
unfixed, in a field nobody had looked at.

The first fix made it worse, and instructively so: one divergence became five.
Scaling a number by a million before inspecting its halfway digit manufactures
ties that do not exist. The value that broke it sits a fraction above a tie —
both engines were rounding it up correctly — and multiplying by a million
rounded that fraction away, produced an exact half, and sent it down. The
lesson is narrow and worth keeping: you cannot detect a tie by doing arithmetic
on the thing you are trying to inspect. The working version leaves the
platform's own exact-value rounding alone, which already matches Python
everywhere except genuine ties, and overrides only those, detecting them by
reading the decimal expansion rather than computing with it.

Both cases are pinned in tests now — the true tie and the near-tie — because
the wrong version looks like a tidier one, and the next person to simplify it
back to Math.round deserves a red build rather than a silent divergence. The
committed vectors never moved: the fix pulled TypeScript toward Python, and
Python is what generated them.

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

Then a phone arrived, and the day got a second half.

A Pixel 10a, gifted the day before — no cellular, no Google account, a blank
SIM, bought purely to develop against. It is a better test bed than a daily
driver, because it shows exactly what a direct-download user sees with no Play
Services quietly filling gaps. It also meant A1, open since session 23 with the
note "`adb devices` is empty", could finally close.

It installed. It cold-started in airplane mode and computed a live chart — the
clock advanced 4:23 → 4:24 between two screenshots and the Moon moved with it,
which is the difference between a cached picture and real astronomy. And then
the screenshot showed two things nobody could have found any other way.

The masthead pills were rendering underneath the status bar. The shell sets
`viewport-fit=cover` and pads with `env(safe-area-inset-*)`, which is exactly
correct — for iOS. On Android the WebView populates those insets from display
cutouts, not from the status bar, so the top inset was zero. Measuring the
screenshot confirmed it: the pill sat at 54px where the padding alone would
explain 18px and nothing more. No CSS change could have fixed it. Since Android
15 an app targeting SDK 35+ is drawn edge-to-edge whether it asks or not, so
the activity now consumes the insets natively, which fixed the gesture bar at
the bottom for free.

The second was worse, and it had been true since the APK was first built. The
badge read "offline — cast on your device" while the phone was on wifi, which
is not a glitch but a structure: `API_BASE` was a relative path, and Capacitor
serves the bundle from its own `https://localhost`, so every API call resolved
to a server that does not exist. It survived because it looked fine — charts
appeared, correctly, because the on-device engine answered. But the written
readings, the narrated voice and the daily transit are all backend work. An
imported entitlement bought almost nothing, on a home screen that says "the
unlock is for the written work". Proven fixed from the server's own access log
rather than the app's optimism: `/api/v1/generate-chart`, `/api/v1/entitlement`.

Fixing it needed a rebuild, which needed the signing recipe, which produced the
day's smallest and most preventable delay — `--ks-pass file:` pointed at the
same file twice, the second read hits EOF, and the answer had been written down
in `APK_A0_FINDINGS.md` since session 23. Reading the note first would have
been faster than rediscovering it.

Then a correction that only mattered because it was caught: the rebuilt APK
still declared versionCode 1. Two materially different binaries would both have
claimed to be version 1.0, which Android will not treat as an update and Play
would reject outright. Bumped, rebuilt, re-signed, republished as v1.0.1 — and
the landing page's checksum, download URL, filename and version label all moved
with it, because a stale checksum beside a fresh download is worse than no
checksum at all: it teaches people that verifying is pointless.

A branch audit that was meant to be housekeeping turned up the day's most
interesting find, and its most interesting non-find. Twenty-seven branches, and
`git cherry` useless against a squashed main, so it took a line-level content
probe. Twenty-six absorbed. `tz-resolver-parked` was not, and the bug it fixed
was live: fractional-second offsets from millisecond-bearing probes broke a
binary search on exact equality, putting the end of local mean time at
1881-04-02 for New York instead of 1883-11-18. Every birth in that 2.6-year
window got a zone offset where it should have got local mean time, and the
chart looked entirely plausible. Forty-six existing tests passed throughout.

The non-find was `track-e1b-ask`, which looked orphaned and had to stay dead. It
carried a "your birth data never leaves this browser" claim and matching tests.
The claim is false — charts are computed server-side by default — and main had
already replaced it with an accurate one and added an assertion that the false
version stays gone. The most useful output of an audit was knowing what not to
recover.

The last act was the service worker, retired from reader builds. Inside the APK
it caches local files against an outage that cannot reach them, and it had
already caused harm: the rebuilt app kept serving the old bundle until
`pm clear`. The instinct is to disable it. Disabling is wrong — it emits no
worker at all, which leaves the workers already registered inside installed
1.0 and 1.0.1 builds in place forever, still answering from their stale
precache. A self-destroying worker gets fetched by those installs and
unregisters itself. The obvious choice would have stranded exactly the users
the change exists to protect.

Fourteen PRs, twenty commits, two releases. The observatory is live, it computes
seventeen bodies, it runs on a phone in airplane mode, it answers in Fable's
voice — and it cannot yet take money, which is now the only thing left.

The signing key was backed up at the end, encrypted, and the backup was
restored and used to sign a test APK to prove it works. It produced the same
certificate the published app carries. It is still on the same disk as the
original, which makes it not yet a backup — only a file that could become one.

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
