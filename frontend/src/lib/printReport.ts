// printReport.ts — PDF-1: client-side print renderer for the Personal Report.
//
// Turns the deluxe edition's PDF-ready markdown into a styled, paginated
// document and opens the browser's print dialog ("Save as PDF"). Design tokens
// are lifted from docs/design/Astro_Arcana_Report_Design_Mock.html (the visual
// contract): Georgia serif, cream #F8F4E9, ink #1A0F33, amethyst #2C1654,
// gold #C9A84C, Cinzel-style part headers, gold pull-quotes.
//
// Privacy invariant: the {{BIRTH_INFO}} placeholder is filled HERE, in the
// browser, from local state — birth details never travel to the server or the
// AI layer. {{SIGIL}} is filled with a locally generated chaos-sigil SVG.
//
// Security: the markdown embeds model output and the user's question, so every
// text fragment is HTML-escaped BEFORE our own tags are applied — nothing from
// the report can inject markup into the print document.

import { buildChaosData, chaosToSVGPath } from "./sigil";
import { PLANET_METAL, MODALITY_PRINCIPLE } from "./alchemy";

const CSS = `
  @page { size: 8.5in 11in; margin: 0.6in 0.75in; }
  * { box-sizing: border-box; }
  body { font-family: Georgia, "EB Garamond", serif; line-height: 1.6;
         color: #1A0F33; background: #F8F4E9; margin: 0 auto; max-width: 8.5in; }
  .page { page-break-after: always; padding: 0.4in; min-height: 9.5in; background: #FAF6EE; }
  .page:last-child { page-break-after: auto; }
  .cover { display: flex; flex-direction: column; align-items: center; justify-content: center;
           text-align: center; color: #F8F4E9;
           background: linear-gradient(180deg, #0D0620 0%, #1A0F33 55%, #2C1654 100%); }
  .cover h2, .cover h3 { color: #F8F4E9; border: none; }
  .cover .meta { color: #C9A84C; font-style: italic; margin: 0.35rem 0; }
  .cover-art { width: 100%; max-width: 5.4in; margin: 0 auto 0.5rem; display: block; }
  h1 { font-family: "Cinzel", Georgia, serif; font-size: 2rem; letter-spacing: 2px;
       color: #2C1654; margin: 0.3rem 0 0.8rem; }
  .page h1::after { content: "✦ ✧ ✦"; display: block; text-align: center;
       color: #C9A84C; font-size: 0.72rem; letter-spacing: 9px; margin-top: 0.25rem; }
  .cover h1 { color: #F8F4E9; font-size: 2.4rem; }
  h2 { font-family: "Cinzel", Georgia, serif; font-size: 1.25rem; color: #2C1654;
       border-bottom: 1px solid #C9A84C; padding-bottom: 0.2rem; margin-top: 1.2rem; }
  h3 { font-size: 1.02rem; color: #2C1654; margin: 0.9rem 0 0.3rem; }
  blockquote { font-style: italic; border-left: 3px solid #C9A84C; padding-left: 0.8rem;
               margin: 0.8rem 0; color: #2C1654; }
  ul { margin: 0.4rem 0 0.8rem; padding-left: 1.3rem; }
  li { margin: 0.15rem 0; }
  p { margin: 0.5rem 0; }
  b { color: #2C1654; }
  .sigil-slot { width: 340px; height: 340px; margin: 1.2rem auto; border: 1px solid #C9A84C;
                border-radius: 50%; display: flex; align-items: center; justify-content: center; }
  .sigil-slot svg { width: 92%; height: 92%; }
  .sigil-caption { text-align: center; font-size: 0.7rem; letter-spacing: 3px;
                   color: #C9A84C; margin-top: -0.6rem; }
  .disclaimer { font-size: 0.72rem; opacity: 0.8; font-style: italic; }
  /* Rendered plates bound into the tome (from the Gallery). */
  .tome-plate { break-inside: avoid; text-align: center; margin: 0.9rem auto; max-width: 3in; }
  .tome-plate img { width: 2.75in; height: 4.75in; object-fit: cover;
                    border: 0.5pt solid #bcae90; border-radius: 6pt; display: block; margin: 0 auto; }
  .tome-plate figcaption { font-size: 0.72rem; color: #5a5142; margin-top: 0.2rem; font-variant: small-caps; }
  /* Plates — the session's dealt spread as engraved card plates (mock: .card-grid) */
  .card-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.55rem; margin: 0.9rem 0 0.4rem; }
  .tarot-card { border: 1px solid #C9A84C; background: #F8F4E9; border-radius: 3px;
                padding: 0.5rem 0.45rem 0.55rem; text-align: center; font-size: 0.75rem;
                line-height: 1.35; break-inside: avoid;
                box-shadow: inset 0 0 0 3px #FAF6EE, inset 0 0 0 4px rgba(201,168,76,0.45); }
  .tarot-card .plate-glyph { font-family: "Cinzel", Georgia, serif; font-size: 1.35rem;
                             color: #2C1654; line-height: 1.2; min-height: 1.7rem; }
  .tarot-card .plate-glyph.rev { display: inline-block; transform: rotate(180deg); }
  .tarot-card .pos { font-family: "Cinzel", Georgia, serif; font-size: 0.64rem;
                     letter-spacing: 1.6px; text-transform: uppercase; color: #2C1654;
                     margin-top: 0.25rem; }
  .tarot-card .label { font-size: 0.68rem; color: #4A5A4A; font-style: italic; margin-top: 0.1rem; }
  .tarot-card .label .rev-tag { color: #7A2F2F; }
  .tarot-card .echo { font-size: 0.62rem; color: #6B5B2E; margin-top: 0.28rem; }
  .tarot-card .kw { font-size: 0.6rem; letter-spacing: 0.5px; color: #2C1654;
                    opacity: 0.75; margin-top: 0.26rem; font-style: italic; }
  /* Two-column research layout (mock page 3) — used for the plate readings */
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 0 1.1rem; margin: 0.7rem 0; }
  .two-col p { break-inside: avoid; font-size: 0.78rem; margin: 0.3rem 0 0.55rem; }
  .plates-note { font-size: 0.72rem; font-style: italic; color: #4A5A4A; margin: 0.2rem 0 0; }
  /* Alchemical correspondences appendix */
  .alch-table { width: 100%; border-collapse: collapse; margin: 0.8rem 0 0.4rem; font-size: 0.86rem; }
  .alch-table th { font-family: "Cinzel", Georgia, serif; font-size: 0.72rem; letter-spacing: 2px;
                   text-transform: uppercase; color: #2C1654; text-align: left;
                   border-bottom: 1.5px solid #C9A84C; padding: 0.25rem 0.4rem; }
  .alch-table td { border-bottom: 1px solid rgba(201,168,76,0.35); padding: 0.32rem 0.4rem;
                   vertical-align: top; }
  .alch-sigil { font-size: 1.05rem; color: #2C1654; }
  .alch-latin { font-style: italic; color: #6b5a8e; font-size: 0.78rem; }
  .alch-stage { font-size: 0.68rem; letter-spacing: 1.5px; text-transform: uppercase; color: #8a6d2f; }
  .alch-motto { font-style: italic; color: #4a3a6e; font-size: 0.8rem; border-bottom: none !important;
                padding-top: 0 !important; }
  .alch-mark { vertical-align: -0.14em; margin-right: 0.22rem; }
`;

/* Tome Phase 0 — the press trim. Appended after CSS when trim === "book":
 * 6×9" book pages with 0.125" bleed each side (PDF page = 6.25 × 9.25in,
 * Lulu-class POD spec), symmetric safe margins ≥ 0.5" from trim, and
 * typography scaled down for the smaller measure. The COVER is a separate
 * file (pressCover in tomeCompile) — POD wants interior and cover apart. */
const PRESS_CSS = `
  @page { size: 6.25in 9.25in; margin: 0; }
  body { max-width: 6.25in; font-size: 0.84rem; line-height: 1.55; }
  .page { padding: 0.7in 0.75in 0.75in; min-height: 9.25in; }
  h1 { font-size: 1.45rem; letter-spacing: 1.5px; }
  .cover h1 { font-size: 1.7rem; }
  h2 { font-size: 1.02rem; }
  h3 { font-size: 0.9rem; }
  .cover-art { max-width: 4.4in; }
  .sigil-slot { width: 260px; height: 260px; }
  .card-grid { grid-template-columns: repeat(2, 1fr); }
  .two-col { grid-template-columns: 1fr; }
  .alch-table { font-size: 0.76rem; }
`;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Inline markdown on already-escaped text: **bold**, then *italic*. */
function inline(escaped: string): string {
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/\*([^*\n]+)\*/g, "<i>$1</i>");
}

/** Locally generated chaos-sigil SVG for the {{SIGIL}} slots. Deterministic for
 *  a given phrase (same construction as the Expression Studio's sigil). */
export function sigilSvg(phrase: string): string {
  const data = buildChaosData(phrase || "astra arcana", 150, 150, 105);
  const path = chaosToSVGPath(data);
  const spokes = data.letters.map((_, i) => {
    const a = (i * 2 * Math.PI) / data.letters.length - Math.PI / 2;
    const x = 150 + 105 * Math.cos(a);
    const y = 150 + 105 * Math.sin(a);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5" fill="#C9A84C"/>`;
  }).join("");
  return `<svg viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg">
    <circle cx="150" cy="150" r="105" fill="none" stroke="#C9A84C" stroke-width="1" opacity="0.55"/>
    ${spokes}
    ${path ? `<path d="${path}" fill="none" stroke="#C9A84C" stroke-width="2.2"
      stroke-linecap="round" stroke-linejoin="round"/>` : ""}
  </svg>`;
}

// ── Esoteric-tome cover art ───────────────────────────────────────────────────
// A deterministic generative frontispiece: the user's OWN sky. Star scatter
// seeded by the Oracle session seed, the zodiac ring, the natal planets set at
// their true longitudes and joined into a personal constellation, and the
// question's chaos sigil at the heart. Pure SVG — offline, reproducible, and
// nothing leaves the browser.

const ZODIAC_GLYPHS = ["♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓"];
const PLANET_GLYPHS: Record<string, string> = {
  Sun: "☉", Moon: "☽", Mercury: "☿", Venus: "♀", Mars: "♂", Jupiter: "♃",
  Saturn: "♄", Uranus: "♅", Neptune: "♆", Pluto: "♇",
};

/** Tiny seeded PRNG (mulberry32 over a string hash) — same seed, same sky. */
function seededRandom(seedStr: string): () => number {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface CoverArtOptions {
  /** Natal placements: id + ecliptic longitude (drawn at their true degrees). */
  planets?: { id: string; longitude: number }[];
  /** Oracle session seed — drives the star scatter. */
  seed?: string;
  /** The question — drives the central chaos sigil. */
  phrase?: string;
}

export function coverArtSvg(opts: CoverArtOptions = {}): string {
  const W = 620, H = 620, cx = W / 2, cy = H / 2;
  const rnd = seededRandom(opts.seed || opts.phrase || "astra arcana");
  const gold = "#C9A84C", cream = "#F8F4E9";

  // Star scatter — three magnitudes, kept off the central sigil disc.
  const stars: string[] = [];
  for (let i = 0; i < 110; i++) {
    const x = 18 + rnd() * (W - 36), y = 18 + rnd() * (H - 36);
    if (Math.hypot(x - cx, y - cy) < 118) continue;
    const m = rnd();
    const r = m < 0.75 ? 0.7 : m < 0.94 ? 1.25 : 1.9;
    const o = (0.25 + rnd() * 0.55).toFixed(2);
    stars.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${cream}" opacity="${o}"/>`);
  }

  // Zodiac ring — 0° Aries at 9 o'clock, counter-clockwise (chart convention).
  // U+FE0E forces TEXT presentation: engraved gold glyphs, not color emoji
  // (emoji also renders unreliably in print/PDF pipelines).
  const TEXT_STYLE = `font-family="Georgia, 'Noto Sans Symbols', serif"`;
  const zodiacR = 262;
  const zodiac = ZODIAC_GLYPHS.map((g, i) => {
    const a = Math.PI - ((i * 30 + 15) * Math.PI) / 180;
    const x = cx + zodiacR * Math.cos(a), y = cy - zodiacR * Math.sin(a);
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="19" fill="${gold}" ${TEXT_STYLE}
      opacity="0.85" text-anchor="middle" dominant-baseline="central">${g}︎</text>`;
  }).join("");
  const ticks = Array.from({ length: 12 }, (_, i) => {
    const a = Math.PI - (i * 30 * Math.PI) / 180;
    const x1 = cx + 240 * Math.cos(a), y1 = cy - 240 * Math.sin(a);
    const x2 = cx + 284 * Math.cos(a), y2 = cy - 284 * Math.sin(a);
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"
      stroke="${gold}" stroke-width="0.6" opacity="0.45"/>`;
  }).join("");

  // The personal constellation — planets at their true longitudes, joined in
  // zodiacal order into a single figure only this chart draws.
  const bodies = (opts.planets ?? [])
    .filter((p) => PLANET_GLYPHS[p.id])
    .sort((a, b) => a.longitude - b.longitude);
  const planetR = 205;
  const pts = bodies.map((p) => {
    const a = Math.PI - (p.longitude * Math.PI) / 180;
    return { ...p, x: cx + planetR * Math.cos(a), y: cy - planetR * Math.sin(a) };
  });
  const constellation = pts.length >= 2
    ? `<polyline points="${pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}"
        fill="none" stroke="${gold}" stroke-width="0.7" opacity="0.5" stroke-dasharray="1 3"/>`
    : "";
  const planetMarks = pts.map((p) => {
    const lum = p.id === "Sun" || p.id === "Moon";
    return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${lum ? 3.4 : 2.3}"
        fill="${gold}"/>` +
      `<text x="${p.x.toFixed(1)}" y="${(p.y - 11).toFixed(1)}" font-size="${lum ? 15 : 12}" ${TEXT_STYLE}
        fill="${cream}" opacity="0.92" text-anchor="middle">${PLANET_GLYPHS[p.id]}︎</text>`;
  }).join("");

  // Heart of the tome: the question's chaos sigil inside a gold annulus.
  const data = buildChaosData(opts.phrase || "astra arcana", cx, cy, 78);
  const sigilPath = chaosToSVGPath(data);
  const sigilDots = data.letters.map((_, i) => {
    const a = (i * 2 * Math.PI) / data.letters.length - Math.PI / 2;
    return `<circle cx="${(cx + 78 * Math.cos(a)).toFixed(1)}" cy="${(cy + 78 * Math.sin(a)).toFixed(1)}"
      r="1.8" fill="${gold}" opacity="0.9"/>`;
  }).join("");

  // Corner ornaments — the tome's binding flourishes.
  const corner = (x: number, y: number, sx: number, sy: number) =>
    `<path d="M ${x} ${y + 26 * sy} L ${x} ${y} L ${x + 26 * sx} ${y}
       M ${x + 6 * sx} ${y + 14 * sy} L ${x + 6 * sx} ${y + 6 * sy} L ${x + 14 * sx} ${y + 6 * sy}"
       fill="none" stroke="${gold}" stroke-width="1.4" opacity="0.9"/>`;

  return `<svg class="cover-art" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img"
    aria-label="Esoteric frontispiece: your natal constellation around your question's sigil">
    <defs>
      <radialGradient id="tome-void" cx="50%" cy="46%" r="72%">
        <stop offset="0%" stop-color="#2C1654"/>
        <stop offset="55%" stop-color="#1A0F33"/>
        <stop offset="100%" stop-color="#0D0620"/>
      </radialGradient>
      <radialGradient id="tome-halo" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${gold}" stop-opacity="0.22"/>
        <stop offset="70%" stop-color="${gold}" stop-opacity="0.05"/>
        <stop offset="100%" stop-color="${gold}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#tome-void)"/>
    <rect x="10" y="10" width="${W - 20}" height="${H - 20}" fill="none"
      stroke="${gold}" stroke-width="2" opacity="0.9"/>
    <rect x="18" y="18" width="${W - 36}" height="${H - 36}" fill="none"
      stroke="${gold}" stroke-width="0.6" opacity="0.55"/>
    ${corner(26, 26, 1, 1)}${corner(W - 26, 26, -1, 1)}
    ${corner(26, H - 26, 1, -1)}${corner(W - 26, H - 26, -1, -1)}
    ${stars.join("")}
    <circle cx="${cx}" cy="${cy}" r="284" fill="none" stroke="${gold}" stroke-width="1.1" opacity="0.8"/>
    <circle cx="${cx}" cy="${cy}" r="240" fill="none" stroke="${gold}" stroke-width="0.8" opacity="0.6"/>
    ${ticks}${zodiac}
    <circle cx="${cx}" cy="${cy}" r="${planetR}" fill="none" stroke="${gold}" stroke-width="0.4"
      opacity="0.3" stroke-dasharray="2 5"/>
    ${constellation}${planetMarks}
    <circle cx="${cx}" cy="${cy}" r="112" fill="url(#tome-halo)"/>
    <circle cx="${cx}" cy="${cy}" r="96" fill="none" stroke="${gold}" stroke-width="1.3" opacity="0.9"/>
    <circle cx="${cx}" cy="${cy}" r="88" fill="none" stroke="${gold}" stroke-width="0.5" opacity="0.5"/>
    ${sigilDots}
    ${sigilPath ? `<path d="${sigilPath}" fill="none" stroke="${cream}" stroke-width="2.6"
      stroke-linecap="round" stroke-linejoin="round" opacity="0.95"/>
    <path d="${sigilPath}" fill="none" stroke="${gold}" stroke-width="5.5"
      stroke-linecap="round" stroke-linejoin="round" opacity="0.22"/>` : ""}
  </svg>`;
}

/** One markdown part (text between `# ` headings) → HTML blocks. */
function renderBlocks(body: string, sigil: string): string {
  const out: string[] = [];
  let list: string[] = [];
  const flushList = () => {
    if (list.length) { out.push(`<ul>${list.join("")}</ul>`); list = []; }
  };
  for (const raw of body.split("\n")) {
    const line = raw.trimEnd();
    if (line.trim() === "{{SIGIL}}") {
      flushList();
      out.push(`<div class="sigil-slot">${sigil}</div>` +
               `<div class="sigil-caption">✧ YOUR PERSONAL CHAOS SIGIL ✧</div>`);
    } else if (/^!\[[^\]]*\]\(/.test(line)) {
      // Embedded image — used to bind collected plates into the tome. Only
      // data: URLs are honored (the images are the gallery's own self-
      // contained data URLs; nothing external or scriptable is injected).
      flushList();
      const m = line.match(/^!\[([^\]]*)\]\((data:[^)]+)\)\s*$/);
      if (m) {
        out.push(
          `<figure class="tome-plate"><img src="${m[2]}" alt="${escapeHtml(m[1])}" />` +
          `<figcaption>${escapeHtml(m[1])}</figcaption></figure>`
        );
      }
    } else if (line.startsWith("## ")) {
      flushList(); out.push(`<h2>${inline(escapeHtml(line.slice(3)))}</h2>`);
    } else if (line.startsWith("### ")) {
      flushList(); out.push(`<h3>${inline(escapeHtml(line.slice(4)))}</h3>`);
    } else if (line.startsWith("> ")) {
      flushList();
      const cls = line.includes("symbolic mirror") ? ` class="disclaimer"` : "";
      out.push(`<blockquote${cls}>${inline(escapeHtml(line.slice(2)))}</blockquote>`);
    } else if (line.startsWith("- ")) {
      list.push(`<li>${inline(escapeHtml(line.slice(2)))}</li>`);
    } else if (line.trim() === "") {
      flushList();
    } else {
      flushList(); out.push(`<p>${inline(escapeHtml(line))}</p>`);
    }
  }
  flushList();
  return out.join("\n");
}

export interface PrintOptions {
  birthInfo?: string;   // filled locally — never sent anywhere
  sigilPhrase?: string; // seeds the chaos sigil (e.g. the Oracle question)
  title?: string;
  /** Natal placements for the tome-cover constellation (id + longitude). */
  chartPlanets?: { id: string; longitude: number }[];
  /** Oracle session seed — makes the cover's star scatter this session's own. */
  seed?: string;
  /** When provided, an "Alchemical Correspondences" appendix page is added:
   *  each classical body's metal, opus stage, element, and principle. */
  alchemyPlanets?: { id: string; element: string; modality: string; sign: string }[];
  /** When provided, a "Plates — The Spread" page follows the cover: the
   *  session's dealt cards as engraved plates. The caller re-deals them
   *  deterministically client-side from the same seed the report reads. */
  spreadCards?: PrintSpreadCard[];
  spreadName?: string;  // e.g. "planetary_seven"
  lineage?: string;     // e.g. "Golden Dawn / Hermetic"
  /** Tome Phase 0: "book" renders at 6×9" + bleed for POD (default letter). */
  trim?: "letter" | "book";
}

export interface PrintSpreadCard {
  position: string;
  name: string;
  arcana: "major" | "minor";
  number: number | null;
  element: string | null;
  reversed: boolean;
  natalLink?: string | null;
  meaning?: string;
  keywords?: string[];
}

/** Tiny inline-SVG element triangle for print (fonts can't be trusted with
 *  the Unicode alchemical block). Ink strokes on cream. */
function elementMarkSvg(element: string): string {
  const up = element === "Fire" || element === "Air";
  const barred = element === "Air" || element === "Earth";
  const tri = up ? "M6 1.5 L11 10.5 L1 10.5 Z" : "M6 10.5 L1 1.5 L11 1.5 Z";
  const bar = barred
    ? `<line x1="3" y1="${up ? 7.4 : 4.6}" x2="9" y2="${up ? 7.4 : 4.6}"/>`
    : "";
  return `<svg class="alch-mark" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#2C1654" stroke-width="1.1" stroke-linejoin="round"><path d="${tri}"/>${bar}</svg>`;
}

/** The appendix page: metals of the reader's own sky. Static correspondence
 *  copy from lib/alchemy plus chart-derived element/sign — all escaped. */
function alchemyPageHtml(
  planets: NonNullable<PrintOptions["alchemyPlanets"]>,
): string {
  const rows = planets
    .filter((p) => PLANET_METAL[p.id])
    .map((p) => {
      const m = PLANET_METAL[p.id];
      const principle = MODALITY_PRINCIPLE[p.modality];
      return `<tr>
        <td><span class="alch-sigil">${escapeHtml(m.sigil)}</span> ${escapeHtml(p.id)}</td>
        <td>${escapeHtml(m.metal)} <span class="alch-latin">· ${escapeHtml(m.latin)}</span>
            ${m.stage ? `<div class="alch-stage">${escapeHtml(m.stage)}</div>` : ""}</td>
        <td>${elementMarkSvg(p.element)}${escapeHtml(p.element)} · ${escapeHtml(p.sign)}</td>
        <td>${principle ? escapeHtml(principle.name) : "—"}</td>
      </tr>
      <tr><td style="border-bottom:none"></td><td colspan="3" class="alch-motto">${escapeHtml(m.motto)}</td></tr>`;
    })
    .join("\n");
  if (!rows) return "";
  return `<section class="page">
    <h1>Alchemical Correspondences</h1>
    <p>The old cosmos gave each wandering light a metal, and each temperament a
    principle of the <i>tria prima</i>. The table sets your own placements
    beside their classical correspondences — read them as mirrors for
    reflection, a vocabulary rather than a verdict.</p>
    <table class="alch-table">
      <thead><tr><th>Body</th><th>Metal</th><th>Element · Sign</th><th>Principle</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <blockquote class="disclaimer">Symbolic correspondence, not chemistry or
    counsel — a contemplative vocabulary drawn from the history of the art.</blockquote>
  </section>`;
}

const ROMAN = ["0", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X",
  "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX", "XXI"];

/** Plate ordinal: trump numeral for majors, pip count + element mark for minors. */
function plateGlyph(c: PrintSpreadCard): string {
  if (c.arcana === "major") {
    return escapeHtml(c.number !== null && ROMAN[c.number] ? ROMAN[c.number] : "✶");
  }
  const mark = c.element ? elementMarkSvg(c.element) : "";
  return `${c.number ?? ""} ${mark}`;
}

const SPREAD_TITLES: Record<string, string> = {
  daily: "Daily Draw", three_card: "Three-Card Spread",
  elemental_balance: "Elemental Balance", planetary_seven: "The Planetary Seven",
  twelve_house: "The Twelve Houses", relationship: "Relationship Spread",
  transit_pressure: "Transit Pressure", shadow_integration: "Shadow Integration",
  creative_expression: "Creative Expression",
};

/** "Plates — The Spread": engraved card plates + two-column readings, per the
 *  design mock's card-grid page. Everything shown is escaped. */
function spreadPageHtml(
  cards: PrintSpreadCard[],
  spreadName?: string,
  lineage?: string,
): string {
  const plates = cards.map((c) => {
    const kw = (c.keywords ?? []).slice(0, 3).join(" · ");
    return `<div class="tarot-card">
      <div class="plate-glyph${c.reversed && c.arcana === "major" ? " rev" : ""}">${plateGlyph(c)}</div>
      <div class="pos">${escapeHtml(c.position)}</div>
      <div class="label">[${escapeHtml(c.name)} · ${
        c.reversed ? `<span class="rev-tag">Reversed</span>` : "Upright"
      }]</div>
      ${c.natalLink ? `<div class="echo">echoes natal ${escapeHtml(c.natalLink)}</div>` : ""}
      ${kw ? `<div class="kw">${escapeHtml(kw)}</div>` : ""}
    </div>`;
  }).join("\n");

  const readings = cards
    .filter((c) => c.meaning)
    .map((c) => `<p><b>${escapeHtml(c.position)} — ${escapeHtml(c.name)}${
      c.reversed ? " (rev.)" : ""
    }.</b> ${inline(escapeHtml(c.meaning!))}</p>`)
    .join("\n");

  const spreadTitle = spreadName ? SPREAD_TITLES[spreadName] ?? spreadName : "";
  const sub = [spreadTitle, lineage].filter((x): x is string => Boolean(x)).map(escapeHtml).join(" · ");
  return `<section class="page">
    <h1>Plates — The Spread</h1>
    ${sub ? `<p class="plates-note" style="text-align:center">${sub}</p>` : ""}
    <div class="card-grid">${plates}</div>
    <p class="plates-note">These plates are the session's own cards, re-dealt in
    your browser from the same deterministic seed the report reads — not a new
    shuffle. Reversed trumps print their numeral inverted, as they fell.</p>
    ${readings ? `<h2>Readings of the Plates</h2><div class="two-col">${readings}</div>` : ""}
  </section>`;
}

/** Markdown → full standalone print document (HTML string). */
export function reportToPrintHtml(markdown: string, opts: PrintOptions = {}): string {
  const sigil = sigilSvg(opts.sigilPhrase ?? "astra arcana");
  const coverArt = coverArtSvg({
    planets: opts.chartPlanets,
    seed: opts.seed,
    phrase: opts.sigilPhrase,
  });
  // Fill the local-only placeholder BEFORE escaping (value is escaped itself).
  const md = markdown.replace(/\{\{BIRTH_INFO\}\}/g, opts.birthInfo ?? "");
  const parts = md.split(/\n(?=# )/g);
  const pages = parts.map((part, i) => {
    let title = "";
    let body = part;
    if (part.startsWith("# ")) {
      const nl = part.indexOf("\n");
      title = nl === -1 ? part.slice(2) : part.slice(2, nl);
      body = nl === -1 ? "" : part.slice(nl + 1);
    }
    const cls = i === 0 ? "page cover" : "page";
    const h = title ? `<h1>${inline(escapeHtml(title))}</h1>` : "";
    // The frontispiece replaces the plain sigil slot on the cover; inner
    // {{SIGIL}} slots keep the focused chaos-sigil rendering.
    const art = i === 0 ? coverArt : "";
    const bodyHtml = i === 0
      ? renderBlocks(body.replace(/^\s*\{\{SIGIL\}\}\s*$/m, ""), sigil)
      : renderBlocks(body, sigil);
    return `<section class="${cls}">${art}${h}${bodyHtml}</section>`;
  });
  // Plates: the dealt spread as a visual break right after the cover.
  if (opts.spreadCards?.length) {
    pages.splice(1, 0, spreadPageHtml(opts.spreadCards, opts.spreadName, opts.lineage));
  }
  // Appendix: the metals of the reader's sky (only when placements provided).
  if (opts.alchemyPlanets?.length) {
    pages.push(alchemyPageHtml(opts.alchemyPlanets));
  }
  const css = opts.trim === "book" ? CSS + PRESS_CSS : CSS;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>${escapeHtml(opts.title ?? "Astra Arcana — Personal Report")}</title>
<style>${css}</style></head><body>${pages.join("\n")}</body></html>`;
}

/** Open the styled document in a new window and invoke the print dialog.
 *  Returns false when the popup was blocked (caller shows a hint). */
export function printReport(markdown: string, opts: PrintOptions = {}): boolean {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(reportToPrintHtml(markdown, opts));
  w.document.close();
  w.focus();
  // Give the new document a tick to layout before the dialog opens.
  w.setTimeout(() => w.print(), 250);
  return true;
}
