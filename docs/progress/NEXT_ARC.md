# NEXT_ARC.md — the user-centred arc (ratified blueprint)

_Status: **Living** — ratified by the operator 2026-07-08. The instrument is
builder-complete (see Hand_off.md); this arc is oriented around the operator
as its **user**. Sequence and wake conditions are the contract; update
statuses inline._

## Track 1 — Keep it alive (maintenance posture, recurring)

- **M1 Dependency cadence** — dependabot sweeps ~monthly; majors get a fresh
  lockfile (`rm -rf node_modules package-lock.json && npm install`).
- **M2 Vendored Swiss policy** — pinned 2.10.03; upgrade = swap artifacts,
  regenerate vectors, review diff (vendor README).
- **M3 Model watch** — `dev.py ai check` is the canary for Fable 5 / Opus
  fallback deprecations; failure = two-line env change.

## Track 2 — Own your data (first)

- **B1 Vault export/import (S)** — ✅ merged 2026-07-08 (PR #55): one file
  of all `aae.*` local state; import restores. *Done when: clear browser
  data → import → everything back.*
- **B2 The Bookshelf (M)** — ✅ 2026-07-08 (`next-arc-bookshelf`): IndexedDB
  library keyed by session seed, auto-save on generation, ❖ Shelf modal
  (reread / offline reprint via shared tomePrint / burn), Vault @2 carries
  it. Done-when proven verbatim in e2e.
- **B3 Server-side note (XS)** — ✅ merged with B1.

## Track 3 — Deepen the practice

- **P1 The Journal (M)** — capture written responses to the readings'
  journal prompts, keyed to session seed + date, local-first, markdown
  export; reflections shelve next to the reading that prompted them.
- **P2 Morning panel (S)** — at-a-glance boot surface: today's card + the
  day's tightest transits (all engines exist; composition only).
- **P3 Deck-art plates v2 (L, paid, opt-in network)** — render actual card
  images from `deck_art.py`'s deterministic prompts, for the Studio and the
  tome's plates. **Decision deferred** until after tome Phase 0 and the
  Track R redesign surfaces the deck-art studio — judge tangible impact on
  the artifact before committing to an image API and budget.

## Track R — UI reorganization (parallel, after B2)

Ratified addition: audit every feature currently buried in modal tabs
(deck-art studio, arcana calendar, learning path, eclipse timelines…);
surface them as first-class views; reflow Oracle → tarot → reading so each
section reads as a *chapter* leading toward the compiled book, including a
**"Generate My Tome"** entry point (→ PB1). Produce wireframes or a static
prototype before any heavy refactoring.

## Physical tome (docs/design/PHYSICAL_TOME_PRODUCT.md)

Phased: **Phase 0** dogfood (one printed copy, POD dark-cover test) →
**Phase 1** gifts (~5, hand-fulfilled) → **Phase 2** storefront (decision
gate; wakes payments/policy/hardening). Technical spine: B2 = corpus,
P3 = plates, **PB1 book compiler** = corpus → press-ready book-trim PDF
(extend the print-CSS route; evaluate Typst if CSS pagination hits limits).

## Track 4 — Parked, with wake conditions

- **H2 Capacitor / stores** — wakes only for other people's phones.
- **Public-deploy checklist** (RPC verification, min-wei, PII history
  decision) — wakes when a storefront is imminent (tome Phase 2).

## Sequence

**B1 → B2 → P1 → P2 → Track R (∥ after B2) → tome Phase 0 → evaluate P3 →
PB1.** Rationale: protect the artifacts being generated now, deepen the
reflect loop, then reorganize the surface around the book the corpus is
becoming.
