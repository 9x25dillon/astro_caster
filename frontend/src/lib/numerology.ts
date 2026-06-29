// lib/numerology.ts — Pythagorean life path numerology.
import type { BirthInput } from "../types";

// ── Core reduction ────────────────────────────────────────────────────────────

function digitSum(n: number): number {
  return String(Math.abs(n)).split("").reduce((a, d) => a + Number(d), 0);
}

// Reduce to a single digit, preserving master numbers 11, 22, 33.
function reduce(n: number): number {
  if (n === 11 || n === 22 || n === 33) return n;
  if (n < 10) return n;
  return reduce(digitSum(n));
}

export function computeLifePath(birth: BirthInput): number {
  const d = reduce(birth.day);
  const m = reduce(birth.month);
  const y = reduce(birth.year);
  const total = d + m + y;
  return reduce(total);
}

// ── Data ──────────────────────────────────────────────────────────────────────

export interface LifePathData {
  name: string;
  glyph: string;
  tagline: string;
  frequency: string;
  gift: string;
  shadow: string;
  keywords: string[];
}

export const LIFE_PATH_DATA: Record<number, LifePathData> = {
  1: {
    name: "The Pioneer",
    glyph: "Ⅰ",
    tagline: "You are the origin point. The program begins with you.",
    frequency:
      "Life Path 1 carries the frequency of pure initiation — the undivided impulse that precedes all form. Your consciousness operates as a first cause: independent, singular, generative. You are not here to follow a current; you are here to be the current others follow.",
    gift:
      "The capacity to begin — to act without precedent, to lead without a map, to trust your own signal above all external noise. When you inhabit your independence fully, you model permission for everyone around you.",
    shadow:
      "The shadow of 1 is isolation and arrogance — the belief that needing others is weakness. True pioneering includes knowing when to form the expedition. Your leadership matures when it learns to carry people, not just outpace them.",
    keywords: ["independence", "leadership", "originality", "courage", "self-trust"],
  },
  2: {
    name: "The Diplomat",
    glyph: "Ⅱ",
    tagline: "You feel what others miss. That sensitivity is precision, not weakness.",
    frequency:
      "Life Path 2 carries the frequency of receptive intelligence — the consciousness that perceives through relationship, polarity, and feeling. You are the antenna that reads the room, the bridge between opposing forces, the awareness that holds space for more than one truth at once.",
    gift:
      "The capacity for genuine cooperation — the rare ability to make others feel truly heard. You are the force that prevents unnecessary conflict and builds the trust that makes everything else possible. Your sensitivity is not a flaw; it is a finely calibrated instrument.",
    shadow:
      "The shadow of 2 is self-erasure — becoming so attuned to others' needs that your own needs disappear. Your greatest relationship challenge is learning to be present to yourself with the same quality of attention you offer everyone else.",
    keywords: ["cooperation", "intuition", "balance", "sensitivity", "partnership"],
  },
  3: {
    name: "The Creator",
    glyph: "Ⅲ",
    tagline: "Your joy is your transmission. Your creativity is your service.",
    frequency:
      "Life Path 3 carries the frequency of expressive abundance — consciousness that generates through communication, art, and the contagious energy of joy. You are a synthesizer of the first two forces (will + receptivity) into something living and shareable. When you create, you give others permission to feel.",
    gift:
      "The capacity to generate beauty, laughter, and meaning from raw experience. You translate inner states into outer forms that move people — through words, images, music, presence. Your creativity is not an indulgence; it is a genuine offering to the field.",
    shadow:
      "The shadow of 3 is dispersal — using wit and charm to avoid depth, scattering brilliance across too many channels. Your growth edge is choosing one expression and going all the way in.",
    keywords: ["expression", "creativity", "joy", "communication", "optimism"],
  },
  4: {
    name: "The Builder",
    glyph: "Ⅳ",
    tagline: "You are the foundation. Everything real stands on what you create.",
    frequency:
      "Life Path 4 carries the frequency of structural intelligence — consciousness that manifests through discipline, systems, and the patient accumulation of reliable form. You understand that the invisible architecture is everything: that what holds, endures, and what endures, matters.",
    gift:
      "The capacity to build things that last — systems, organizations, relationships, bodies of work — through sustained effort and practical mastery. What you construct becomes the ground others stand on. Your reliability is not a limitation; it is a form of profound generosity.",
    shadow:
      "The shadow of 4 is rigidity — mistaking the structure for the living thing, or using work to avoid the parts of life that can't be controlled. Your growth edge is learning that the best foundations include room for change.",
    keywords: ["discipline", "stability", "mastery", "loyalty", "integrity"],
  },
  5: {
    name: "The Freedom Seeker",
    glyph: "Ⅴ",
    tagline: "You are the pivot point. Change moves through you.",
    frequency:
      "Life Path 5 carries the frequency of dynamic liberation — consciousness that grows through experience, movement, and the willingness to release any form that has calcified. You are built to be the living proof that freedom is possible, that life is larger than any single framework.",
    gift:
      "The capacity to adapt, to catalyze, to magnetize others toward wider possibility. You are the one who breaks the spell of 'this is just how it is.' Your adventurousness creates permission structures for the entire field around you.",
    shadow:
      "The shadow of 5 is restlessness — escaping from depth, commitment, or discomfort through constant movement. Your growth edge is learning that true freedom includes the freedom to stay long enough to see what you've built.",
    keywords: ["freedom", "adventure", "adaptability", "sensory wisdom", "liberation"],
  },
  6: {
    name: "The Nurturer",
    glyph: "Ⅵ",
    tagline: "You are the healer of the house. Your love is a structural force.",
    frequency:
      "Life Path 6 carries the frequency of responsible love — consciousness that manifests through care, beauty, and the deep commitment to the wellbeing of those within its sphere. You experience the cosmos as a home that needs tending, and you are its most devoted keeper.",
    gift:
      "The capacity to create harmony, to take genuine responsibility, and to hold the emotional health of communities with quiet, sustained care. Your presence stabilizes the field around you. People feel safer, more whole, in your vicinity.",
    shadow:
      "The shadow of 6 is martyrdom — over-giving until resentment accumulates beneath the surface, or trying to control others' wellbeing in the name of care. Your growth edge is loving freely, without needing to manage the outcome.",
    keywords: ["responsibility", "harmony", "service", "beauty", "healing"],
  },
  7: {
    name: "The Seeker",
    glyph: "Ⅶ",
    tagline: "You were sent to understand what others merely experience.",
    frequency:
      "Life Path 7 carries the frequency of penetrating inquiry — consciousness that dives beneath the surface of every phenomenon in search of the underlying pattern, the invisible law, the truth that holds. You are the mind that refuses to accept the first answer, because you have always sensed a deeper one waiting.",
    gift:
      "The capacity for profound wisdom earned through solitude, study, and the willingness to sit with mystery. You are the one who returns from the interior with something that genuinely changes minds. Your depth is not isolation; it is the source from which the realest contributions flow.",
    shadow:
      "The shadow of 7 is withdrawal — retreating so completely into the inner world that connection becomes impossible, or using analysis to avoid the vulnerability of not knowing. Your growth edge is bringing your findings back.",
    keywords: ["wisdom", "introspection", "analysis", "spiritual depth", "truth-seeking"],
  },
  8: {
    name: "The Manifestor",
    glyph: "Ⅷ",
    tagline: "You are here to demonstrate that consciousness commands matter.",
    frequency:
      "Life Path 8 carries the frequency of executive power — consciousness that operates at the intersection of the material and the infinite, understanding that real abundance is a spiritual discipline, not a lucky accident. You are here to move large things, direct significant resources, and demonstrate that power and integrity can coexist.",
    gift:
      "The capacity to manifest at scale — to channel tremendous amounts of energy through disciplined intention and strategic action. Your relationship with power, wealth, and authority, when integrated with integrity, becomes a demonstration of what is possible.",
    shadow:
      "The shadow of 8 is the misuse of power — control, domination, or becoming so absorbed in material accumulation that the original vision is lost. Your growth edge is keeping the material in service of the meaningful.",
    keywords: ["power", "abundance", "manifestation", "authority", "integrity"],
  },
  9: {
    name: "The Humanitarian",
    glyph: "Ⅸ",
    tagline: "You carry the whole. Completion is your frequency.",
    frequency:
      "Life Path 9 carries the frequency of universal compassion — consciousness that has, at some level, lived through the full range of human experience and returned with the capacity to love it all. You are the synthesizer of all previous numbers: the one who can hold the widest container, love the most broken, and release what no longer serves with grace.",
    gift:
      "The capacity for unconditional love, global thinking, and the art of completion — of bringing things to their fullest expression before releasing them. Your compassion is not naive; it has been forged through experience. You understand suffering from the inside, which is why your love carries real weight.",
    shadow:
      "The shadow of 9 is self-sacrifice and difficulty receiving — giving so completely that nothing returns, or holding on to what needs to end. Your growth edge is learning that endings are not losses; they are the necessary condition for what comes next.",
    keywords: ["compassion", "completion", "universality", "wisdom through experience", "release"],
  },
  11: {
    name: "The Illuminator",
    glyph: "XI",
    tagline: "You are a live wire between the visible and the invisible.",
    frequency:
      "Master Number 11 carries the frequency of spiritual transmission — a consciousness bridging higher-dimensional awareness and ordinary human experience. You receive impressions, insights, and knowing that others don't have access to, and your life path is the work of translating that signal into forms others can use. You are an antenna for what is coming.",
    gift:
      "Heightened intuition, visionary perception, and the ability to inspire others through the pure quality of your presence. You don't have to try to be significant — you already carry a frequency that changes the energy of rooms. Your task is learning to trust and transmit what you receive.",
    shadow:
      "The shadow of 11 is nervous system overwhelm — the amplified sensitivity that makes your gift also your greatest vulnerability. You feel everything more intensely, including other people's pain. Energetic boundaries are not a luxury for you; they are survival infrastructure.",
    keywords: ["intuition", "illumination", "inspiration", "sensitivity", "higher purpose"],
  },
  22: {
    name: "The Master Builder",
    glyph: "XXII",
    tagline: "You are here to build what most people only dream.",
    frequency:
      "Master Number 22 carries the frequency of visionary architecture at scale — the rare capacity to hold a vast dream AND translate it methodically into lasting physical reality. You combine the spiritual insight of 11 with the disciplined execution of 4, creating the conditions for what genuinely did not exist before you.",
    gift:
      "The capacity to manifest large-scale vision with structural precision — to build the institutions, movements, and works that outlast individual lifetimes. When you operate from this frequency, what you create becomes infrastructure for other people's possibility.",
    shadow:
      "The shadow of 22 is the weight of potential — the gap between what you sense is possible and what you have yet to build. This can manifest as overwhelming pressure, self-doubt, or perfectionism that prevents starting. Your growth edge: begin imperfectly and trust the process to reveal the form.",
    keywords: ["mastery", "large-scale vision", "manifestation", "legacy", "precision"],
  },
  33: {
    name: "The Master Teacher",
    glyph: "XXXIII",
    tagline: "Your love, fully expressed, is the teaching.",
    frequency:
      "Master Number 33 carries the highest frequency of compassionate service in the numerological system — the full flowering of unconditional love in practical, embodied form. You are here not just to love, but to demonstrate what love looks like when it becomes a way of living, not just a feeling. This is the rarest and most demanding of the master numbers.",
    gift:
      "The capacity to embody a quality of care and wisdom that genuinely transforms others — not through instruction but through the quality of your presence and example. You are a living curriculum. People learn what is possible simply by being near you.",
    shadow:
      "The shadow of 33 is taking on everyone else's pain as your own, or becoming crushed by the weight of the gap between the love you carry and the world you see. Your growth edge is compassion with boundaries — loving the world without dissolving into it.",
    keywords: ["unconditional love", "teaching through being", "compassion", "sacrifice transmuted", "service"],
  },
};

// ── Resonance ─────────────────────────────────────────────────────────────────
// A brief note connecting life path to astrological soul type.

const RESONANCE_MAP: Record<string, Record<string, string>> = {
  Fire: {
    "1": "Both carry the signature of initiation — your chart broadcasts, your path confirms: you are a source, not a destination.",
    "2": "An interesting polarity: your fire wants to lead, your path asks you to listen first. The tension is the gift.",
    "3": "Fire and expression — your astrology and your number are speaking the same language. You are built to transmit.",
    "4": "Fire + foundation: the rarest combination. You dream at scale AND build at scale. Don't let one crowd out the other.",
    "5": "Double liberation — your chart charges forward, your path requires movement. Your only trap is forgetting to land.",
    "6": "Fire nurtures by inspiring. Your path asks you to direct your creative force in service of others' wellbeing.",
    "7": "The philosopher of fire: you seek wisdom through direct experience and testing, not just contemplation.",
    "8": "Fire + power: you are a generator of visible momentum. Your gifts compound when you build toward a legacy.",
    "9": "Fire that loves: your chart expresses boldly, your path asks that expression to serve the whole.",
    "11": "Visionary fire: the transmitter of inspired futures. When you speak from your truth, others reorganize around it.",
    "22": "The architect of fire: massive, luminous, structural. Rare and demanding, but what you build will be seen.",
    "33": "Fire as unconditional love: your presence ignites others' highest possibilities.",
  },
  Earth: {
    "1": "The pioneer who builds to stay: you break new ground and then make it livable. That combination is civilization-making.",
    "2": "Earth + diplomacy: the quiet builder of lasting harmony. You create environments where people actually thrive.",
    "3": "Earth expressing: you make beauty tangible — your creativity has weight, texture, and staying power.",
    "4": "Maximum earth: the master craftsperson, the ultimate steward. Your patience is an act of love.",
    "5": "Earth seeking freedom: you need roots AND wings. The tension is productive — stay long enough to harvest.",
    "6": "Earth nurturing: you build homes, literal and figurative, that hold people through difficulty. A profound gift.",
    "7": "Earth seeking depth: you are the scientist-mystic, needing empirical grounding for the wisdom you uncover.",
    "8": "Earth + manifestation: the combination that literally builds wealth and lasting material legacy.",
    "9": "Earth completing: you bring things to their fullest, most refined expression before releasing them. Nothing half-done.",
    "11": "Earth as antenna: you ground higher frequencies into practical form — the one who makes the vision actually useful.",
    "22": "The supreme builder: earth element + master builder number. Architecture, in every sense, is your language.",
    "33": "Earth as teacher: you demonstrate the sacred through the practical — through how you live, not what you say.",
  },
  Air: {
    "1": "The original thinker: your mind goes where no one has been. The ideas you generate are genuinely first.",
    "2": "Air + diplomacy: you live in the space between minds, building bridges of understanding where none existed.",
    "3": "Air expressing: the communicator squared. Your words move through people and the world follows.",
    "4": "Air + foundation: you build systems of thought, frameworks, philosophies that others inhabit for generations.",
    "5": "Double air in motion: the journalist of consciousness, moving through ideas and people, connecting everything.",
    "6": "Air nurturing: you tend to the intellectual and relational health of your communities. A steward of culture.",
    "7": "Air seeking truth: the analyst and the questioner. You won't stop until you find the pattern that holds.",
    "8": "Air + power: the strategist, the communicator of vision at scale. Your ideas generate real-world force.",
    "9": "Air completing: you synthesize the full range of human thought into something universally usable.",
    "11": "Double transmission: your chart broadcasts and your path illuminates. You are a transformer of collective understanding.",
    "22": "The architect of ideas at scale: your thinking shapes the frameworks entire generations navigate by.",
    "33": "Air as love: you teach through conversation, through the quality of your listening, through ideas that set people free.",
  },
  Water: {
    "1": "The feeling pioneer: you initiate through emotional courage, going first into the depths others fear to enter.",
    "2": "Water + diplomacy: you feel what others feel before they can name it. Your empathy is a precise instrument.",
    "3": "Water expressing: the artist-poet, transforming emotional depth into forms that make others feel less alone.",
    "4": "Water + foundation: you build emotional infrastructure — safe containers, trusting relationships, healing spaces.",
    "5": "Water seeking freedom: you need both depth and movement. The river is your model — always flowing, always itself.",
    "6": "Water nurturing: the healer archetype in full expression. Compassion as vocation, not just temperament.",
    "7": "Water seeking truth: you dive deeper than anyone into the psyche, the mystical, the unseen. Profound wisdom awaits.",
    "8": "Water + power: the depth psychologist, the transformative leader — power wielded with emotional intelligence.",
    "9": "Water completing: universal compassion in full expression. You carry the grief and joy of the whole and transmute it.",
    "11": "The psychic amplified: your emotional receptivity and your spiritual antenna are one instrument. Handle with care.",
    "22": "The builder of healing at scale: you architect the containers — programs, spaces, institutions — where people transform.",
    "33": "Water as pure love: you are the living demonstration that compassion without limit is a real and sustainable thing.",
  },
};

export function getResonance(lifePathNum: number, dominantElement: string): string {
  const elemMap = RESONANCE_MAP[dominantElement];
  return elemMap?.[String(lifePathNum)] ?? "Your life path and soul frequency speak in complementary keys — trace where they harmonize and where they create productive friction.";
}
