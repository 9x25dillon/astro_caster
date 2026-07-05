// Direct port of backend/patterns.py (the deterministic version): aspect
// adjacency graphs → geometric configurations. Iteration and pair-unpack
// order are sorted throughout, matching the Python engine exactly.

import { ELEMENTS, MODALITIES } from "./astrology.js";
import type { Aspect, Pattern, PlanetData } from "./types.js";

const CORE = new Set([
  "Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn",
  "Uranus", "Neptune", "Pluto", "Chiron", "Ascendant", "Midheaven",
]);

type Edge = string; // canonical "a|b" with a < b

function edgeKey(a: string, b: string): Edge {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function edgesOf(aspects: Aspect[], kind: string): Set<Edge> {
  const out = new Set<Edge>();
  for (const a of aspects) {
    if (a.type === kind && CORE.has(a.p1) && CORE.has(a.p2)) {
      out.add(edgeKey(a.p1, a.p2));
    }
  }
  return out;
}

function has(edges: Set<Edge>, x: string, y: string): boolean {
  return edges.has(edgeKey(x, y));
}

function sortedPairs(edges: Set<Edge>): [string, string][] {
  return [...edges]
    .map((e) => e.split("|") as [string, string])
    .sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
}

function* combinations3<T>(items: T[]): Generator<[T, T, T]> {
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++)
      for (let k = j + 1; k < items.length; k++) yield [items[i], items[j], items[k]];
}

export function detectPatterns(planets: PlanetData[], aspects: Aspect[]): Pattern[] {
  const core = planets.filter((p) => CORE.has(p.id));
  const byId = new Map(core.map((p) => [p.id, p]));
  const ids = [...byId.keys()];

  const trines = edgesOf(aspects, "Trine");
  const squares = edgesOf(aspects, "Square");
  const opps = edgesOf(aspects, "Opposition");
  const sextiles = edgesOf(aspects, "Sextile");
  const quincunx = edgesOf(aspects, "Quincunx");

  const patterns: Pattern[] = [];

  // --- Stellium: 3+ bodies in one sign (insertion order = planet order) ---- //
  const bySign = new Map<string, string[]>();
  for (const p of core) {
    if (!bySign.has(p.sign)) bySign.set(p.sign, []);
    bySign.get(p.sign)!.push(p.id);
  }
  for (const [sign, members] of bySign) {
    if (members.length >= 3) {
      patterns.push({
        type: "Stellium",
        planets: [...members].sort(),
        description:
          `A concentration of ${members.length} bodies in ${sign}, ` +
          `intensifying the ${ELEMENTS[sign]}/${MODALITIES[sign]} signature.`,
        extra: { sign },
      });
    }
  }

  // --- Grand Trine: triangle of trines ------------------------------------ //
  for (const [a, b, c] of combinations3(ids)) {
    if (has(trines, a, b) && has(trines, b, c) && has(trines, a, c)) {
      const elem = byId.get(a)!.element;
      patterns.push({
        type: "Grand Trine",
        planets: [a, b, c].sort(),
        description:
          `A harmonious ${elem} triangle — innate, flowing talent ` +
          `that can become complacent if left unchallenged.`,
        extra: { element: elem },
      });
    }
  }

  // --- T-Square: two squares converging on an opposition ------------------ //
  for (const [x, y] of sortedPairs(opps)) {
    for (const apex of ids) {
      if (apex === x || apex === y) continue;
      if (has(squares, apex, x) && has(squares, apex, y)) {
        patterns.push({
          type: "T-Square",
          planets: [x, y, apex].sort(),
          description:
            `Dynamic tension between ${x} and ${y} discharges through ` +
            `${apex} (the apex) — a powerful engine of motivated growth.`,
          extra: { apex },
        });
      }
    }
  }

  // --- Grand Cross: two oppositions mutually squared ----------------------- //
  const oppList = sortedPairs(opps);
  for (let i = 0; i < oppList.length; i++) {
    for (let j = i + 1; j < oppList.length; j++) {
      const [a, b] = oppList[i];
      const [c, d] = oppList[j];
      if (new Set([a, b, c, d]).size !== 4) continue;
      if (has(squares, a, c) && has(squares, a, d) && has(squares, b, c) && has(squares, b, d)) {
        patterns.push({
          type: "Grand Cross",
          planets: [a, b, c, d].sort(),
          description:
            "Four bodies in mutual tension across all modalities of a " +
            "quality — immense drive that demands conscious integration.",
          extra: {},
        });
      }
    }
  }

  // --- Yod: two quincunxes onto a sextile base ------------------------------ //
  for (const [x, y] of sortedPairs(sextiles)) {
    for (const apex of ids) {
      if (apex === x || apex === y) continue;
      if (has(quincunx, apex, x) && has(quincunx, apex, y)) {
        patterns.push({
          type: "Yod",
          planets: [x, y, apex].sort(),
          description:
            `A 'Finger of Fate' pointing at ${apex} — a call toward ` +
            `a refined, often fated vocation that asks for adjustment.`,
          extra: { apex },
        });
      }
    }
  }

  // --- Kite: Grand Trine with an opposition to one apex --------------------- //
  const grandTrines = patterns
    .filter((p) => p.type === "Grand Trine")
    .map((p) => new Set(p.planets));
  for (const gt of grandTrines) {
    for (const [lo, hi] of sortedPairs(opps)) {
      for (const [x, y] of [[lo, hi], [hi, lo]] as [string, string][]) {
        if (gt.has(x) && !gt.has(y)) {
          const others = [...gt].filter((o) => o !== x);
          if (others.every((o) => has(sextiles, y, o))) {
            patterns.push({
              type: "Kite",
              planets: [...gt, y].sort(),
              description:
                "A Grand Trine focused and made productive by an " +
                "opposition — talent given direction and an outlet.",
              extra: { focus: y },
            });
          }
        }
      }
    }
  }

  // De-duplicate (same type + same member set can arise via multiple paths).
  const seen = new Set<string>();
  const unique: Pattern[] = [];
  for (const p of patterns) {
    const key = `${p.type}:${[...p.planets].sort().join(",")}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(p);
    }
  }
  return unique;
}
