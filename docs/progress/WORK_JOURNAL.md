# Work Journal — the observatory's log

_Narrative entries, newest first. The mechanics live in Hand_off.md and the
PR bodies; this is the story. Started session 15 at the operator's request._

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
