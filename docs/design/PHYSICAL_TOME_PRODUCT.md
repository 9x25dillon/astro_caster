# The Physical Tome — product & business model exploration

_Status: **Draft for operator review** — created 2026-07-08. No commitments;
this document exists to make the decisions visible._

## 1. The product

A finely crafted physical book compiled from one person's complete generated
corpus — natal chart and wheel art, arcana signature, Oracle Report, deluxe
Personal Report, dealt spreads as plates, sigils and kamea, predictive
timelines — **themed by that person's own motifs**: element palette, dominant
planetary metals, lineage styling, the constellation frontispiece. Everything
listed already exists as deterministic code; the book is a new *rendering
target*, not a new engine.

Working name candidates: *The Astral Codex*, *The Tome of [Name]*, *Liber
Personae*.

## 2. Why it can work

- **The moat is personalization depth.** Print-on-demand astrology books
  exist; none are compiled from a real ephemeris-grade engine with
  seed-deterministic tarot, personal sigils, and an AI synthesis grounded in
  the math. The book is unforgeable in the way a template product isn't —
  every page derives from the customer's chart.
- **The artifact matches the audience.** The product is already framed as a
  "collectible artifact" (design doc, 2026-07-01). People who buy tarot decks
  and leather journals buy objects, not files.
- **Gift-shaped.** Natal edition (births, birthdays), synastry/Davison duo
  edition (weddings, anniversaries) — the relationship engines are already
  built and parity-locked.

## 3. The privacy tension — and its resolution

The brand's core claim is *"birth data never leaves your device."* A printed
book of that data is the maximal exception. This must be a **feature, not a
leak**:

- The print bundle is compiled **locally** (the same posture as printReport
  today) and leaves the device **once, explicitly, at the customer's
  command** — a deliberate act of manifestation, on-brand.
- Retention policy: production files deleted after fulfilment + N days;
  documented; no account required.
- A **self-print tier** keeps the purist path open: the customer downloads
  the press-ready PDF and takes it to their own bindery. Zero data leaves.

## 4. Tiers & rough economics (to pressure-test, not to commit)

| Tier | What | Unit cost (rough) | Price band | Ops |
|---|---|---|---|---|
| Digital deluxe | Press-grade PDF, book-format (exists as letter-format today) | ~$0 | $20–40 | Automated, today's rail |
| Bound edition | POD hardcover, color, ~60–120 pp | $15–35 (Lulu/Bookvault class) | $90–150 | Automated dropship |
| Artisan edition | Small-batch hand binding, foil, ribbon, slipcase | $60–150 materials+labor+POD block | $250–600 | Batch queue, weeks lead |
| Duo edition | Synastry/composite/Davison volume for two | as above +20% | +$40–80 premium | Same |

Open questions the numbers force: POD color quality on dark cover stock
(the current cover is a near-black gradient — needs a print test); whether
the artisan tier is *your* craft or a partner bindery; shipping/customs if
ever beyond the US.

## 5. Payments & the parked items it wakes

The current rail (crypto donation + trust mode) is dev-grade. Physical
commerce needs real payments (Stripe-class), which wakes several parked
items **at Phase 2, not before**: receipts (ledger exists), a privacy
policy, prompt-injection hardening if strangers' questions reach the AI,
and the public-deploy env checklist. None of this blocks Phases 0–1.

## 6. Phased path (each phase is complete on its own)

- **Phase 0 — N=1 (dogfood).** Build the *book compiler* (see §7) and print
  ONE copy: yours. Proves the pipeline, the POD vendor, the dark-cover
  print quality, and whether the object feels worth $150 before any
  commerce exists. Exit: a physical book on your shelf you'd gift.
  _Status 2026-07-12: pipeline BUILT — press interior (6×9 + bleed) and
  separate cover file from the Library's tome meter; corpus rescue tool for
  the pre-Bookshelf Fable reports. Runbook: TOME_PHASE0.md. Remaining: the
  operator's order (vendor pick §8.1) and the in-hand verdicts._
- **Phase 1 — Gifts (N≈5).** Friends/family editions, hand-fulfilled, no
  storefront. Exit: repeatable compile→order flow; feedback on what pages
  people actually linger on.
- **Phase 2 — Storefront (only if wanted).** Payments, order queue, policy
  pages, maybe the artisan tier. This is where "personal instrument"
  formally forks into "product" — a real decision gate, not a drift.

## 7. Technical implications (feeds the approved build tracks)

- **B2 (Bookshelf) is the book's data source** — the compiler reads the
  whole session library, not one report. Approved, sequenced first.
- **P3 (deck art images)** becomes the plate illustrations — the strongest
  argument yet for doing it. Image generation is opt-in network, same
  posture as the Oracle.
- **New item — PB1 "Book compiler":** the corpus → press-ready PDF at book
  trim (e.g. 6×9", bleed, imposition-friendly, chapter structure, motif
  theming from the chart's elements/metals). Extends the proven print-CSS
  route; evaluate Typst if CSS pagination hits its limits.
- **UI redesign track (R)** pairs naturally: several coded features are
  buried in modal tabs (deck-art studio, arcana calendar, learning path,
  eclipse timelines) — the redesign should audit and surface everything the
  book will showcase.

## 8. Decisions requested from the operator

1. **Phase 0 vendor**: pick one POD to test (Lulu API-class vs local print
   shop) — the dark-cover print test is the first real-world unknown.
2. **Artisan tier**: your hands, a partner, or drop it?
3. **P3 image model**: which image API, and what per-book generation budget?
4. **Naming**: does *The Astral Codex* direction feel right?
