// case-bridge.mjs — Track A1: the TS half of the generative parity harness.
//
// A line-oriented chart server: each stdin line is a ChartRequest JSON, each
// stdout line is the corresponding ChartResponse JSON (or {"bridge_error"}).
// The Python harness (backend/tools/parity_property.py) keeps ONE bridge
// process alive and streams thousands of cases through it — a process per
// case would spend everything on wasm startup.
//
// Run from packages/astra-core:  npx tsx tools/case-bridge.mjs
// Prints READY on its own line once the wasm ephemeris is initialised.
import readline from "node:readline";

import { calculateChart } from "../src/index.js";
import { initSwisseph } from "../src/swisseph.js";

await initSwisseph();
process.stdout.write("READY\n");

const rl = readline.createInterface({ input: process.stdin, terminal: false });
for await (const line of rl) {
  const text = line.trim();
  if (!text) continue;
  let out;
  try {
    out = calculateChart(JSON.parse(text));
    // Falsification knob (A1 acceptance): PARITY_INJECT_BIAS_DEG perturbs
    // every planet longitude AFTER computation, so the harness can prove it
    // would catch a biased engine. Never set outside that self-test.
    const bias = Number(process.env.PARITY_INJECT_BIAS_DEG || 0);
    if (bias) {
      for (const p of out.planets) p.longitude = (p.longitude + bias + 360) % 360;
    }
  } catch (err) {
    out = { bridge_error: String((err && err.stack) || err) };
  }
  process.stdout.write(JSON.stringify(out) + "\n");
}
