// lib/archetypes.ts — soul archetype derivation from natal chart.
import type { ChartResponse } from "../types";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LifeTheme {
  house: number;
  planets: string[];
  theme: string;
  focus: string;
}

export interface SoulProfile {
  soulType: string;
  archetype: string;       // "Water · Fixed"
  tagline: string;
  description: string;
  frequency: string;       // philosophical / consciousness framing
  manifestation: string;   // North Node guidance
  lifeThemes: LifeTheme[]; // top 3 occupied houses
  dominantElement: string;
  dominantModality: string;
  dominantPlanet: string;
  dominantGlyph: string;
  elementColors: [string, string]; // [primary, secondary]
}

// ── Data tables ───────────────────────────────────────────────────────────────

const SOUL_TYPES: Record<string, { name: string; tagline: string; description: string }> = {
  "Fire-Cardinal": {
    name: "The Pioneer",
    tagline: "You arrive first. You ignite what others only imagine.",
    description:
      "Your soul carries the impulse of the trailblazer — here to initiate new cycles, lead through example, and demonstrate that the first step is always possible. You are a generator of fresh starts in the collective program. Where others see obstacles, you see the invitation to begin.",
  },
  "Fire-Fixed": {
    name: "The Sovereign",
    tagline: "You radiate steadily. Your light doesn't flicker.",
    description:
      "Your soul carries the frequency of sustained creative power — a luminous center that others orient around. You are not here to initiate or adapt, but to hold and radiate the fullness of what you are. Your greatest offering to the world is consistency of presence and unshakeable creative identity.",
  },
  "Fire-Mutable": {
    name: "The Torch-Bearer",
    tagline: "You carry the flame across every threshold.",
    description:
      "Your soul is built for transmission — taking inspired truth and moving it across minds, cultures, and contexts. You are the messenger of fire, translating vision into story, philosophy, and enthusiasm that lights up the rooms you pass through. You don't settle because you are meant to keep moving.",
  },
  "Earth-Cardinal": {
    name: "The Architect",
    tagline: "You don't just dream it — you build it.",
    description:
      "Your soul is oriented toward making vision concrete. You carry the impulse to transform abstract potential into lasting, inhabitable form through discipline and strategic action. You are a builder of structures — organizations, systems, families, legacies — that others will rely on long after you have moved on.",
  },
  "Earth-Fixed": {
    name: "The Keeper",
    tagline: "You hold what is real, beautiful, and enduring.",
    description:
      "Your soul is the steward of the earth's most precious resources — beauty, stability, patience, and genuine value. You cultivate slowly and tend faithfully. You have a rare capacity to hold and protect what matters through time, creating the kind of abundance that feeds generations.",
  },
  "Earth-Mutable": {
    name: "The Craftsperson",
    tagline: "You find the sacred in the details of the work itself.",
    description:
      "Your soul is devoted to the art of refinement. You carry the frequency of mastery through iteration — improving, perfecting, and serving through the intelligence of the body and the precision of the hand. The sacred is not somewhere else; it lives in the discipline of doing things well.",
  },
  "Air-Cardinal": {
    name: "The Catalyst",
    tagline: "Your ideas spark currents that change the course of things.",
    description:
      "Your soul ignites social and intellectual change through the sharp, initiating force of ideas. You are a starter of conversations that matter, a launcher of movements and connections that ripple outward. Where others hesitate at the edge of a new paradigm, you step forward and name it.",
  },
  "Air-Fixed": {
    name: "The Transmitter",
    tagline: "You hold a frequency steady until the world catches up.",
    description:
      "Your soul is the unwavering broadcast tower of a singular truth. You hold your vision of what is possible — what ought to be — with a loyalty that transcends fashion, resistance, or doubt. Your gift is radical consistency: staying on-frequency long enough for others to finally tune in.",
  },
  "Air-Mutable": {
    name: "The Weaver",
    tagline: "You gather, translate, and distribute intelligence.",
    description:
      "Your soul moves through the network of ideas like light through fiber — carrying information from node to node, synthesizing what was separate into unified understanding. You are the connector, the translator, the one whose mind can hold contradictions long enough to find what they share.",
  },
  "Water-Cardinal": {
    name: "The Seer",
    tagline: "You feel what is true before it becomes visible.",
    description:
      "Your soul initiates through emotional intelligence and intuitive courage. You are the one who feels what is coming, who names what others sense but cannot articulate, and who leads by being willing to be vulnerable first. Your emotional depth is not a liability — it is your method of perception.",
  },
  "Water-Fixed": {
    name: "The Alchemist",
    tagline: "You transform darkness into soul-gold through sheer depth.",
    description:
      "Your soul holds the deepest and most transformative frequencies — the psychic weight of what needs to change in yourself and in the collective. You are the crucible, capable of holding tremendous pressure and converting it into wisdom, power, and renewal. Nothing is wasted in your process.",
  },
  "Water-Mutable": {
    name: "The Mystic",
    tagline: "You dissolve the membrane between self and the greater whole.",
    description:
      "Your soul is the porous boundary where the individual meets the infinite. You are built to receive, to merge, to channel from the invisible dimensions, and to return those gifts into the world through art, compassion, and spiritual service. Your porousness is your power — and your practice.",
  },
};

const ELEMENT_FREQUENCIES: Record<string, string> = {
  Fire:
    "Your frequency operates as radiant projection — light emitting outward, initiating new patterns in the field around you. The planets of your chart are source-points of impulse: they do not wait to be activated, they generate. In the astrological program, you are a transmitter of initial conditions.",
  Earth:
    "Your frequency operates as gravitational coherence — matter organizing toward form and permanence. Your planets are densifying nodes: they attract, consolidate, and give lasting body to what flows through you. In the astrological program, you are an anchor — the point where energy becomes structure.",
  Air:
    "Your frequency operates as resonant transmission — information moving through the network of minds and relationships. Your planets are carrier waves: they receive, modulate, and re-emit signals between nodes of consciousness. In the astrological program, you are the medium through which ideas become culture.",
  Water:
    "Your frequency operates as receptive depth — feeling the full spectrum of the field and transforming what it holds. Your planets are processing centers: they absorb, metabolize, and distill the emotional and psychic material that others cannot or will not feel. In the astrological program, you are the alchemical vessel.",
};

const MODALITY_IMPULSES: Record<string, string> = {
  Cardinal:
    "The cardinal impulse orients your energy toward new initiations — you are a generator of fresh cycles, a point of departure in the cosmic program. Your influence is strongest at beginnings.",
  Fixed:
    "The fixed impulse orients your energy toward sustained presence — you are a stabilizing node, holding frequency long enough and steadily enough for others to calibrate to it. Your influence is strongest in duration.",
  Mutable:
    "The mutable impulse orients your energy toward synthesis and distribution — you are a bridge between cycles, a carrier of what was into what will become. Your influence is strongest in transitions.",
};

const HOUSE_THEMES: Record<number, { theme: string; focus: string }> = {
  1: { theme: "Self & Embodiment", focus: "Your physical presence carries your signal — inhabit yourself fully. How you show up in the first moment is the invitation others respond to." },
  2: { theme: "Value & Resource", focus: "What you build, own, and invest in mirrors what you believe you deserve. Align your material life with your actual values, not inherited ones." },
  3: { theme: "Mind & Voice", focus: "Your greatest leverage lives in how you communicate and connect locally. Every conversation is a frequency exchange — speak what is actually true." },
  4: { theme: "Roots & Foundation", focus: "The quality of your inner foundation determines the height of everything built above it. Tend the roots: family patterns, emotional security, and your relationship with home." },
  5: { theme: "Creative Fire & Joy", focus: "Your creative output and capacity for joy are where your signal is most authentic. Play is practice for becoming — do not rationalize away the things that delight you." },
  6: { theme: "Practice & Mastery", focus: "Your daily routines are the invisible architecture of your life. Every repeated ritual is either expanding or contracting your field. Audit the small things." },
  7: { theme: "Partnership & Mirror", focus: "The relationships you attract are precise reflections of frequencies you carry. Choose to see your closest mirrors as teachers rather than obstacles." },
  8: { theme: "Transformation & Depth", focus: "What you are willing to release determines how much power you access. The depth here is a resource, not a threat — dive deliberately." },
  9: { theme: "Vision & Expansion", focus: "Your philosophy is the lens through which all experience is filtered. Upgrade your worldview and the world upgrades in response. Seek the teachers and territories that break you open." },
  10: { theme: "Purpose & Legacy", focus: "Your public contribution is your soul's vote for what kind of world exists. Act in the visible realm as if it matters — because in your case, it does." },
  11: { theme: "Vision & Community", focus: "The future you can actually imagine is the attractor pulling you forward. Find your people, build toward the vision together, and hold the frequency of what hasn't arrived yet." },
  12: { theme: "Surrender & Source", focus: "What you release into the invisible feeds your greatest work. The unseen dimensions of your life are not a vacancy — they are the wellspring. Rest there without apology." },
};

export const ELEMENT_PALETTES: Record<string, [string, string]> = {
  Fire:  ["#e8b84b", "#c9612a"],
  Earth: ["#8b9e5a", "#c9b48a"],
  Air:   ["#7ab4d4", "#5c8ab0"],
  Water: ["#4a7fb8", "#2d5a8a"],
};

const PLANET_GLYPHS: Record<string, string> = {
  Sun: "☉", Moon: "☽", Mercury: "☿", Venus: "♀", Mars: "♂",
  Jupiter: "♃", Saturn: "♄", Uranus: "♅", Neptune: "♆", Pluto: "♇",
  Chiron: "⚷", "North Node": "☊",
};

const SKIP = new Set(["Ascendant", "Midheaven", "Descendant", "Imum Coeli", "South Node", "Part of Fortune", "Lilith"]);

// ── Derivation ────────────────────────────────────────────────────────────────

export function deriveSoulProfile(chart: ChartResponse): SoulProfile {
  const planets = chart.planets.filter((p) => !SKIP.has(p.id));

  // Tally elements and modalities
  const elemCount: Record<string, number> = {};
  const modCount: Record<string, number> = {};
  for (const p of planets) {
    if (p.element) elemCount[p.element] = (elemCount[p.element] ?? 0) + 1;
    if (p.modality) modCount[p.modality] = (modCount[p.modality] ?? 0) + 1;
  }
  const dominantElement = Object.entries(elemCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Fire";
  const dominantModality = Object.entries(modCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Cardinal";

  // Most aspected planet = dominant planet
  const aspectCount: Record<string, number> = {};
  for (const a of chart.aspects) {
    if (!SKIP.has(a.p1)) aspectCount[a.p1] = (aspectCount[a.p1] ?? 0) + 1;
    if (!SKIP.has(a.p2)) aspectCount[a.p2] = (aspectCount[a.p2] ?? 0) + 1;
  }
  const dominantPlanet = Object.entries(aspectCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Sun";
  const dominantGlyph = PLANET_GLYPHS[dominantPlanet] ?? "☉";

  // Soul type
  const key = `${dominantElement}-${dominantModality}`;
  const st = SOUL_TYPES[key] ?? SOUL_TYPES["Fire-Cardinal"];

  // Top 3 occupied houses
  const housePlanets: Record<number, string[]> = {};
  for (const p of planets) {
    if (!housePlanets[p.house]) housePlanets[p.house] = [];
    housePlanets[p.house].push(p.id);
  }
  const lifeThemes: LifeTheme[] = Object.entries(housePlanets)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 3)
    .map(([h, ps]) => {
      const n = Number(h);
      return { house: n, planets: ps, theme: HOUSE_THEMES[n]?.theme ?? `House ${n}`, focus: HOUSE_THEMES[n]?.focus ?? "" };
    });

  // Manifestation: North Node
  const nn = chart.planets.find((p) => p.id === "North Node");
  const ordinal = (n: number) => { const s = ["th","st","nd","rd"]; const v = n%100; return n+(s[(v-20)%10]??s[v]??s[0]); };
  const manifestation = nn
    ? `Your North Node in ${nn.sign} (${ordinal(nn.house)} house) is the arrow of your soul's trajectory in this lifetime — the frequency you are here to develop, embody, and radiate most fully. Growth in this direction is never fully comfortable, because it is always toward the unknown. That discomfort is confirmation, not warning.`
    : "Your manifestation arc is encoded in the life domain you find most challenging. That is precisely where the greatest return on consciousness is available.";

  return {
    soulType: st.name,
    archetype: `${dominantElement} · ${dominantModality}`,
    tagline: st.tagline,
    description: st.description,
    frequency: ELEMENT_FREQUENCIES[dominantElement] + "\n\n" + MODALITY_IMPULSES[dominantModality],
    manifestation,
    lifeThemes,
    dominantElement,
    dominantModality,
    dominantPlanet,
    dominantGlyph,
    elementColors: ELEMENT_PALETTES[dominantElement] ?? ELEMENT_PALETTES.Fire,
  };
}
