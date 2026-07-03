# Astro Arcana Personal Report — Comprehensive Design Specification

**Version:** 1.1  
**Date:** 2026-07-01  
**Purpose:** Visual, structural, and experiential design for a premium, research-paper-style PDF report sold as an **optional, separately purchasable product**. The report is only available *after* the user has successfully generated output from the Oracle Report feature. It compiles the Oracle output + all other premium features (Arcana, sigils, tarot, predictive, advanced, psychological/evolutionary) into one cohesive, collectible artifact.

**Core Constraint:** This is a post-Oracle upsell product. Users must have an active oracle-tier entitlement *and* have produced at least one successful Oracle Report before the purchase option appears and before generation is allowed.

**Future Evolution:** This PDF design will become the foundation for a short physical book + ElevenLabs-narrated MP3 audio companion. The design prioritizes print fidelity, beautiful typography, and narrative pacing that invites the user to explore deeper with each turn of the page.

**Core Design Philosophy**
- Mathematics first, beauty second, reflection always.
- Research-paper elegance (scholarly clarity, precise citations to chart elements) meets mystical invitation (sigils, symbolic imagery, evocative whitespace).
- Every element builds curiosity: start with a powerful visual anchor, reveal layers progressively, end with actionable practices.
- Fully data-driven from the app’s premium engines (natal chart, Arcana signature, tarot spreads, Oracle Report, predictive/advanced modules, sigil generation).
- No filler. Every line of text or image references the user’s exact chart (planets, signs, houses, aspects).

**Product Positioning & Access Gating (Critical)**
- This report is an **optional, separately purchased product**.
- **Prerequisite:** User must have successfully generated output via the Oracle Report endpoint (`/api/oracle-report`) using an oracle-tier entitlement.
- The PDF is explicitly framed as the "deluxe compiled edition" of their Oracle experience.
- On the cover and in the opening pages it must clearly state: "Compiled from your Oracle Report session of [date] • Seed: [short-seed]".
- Gating logic (enforced server-side):
  1. User must hold a valid oracle-tier entitlement.
  2. Backend verifies (via telemetry or session reference) that the user has at least one successful Oracle Report for this chart.
  3. Separate payment flow (or one-time report token) unlocks the full generation.
- This creates a natural upsell path: Oracle experience → "Want the beautiful, complete, print-ready version with everything compiled?"
- The product can be priced independently of the oracle tier (e.g., one-time purchase for the PDF + future physical/audio upgrades).

---

## 1. Document Specifications

**Physical/Digital Size**
- Print: US Letter (8.5 × 11 in) or A4 with 3mm bleed.
- Digital PDF: Same dimensions, optimized for screen + print.
- Page count target: 24–36 pages (substantial but not overwhelming; expandable for physical book).

**Margins & Grid**
- Outer margins: 0.75–1 in (generous for binding and breathing room).
- Inner margin: 0.6 in (gutter consideration for physical book).
- 12-column grid or strong 2/3 + 1/3 asymmetric columns.
- Consistent baseline grid (12–14 pt for body).

**Typography (Print-Ready, Elegant)**
- Body: EB Garamond or similar high-quality serif (excellent readability, classical research feel).
- Section titles: Cinzel, Playfair Display, or Cormorant Garamond (decorative but legible).
- Accent / data labels: Inter or a clean monospace (for seeds, degrees, exact placements).
- Pull-quotes: Larger weight or italic of body font.
- Hierarchy:
  - Main title: 28–36 pt
  - Section heads: 18–22 pt
  - Subsection: 14 pt bold
  - Body: 10–11 pt
  - Captions / citations: 8–9 pt

**Color Palette (Premium Celestial)**
- Primary: Deep Amethyst (#2C1654 or #1A0F33)
- Accent Gold: #C9A84C (warm, not brassy)
- Cream / Parchment: #F8F4E9 or #FAF6EE (warm off-white)
- Midnight: #0B0B0F (for contrast elements)
- Supporting: Soft teal (#4A8C8C) for evolutionary themes, subtle silver for lines
- Text: High contrast — dark amethyst or near-black on cream. Reverse for special pages.

**Visual Language**
- Fine geometric line work (inspired by sacred geometry and ChartWheel SVG layers).
- Subtle starfield or constellation textures (low opacity).
- Decorative elements limited to borders, dividers, and sigil frames — never cluttered.
- Consistent iconography: small planet glyphs, house numbers, element symbols.

**Images & Illustrations**
- All personalized from user chart.
- High resolution (300 dpi print).
- Primary visuals: Large personalized chaos sigils, kamea squares, stylized tarot cards, simplified wheel diagrams.
- Secondary: Small inline diagrams, aspect glyphs, evolutionary timelines.
- Style: Refined, vector-clean, mystical without being ornate or kitsch.

---

## 2. Overall Narrative & Page Flow (Curiosity Architecture)

The report is structured as a progressive revelation, explicitly positioned as a compiled artifact of a specific Oracle session:

1. **Hook & Identity** — Immediate visual and emotional engagement (tied to the Oracle session).
2. **Foundation** — Scholarly grounding (chart + signature) with reference to the Oracle call.
3. **Depth Layers** — Psychological/evolutionary + full Oracle synthesis (I–V).
4. **Symbolic Mirrors** — Tarot layout + sigils (the heart of curiosity, using the same spread/question from the Oracle).
5. **Applied Life Areas** — Career and Relationship inserts (derived from the same chart substrate).
6. **Integration** — Practices, prompts, and forward path (pulled from the Oracle output).
7. **Appendix** — Full reference data (research paper credibility) + Oracle session metadata.

**Pacing Rules for Curiosity**
- Never more than 2–3 dense text pages without a strong visual break (sigil, card grid, diagram).
- Every major section opens with a “teaser” element (large image + one powerful sentence).
- Use “Curiosity Callouts” (small italic boxes): “See how your Sun placement shapes Card II…”
- Progressive disclosure: High-level summary → detailed citations → personal practices.
- White space is intentional — it invites the reader to pause and feel.

---

## 3. Detailed Section Designs & Layouts

### 3.1 Cover / Title Page (1 page, full visual impact)

**Layout**
- Full-bleed or near-full background (subtle texture + fine constellation lines).
- Centered or slightly off-center large chaos sigil (primary focal point, ~40–50% of page height).
- Title block below or elegantly integrated:  
  **ASTRA ARCANA**  
  *Personal Soul Report*  
  For [User Name]  
  Born [Date] • [Place]  
  **Compiled from your Oracle Report • [Session Date]**
- Small gold badge or line: “Deluxe Compiled Edition — Optional Post-Oracle Product”
- Subtle gold line or thin border.
- Small footer: “A Mathematics-First Symbolic Mirror” + discreet app logo or date + “Seed: [short-seed]”

**Curiosity Element**
- The sigil itself is the hook. The “Compiled from your Oracle Report” line creates continuity and FOMO for users who just experienced the oracle.

**Mockup Reference**
- See generated cover mockup image (images/1.jpg).

---

### 3.2 Opening Spread — Personal Sigil & Invocation (2 pages)

**Page 1 (left or full)**
- Large, centered chaos sigil (the one generated from the user’s core identity phrase, e.g., full name + dominant archetype or “I arrive as…”).
- Below: short invocation text (1–2 poetic paragraphs drawn from Oracle Synthesis or signature).

**Page 2 (right)**
- Two-column or elegant 2/3–1/3 layout.
- Left/main: “How This Sigil Was Born” (derivation explanation using chaosLetters method + word value).
- Small secondary kamea or planetary square if relevant.
- Right sidebar: Key chart facts in clean list (Dominant Element/Modality, Strongest Archetype, etc.).

**Visual Notes**
- Sigil rendered large, high contrast, with delicate connecting lines.
- Text wrapped respectfully around the image or placed below with generous breathing room.

**Mockup Reference**
- See two-page spread mockup (images/2.jpg).

---

### 3.3 The Natal Foundation (2–3 pages)

**Purpose:** Ground the reader in precise, visual chart data without overwhelming.

**Layout Options**
- Option A (preferred for flow): Full-page simplified wheel on left (or top), text analysis on right in two columns.
- Or elegant single-page overview followed by focused placements.

**Content Blocks**
- Large but clean wheel diagram (planets, houses, angles, major aspects highlighted).
- “The Signature” summary box (dominant element/modality, themes, shadows).
- Key placements table or flowing text with exact citations (e.g., “Sun at 23° Pisces in the 12th House — ruled by Neptune…”).

**Curiosity Devices**
- Small “Why This Matters” callouts linking to later tarot or oracle sections.
- Color-coded elements (Fire red-gold, Water teal-amethyst, etc.).

---

### 3.4 In-Depth Psychological & Evolutionary Natal Report (4–6 pages)

This is the “research paper” core.

**Structure (Research Style)**
- Psychological Lens (Moon, Mercury, Venus, Mars, aspects to them)
- Evolutionary Lens (Nodes, Pluto, Saturn, 12th house)
- Integration section

**Page Layout**
- Generous serif body text.
- Frequent short pull-quotes from the generated Oracle Report text (set in larger italic or accented color).
- Inline small diagrams (e.g., Node axis line drawing, Pluto aspects).
- Subsection headers with subtle decorative line.
- Every interpretive claim footnoted or inline-cited to exact chart data: “(Sun trine North Node, 2° orb, 12th–4th axis)”.

**Curiosity Invitation**
- “Turn the page to see how these forces appear in your active tarot spread…”

---

### 3.5 The Oracle Report — Structured Synthesis (4–6 pages)

Directly uses the fixed five-section format from the engine.

**I. The Signature — who arrives**  
Large sigil or small portrait-style visual + flowing text.

**II. The Spread — what is active now**  
One subsection per card.  
Best visual treatment: Card illustration (or elegant textual representation) on left or in a framed box, meaning + chart citation on right.

**III. The Path — anchor to growth edge**  
Clean numbered or timeline-style layout of the learning path steps.

**IV. Practices**  
Bullet or numbered list with generous space. Small decorative element per practice.

**V. Synthesis**  
The emotional and integrative climax. Set in slightly larger body text or with elegant drop cap. Ends with the journal question in a distinct styled box.

**Overall Treatment**
- The markdown headings are promoted to beautiful section openers with gold accents.
- Generous leading and margins so the long-form reading feels luxurious, not dense.

---

### 3.6 Personalized Tarot Card Layout (3–4 pages — centerpiece of curiosity)

**Design Concept**
A custom “Chart-Referenced Spread” (not generic). Positions are explicitly mapped to natal planets, houses, or angles.

Example spread skeleton (design this to be generated deterministically):
- Position 1: Your Sun (identity & conscious will)
- Position 2: Your Moon (emotional body & needs)
- Position 3: Your Ascendant (mask & approach to life)
- Position 4–6 or more: Key houses or angles (MC for vocation, 7th for relationship, etc.)
- Shadow / Growth card: North Node or Pluto placement

**Visual Layout**
- Mandala or circular / house-wheel arrangement of cards (highly inviting).
- Each card has:
  - Beautiful card image or artistic frame
  - Position label + chart reference in small caps or italic (“Sun • Pisces • 12th House”)
  - Upright/Reversed indicator
  - Short meaning + “Why this card was drawn” (weight_sources)
- Connecting lines or subtle arcs showing relationships between cards and natal factors.
- Optional “Full 78-card resonance” sidebar or small table.

**Page Flow**
- Opening page: The full spread visual (hero image).
- Following pages: Detailed card-by-card analysis with citations.
- Final page of section: “How the Spread and Your Chart Speak Together” summary.

**Mockup Reference**
- See tarot spread layout mockup (images/3.jpg).

---

### 3.7 Career Constellation Insert (2 pages, designed as “pull-out” feel or distinct chapter)

**Visual Treatment**
- Header with subtle career-related glyph or MC line drawing.
- Two-column or card-style layout.
- Key chart factors table (MC sign/degree/house, 10th house planets, Jupiter, Saturn, aspects).
- “Current & Upcoming” using predictive data (progressions, solar return highlights, eclipses).
- One or two tailored practices.

**Design Notes**
- Slightly more structured/table-heavy (research paper professionalism).
- Gold accent for “vocation” elements.

---

### 3.8 Relationship Mirror Insert (2 pages)

Similar treatment to Career but warmer palette accents.
- 7th house, Venus, Moon, Descendant.
- Reciprocity notes (even in solo reading — “How you project and attract”).
- Optional synastry-style self-reflection if data available.

---

### 3.9 Sigil Codex & Creative Expression Studio (2–3 pages)

- Gallery of 3–5 sigils (main chaos sigil + kamea for key planets + one deck-art inspired visual).
- Each with short derivation note and “How to work with this sigil” prompt.
- Links back to Expression Studio artifacts (poem, affirmation, shadow letter) if generated.

**Layout**
- Full-bleed or large images for the strongest sigils.
- Text in refined captions.

---

### 3.10 Practices, Prompts & Closing (2 pages)

- Beautifully typeset list drawn from Oracle IV + Arcana activities + journal questions.
- “Your Personal Audio Companion” callout (ElevenLabs narration of Synthesis + selected practices).
- Final page: Elegant closing sigil or small wheel + strong disclaimer box + “This report was generated for you on [date] from your exact chart.”

---

### 3.11 Appendix (2–4 pages)

- Full reference tables (planets with signs, degrees, houses, speeds).
- Complete tarot draw with weight_sources.
- Learning path steps in detail.
- Technical notes on methods (Swiss Ephemeris, seeding method, source system).
- This section gives the “research paper” credibility and satisfies analytical users.

---

## 4. Production & Implementation Notes

**Strict Gating (Post-Oracle Only — Core Business Rule)**
- This is an **optional, separately purchased product**.
- The purchase/ generation option must only be offered **after** the user has successfully called `/api/oracle-report` and received valid output.
- Required server-side checks before showing the buy button or allowing generation:
  1. User holds a valid oracle-tier entitlement.
  2. Telemetry (or a returned session reference from the Oracle call) confirms at least one successful Oracle Report for this chart + entitlement.
  3. Separate payment (extend the existing donation/verify flow with a distinct “personal_report” product) or one-time report token.
- Once purchased, issue a report-specific token. The generation endpoint validates both the oracle history and the report token.
- The PDF must prominently reference the source Oracle session (date, short seed, question, spread).

**Data Sources (All Premium Features)**
- Natal chart + advanced overlays → ephemeris + predictive + advanced modules
- Arcana signature, spreads, explainability → tarot engine (must align with the spread/question used in the triggering Oracle call)
- Structured long-form synthesis → Oracle Report (Fable 5 or offline) — this is the structural and textual heart of the document
- Sigils → sigil.ts (chaos + kamea)
- Creative prompts & activities → deck_art + tarotCopy + learning path

**Generation Path (Future)**
- After a successful Oracle Report in the UI (ArcanaModal or dedicated flow), show a clear upsell:  
  “Turn this Oracle reading into the complete, beautifully designed Personal Report PDF — optional purchase.”
- In ArcanaModal (after `setOracle(r)` succeeds), render a prominent but non-intrusive button or card: “Get the Full Personal Report (PDF) — $XX”.
- The button is only visible/enabled when the current oracle result exists and the user has oracle tier.
- Clicking it triggers a separate payment/verify flow (new product type) → backend generates the compiled PDF.
- Backend assembles the full substrate from the Oracle call + inserts.
- Render to high-quality PDF (strongly recommend WeasyPrint + HTML/CSS or a similar print-ready pipeline for perfect typography and layout fidelity).
- Images (sigils, stylized cards, wheels) generated on demand or pre-cached.
- Deliver the PDF as a downloadable file; optionally associate it with the user’s account for re-download.

**Physical Book Considerations**
- Design margins allow for perfect-bound or case-laminate.
- High-res assets prepared for print.
- Consider a “deluxe” version with spot UV on sigils or foil stamping on cover.

**Audio Companion**
- ElevenLabs voice reads: full Synthesis, selected practices, and journal questions.
- PDF includes QR code or link + timestamps for each audio section.
- Design “speaker” icon next to narratable passages.

**Accessibility & Delight**
- High contrast.
- Clear heading structure for screen readers.
- Optional “expanded” digital version with interactive chart wheel.

---

## 5. Design Principles Summary (for Implementers & Future Designers)

- **Inviting Curiosity**: One powerful visual per major section. Teaser language. Progressive depth.
- **Scholarly Trust**: Precise citations to chart data everywhere. Research-paper tone in body text.
- **Mystical Beauty**: Sigils and card layouts are the emotional and visual heart.
- **Generous Space**: Never cramped. White space signals quality and respect for the reader’s inner process.
- **Cohesion**: Every page feels like it belongs to the same elegant, mathematics-first, symbolically rich world.

---

## 6. Next Steps & Assets

1. Implement PDF generation pipeline (HTML/CSS → WeasyPrint or equivalent) that consumes existing `/api/oracle-report`, natal-arcana, deck-art, etc. endpoints.
2. Enhance sigil and card rendering for high-resolution export.
3. Create sample data templates using the existing Einstein test chart (or synthetic) to validate layouts.
4. Design the ElevenLabs script extraction logic (pull Synthesis + Practices sections).
5. Iterate on this spec after first visual prototypes.

**Reference Mockups Generated for This Design**
- Cover page (images/1.jpg)
- Two-page spread example (images/2.jpg)
- Tarot spread page (images/3.jpg)

Use these as visual north stars when building the actual renderer.

---

*This design treats the report as both a profound personal document and a beautiful, premium physical object in waiting. Every layout decision serves clarity, emotional impact, and the desire to turn the next page.*

**End of Design Specification**