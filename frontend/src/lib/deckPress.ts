// deckPress.ts — The Archive: lay the collected tarot plates out as a
// physical deck. Two outputs:
//   pressDeck()      — a print-ready proof sheet (card-aspect grid, labelled,
//                      cut-friendly) the operator saves as PDF to review or
//                      hand to a POD tarot printer.
//   downloadDeckManifest() — a JSON index of the collected cards (id, title,
//                      source) so a print run can be reconciled against the 78.
//
// Self-contained: the images are the gallery's data: URLs, so the print
// window needs no network. Mirrors printReport's window.open→write→print path.

import type { GalleryItem } from "./bookshelf";

// Standard tarot card trim (a hair larger than poker) — 2.75in × 4.75in.
const CARD_W = "2.75in";
const CARD_H = "4.75in";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function deckToHtml(plates: GalleryItem[]): string {
  const cards = plates
    .map(
      (p) => `
      <figure class="card">
        <img src="${p.data}" alt="${esc(p.title)}" />
        <figcaption>${esc(p.title)}${
          p.source ? ` · <span class="src">${esc(p.source)}</span>` : ""
        }</figcaption>
      </figure>`
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8" />
  <title>Astra — The Deck</title>
  <style>
    @page { size: 8.5in 11in; margin: 0.5in; }
    * { box-sizing: border-box; }
    body { font-family: "EB Garamond", Georgia, serif; color: #14110c; margin: 0; }
    .cover { text-align: center; padding: 2.5in 0.5in; page-break-after: always; }
    .cover h1 { font-size: 34pt; margin: 0 0 8pt; letter-spacing: 0.04em; }
    .cover p { font-size: 12pt; color: #5a5142; margin: 4pt 0; }
    .grid { display: grid; grid-template-columns: repeat(3, ${CARD_W});
            gap: 0.28in; justify-content: center; align-content: start; }
    .card { margin: 0; width: ${CARD_W}; break-inside: avoid; }
    .card img { width: ${CARD_W}; height: ${CARD_H}; object-fit: cover;
                border: 0.5pt solid #bcae90; border-radius: 6pt; display: block; }
    .card figcaption { font-size: 8pt; text-align: center; margin-top: 3pt;
                       color: #3a3428; }
    .card .src { color: #8a7d63; font-variant: small-caps; }
  </style></head>
  <body>
    <section class="cover">
      <h1>The Deck</h1>
      <p>Astra — collected plates</p>
      <p>${plates.length} of 78 cards · pressed ${new Date().toISOString().slice(0, 10)}</p>
      <p style="margin-top:0.4in; font-size:10pt; color:#8a7d63">
        Save as PDF at 8.5×11in, margins default, background graphics ON.
        Individual card PNGs export from the Studio for a POD tarot printer.
      </p>
    </section>
    <div class="grid">${cards}</div>
  </body></html>`;
}

/** Open a print-ready proof sheet of the collected card plates. Returns the
 *  number of cards laid out (0 if none — caller can warn). */
export function pressDeck(plates: GalleryItem[]): number {
  const cards = plates.filter((p) => p.kind === "plate" && p.data);
  if (!cards.length) return 0;
  const w = window.open("", "_blank");
  if (!w) return cards.length; // popup blocked — caller surfaces it
  w.document.write(deckToHtml(cards));
  w.document.close();
  w.setTimeout(() => w.print(), 300);
  return cards.length;
}

/** A JSON index of the collected cards, to reconcile a print run against 78. */
export function downloadDeckManifest(plates: GalleryItem[]): void {
  const cards = plates.filter((p) => p.kind === "plate");
  const manifest = {
    generated_at: new Date().toISOString(),
    count: cards.length,
    cards: cards.map((p) => ({
      card_id: p.cardId,
      title: p.title,
      source: p.source,
      created_at: p.createdAt,
    })),
  };
  const blob = new Blob([JSON.stringify(manifest, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `astra-deck-manifest-${manifest.generated_at.slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
