# Tome Phase 0 — the N=1 runbook

_One physical copy: yours. Proves the pipeline, the POD vendor, and the
dark-cover print. Exit: a book on your shelf you'd gift._
_(Contract: PHYSICAL_TOME_PRODUCT.md §6, Phase 0.)_

## 1 · Put the real corpus on the shelf (once)

The July-8 Fable sessions predate the Bookshelf — wrap them:

```bash
backend/.venv/bin/python backend/tools/make_shelf_vault.py \
  --oracle oracle_report_2026-07-08.txt \
  --personal oracle_report_personal_2026-07-08.txt \
  --course course_2a5c79a37197_2026-07-10.txt \
  --short-seed f2929236c3d2 \
  --birth '{"year":…your birth JSON…}'     # optional; enables reprint plates
```

Then in the observatory: **Library (8) → The Vault → ⇑ Restore** → pick
`astra-vault-phase0.json`. The spine meter should show chapters II and VI
bound. (The vault file carries your reports — it's gitignored; guard it.)

Cast **your** chart first (load your profile) — the cover constellation,
frontispiece, and alchemy appendix come from the live cast.

## 2 · Print the two files

From **Library → ✦ Generate My Tome**:

| File | Button | Print dialog settings |
|---|---|---|
| Interior | `⎙ press interior (6×9)` | Destination **Save as PDF** · Paper size **custom 6.25 × 9.25 in** (or "defined by document") · Margins **None** · Scale 100 · **Background graphics ON** |
| Cover | `◈ cover file` | same settings — one full-bleed page |

Sanity-check the interior PDF: pages 6.25×9.25, nothing important within
½″ of the trim, the dark frontispiece plate intact, refrain colophon last.

## 3 · Order the copy (Lulu-class POD)

1. lulu.com → Create → **Print book** → size **6 × 9 in (US Trade)**,
   **hardcover casewrap**, **premium color**, 80#/100# coated paper.
2. Upload the interior PDF. Lulu re-flags anything outside spec (bleed,
   fonts embedded — Chrome's Save-as-PDF embeds).
3. Cover: use Lulu's **cover wizard**, upload the cover file as the FRONT
   panel art; let the wizard compose spine + back (spine width depends on
   the final page count — this is why the cover ships as front-art only).
4. Order **one** copy to yourself. Note the total (target: unit cost
   $15–35 → does the object feel worth $150?).

## 4 · What Phase 0 is actually testing

- **Dark-cover print quality** — the near-black gradient cover and the
  interior frontispiece plate are the known unknowns. Judge banding, ink
  coverage, gold-on-dark contrast in hand, not on screen.
- **CSS pagination limits** — Chromium can't do running page numbers
  (@page margin boxes unsupported). The dogfood copy ships without them;
  if the object wants numbers, PB1 evaluates Typst.
- **The $150 question** — would you gift this?

## 5 · Exit checklist

- [ ] Vault imported; spine shows the real sessions bound
- [ ] Interior PDF at 6.25 × 9.25 with bleed-safe margins
- [ ] Cover PDF, front-art composed by the vendor wizard
- [ ] One copy ordered · vendor: ________ · cost: ________
- [ ] In hand: dark-cover verdict ________ · worth-$150 verdict ________

Feedback lands in PHYSICAL_TOME_PRODUCT.md; Phase 1 (gifts, N≈5) only
after the object passes in hand.
