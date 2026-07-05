// Direct port of backend/astrology.py — the dependency-free domain dictionary.
// Keep the two files in lockstep; the parity suite is the referee.

export const SIGNS: string[] = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];

export const SIGN_GLYPHS: Record<string, string> = {
  Aries: "♈", Taurus: "♉", Gemini: "♊", Cancer: "♋",
  Leo: "♌", Virgo: "♍", Libra: "♎", Scorpio: "♏",
  Sagittarius: "♐", Capricorn: "♑", Aquarius: "♒", Pisces: "♓",
};

export const ELEMENTS: Record<string, string> = {
  Aries: "Fire", Leo: "Fire", Sagittarius: "Fire",
  Taurus: "Earth", Virgo: "Earth", Capricorn: "Earth",
  Gemini: "Air", Libra: "Air", Aquarius: "Air",
  Cancer: "Water", Scorpio: "Water", Pisces: "Water",
};

export const MODALITIES: Record<string, string> = {
  Aries: "Cardinal", Cancer: "Cardinal", Libra: "Cardinal", Capricorn: "Cardinal",
  Taurus: "Fixed", Leo: "Fixed", Scorpio: "Fixed", Aquarius: "Fixed",
  Gemini: "Mutable", Virgo: "Mutable", Sagittarius: "Mutable", Pisces: "Mutable",
};

const DOMICILE: Record<string, string[]> = {
  Sun: ["Leo"],
  Moon: ["Cancer"],
  Mercury: ["Gemini", "Virgo"],
  Venus: ["Taurus", "Libra"],
  Mars: ["Aries", "Scorpio"],
  Jupiter: ["Sagittarius", "Pisces"],
  Saturn: ["Capricorn", "Aquarius"],
  Uranus: ["Aquarius"],
  Neptune: ["Pisces"],
  Pluto: ["Scorpio"],
};

const EXALTATION: Record<string, string> = {
  Sun: "Aries",
  Moon: "Taurus",
  Mercury: "Virgo",
  Venus: "Pisces",
  Mars: "Capricorn",
  Jupiter: "Cancer",
  Saturn: "Libra",
};

const OPPOSITE_SIGN: Record<string, string> = {
  Aries: "Libra", Taurus: "Scorpio", Gemini: "Sagittarius",
  Cancer: "Capricorn", Leo: "Aquarius", Virgo: "Pisces",
  Libra: "Aries", Scorpio: "Taurus", Sagittarius: "Gemini",
  Capricorn: "Cancer", Aquarius: "Leo", Pisces: "Virgo",
};

export function dignityFor(planetId: string, sign: string): string {
  const domicile = DOMICILE[planetId] ?? [];
  if (domicile.includes(sign)) return "Domicile";
  if (EXALTATION[planetId] === sign) return "Exaltation";
  if (domicile.some((s) => OPPOSITE_SIGN[s] === sign)) return "Detriment";
  const exalt = EXALTATION[planetId];
  if (exalt && OPPOSITE_SIGN[exalt] === sign) return "Fall";
  return "Neutral";
}

export interface AspectDef {
  name: string;
  angle: number;
  defaultOrb: number;
  harmony: string;
  color: string;
}

export const ASPECT_DEFS: AspectDef[] = [
  { name: "Conjunction", angle: 0.0, defaultOrb: 8.0, harmony: "neutral", color: "#c9a84c" },
  { name: "Opposition", angle: 180.0, defaultOrb: 8.0, harmony: "challenging", color: "#b03a2e" },
  { name: "Trine", angle: 120.0, defaultOrb: 7.0, harmony: "harmonious", color: "#2e86c1" },
  { name: "Square", angle: 90.0, defaultOrb: 6.0, harmony: "challenging", color: "#b03a2e" },
  { name: "Sextile", angle: 60.0, defaultOrb: 5.0, harmony: "harmonious", color: "#48a999" },
  { name: "Quincunx", angle: 150.0, defaultOrb: 3.0, harmony: "neutral", color: "#8e7cc3" },
  { name: "Semisextile", angle: 30.0, defaultOrb: 2.0, harmony: "neutral", color: "#7d6608" },
  { name: "Sesquiquadrate", angle: 135.0, defaultOrb: 2.0, harmony: "challenging", color: "#a04000" },
  { name: "Semisquare", angle: 45.0, defaultOrb: 2.0, harmony: "challenging", color: "#a04000" },
  { name: "Quintile", angle: 72.0, defaultOrb: 2.0, harmony: "harmonious", color: "#117864" },
];

export function norm360(deg: number): number {
  // Python's % is non-negative; JS's keeps the sign — normalize explicitly.
  return ((deg % 360) + 360) % 360;
}

export function angularSeparation(a: number, b: number): number {
  const diff = Math.abs(norm360(a) - norm360(b)) % 360;
  return diff > 180 ? 360 - diff : diff;
}

export function signFor(longitude: number): string {
  return SIGNS[Math.floor(norm360(longitude) / 30) % 12];
}

export function degreeInSign(longitude: number): [number, number, number] {
  const within = norm360(longitude) % 30;
  const d = Math.floor(within);
  const mFull = (within - d) * 60;
  const m = Math.floor(mFull);
  const s = Math.round((mFull - m) * 60 * 10) / 10;
  return [d, m, s];
}
