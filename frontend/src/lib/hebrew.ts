// hebrew.ts — the twenty-two letters, as a coordinate system.
//
// The Sefer Yetzirah does not treat its alphabet as a set of symbols. It treats
// it as a PARTITION, and the partition has the same shape as the one this app
// already computes:
//
//   3 mothers    (א מ ש)  — elements, and so the axes a thing can turn about
//   7 doubles    (ב ג ד כ פ ר ת)  — the classical planets, one per body
//   12 elementals (ה ו ז ח ט י ל נ ס ע צ ק) — the signs, one per 30° arc
//
// 3 + 7 + 12 = 22, and every one of those three numbers is already load-bearing
// in the torus: the surface's wireframe sits on twelve sign cusps per axis
// (lib/torusLayers.signLines), each axis carries one body, and ℝ⁴ — the space
// the Clifford embedding lives in — has exactly THREE ways to be split into two
// completely orthogonal planes. So the letters are not a skin over the geometry.
// They are names for parts of it that were already there and unnamed.
//
// The 3↔3 is the one worth spelling out, because it is the claim that makes
// this more than decoration. A rotation of ℝ⁴ is not a rotation about an axis —
// four dimensions have no rotation axis. It is a rotation in a PLANE, and the
// six coordinate planes pair up into three sets of completely orthogonal pairs:
//
//     {xy, zw}    {xz, yw}    {xw, yz}
//
// Three, exactly. A rotation running in both planes of one pair at the same
// rate is an ISOCLINIC rotation, the motion with no fixed direction at all —
// and the Hopf flow this panel has shipped since chapter V is precisely the
// isoclinic rotation of the first pair. It already had a letter; nobody had
// said so. See MOTHER_PLANE_PAIRS below and lib/torus4.motherRotation.
//
// Two attribution schemes ship, because the split between them is real and old
// and this module has no business hiding it — see ATTRIBUTIONS. The elementals
// and the mothers agree across both; only the seven doubles differ.
//
// Pure data and lookups: no DOM, no ephemeris, no imports at all. Geometry
// consumes this (lib/torus4), placement consumes this (lib/torusLayers), the
// component draws.

export type LetterClass = "mother" | "double" | "elemental";

/** One of the six coordinate planes of ℝ⁴ — the thing a 4D rotation turns IN. */
export type Plane4 = "xy" | "xz" | "xw" | "yz" | "yw" | "zw";

export interface HebrewLetter {
  /** The letter itself. */
  glyph: string;
  /** Final (sofit) form, for the five that have one. Not a 23rd letter. */
  final?: string;
  /** Romanised name, as the tradition names it. */
  name: string;
  /** Rough transliteration of the sound. */
  latin: string;
  /** Gematria — the letter's number. 1–9, then tens, then hundreds. */
  value: number;
  cls: LetterClass;
  /**
   * Path on the Tree of Life, 11–32, in the Kircher arrangement the Golden Dawn
   * inherited (the ten sefirot take 1–10, so the paths start at 11). It is
   * simply the letter's ordinal + 10 — the alphabet and the paths run together.
   */
  path: number;
  /** The two sefirot that path joins. */
  joins: string;
}

/**
 * The alphabet, in order. `path` and `value` are fixed facts of the letter; the
 * astrological attribution is NOT stored here, because it depends on the scheme
 * — see ATTRIBUTIONS.
 */
export const HEBREW_LETTERS: readonly HebrewLetter[] = [
  { glyph: "א", name: "Aleph",  latin: "'",   value: 1,   cls: "mother",    path: 11, joins: "Kether–Chokmah" },
  { glyph: "ב", name: "Bet",    latin: "B",   value: 2,   cls: "double",    path: 12, joins: "Kether–Binah" },
  { glyph: "ג", name: "Gimel",  latin: "G",   value: 3,   cls: "double",    path: 13, joins: "Kether–Tiphereth" },
  { glyph: "ד", name: "Dalet",  latin: "D",   value: 4,   cls: "double",    path: 14, joins: "Chokmah–Binah" },
  { glyph: "ה", name: "He",     latin: "H",   value: 5,   cls: "elemental", path: 15, joins: "Chokmah–Tiphereth" },
  { glyph: "ו", name: "Vav",    latin: "V",   value: 6,   cls: "elemental", path: 16, joins: "Chokmah–Chesed" },
  { glyph: "ז", name: "Zayin",  latin: "Z",   value: 7,   cls: "elemental", path: 17, joins: "Binah–Tiphereth" },
  { glyph: "ח", name: "Chet",   latin: "Ch",  value: 8,   cls: "elemental", path: 18, joins: "Binah–Geburah" },
  { glyph: "ט", name: "Tet",    latin: "T",   value: 9,   cls: "elemental", path: 19, joins: "Chesed–Geburah" },
  { glyph: "י", name: "Yod",    latin: "Y",   value: 10,  cls: "elemental", path: 20, joins: "Chesed–Tiphereth" },
  { glyph: "כ", final: "ך", name: "Kaf", latin: "K", value: 20, cls: "double", path: 21, joins: "Chesed–Netzach" },
  { glyph: "ל", name: "Lamed",  latin: "L",   value: 30,  cls: "elemental", path: 22, joins: "Geburah–Tiphereth" },
  { glyph: "מ", final: "ם", name: "Mem", latin: "M", value: 40, cls: "mother", path: 23, joins: "Geburah–Hod" },
  { glyph: "נ", final: "ן", name: "Nun", latin: "N", value: 50, cls: "elemental", path: 24, joins: "Tiphereth–Netzach" },
  { glyph: "ס", name: "Samekh", latin: "S",   value: 60,  cls: "elemental", path: 25, joins: "Tiphereth–Yesod" },
  { glyph: "ע", name: "Ayin",   latin: "'",   value: 70,  cls: "elemental", path: 26, joins: "Tiphereth–Hod" },
  { glyph: "פ", final: "ף", name: "Pe", latin: "P", value: 80, cls: "double", path: 27, joins: "Netzach–Hod" },
  { glyph: "צ", final: "ץ", name: "Tsadi", latin: "Ts", value: 90, cls: "elemental", path: 28, joins: "Netzach–Yesod" },
  { glyph: "ק", name: "Qof",    latin: "Q",   value: 100, cls: "elemental", path: 29, joins: "Netzach–Malkuth" },
  { glyph: "ר", name: "Resh",   latin: "R",   value: 200, cls: "double",    path: 30, joins: "Hod–Yesod" },
  { glyph: "ש", name: "Shin",   latin: "Sh",  value: 300, cls: "mother",    path: 31, joins: "Hod–Malkuth" },
  { glyph: "ת", name: "Tav",    latin: "Th",  value: 400, cls: "double",    path: 32, joins: "Yesod–Malkuth" },
];

const BY_NAME = new Map(HEBREW_LETTERS.map((l) => [l.name, l]));

/** Look a letter up by its romanised name. Throws on a typo at module load. */
function L(name: string): HebrewLetter {
  const l = BY_NAME.get(name);
  if (!l) throw new Error(`hebrew.ts: no letter named ${name}`);
  return l;
}

export const MOTHERS = [L("Aleph"), L("Mem"), L("Shin")] as const;
export const DOUBLES = HEBREW_LETTERS.filter((l) => l.cls === "double");
export const ELEMENTALS = HEBREW_LETTERS.filter((l) => l.cls === "elemental");

// ---------------------------------------------------------------------------
// The three mothers are the three plane-pairs of ℝ⁴
// ---------------------------------------------------------------------------

/**
 * Each mother owns one way of splitting ℝ⁴ into two completely orthogonal
 * planes — and there are exactly three such splits, which is why this
 * correspondence is a fit rather than an assignment.
 *
 * The order is not arbitrary either: the pairs sort by the second axis of their
 * first plane (xy, xz, xw), and the mothers sort as the alphabet has them
 * (א, מ, ש). First to first.
 *
 * א Aleph gets {xy, zw}, and that is the load-bearing one. On the Clifford
 * torus (cos θ, sin θ, cos φ, sin φ)/√2 the xy plane carries θ — body A — and
 * the zw plane carries φ — body B. So turning both at the same rate is exactly
 * (θ, φ) ↦ (θ+α, φ+α), the Hopf flow already in torus.embedClifford. Air is
 * the balance between fire and water in the Sefer Yetzirah, and this is the one
 * rotation that leaves the surface where it found it: the torus slides along
 * itself and never tilts. The other two mothers mix the axes, and under them
 * the surface genuinely leaves the position it has always been drawn in.
 */
export const MOTHER_PLANE_PAIRS: Readonly<Record<string, readonly [Plane4, Plane4]>> = {
  Aleph: ["xy", "zw"],
  Mem: ["xz", "yw"],
  Shin: ["xw", "yz"],
};

/** Element each mother governs. Note what is missing, and see elementLetter. */
export const MOTHER_ELEMENTS: Readonly<Record<string, string>> = {
  Aleph: "Air",
  Mem: "Water",
  Shin: "Fire",
};

/**
 * The letter for an element — or null for Earth.
 *
 * Earth genuinely has no mother letter. The Sefer Yetzirah counts three, not
 * four, and the three it counts are air, water and fire; earth arrives later,
 * as the sediment of the other three, and takes no letter of its own. Returning
 * null rather than inventing a fourth is the same choice dignityBands makes
 * when it returns twelve flat Neutrals: say what is true, including that the
 * scheme has nothing to say here.
 */
export function elementLetter(element: string): HebrewLetter | null {
  const name = Object.keys(MOTHER_ELEMENTS).find((k) => MOTHER_ELEMENTS[k] === element);
  return name ? L(name) : null;
}

// ---------------------------------------------------------------------------
// The twelve elementals — one letter per sign
// ---------------------------------------------------------------------------

/** Zodiacal order. Both attribution schemes agree here, letter for letter. */
export const SIGN_LETTERS: Readonly<Record<string, HebrewLetter>> = {
  Aries: L("He"),
  Taurus: L("Vav"),
  Gemini: L("Zayin"),
  Cancer: L("Chet"),
  Leo: L("Tet"),
  Virgo: L("Yod"),
  Libra: L("Lamed"),
  Scorpio: L("Nun"),
  Sagittarius: L("Samekh"),
  Capricorn: L("Ayin"),
  Aquarius: L("Tsadi"),
  Pisces: L("Qof"),
};

/** The letter standing over a zodiacal longitude — the sign it falls in. */
const SIGN_ORDER = Object.keys(SIGN_LETTERS);

export function letterForSignIndex(i: number): HebrewLetter {
  return SIGN_LETTERS[SIGN_ORDER[((i % 12) + 12) % 12]];
}

export function letterAtLongitude(lonDeg: number): HebrewLetter {
  const r = lonDeg % 360;
  return letterForSignIndex(Math.floor((r < 0 ? r + 360 : r) / 30));
}

// ---------------------------------------------------------------------------
// The seven doubles — where the traditions part
// ---------------------------------------------------------------------------

export type Attribution = "yetzirah" | "golden-dawn";

/**
 * The doubles are the one place the schemes disagree, and they disagree
 * completely — no letter keeps its planet across the two.
 *
 * `yetzirah` walks the planets in descending Chaldean order (Saturn, Jupiter,
 * Mars, Sun, Venus, Mercury, Moon) against the doubles in alphabetical order —
 * the reading most commonly drawn from the long recension of the Sefer
 * Yetzirah, and the one this app defaults to.
 *
 * `golden-dawn` is the Kircher/Golden Dawn attribution that governs the tarot
 * trumps and most modern Western esoteric material: ב Mercury (the Magician),
 * ג Moon (the High Priestess), ד Venus (the Empress), and so on.
 *
 * Both ship because a reader who arrives from a tarot deck and a reader who
 * arrives from the Sefer Yetzirah are looking for different letters over the
 * same Sun, and silently picking one would be telling one of them they are
 * wrong about their own tradition.
 */
export const ATTRIBUTIONS: Readonly<Record<Attribution, Readonly<Record<string, HebrewLetter>>>> = {
  yetzirah: {
    Saturn: L("Bet"),
    Jupiter: L("Gimel"),
    Mars: L("Dalet"),
    Sun: L("Kaf"),
    Venus: L("Pe"),
    Mercury: L("Resh"),
    Moon: L("Tav"),
  },
  "golden-dawn": {
    Mercury: L("Bet"),
    Moon: L("Gimel"),
    Venus: L("Dalet"),
    Jupiter: L("Kaf"),
    Mars: L("Pe"),
    Sun: L("Resh"),
    Saturn: L("Tav"),
  },
};

export const ATTRIBUTION_LABEL: Readonly<Record<Attribution, string>> = {
  yetzirah: "Sefer Yetzirah",
  "golden-dawn": "Golden Dawn",
};

/**
 * The three moderns, placed on the three mothers.
 *
 * This is the standard modern extension and it is NOT ancient: the Golden Dawn
 * put the Fool (א, air) with Uranus, the Hanged Man (מ, water) with Neptune and
 * Judgement (ש, fire) with Pluto once those planets existed to be placed. Kept
 * behind an opt-in flag and labelled modern wherever it shows, because a reader
 * checking this against a printed table should be able to see which lines came
 * from the table and which came from after it.
 */
export const MODERN_OUTERS: Readonly<Record<string, HebrewLetter>> = {
  Uranus: L("Aleph"),
  Neptune: L("Mem"),
  Pluto: L("Shin"),
};

/** What a body's letter is, and on whose authority. */
export interface BodyLetter {
  letter: HebrewLetter;
  /** "double" for the classical seven, "mother" for a modern outer. */
  via: LetterClass;
  /** False when the attribution postdates the source table. */
  traditional: boolean;
}

/**
 * The letter over a body — or null, honestly, when the scheme has none.
 *
 * The Nodes, Chiron, Lilith and the angles get null and are meant to. There are
 * seven doubles because there were seven planets; a lunar node is not an eighth
 * one, and quietly handing it a spare letter would make the alphabet look like
 * it covers a sky it was never asked about. The panel draws these bodies
 * unlettered, which is the true statement.
 */
export function letterForBody(
  bodyId: string,
  scheme: Attribution = "yetzirah",
  includeModernOuters = false,
): BodyLetter | null {
  const classical = ATTRIBUTIONS[scheme][bodyId];
  if (classical) return { letter: classical, via: "double", traditional: true };
  if (includeModernOuters && MODERN_OUTERS[bodyId]) {
    return { letter: MODERN_OUTERS[bodyId], via: "mother", traditional: false };
  }
  return null;
}

// ---------------------------------------------------------------------------
// The 144 tiles
// ---------------------------------------------------------------------------

/**
 * The letter-pair naming one cell of the sign grid.
 *
 * torusLayers already makes the case that on a product of two circles a sign
 * partition is a 144-tile CHECKERBOARD, and that a tile — "A in Aries while B
 * is in Taurus" — is a whole statement the wheel cannot show. Each tile now has
 * a two-letter name and a number: the gematria of the pair.
 *
 * The number is not decoration. It is the only quantity on this surface that is
 * invariant under the whole thing turning — depth changes, projection changes,
 * the mothers can roll the surface through four dimensions, and the tile the
 * trajectory is standing in still sums to what it sums to.
 */
export interface TileWord {
  theta: HebrewLetter;
  phi: HebrewLetter;
  /** θ's letter then φ's, written right-to-left as Hebrew is read. */
  word: string;
  /** Gematria of the pair. */
  value: number;
}

export function tileWord(thetaDeg: number, phiDeg: number): TileWord {
  const a = letterAtLongitude(thetaDeg);
  const b = letterAtLongitude(phiDeg);
  return { theta: a, phi: b, word: `${b.glyph}${a.glyph}`, value: a.value + b.value };
}

/** Gematria of a run of letters — the sum, which is all gematria ever is. */
export function gematria(letters: readonly HebrewLetter[]): number {
  return letters.reduce((s, l) => s + l.value, 0);
}
