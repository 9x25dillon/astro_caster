// lib/glossary.ts — astrological term definitions and application guidance.

export interface GlossaryEntry {
  term: string;
  category: "planet" | "aspect" | "element" | "modality" | "dignity" | "pattern" | "concept";
  glyph?: string;
  short: string;
  detail: string;
  apply: string; // premium: how to use this in your practice
}

export const GLOSSARY: GlossaryEntry[] = [
  // ── PLANETS ──────────────────────────────────────────────────────────────
  {
    term: "Sun", category: "planet", glyph: "☉",
    short: "Your core identity, conscious will, and vital energy. The sign it occupies colors how you express yourself.",
    detail: "The Sun represents the ego, conscious self, and life force. It is the sovereign archetype — authority, creative self-expression, and the drive to be seen. The Sun's sign shows WHERE you radiate; its house shows the life arena where you seek recognition and meaning.",
    apply: "Ask: 'Where am I fully myself?' The Sun's sign and house reveal the domain where you need to shine. Lean into that territory deliberately rather than waiting for permission.",
  },
  {
    term: "Moon", category: "planet", glyph: "☽",
    short: "Your emotional nature, instincts, and the subconscious patterns rooted in early life and family.",
    detail: "The Moon governs emotional memory, instinctual reactions, and the inner child. It represents what you need to feel safe, your relationship to the past and family, and the rhythm of your moods. Its sign describes the emotional style; its house reveals where you retreat, nurture, and feel at home.",
    apply: "Ask: 'What makes me feel safe?' Meet those needs consciously rather than reactively. The Moon thrives when acknowledged rather than suppressed or managed away.",
  },
  {
    term: "Mercury", category: "planet", glyph: "☿",
    short: "Your mind, communication style, perception, and how you gather and share information.",
    detail: "Mercury rules thought, language, nervous system, and the exchange of ideas. It governs how you learn, speak, write, and perceive the world. Its sign shows your mental style; its house shows where ideas flow naturally and where your voice carries.",
    apply: "Notice how you process information. Adapt your communication to your Mercury style — forcing an analytical Virgo Mercury to work intuitively is friction; feeding it is flow.",
  },
  {
    term: "Venus", category: "planet", glyph: "♀",
    short: "Your capacity for love, attraction, beauty, and the values that guide what you pursue.",
    detail: "Venus governs romantic love, aesthetics, financial values, and the capacity for pleasure. It shows what you find beautiful, how you attract others, and what you need to feel valued. Its sign colors your relational style; its house reveals where love and appreciation seek expression.",
    apply: "Study your Venus sign to understand your love language and aesthetic sensibility. Its house placement shows where beauty, connection, and appreciation flourish most naturally.",
  },
  {
    term: "Mars", category: "planet", glyph: "♂",
    short: "Your drive, desire, assertion, and the way you pursue what you want. The fuel that moves you.",
    detail: "Mars is the engine of desire, willpower, and directed action. It governs anger, sexuality, athleticism, and the instinct to survive and compete. Its sign shows how you fight and desire; its house shows where you channel ambition and face opposition.",
    apply: "Mars energy demands expression — suppressed, it turns to irritation or apathy. Know your Mars sign and give its drive a legitimate outlet. This is the planet of deliberate action.",
  },
  {
    term: "Jupiter", category: "planet", glyph: "♃",
    short: "Expansion, abundance, wisdom, and where life tends to flow generously. Your philosophical compass.",
    detail: "Jupiter is the great benefic — it expands whatever it touches. It governs optimism, faith, higher education, travel, philosophy, and the search for meaning. Its sign reveals your worldview; its house shows where you attract luck and where excess must be watched.",
    apply: "Jupiter's house is where you're invited to grow boldly and trust abundance. However, watch for overextension — Jupiter's shadow is inflation and promising more than you can deliver.",
  },
  {
    term: "Saturn", category: "planet", glyph: "♄",
    short: "Structure, discipline, time, limitation, and mastery earned through sustained effort. Your greatest teacher.",
    detail: "Saturn governs responsibility, karma, long-term achievement, and the lessons time delivers. It shows where you face difficulty and restriction — but also where lasting mastery is possible through effort. Its house is the arena of life's most rigorous curriculum.",
    apply: "Saturn's house is where you must work hardest — but the rewards are the most durable. Don't avoid these lessons; they are the path to genuine authority and competence that can't be taken away.",
  },
  {
    term: "Uranus", category: "planet", glyph: "♅",
    short: "Sudden change, liberation, innovation, and the urge to break free from convention.",
    detail: "Uranus governs revolution, genius, technology, and collective awakening. It shatters stagnant structures and forces original thinking. Its house shows where you need radical freedom and where unexpected disruptions catalyze breakthroughs.",
    apply: "Where Uranus sits, resist rigidity. This area of life benefits from flexibility, experimentation, and embracing the unusual. The disruptions here are often the doorways.",
  },
  {
    term: "Neptune", category: "planet", glyph: "♆",
    short: "Dreams, spiritual longing, illusion, compassion, and the dissolving of boundaries.",
    detail: "Neptune governs mysticism, art, imagination, addiction, and the transcendent urge to merge with something larger than the ego. It dissolves boundaries and can manifest as inspiration or self-deception. Its house reveals where you seek the divine — and where clarity matters most.",
    apply: "Honor Neptune's call for beauty and spiritual depth, but stay grounded in discernment. Its house needs both imagination AND clear-eyed realism to avoid idealization that leads to disappointment.",
  },
  {
    term: "Pluto", category: "planet", glyph: "♇",
    short: "Deep transformation, power, death and rebirth, and the irresistible force of evolution.",
    detail: "Pluto governs the underworld, shadow material, collective power, and cycles of decay and regeneration. It rules psychic depth, crisis, and the compulsive urge toward control or total release. Its house shows where you undergo the deepest and most irreversible transformation.",
    apply: "Pluto's house is the domain of your most profound metamorphosis. Surrender to it rather than resist — what Pluto destroys was ready to end; what emerges is more authentic and can't be taken back.",
  },
  {
    term: "Chiron", category: "planet", glyph: "⚷",
    short: "Your core wound and the path to becoming a healer of others through that very wound.",
    detail: "Chiron, the wounded healer, represents a deep psychic wound that never fully heals — yet becomes the source of your greatest healing capacity. Its sign and house reveal the nature of the wound. Working with Chiron consciously transforms suffering into wisdom that helps others.",
    apply: "Don't try to eliminate your Chiron wound — work with it. Your deepest insecurity, healed enough, becomes your most genuine offering. It is credential, not liability.",
  },
  {
    term: "North Node", category: "planet", glyph: "☊",
    short: "Your soul's evolutionary direction — the territory you are here to grow toward in this lifetime.",
    detail: "The North Node represents the karmic direction of growth, the territory that feels unfamiliar but deeply right to develop. It always opposes the South Node. Its sign and house describe the qualities and life arena you are here to cultivate — consciously, with effort.",
    apply: "Lean into your North Node even when it feels uncomfortable — that discomfort signals growth. Its house is where your most meaningful development occurs, often in the second half of life.",
  },
  // ── ASPECTS ──────────────────────────────────────────────────────────────
  {
    term: "Conjunction", category: "aspect",
    short: "Two planets at the same degree — they fuse and amplify each other with great intensity.",
    detail: "A conjunction (0°, orb ~8°) merges planetary energies into a unified force. It is the most potent aspect — the planets act as one. This creates concentration and power, but also potential blind spots when the fusion is unexamined.",
    apply: "Planets conjoined in your chart are intertwined — working with one inevitably invokes the other. Map the fused archetype; it is a dominant signature of your personality.",
  },
  {
    term: "Opposition", category: "aspect",
    short: "Two planets facing each other — tension between opposite needs that seeks balance through awareness.",
    detail: "An opposition (180°, orb ~8°) creates awareness through contrast and relational tension. The two planets represent competing drives that must be integrated. Oppositions often manifest through 'other people' — you project one end onto partners or rivals.",
    apply: "Oppositions demand integration, not choosing sides. Find the middle ground between the two planetary principles. The awareness they force is the gift — you see the full polarity where others see only one side.",
  },
  {
    term: "Trine", category: "aspect",
    short: "Three planets 120° apart — effortless flow, natural talent, and ease of expression.",
    detail: "A trine (120°, orb ~8°) links planets in the same element, creating harmonious energy flow. It represents inherited gifts and areas where things come naturally. The shadow of the trine is complacency — its gifts can go undeveloped precisely because they feel effortless.",
    apply: "Don't take your trines for granted. They are genuine talents that reward deliberate cultivation. Ease is a starting point, not a ceiling — build on it intentionally.",
  },
  {
    term: "Square", category: "aspect",
    short: "Two planets 90° apart — friction, inner conflict, and growth through conscious confrontation.",
    detail: "A square (90°, orb ~7°) creates friction between planets in incompatible signs, demanding action, adjustment, and growth. It represents challenge and the drive to resolve paradox. Squares are often the source of a person's most powerful achievements — difficulty forges strength.",
    apply: "Squares mark the arenas of productive struggle. Rather than avoiding the tension, engage it: the friction is exactly what develops the muscle. Your greatest competence often grows from your hardest squares.",
  },
  {
    term: "Sextile", category: "aspect",
    short: "Two planets 60° apart — cooperative opportunity and latent talent that can be activated.",
    detail: "A sextile (60°, orb ~5°) links complementary elements in a relationship of easy cooperation. It represents opportunities and abilities available but requiring some initiative to activate. Unlike a trine, a sextile needs you to reach for it.",
    apply: "Sextiles are gifts with a key — they need initiative to unlock. Look for opportunities in the areas these planets govern and take consistent small steps. They reward follow-through.",
  },
  {
    term: "Quincunx", category: "aspect",
    short: "Two planets 150° apart — an awkward, persistent need for adjustment between irreconcilable energies.",
    detail: "A quincunx (150°, orb ~3°) connects planets that share neither element nor modality, creating a relationship of persistent unease. It requires ongoing adjustment rather than resolution. Often appears in health crises, vocational pivots, or areas of chronic low-grade friction.",
    apply: "With a quincunx, there is no 'fix' — only ongoing management and recalibration. The lesson is flexibility and tolerance for ambiguity between two life domains that will never fully agree.",
  },
  // ── ELEMENTS ─────────────────────────────────────────────────────────────
  {
    term: "Fire", category: "element",
    short: "Inspiration, spirit, will, and the impulse to act and become. Signs: Aries, Leo, Sagittarius.",
    detail: "Fire energy is enthusiastic, visionary, courageous, and self-expressive. It represents the vital spark and the urge to become. Strong fire brings dynamism and leadership; weak fire may mean difficulty with motivation, confidence, or sustained initiative.",
    apply: "If fire dominates your chart, channel it into creation and service — ungrounded fire becomes egotism. If underrepresented, cultivate practices that build faith, courage, and playfulness.",
  },
  {
    term: "Earth", category: "element",
    short: "Matter, body, practicality, and the capacity to manifest vision in the physical world. Signs: Taurus, Virgo, Capricorn.",
    detail: "Earth energy is grounded, patient, sensory, and results-oriented. It represents the capacity to build, maintain, and inhabit physical reality. Strong earth brings reliability and tangible results; weak earth can manifest as impracticality or difficulty with finances or follow-through.",
    apply: "Earth planets anchor your chart's visions in reality. Honor their need for patience and physical grounding — embodiment practices, craft, and nature feed earth energy.",
  },
  {
    term: "Air", category: "element",
    short: "Mind, language, relationship, and the circulation of ideas and connection. Signs: Gemini, Libra, Aquarius.",
    detail: "Air energy is curious, relational, rational, and conceptual. It represents the capacity to communicate, connect, and think abstractly. Strong air brings social intelligence and verbal gifts; weak air can manifest as difficulty articulating ideas or seeing others' perspectives.",
    apply: "Air planets connect your inner world to social reality through thought and language. Feed them with conversation, writing, and intellectual challenge — isolation stifles air energy.",
  },
  {
    term: "Water", category: "element",
    short: "Emotion, intuition, soul, and the feeling dimension of experience. Signs: Cancer, Scorpio, Pisces.",
    detail: "Water energy is sensitive, empathic, deep, and psychic. It represents the emotional and spiritual dimensions of experience. Strong water brings depth of feeling and intuition; weak water can manifest as emotional disconnection or difficulty with empathy and vulnerability.",
    apply: "Water planets speak through feelings, dreams, and somatic intuition. Honor them by creating space for emotional processing rather than intellectualizing or suppressing what they carry.",
  },
  // ── MODALITIES ───────────────────────────────────────────────────────────
  {
    term: "Cardinal", category: "modality",
    short: "The initiator — takes action, starts projects, and creates change. Signs: Aries, Cancer, Libra, Capricorn.",
    detail: "Cardinal energy initiates and leads. Cardinal signs begin each season — they carry the impulse to start, act, and create new cycles. Strong cardinal energy brings entrepreneurial vision and decisive action; overdone, it can struggle to finish what it starts.",
    apply: "Cardinal planets in your chart point to where you lead and initiate. Use these energies to start — but partner them with fixed energy for follow-through and completion.",
  },
  {
    term: "Fixed", category: "modality",
    short: "The sustainer — persists, maintains, and holds the course. Signs: Taurus, Leo, Scorpio, Aquarius.",
    detail: "Fixed energy holds steady, maintains momentum, and resists change. Fixed signs fall in the middle of each season, consolidating its energy. Strong fixed energy brings persistence and loyalty; overdone, it becomes rigid or resistant to necessary change.",
    apply: "Fixed planets show where you persist and hold ground. Use them for long-term projects and integrity — but monitor for inflexibility when genuine change is calling.",
  },
  {
    term: "Mutable", category: "modality",
    short: "The adapter — synthesizes, transitions, and bridges between cycles. Signs: Gemini, Virgo, Sagittarius, Pisces.",
    detail: "Mutable energy adapts, synthesizes, and moves between states. Mutable signs close each season, distributing its energy into the next cycle. Strong mutable energy brings flexibility and versatility; overdone, it can manifest as indecision or difficulty committing.",
    apply: "Mutable planets are where you adapt and translate. Channel them through roles requiring flexibility — but ground yourself in clear values to avoid drifting with every wind.",
  },
  // ── DIGNITIES ────────────────────────────────────────────────────────────
  {
    term: "Domicile", category: "dignity",
    short: "A planet in its home sign — expressing with full power, ease, and self-knowledge.",
    detail: "Domicile (rulership) means the planet occupies the sign it naturally governs — Mars in Aries, Venus in Taurus. The planet operates with full efficiency, clarity, and authority. It is 'at home' — no translation required.",
    apply: "Planets in domicile are your power positions. Lean into those archetypes deliberately — they operate with unusual clarity and can anchor other less-settled parts of the chart.",
  },
  {
    term: "Exaltation", category: "dignity",
    short: "A planet in its sign of honor — elevated, idealized, and operating with refined power.",
    detail: "Exaltation places a planet in the sign where it expresses most ideally — the Moon in Taurus, the Sun in Aries. The planet performs brilliantly but may tend toward idealism or overreach. It is honored, not at home.",
    apply: "Exalted planets express an archetype with unusual refinement and grace — but watch for the perfectionism or inflation that can accompany an elevated position. Ground their gifts in practical application.",
  },
  {
    term: "Detriment", category: "dignity",
    short: "A planet in the sign opposite its home — expressing with friction, forced adaptation, or inversion.",
    detail: "Detriment places a planet in the sign opposing its domicile — Mars in Libra, the Moon in Capricorn. The planet must work against the grain, creating productive tension. This is not simply 'bad' — it often produces distinctive, hard-won, nuanced expressions of the archetype.",
    apply: "Planets in detriment require integration work. Their expression is complex and non-obvious — approach them as an invitation to develop a more sophisticated version of that archetype, not as a deficit.",
  },
  {
    term: "Fall", category: "dignity",
    short: "A planet in the sign opposite its exaltation — operating below its ideal, humbled, or internalized.",
    detail: "Fall places a planet in the sign opposing its exaltation — the Moon in Scorpio, Saturn in Aries. The planet's gifts are less accessible and more internalized, requiring conscious effort to deploy. Planets in fall often develop very unique, deeply personal expressions over time.",
    apply: "Planets in fall are areas that require deliberate cultivation. What feels weak in youth often becomes distinctive and hard-won strength by midlife — through the very effort of having to develop it consciously.",
  },
  {
    term: "Peregrine", category: "dignity",
    short: "A planet with no essential dignity — wandering, versatile, and shaped strongly by context.",
    detail: "A peregrine planet lacks essential dignity — it is neither at home nor honored in its sign. Like a traveler in a foreign land, it must adapt to its environment. Peregrine planets are not weakened — they are freed from fixed expression and become highly contextual and adaptive.",
    apply: "Peregrine planets in your chart are chameleons — their meaning is shaped strongly by house, aspects, and transits. Study the surrounding influences carefully to understand how they express in your specific life.",
  },
  // ── PATTERNS ─────────────────────────────────────────────────────────────
  {
    term: "Grand Trine", category: "pattern",
    short: "Three planets in mutual trine — a self-contained circuit of flowing talent and ease.",
    detail: "A Grand Trine forms when three planets each trine the other two, creating an equilateral triangle in one element. It represents exceptional natural talent and ease in that element's domain. The shadow: the energy can be self-enclosed and miss opportunities for growth through challenge.",
    apply: "A Grand Trine is a genuine gift — but gifts need a door opened outward. Look for planets that oppose or square the trine; challenge there is what activates the talent and directs it into the world.",
  },
  {
    term: "T-Square", category: "pattern",
    short: "Two planets opposite, both squaring a third — high-voltage tension seeking a release point.",
    detail: "A T-Square links three planets: two in opposition and a third (the apex) squaring both. The apex planet is under intense pressure from both sides and is the key to the configuration. T-Squares are motors of achievement — their discomfort drives extraordinary output.",
    apply: "The sign and house opposite the apex planet is the 'empty leg' — the release valve. Developing that area consciously provides an outlet for the T-Square's intense drive and allows the whole pattern to discharge productively.",
  },
  {
    term: "Yod", category: "pattern",
    short: "The 'Finger of God' — two sextile planets both quincunx a third, pointing to a compulsive purpose.",
    detail: "A Yod forms when two planets in sextile both form quincunx aspects to a third planet (the apex). The energy flows to the apex insistently, creating a sense of compulsion or fate. The apex planet demands constant adjustment and recalibration — it is a mission that never quite settles.",
    apply: "The Yod's apex planet is your 'point of adjustment' — it consistently demands attention and reorientation. Surrender to its calling rather than forcing resolution. Its restlessness IS the direction.",
  },
  {
    term: "Stellium", category: "pattern",
    short: "Three or more planets in one sign or house — massively concentrated energy in a single domain.",
    detail: "A stellium occurs when three or more planets cluster in one sign or house. It creates overwhelming concentration of energy in that area, making it the dominant theme of the chart. The individual is deeply identified with the stellium's themes.",
    apply: "A stellium's concentration is its power and its limitation. Develop other areas of the chart with intention to create balance. The stellium will dominate naturally — it's the other houses that need deliberate cultivation.",
  },
  {
    term: "Grand Cross", category: "pattern",
    short: "Four planets in two oppositions squaring each other — cross-pressured tension and remarkable resilience.",
    detail: "A Grand Cross forms when four planets occupy all four signs of one modality, creating two oppositions and four squares simultaneously. It creates a feeling of being pulled in four directions. Grand Cross natives develop exceptional resilience through navigating this constant tension.",
    apply: "The Grand Cross's four arms are four life arenas in constant tension. The path is not to resolve it but to develop mastery in all four — becoming an axis that holds under pressure rather than one that collapses.",
  },
  {
    term: "Kite", category: "pattern",
    short: "A Grand Trine with an opposition — the trine's flowing gifts are given direction and purpose.",
    detail: "A Kite forms when a Grand Trine has one planet opposed by a fourth planet, with the opposing planet sextile to two trine members. The opposition provides direction and tension that channels the trine's flowing energy outward. It is one of the most complete and directed configurations.",
    apply: "In a Kite, the planet at the 'tail' (opposing the Grand Trine) is the driving force. Work consciously with its themes — it is the rudder that determines where the Kite's abundant energy flows.",
  },
  // ── CONCEPTS ─────────────────────────────────────────────────────────────
  {
    term: "Retrograde", category: "concept",
    short: "A planet appears to move backward from Earth's perspective — its energy turns inward and reflective.",
    detail: "Retrograde motion is an optical illusion — the planet slows, stops, and appears to reverse. Astrologically, this internalizes the planet's energy: it works more deeply, subtly, and privately. Natal retrograde planets suggest energies developed through inner experience rather than conventional outward expression.",
    apply: "Natal retrograde planets are not weakened — they are introspective. They reward inner work, revision, and non-linear development. Don't force them to express conventionally; find your own form for that archetype.",
  },
  {
    term: "Orb", category: "concept",
    short: "The allowable degree of inexactness for an aspect to count as active. Tighter orbs = stronger influence.",
    detail: "An orb is the margin allowed for an aspect to be active. A conjunction with 2° orb is far more potent than one with 7° orb. For major aspects, up to 8° is common; minor aspects warrant narrower orbs (2–3°). The tighter the orb, the more specific and intense the interaction.",
    apply: "Prioritize aspects with tight orbs (under 3°) — they represent the most potent and specific influences. Wider orbs are background themes. Sort by orb to find the heart of your chart's story.",
  },
  {
    term: "Ascendant", category: "concept",
    short: "The rising sign at the moment of birth — your outer personality, physical presence, and first impression.",
    detail: "The Ascendant (Rising) is the degree of the zodiac rising on the eastern horizon at birth. It rules the 1st house and describes the persona, body, and instinctive mode. While the Sun is who you are inside, the Ascendant is how you appear and how you instinctively meet the world.",
    apply: "Your Ascendant is your interface with the world — the mode you adopt automatically in new situations. Understanding it explains why others perceive you a certain way, even when that doesn't feel like 'you' from inside.",
  },
  {
    term: "Midheaven", category: "concept",
    short: "The highest point in the chart — your public role, life direction, and how the world comes to know you.",
    detail: "The Midheaven (MC) is the highest zodiac degree at birth, cusp of the 10th house. It represents reputation, career, life direction, and the public face. The MC's sign describes the style in which you are most visible; planets near it are especially prominent in public life.",
    apply: "Look to your Midheaven sign for clues about your ideal public contribution. Planets conjunct the MC describe qualities you are here to embody visibly — they are a core part of your vocational identity.",
  },
];

export const GLOSSARY_MAP = new Map(GLOSSARY.map((e) => [e.term.toLowerCase(), e]));

export function getEntry(term: string): GlossaryEntry | undefined {
  return GLOSSARY_MAP.get(term.toLowerCase());
}

export const CATEGORIES = [
  "planet", "aspect", "element", "modality", "dignity", "pattern", "concept",
] as const;

export type GlossaryCategory = (typeof CATEGORIES)[number];
