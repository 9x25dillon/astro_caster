// lib/astro.ts — shared geometry + display helpers for the wheel.
import type { PlanetData } from "../types";

// Bodies that are angles/derived points; rendered differently or excluded.
export const POINT_IDS = new Set([
  "Ascendant",
  "Midheaven",
  "Descendant",
  "Imum Coeli",
  "Part of Fortune",
  "North Node",
  "South Node",
  "Lilith",
]);

export const SIGN_GLYPHS = [
  "♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓",
];

/**
 * Astrological Unicode symbols (♈–♓, ♀, ♂, ☿…) are frequently promoted to
 * colourful emoji by the OS emoji font. Appending the U+FE0E "text
 * presentation selector" forces a flat, monochrome glyph so they match the
 * antique-gold aesthetic instead of appearing as red/blue emoji discs.
 */
export const glyphText = (g: string): string => g + "︎";

export const SIGN_NAMES = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];

// One-line essence of each zodiac sign (keyed by name), for the wheel popover.
export const SIGN_INFLUENCE: Record<string, string> = {
  Aries: "The pioneer — raw initiative, courage, and the spark of beginning.",
  Taurus: "The steward — stability, sensuality, and patient endurance.",
  Gemini: "The messenger — curiosity, language, and quicksilver connection.",
  Cancer: "The nurturer — feeling, memory, and the need for belonging.",
  Leo: "The sovereign — creative fire, pride, and radiant self-expression.",
  Virgo: "The artisan — discernment, service, and devotion to craft.",
  Libra: "The diplomat — balance, beauty, and the art of relationship.",
  Scorpio: "The alchemist — depth, intensity, and transformation through truth.",
  Sagittarius: "The seeker — vision, freedom, and the hunger for meaning.",
  Capricorn: "The architect — discipline, mastery, and the long climb.",
  Aquarius: "The visionary — independence, invention, and the collective future.",
  Pisces: "The mystic — compassion, imagination, and dissolving boundaries.",
};

export const SIGN_MODALITIES = ["Cardinal", "Fixed", "Mutable"] as const;

// One-line essence of each house (keyed by 1–12), for the wheel popover.
export const HOUSE_INFLUENCE: Record<number, string> = {
  1: "Self, body, and the mask you meet the world through.",
  2: "Resources, values, and what you call your own.",
  3: "Mind, siblings, and the near world of daily exchange.",
  4: "Home, roots, family, and your inner foundation.",
  5: "Creativity, romance, play, and the heart's expression.",
  6: "Work, health, routine, and devotion to craft.",
  7: "Partnership, marriage, and the mirror of the Other.",
  8: "Intimacy, shared resources, and transformation.",
  9: "Meaning, travel, philosophy, and the wider horizon.",
  10: "Vocation, reputation, and your visible summit.",
  11: "Community, friends, hopes, and the future you build.",
  12: "Solitude, the unconscious, surrender, and the hidden.",
};

// One-line essence of each aspect (major + minor), for the wheel popover.
export const ASPECT_INFLUENCE: Record<string, string> = {
  Conjunction: "Two forces fused into one — concentrated, amplified, acting together.",
  Opposition: "Two forces face to face — tension seeking balance through awareness.",
  Trine: "Effortless flow between allied forces — natural, inherited talent.",
  Square: "Friction between forces at cross-purposes — growth through challenge.",
  Sextile: "An open door between forces — opportunity that rewards initiative.",
  Quincunx: "An awkward angle — persistent adjustment between energies that never quite agree.",
  Semisextile: "A subtle, growing link — quiet tension between neighbouring energies.",
  Sesquiquadrate: "An agitating undercurrent — friction that surfaces as restlessness.",
  Semisquare: "A minor irritant — low-grade friction prompting small adjustments.",
  Quintile: "A creative, gifted angle — a talent for pattern, craft, and inspired making.",
};

// Astrological glyphs for aspects (falls back to a generic angle mark).
export const ASPECT_SYMBOL: Record<string, string> = {
  Conjunction: "☌", Opposition: "☍", Trine: "△", Square: "□", Sextile: "⚹",
  Quincunx: "⚻", Semisextile: "⚺", Sesquiquadrate: "⚼", Semisquare: "∠", Quintile: "✩",
};

/**
 * One-line essence of each body's influence, shown in the wheel hover popover.
 * Condensed from the glossary so the wheel stays self-explanatory on hover.
 */
export const PLANET_INFLUENCE: Record<string, string> = {
  Sun: "Core identity, conscious will, and the drive to shine.",
  Moon: "Emotional nature, instinct, and what makes you feel safe.",
  Mercury: "Mind, communication, and how you gather and share ideas.",
  Venus: "Love, beauty, attraction, and the values you pursue.",
  Mars: "Drive, desire, and the way you assert and pursue.",
  Jupiter: "Expansion, abundance, faith, and your search for meaning.",
  Saturn: "Structure, discipline, and mastery earned through time.",
  Uranus: "Sudden change, liberation, and the urge to break free.",
  Neptune: "Dreams, compassion, and the dissolving of boundaries.",
  Pluto: "Deep transformation, power, and death-and-rebirth.",
  Chiron: "The wound that becomes the source of your healing gift.",
  "North Node": "The growth edge your life is drawing you toward.",
  "South Node": "Innate gifts and patterns carried from the past.",
  "Part of Fortune": "Where ease, flow, and natural fortune gather.",
  Lilith: "The untamed, instinctual self that refuses to be owned.",
  Ascendant: "The mask you meet the world through — your becoming.",
  Midheaven: "Vocation, reputation, and your visible summit.",
};

// Element colour key, used by the zodiac ring tinting + radar.
export const ELEMENT_COLORS: Record<string, string> = {
  Fire: "#b0432e",
  Earth: "#6b8e23",
  Air: "#c9a84c",
  Water: "#2e6e8e",
};

export const ELEMENT_OF_SIGN_INDEX = (i: number): string =>
  ["Fire", "Earth", "Air", "Water"][i % 4];

/**
 * The chart is drawn with the Ascendant pinned to the 9-o'clock (left) position
 * and longitude increasing counter-clockwise, the astrological convention.
 *
 * Given an absolute ecliptic longitude and the ascendant longitude, return the
 * on-screen polar angle in radians for the standard SVG coordinate system
 * (x = r·cos θ, y = r·sin θ, y growing downward).
 */
export function lonToAngle(longitude: number, ascendant: number): number {
  // Degrees of the body measured counter-clockwise from the Ascendant.
  const rel = ((longitude - ascendant) % 360 + 360) % 360;
  // Ascendant sits at 180° on screen (left). Counter-clockwise => subtract.
  const screenDeg = 180 - rel;
  return (screenDeg * Math.PI) / 180;
}

export function polar(r: number, angleRad: number): [number, number] {
  return [r * Math.cos(angleRad), r * Math.sin(angleRad)];
}

export function formatPos(p: PlanetData): string {
  return `${p.degree}°${String(p.minute).padStart(2, "0")}' ${p.sign}`;
}

export const ORDINAL = (n: number): string => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

// Resolve a separation of two points to a midpoint longitude (shorter arc).
export function midpointLon(a: number, b: number): number {
  let diff = ((b - a) % 360 + 360) % 360;
  if (diff > 180) diff -= 360;
  return ((a + diff / 2) % 360 + 360) % 360;
}
