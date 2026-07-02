// lib/alchemy.ts — classical alchemical correspondences for the observatory.
//
// The seven planets of the old cosmos each answer to a metal; the three
// astrological modalities map onto the tria prima (Sulphur / Salt / Mercury);
// the four elements carry their triangle sigils. Symbolic flavour only —
// reflective language, never prediction or prescription.

export interface Metal {
  metal: string;        // English name
  latin: string;        // classical Latin name
  sigil: string;        // planetary glyph doubles as the metal's sigil
  color: string;        // accent tint for UI chrome
  stage?: string;       // magnum-opus stage this body is traditionally near
  motto: string;        // one hermetic line for the detail panel
}

/** The seven classical planetary metals, plus the three moderns whose
 *  elements were literally named after them (uranium 1789, neptunium 1940,
 *  plutonium 1940) — the periodic table kept the correspondence alive. */
export const PLANET_METAL: Record<string, Metal> = {
  Sun: {
    metal: "Gold", latin: "Aurum", sigil: "☉", color: "#e0c578",
    stage: "rubedo",
    motto: "The perfected metal — what the whole work turns toward.",
  },
  Moon: {
    metal: "Silver", latin: "Argentum", sigil: "☽", color: "#cdd5e0",
    stage: "albedo",
    motto: "The white stone: reflection polished until it holds light.",
  },
  Mercury: {
    metal: "Quicksilver", latin: "Argentum vivum", sigil: "☿", color: "#b8c4c9",
    motto: "The living metal — messenger, solvent, and go-between.",
  },
  Venus: {
    metal: "Copper", latin: "Cuprum", sigil: "♀", color: "#c98a56",
    motto: "The mirror of Cyprus: warmth that conducts and connects.",
  },
  Mars: {
    metal: "Iron", latin: "Ferrum", sigil: "♂", color: "#b0432e",
    motto: "The edged metal — will quenched and tempered into tool.",
  },
  Jupiter: {
    metal: "Tin", latin: "Stannum", sigil: "♃", color: "#b9c0c8",
    motto: "The generous alloy-maker: strength through joining.",
  },
  Saturn: {
    metal: "Lead", latin: "Plumbum", sigil: "♄", color: "#8a8f9c",
    stage: "nigredo",
    motto: "The weight where the work begins — patience as prima materia.",
  },
  Uranus: {
    metal: "Uranium", latin: "Uranium (1789)", sigil: "♅", color: "#9fc98f",
    motto: "Named for the new sky — the element that broke the old table.",
  },
  Neptune: {
    metal: "Neptunium", latin: "Neptunium (1940)", sigil: "♆", color: "#7ea8c9",
    motto: "First beyond uranium: the dissolving threshold made matter.",
  },
  Pluto: {
    metal: "Plutonium", latin: "Plutonium (1940)", sigil: "♇", color: "#c9899b",
    motto: "The underworld metal — transformation at the root of things.",
  },
};

/** Order of the seven classical metals around the wheel's central seal
 *  (Chaldean order, slowest to swiftest). */
export const SEAL_ORDER = [
  "Saturn", "Jupiter", "Mars", "Sun", "Venus", "Mercury", "Moon",
] as const;

export interface Principle {
  name: string;       // tria prima name
  gloss: string;      // one-line meaning
}

/** Modality → tria prima. Cardinal ignites, Fixed crystallizes,
 *  Mutable mediates. */
export const MODALITY_PRINCIPLE: Record<string, Principle> = {
  Cardinal: { name: "Sulphur", gloss: "the igniting soul — what initiates" },
  Fixed: { name: "Salt", gloss: "the crystallized body — what endures" },
  Mutable: { name: "Mercury", gloss: "the mediating spirit — what adapts" },
};

/** The four stages of the magnum opus, in order — used as a gradient motif
 *  (blackening → whitening → yellowing → reddening) in section rules. */
export const OPUS_STAGES = [
  { name: "nigredo", color: "#2b2b33" },
  { name: "albedo", color: "#cdd5e0" },
  { name: "citrinitas", color: "#c9a84c" },
  { name: "rubedo", color: "#b0432e" },
] as const;
