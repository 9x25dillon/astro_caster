// tarotCopy.ts — static Arcane Classroom lessons + offline expression generators.
// All client-side, no network: the studio works even when the AI is offline.
import type { NatalArcanaSignature } from "../api/client";

export interface ClassroomLesson {
  title: string;
  summary: string;
  symbolic: string;
  astrology: string;
  tarot: string;
  shadow: string;
  balanced: string;
  practice: string;
  journal: string;
}

export const CLASSROOM: ClassroomLesson[] = [
  {
    title: "Fire",
    summary: "Fire is the principle of ignition, courage, appetite, and creative will.",
    symbolic: "Fire begins before it explains itself.",
    astrology: "Aries, Leo, Sagittarius.",
    tarot: "Wands.",
    shadow: "Impulsiveness, burnout, domination.",
    balanced: "Courage, vitality, inspired action.",
    practice: "Light a candle and name one action you are ready to take.",
    journal: "Where does my life need warmth instead of force?",
  },
  {
    title: "Water",
    summary: "Water is the principle of feeling, memory, intuition, and connection.",
    symbolic: "Water remembers the shape of everything it has touched.",
    astrology: "Cancer, Scorpio, Pisces.",
    tarot: "Cups.",
    shadow: "Overwhelm, enmeshment, drowning in mood.",
    balanced: "Empathy, depth, emotional honesty.",
    practice: "Name the emotional weather you are in, without trying to change it.",
    journal: "What feeling have I been postponing?",
  },
  {
    title: "Air",
    summary: "Air is the principle of mind, language, perspective, and exchange.",
    symbolic: "Air is the distance that lets us see.",
    astrology: "Gemini, Libra, Aquarius.",
    tarot: "Swords.",
    shadow: "Overthinking, detachment, cutting words.",
    balanced: "Clarity, fairness, articulate truth.",
    practice: "Write one thought you keep circling, then read it aloud once.",
    journal: "Where am I living in my head instead of my life?",
  },
  {
    title: "Earth",
    summary: "Earth is the principle of body, work, resources, and form.",
    symbolic: "Earth is what love looks like when it becomes useful.",
    astrology: "Taurus, Virgo, Capricorn.",
    tarot: "Pentacles.",
    shadow: "Rigidity, over-control, materialism.",
    balanced: "Steadiness, craft, embodied care.",
    practice: "Tend one small physical thing well — a plant, a meal, a corner of a room.",
    journal: "What in my life is asking to be made real and tangible?",
  },
  {
    title: "The Three Modalities",
    summary: "Cardinal initiates, Fixed sustains, Mutable adapts.",
    symbolic: "Every season has a beginning, a middle, and a turning.",
    astrology: "Cardinal: Aries/Cancer/Libra/Capricorn · Fixed: Taurus/Leo/Scorpio/Aquarius · Mutable: Gemini/Virgo/Sagittarius/Pisces.",
    tarot: "Aces & Kings initiate, Queens & Knights sustain, Pages & change-cards adapt.",
    shadow: "Cardinal: starting without finishing. Fixed: stubbornness. Mutable: scattering.",
    balanced: "Cardinal: leadership. Fixed: devotion. Mutable: versatility.",
    practice: "Notice whether a stuck situation needs starting, holding, or changing.",
    journal: "Do I need to begin something, commit to something, or let something move?",
  },
  {
    title: "The Twelve Houses",
    summary: "The houses are the stages of life a planet acts upon — not what, but where.",
    symbolic: "If signs are how, houses are where the story happens.",
    astrology: "1 self · 2 worth · 3 mind · 4 home · 5 play · 6 craft · 7 partnership · 8 depth · 9 meaning · 10 calling · 11 community · 12 spirit.",
    tarot: "A twelve-house spread maps one card to each domain of life.",
    shadow: "Over-focusing on one house and neglecting its opposite.",
    balanced: "A life lived across all twelve rooms, not just the comfortable ones.",
    practice: "Name which 'room' of your life feels most crowded right now, and which feels empty.",
    journal: "Which house am I avoiding?",
  },
  {
    title: "Archetype vs. Prediction",
    summary: "An archetype is a mirror for self-understanding; a prediction claims a fixed future.",
    symbolic: "The stars do not dictate the path; they illuminate energies you can work with.",
    astrology: "A transit names a theme being activated, not an event being scheduled.",
    tarot: "A card names an archetype in motion, not a fate being delivered.",
    shadow: "Outsourcing your agency to the cards or the sky.",
    balanced: "Using symbol to reflect, choose, and create more consciously.",
    practice: "Reframe one 'what will happen?' question into 'what is mine to work with?'",
    journal: "Where am I asking the cards to decide what is mine to choose?",
  },
];

// ── Offline expression generators ──────────────────────────────────────────────

function topCards(sig: NatalArcanaSignature, n: number): string[] {
  return [...sig.links].slice(0, n).map((l) => l.card.name);
}

export interface Artifact {
  title: string;
  body: string;
}

export function generateArtifact(kind: string, sig: NatalArcanaSignature): Artifact {
  const sun = sig.links.find((l) => l.body === "Sun")?.card.name ?? "The Sun";
  const moon = sig.links.find((l) => l.body === "Moon")?.card.name ?? "The High Priestess";
  const asc = sig.links.find((l) => l.body === "Ascendant")?.card.name ?? "the threshold";
  const el = sig.dominant_element;
  const themes = sig.themes.join(", ");

  switch (kind) {
    case "poem":
      return {
        title: "Archetype Poem",
        body:
`I arrive as ${asc},
${sun} burning at the center,
${moon} keeping the tide.
My element is ${el.toLowerCase()} —
${themes.toLowerCase()} move through me
like weather through a long valley.
I am not my fate. I am the one who reads it.`,
      };
    case "affirmation":
      return {
        title: "Affirmation",
        body:
`I carry ${sun} as my light and ${moon} as my depth.
My ${el.toLowerCase()} nature is a gift I can wield with care.
I meet my shadow — ${sig.shadows.join(", ") || "what is quiet in me"} — as a teacher, not a threat.`,
      };
    case "sigil":
      return {
        title: "Personal Sigil Prompt",
        body:
`Draw a sigil from your signature:
• Spine: the glyph of ${sun} (your conscious light).
• Curve: the glyph of ${moon} (your inner tide).
• Outer ring: your dominant element, ${el}.
Trace it slowly, breathe once at each turn, and name one intention as you close the line.`,
      };
    case "shadow_letter":
      return {
        title: "Shadow Letter",
        body:
`Dear ${sig.shadows[0] || "quiet one"},
You are the part of me I keep in the next room.
I have called you a flaw; today I call you unlived.
What were you trying to protect? I am ready to listen.
— ${sun}`,
      };
    case "myth":
      return {
        title: "Mythic Birth Story",
        body:
`Once, light arrived through ${asc}.
At the center stood ${sun}, and beneath it moved ${moon}.
The land was ${el.toLowerCase()}, shaped by ${topCards(sig, 4).join(", ").toLowerCase()}.
This is not a prophecy. It is a map of arrival — yours to walk.`,
      };
    default:
      return { title: "Artifact", body: "Choose a form to generate." };
  }
}

export const EXPRESSION_KINDS: { kind: string; label: string }[] = [
  { kind: "poem", label: "Archetype Poem" },
  { kind: "affirmation", label: "Affirmation" },
  { kind: "sigil", label: "Sigil Prompt" },
  { kind: "shadow_letter", label: "Shadow Letter" },
  { kind: "myth", label: "Mythic Birth Story" },
];
