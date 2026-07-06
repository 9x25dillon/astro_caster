// Offline reading parity: buildLocalReading must reproduce the backend's
// OFFLINE build_reading_core — the exact seed string, the dealt cards, and the
// per-card meaning template — when fed the same (full) chart. This is what a
// browser produces from a cached full chart with the backend down. Exact.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { buildLocalReading } from "../src/tarot.js";
import type { ChartResponse } from "../src/types.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const payload = JSON.parse(
  readFileSync(path.join(here, "../../../parity/tarot-reading.json"), "utf8")
);

// buildLocalReading only reads planets / elements / modalities.
function asChart(slim: any): ChartResponse {
  return {
    planets: slim.planets,
    houses: [], angles: {} as any, aspects: [], patterns: [],
    elements: slim.elements, modalities: slim.modalities, meta: {},
  } as ChartResponse;
}

for (const kase of payload.cases) {
  test(`tarot-reading: ${kase.id}`, () => {
    const chart = asChart(kase.chart);
    for (const r of kase.readings) {
      const got = buildLocalReading(chart, r.spread, r.question, {
        date: r.date, source: r.source,
      });
      assert.equal(got.seed, r.seed, `${r.spread} seed`);
      const gotCards = got.cards.map((c) => ({
        card: c.card.id, reversed: c.reversed, position: c.position, meaning: c.meaning,
      }));
      assert.deepEqual(gotCards, r.cards, `${r.spread} cards/meanings`);
    }
  });
}
