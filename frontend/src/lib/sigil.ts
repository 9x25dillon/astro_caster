// lib/sigil.ts — sigil generation via chaos magick and planetary kamea (magic square).

// ── Gematria ──────────────────────────────────────────────────────────────────

// Simple English ordinal: A=1 … Z=26
export function letterValue(ch: string): number {
  const c = ch.toLowerCase().charCodeAt(0);
  if (c < 97 || c > 122) return 0;
  return c - 96; // a=1 … z=26
}

// Reduce a value to single digit 1-9 (no master numbers — sigil uses raw paths)
export function reduceDigit(n: number): number {
  if (n <= 0) return 1;
  let v = n;
  while (v > 9) {
    v = String(v).split("").reduce((a, d) => a + Number(d), 0);
  }
  return v || 1;
}

// Full word value (unreduced)
export function wordValue(text: string): number {
  return text.replace(/[^a-zA-Z]/g, "").split("").reduce((a, c) => a + letterValue(c), 0);
}

// ── Chaos Magick Sigil ────────────────────────────────────────────────────────
// Method: remove vowels + duplicates, arrange remaining letters around a circle,
// draw connecting lines in the order they appear in the original text.

const VOWELS = new Set(["a", "e", "i", "o", "u"]);

export function chaosLetters(text: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const ch of text.toLowerCase().replace(/[^a-z]/g, "")) {
    if (!VOWELS.has(ch) && !seen.has(ch)) {
      seen.add(ch);
      result.push(ch);
    }
  }
  return result;
}

// Returns { letterPositions, path } for rendering
export interface ChaosData {
  letters: string[];       // unique consonants in order
  sequence: number[];      // indices into letters[] tracing the original consonants
  cx: number;
  cy: number;
  radius: number;
}

export function buildChaosData(text: string, cx = 150, cy = 150, radius = 105): ChaosData {
  const letters = chaosLetters(text);
  if (letters.length < 2) return { letters, sequence: [0], cx, cy, radius };

  // Build the original consonant sequence (with repetitions) to know the draw order
  const letterIndex: Record<string, number> = {};
  letters.forEach((l, i) => { letterIndex[l] = i; });

  const sequence: number[] = [];
  for (const ch of text.toLowerCase().replace(/[^a-z]/g, "")) {
    if (!VOWELS.has(ch) && letterIndex[ch] !== undefined) {
      const idx = letterIndex[ch];
      if (sequence[sequence.length - 1] !== idx) sequence.push(idx);
    }
  }

  return { letters, sequence, cx, cy, radius };
}

// Convert to SVG path string
export function chaosToSVGPath(data: ChaosData): string {
  const { letters, sequence, cx, cy, radius } = data;
  if (letters.length < 2 || sequence.length < 2) return "";
  const angleStep = (2 * Math.PI) / letters.length;
  const posAngle = (i: number) => i * angleStep - Math.PI / 2;

  const pts = sequence.map((i) => {
    const a = posAngle(i);
    return [cx + radius * Math.cos(a), cy + radius * Math.sin(a)] as [number, number];
  });

  return pts.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
}

// ── Planetary Kamea (Magic Square) ────────────────────────────────────────────

export interface KameaSquare {
  planet: string;
  glyph: string;
  size: number;   // n×n
  grid: number[][]; // [row][col] = number
  sum: number;    // magic constant
}

// Position lookup: number → [row, col] in the square
function buildPosMap(grid: number[][]): Map<number, [number, number]> {
  const map = new Map<number, [number, number]>();
  grid.forEach((row, r) => row.forEach((val, c) => map.set(val, [r, c])));
  return map;
}

export const KAMEA: Record<string, KameaSquare> = {
  Saturn: {
    planet: "Saturn", glyph: "♄", size: 3, sum: 15,
    grid: [
      [4, 9, 2],
      [3, 5, 7],
      [8, 1, 6],
    ],
  },
  Jupiter: {
    planet: "Jupiter", glyph: "♃", size: 4, sum: 34,
    grid: [
      [4,  14, 15,  1],
      [9,   7,  6, 12],
      [5,  11, 10,  8],
      [16,  2,  3, 13],
    ],
  },
  Mars: {
    planet: "Mars", glyph: "♂", size: 5, sum: 65,
    grid: [
      [11, 24,  7, 20,  3],
      [ 4, 12, 25,  8, 16],
      [17,  5, 13, 21,  9],
      [10, 18,  1, 14, 22],
      [23,  6, 19,  2, 15],
    ],
  },
  Sun: {
    planet: "Sun", glyph: "☉", size: 6, sum: 111,
    grid: [
      [ 6, 32,  3, 34, 35,  1],
      [ 7, 11, 27, 28,  8, 30],
      [19, 14, 16, 15, 23, 24],
      [18, 20, 22, 21, 17, 13],
      [25, 29, 10,  9, 26, 12],
      [36,  5, 33,  4,  2, 31],
    ],
  },
  Venus: {
    planet: "Venus", glyph: "♀", size: 7, sum: 175,
    grid: [
      [22, 47, 16, 41, 10, 35,  4],
      [ 5, 23, 48, 17, 42, 11, 29],
      [30,  6, 24, 49, 18, 36, 12],
      [13, 31,  7, 25, 43, 19, 37],
      [38, 14, 32,  1, 26, 44, 20],
      [21, 39,  8, 33,  2, 27, 45],
      [46, 15, 40,  9, 34,  3, 28],
    ],
  },
  Mercury: {
    planet: "Mercury", glyph: "☿", size: 8, sum: 260,
    grid: [
      [ 8, 58, 59,  5,  4, 62, 63,  1],
      [49, 15, 14, 52, 53, 11, 10, 56],
      [41, 23, 22, 44, 45, 19, 18, 48],
      [32, 34, 35, 29, 28, 38, 39, 25],
      [40, 26, 27, 37, 36, 30, 31, 33],
      [17, 47, 46, 20, 21, 43, 42, 24],
      [ 9, 55, 54, 12, 13, 51, 50, 16],
      [64,  2,  3, 61, 60,  6,  7, 57],
    ],
  },
  Moon: {
    planet: "Moon", glyph: "☽", size: 9, sum: 369,
    grid: [
      [37, 78, 29, 70, 21, 62, 13, 54,  5],
      [ 6, 38, 79, 30, 71, 22, 63, 14, 46],
      [47,  7, 39, 80, 31, 72, 23, 55, 15],
      [16, 48,  8, 40, 81, 32, 64, 24, 56],
      [57, 17, 49,  9, 41, 73, 33, 65, 25],
      [26, 58, 18, 50,  1, 42, 74, 34, 66],
      [67, 27, 59, 10, 51,  2, 43, 75, 35],
      [36, 68, 19, 60, 11, 52,  3, 44, 76],
      [77, 28, 69, 20, 61, 12, 53,  4, 45],
    ],
  },
};

// Map dominant planet name to a kamea planet (fallback to Saturn)
export function planetToKamea(planet: string): string {
  const map: Record<string, string> = {
    Sun: "Sun", Moon: "Moon", Mercury: "Mercury", Venus: "Venus",
    Mars: "Mars", Jupiter: "Jupiter", Saturn: "Saturn",
    Uranus: "Saturn", Neptune: "Moon", Pluto: "Saturn",
    Chiron: "Saturn", "North Node": "Moon",
  };
  return map[planet] ?? "Saturn";
}

export interface KameaData {
  square: KameaSquare;
  sequence: number[];    // number values from gematria, wrapped to square range
  positions: [number, number][];  // [row, col] for each value
}

export function buildKameaData(text: string, planetName: string): KameaData {
  const square = KAMEA[planetName] ?? KAMEA.Saturn;
  const posMap = buildPosMap(square.grid);
  const max = square.size * square.size;

  // Get letter values from the intention text
  const letters = text.replace(/[^a-zA-Z]/g, "").split("");
  let raw = letters.map((c) => letterValue(c)).filter((v) => v > 0);

  // For small squares (Saturn 1-9), reduce each letter; for larger, use raw mod max
  const toSquareVal = (v: number): number => {
    if (max <= 9) return reduceDigit(v);
    const wrapped = ((v - 1) % max) + 1;
    return wrapped;
  };

  // Build deduplicated sequence (remove consecutive repeats)
  const rawSeq = raw.map(toSquareVal);
  const sequence: number[] = [];
  for (const v of rawSeq) {
    if (posMap.has(v) && sequence[sequence.length - 1] !== v) {
      sequence.push(v);
    }
  }
  if (sequence.length === 0) sequence.push(1); // fallback

  const positions = sequence.map((v) => posMap.get(v) ?? [0, 0] as [number, number]);
  return { square, sequence, positions };
}

// Convert kamea data to SVG path string
export function kameaToSVGPath(
  data: KameaData,
  cx: number,
  cy: number,
  squareSize: number // total pixel size of the grid
): string {
  const { square, positions } = data;
  const n = square.size;
  const cellSize = squareSize / n;

  const toXY = ([r, c]: [number, number]): [number, number] => {
    const gridLeft = cx - squareSize / 2;
    const gridTop = cy - squareSize / 2;
    return [
      gridLeft + (c + 0.5) * cellSize,
      gridTop + (r + 0.5) * cellSize,
    ];
  };

  const pts = positions.map(toXY);
  return pts.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
}

export function kameaGridLines(
  cx: number, cy: number, squareSize: number, n: number
): { x1: number; y1: number; x2: number; y2: number }[] {
  const cellSize = squareSize / n;
  const left = cx - squareSize / 2;
  const top = cy - squareSize / 2;
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let i = 0; i <= n; i++) {
    lines.push({ x1: left + i * cellSize, y1: top, x2: left + i * cellSize, y2: top + squareSize });
    lines.push({ x1: left, y1: top + i * cellSize, x2: left + squareSize, y2: top + i * cellSize });
  }
  return lines;
}
