// Arcana-forecast parity: the on-device daily transit-card overlay must
// reproduce parity/arcana-forecast.json (backend tarot.daily_arcana_from_events
// over forecast.generate_forecast events) EXACTLY — the mapping is categorical
// and the reversal/quiet-sky draws ride the same sha256-seeded MT19937 the
// tarot vectors already lock. The min_sig=medium cases exercise the
// event→trump path; min_sig=high leaves quiet-sky days that exercise the
// natal-weighted draw.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { calculateChart } from "../src/ephemeris.js";
import { generateForecast } from "../src/forecast.js";
import { buildNatalArcanaSignature, dailyArcanaFromEvents } from "../src/tarot.js";

import { initSwisseph } from "../src/swisseph.js";

// The extended bodies (Node/Chiron/Lilith) ride the WASM Swiss engine.
await initSwisseph();

const here = path.dirname(fileURLToPath(import.meta.url));
const payload = JSON.parse(
  readFileSync(path.join(here, "../../../parity/arcana-forecast.json"), "utf8")
);

for (const kase of payload.cases) {
  test(`arcana-forecast: ${kase.id}`, () => {
    const chart = calculateChart(kase.request);
    const signature = buildNatalArcanaSignature(chart);
    const events = generateForecast(kase.natal, kase.start, kase.days, kase.min_sig);
    const cards = dailyArcanaFromEvents(events, kase.start, kase.days, signature);
    const slim = cards.map((c) => ({
      date: c.date,
      card: c.card.id,
      reversed: c.reversed,
      natal_link: c.natal_link,
      transit_summary: c.transit_summary,
      lesson: c.lesson,
      shadow: c.shadow,
      best_expression: c.best_expression,
      alignment_action: c.alignment_action,
      journal_prompt: c.journal_prompt,
    }));
    assert.deepEqual(slim, kase.cards, kase.id);
  });
}
