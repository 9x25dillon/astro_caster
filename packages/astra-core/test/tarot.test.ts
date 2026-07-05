// Tarot draw parity: the signature weights and every seeded spread draw must
// match the backend exactly (parity/tarot-draw.json). Unlike the chart vectors
// this is EXACT — the draw is pure arithmetic + the bit-exact MT19937, so any
// difference is a real bug, not cross-engine noise.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { buildNatalArcanaSignature } from "../src/tarot.js";
import { weightedDraw } from "../src/tarot.js";
import { calculateChart } from "../src/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const payload = JSON.parse(
  readFileSync(path.join(here, "../../../parity/tarot-draw.json"), "utf8")
);

for (const kase of payload.cases) {
  test(`tarot: ${kase.id}`, () => {
    const chart = calculateChart(kase.request);
    const sig = buildNatalArcanaSignature(chart);

    // Signature — the weights that feed the draw.
    assert.deepEqual(sig.suit_bias, kase.signature.suit_bias);
    assert.deepEqual(sig.major_weights, kase.signature.major_weights);
    assert.equal(sig.dominant_element, kase.signature.dominant_element);
    assert.equal(sig.dominant_modality, kase.signature.dominant_modality);

    // Every seeded spread draw — card, orientation, and position, in order.
    for (const d of kase.draws) {
      const got = weightedDraw(sig, d.spread, d.seed);
      assert.deepEqual(got, d.cards, `${d.spread} / ${d.seed}`);
    }
  });
}
