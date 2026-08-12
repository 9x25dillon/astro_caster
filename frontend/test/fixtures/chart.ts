// A real ChartResponse for unit tests, read from the golden parity vector.
//
// Deliberately NOT a hand-written chart object. A fixture invented for a test
// drifts from what the engine actually returns the moment a field is added,
// and then the test passes against a shape production never sees. The parity
// vectors are the repo's canonical record of that shape, they are already
// asserted byte-for-byte by two engines and a CI tripwire, and reading one
// here costs nothing — no wasm init, no async setup.
//
// `einstein-ulm-1879` is the first case: public natal data, tropical/Placidus,
// 17 bodies.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { ChartResponse } from "@astra/core";

const HERE = dirname(fileURLToPath(import.meta.url));
const VECTORS = resolve(HERE, "../../../parity/natal-chart.json");

interface VectorFile {
  cases: { id: string; expected: ChartResponse }[];
}

/** The `einstein-ulm-1879` golden vector as a ChartResponse. */
export function localChartFixture(id = "einstein-ulm-1879"): ChartResponse {
  const file: VectorFile = JSON.parse(readFileSync(VECTORS, "utf8"));
  const found = file.cases.find((c) => c.id === id);
  if (!found) {
    throw new Error(
      `parity vector "${id}" not found in ${VECTORS} — ` +
        `available: ${file.cases.map((c) => c.id).join(", ")}`
    );
  }
  return found.expected;
}
