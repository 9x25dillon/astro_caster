// printReport.ts — PDF-1: client-side print renderer for the Personal Report.
//
// Turns the deluxe edition's PDF-ready markdown into a styled, paginated
// document and opens the browser's print dialog ("Save as PDF"). Design tokens
// are lifted from docs/Astro_Arcana_Report_Design_Mock.html (the visual
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

const CSS = `
  @page { size: 8.5in 11in; margin: 0.6in 0.75in; }
  * { box-sizing: border-box; }
  body { font-family: Georgia, "EB Garamond", serif; line-height: 1.6;
         color: #1A0F33; background: #F8F4E9; margin: 0 auto; max-width: 8.5in; }
  .page { page-break-after: always; padding: 0.4in; min-height: 9.5in; background: #FAF6EE; }
  .page:last-child { page-break-after: auto; }
  .cover { display: flex; flex-direction: column; align-items: center; justify-content: center;
           text-align: center; color: #F8F4E9;
           background: linear-gradient(180deg, #1A0F33 0%, #2C1654 100%); }
  .cover h2, .cover h3 { color: #F8F4E9; border: none; }
  .cover .meta { color: #C9A84C; font-style: italic; margin: 0.35rem 0; }
  h1 { font-family: "Cinzel", Georgia, serif; font-size: 2rem; letter-spacing: 2px;
       color: #2C1654; margin: 0.3rem 0 0.8rem; }
  .cover h1 { color: #F8F4E9; font-size: 2.6rem; }
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
}

/** Markdown → full standalone print document (HTML string). */
export function reportToPrintHtml(markdown: string, opts: PrintOptions = {}): string {
  const sigil = sigilSvg(opts.sigilPhrase ?? "astra arcana");
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
    return `<section class="${cls}">${h}${renderBlocks(body, sigil)}</section>`;
  });
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>${escapeHtml(opts.title ?? "Astra Arcana — Personal Report")}</title>
<style>${CSS}</style></head><body>${pages.join("\n")}</body></html>`;
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
