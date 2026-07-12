# Work Journal — the observatory's log

_Narrative entries, newest first. The mechanics live in Hand_off.md and the
PR bodies; this is the story. Started session 15 at the operator's request._

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
