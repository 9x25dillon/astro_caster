"""
tarot_data.py
=============
Static tarot correspondence tables for Astra Arcana. Pure data, no logic, no AI.
This is the offline-first foundation: every deterministic reading and every
classroom lesson is rendered from the corpora here, so the module works with no
network and burns zero LLM tokens.

Design notes / esoteric sourcing
--------------------------------
- Major Arcana astrological attributions follow the Golden Dawn / Hermetic
  scheme (Emperor=Aries, Hierophant=Taurus, ... Moon=Pisces; planetary trumps
  Magician=Mercury, High Priestess=Moon, Empress=Venus, etc.).
- PLANET_MAJOR is a deliberate *luminary/archetype* mapping (which trump best
  embodies each natal body), NOT the decan system. Where a planet rules a sign
  whose trump is elsewhere (e.g. Pluto rules Scorpio = Death), we map the planet
  to its modern planetary trump (Pluto -> Judgement) so planet-cards and
  sign-cards stay distinct. This is documented rather than a bug.
- Planet ids are CAPITALIZED to match PlanetData.id from the chart engine
  ("Sun", "Moon", "North Node", "Ascendant", ...).
"""

from __future__ import annotations

from typing import Dict, List

# --------------------------------------------------------------------------- #
# Major Arcana — full 22 trumps with correspondences + embedded lesson corpus
# --------------------------------------------------------------------------- #
# Each entry: id, name, number, keywords, element, astrology, upright (gift),
# reversed (shadow), and a `lesson` block used by the Arcane Classroom and the
# per-card meaning generator.

MAJOR_ARCANA: List[Dict] = [
    {
        "id": "fool", "name": "The Fool", "number": 0, "arcana": "major",
        "keywords": ["beginning", "risk", "innocence", "leap", "trust"],
        "element": "Air", "astrology": ["Uranus", "Aquarius"],
        "upright": "the courage to begin before you can see the whole path",
        "reversed": "recklessness, or fear that freezes the first step",
        "lesson": {
            "mythic": "The Fool walks the cliff-edge with eyes on the horizon — the eternal beginner, holy and unafraid.",
            "psychological": "The unconditioned self before roles harden; pure potential meeting the unknown.",
            "shadow": "Leaping without grounding, or refusing to leap at all.",
            "practice": "Name one threshold you have been circling. Take the smallest real step across it today.",
            "journal": "Where is my life asking me to begin before I feel ready?",
        },
    },
    {
        "id": "magician", "name": "The Magician", "number": 1, "arcana": "major",
        "keywords": ["will", "language", "craft", "manifestation", "focus"],
        "element": "Air", "astrology": ["Mercury", "Gemini", "Virgo"],
        "upright": "focused will turning idea into form through skill and word",
        "reversed": "scattered energy, manipulation, or talent left unused",
        "lesson": {
            "mythic": "Hermes at the crossroads, channel between worlds, who makes the invisible speak.",
            "psychological": "The integrating ego that gathers the four elements and directs them with intention.",
            "shadow": "Cleverness used to deceive; power without devotion.",
            "practice": "Speak one intention aloud as if it were already true, then take one concrete action toward it.",
            "journal": "What do I already have the tools to create, if I concentrate my will?",
        },
    },
    {
        "id": "high_priestess", "name": "The High Priestess", "number": 2, "arcana": "major",
        "keywords": ["intuition", "mystery", "inner knowing", "stillness"],
        "element": "Water", "astrology": ["Moon", "Cancer"],
        "upright": "trust in the inner voice that knows before it can explain",
        "reversed": "ignored intuition, secrets that isolate, surface noise",
        "lesson": {
            "mythic": "The veiled guardian between the pillars, keeper of the lunar waters and the unspoken.",
            "psychological": "The receptive unconscious; knowledge that arrives as feeling, dream, and image.",
            "shadow": "Withdrawal into secrecy; refusing to act on what you already know.",
            "practice": "Before deciding anything today, pause and ask your body what it already senses.",
            "journal": "What do I know quietly that I have not yet let myself say?",
        },
    },
    {
        "id": "empress", "name": "The Empress", "number": 3, "arcana": "major",
        "keywords": ["abundance", "beauty", "nurture", "creativity", "sensuality"],
        "element": "Earth", "astrology": ["Venus", "Taurus", "Libra"],
        "upright": "creative fertility, pleasure, and the power to nourish",
        "reversed": "smothering, creative block, or neglect of your own needs",
        "lesson": {
            "mythic": "The great Mother, garden made flesh, who creates by receiving and tending.",
            "psychological": "The generative principle; self-worth rooted in the body and the senses.",
            "shadow": "Giving until depleted, or possessiveness disguised as care.",
            "practice": "Receive one beautiful thing today — color, scent, taste — without earning it first.",
            "journal": "Where am I being asked to nurture, and where to let myself be nurtured?",
        },
    },
    {
        "id": "emperor", "name": "The Emperor", "number": 4, "arcana": "major",
        "keywords": ["structure", "authority", "boundaries", "order", "protection"],
        "element": "Fire", "astrology": ["Aries"],
        "upright": "stable structure and protective authority you can stand on",
        "reversed": "rigidity, domination, or authority abdicated",
        "lesson": {
            "mythic": "The sovereign on the stone throne, who builds the walls within which life can flourish.",
            "psychological": "The inner father; the capacity to set boundaries and keep one's word.",
            "shadow": "Control mistaken for safety; tyranny over self or others.",
            "practice": "Set one clear boundary today and keep it for the full day.",
            "journal": "Where does my life need structure, and where has structure become a cage?",
        },
    },
    {
        "id": "hierophant", "name": "The Hierophant", "number": 5, "arcana": "major",
        "keywords": ["tradition", "teaching", "meaning", "belonging", "vows"],
        "element": "Earth", "astrology": ["Taurus"],
        "upright": "wisdom carried through tradition, mentorship, and shared meaning",
        "reversed": "dogma, conformity, or rejecting all inherited wisdom",
        "lesson": {
            "mythic": "The bridge-builder (pontifex) between heaven and earth, keeper of the sacred forms.",
            "psychological": "The internalized teacher; how we relate to authority, doctrine, and belonging.",
            "shadow": "Outsourcing conscience to the institution; or contempt for all guidance.",
            "practice": "Name one teaching that shaped you. Keep what is true; release what no longer fits.",
            "journal": "Whose voice do I treat as authority, and have I examined why?",
        },
    },
    {
        "id": "lovers", "name": "The Lovers", "number": 6, "arcana": "major",
        "keywords": ["union", "choice", "values", "attraction", "alignment"],
        "element": "Air", "astrology": ["Gemini"],
        "upright": "conscious choice and union grounded in your true values",
        "reversed": "discord, values out of alignment, choosing by default",
        "lesson": {
            "mythic": "The choice at Eden's gate; two becoming one without ceasing to be two.",
            "psychological": "The integration of opposites within, mirrored by attraction without.",
            "shadow": "Losing yourself in the Other; avoiding the responsibility of choosing.",
            "practice": "Make one small choice today from your values rather than your habits.",
            "journal": "What am I being asked to choose, and what value is the choice really about?",
        },
    },
    {
        "id": "chariot", "name": "The Chariot", "number": 7, "arcana": "major",
        "keywords": ["will", "direction", "drive", "mastery", "momentum"],
        "element": "Water", "astrology": ["Cancer"],
        "upright": "victory through directed will and emotional self-command",
        "reversed": "scattered force, defensiveness, or losing the reins",
        "lesson": {
            "mythic": "The charioteer who yokes two opposing sphinxes and moves them by will alone.",
            "psychological": "Ego strength: holding contradictory drives together and steering them.",
            "shadow": "Armoring up; pushing forward while feeling nothing.",
            "practice": "Choose one direction today and move toward it without negotiating with doubt.",
            "journal": "What opposing forces in me need to be yoked rather than silenced?",
        },
    },
    {
        "id": "strength", "name": "Strength", "number": 8, "arcana": "major",
        "keywords": ["courage", "gentleness", "patience", "inner power"],
        "element": "Fire", "astrology": ["Leo"],
        "upright": "the quiet courage that gentles the lion rather than slaying it",
        "reversed": "self-doubt, force where tenderness was needed",
        "lesson": {
            "mythic": "The maiden who closes the lion's jaws with an open hand, not a sword.",
            "psychological": "Befriending the instinctual self; power expressed through composure.",
            "shadow": "Suppressing the wild self, or being ruled by it.",
            "practice": "Meet one impulse today with patience instead of force, and notice what it wanted.",
            "journal": "What part of my animal nature am I being asked to befriend, not conquer?",
        },
    },
    {
        "id": "hermit", "name": "The Hermit", "number": 9, "arcana": "major",
        "keywords": ["solitude", "guidance", "search", "inner light", "discernment"],
        "element": "Earth", "astrology": ["Virgo"],
        "upright": "withdrawal that finds the inner lamp and lights the way back",
        "reversed": "isolation, lostness, or refusing needed solitude",
        "lesson": {
            "mythic": "The lone figure on the peak, raising a lantern with a single star inside it.",
            "psychological": "The wise self met only in solitude; meaning sought rather than performed.",
            "shadow": "Hiding from life under the name of depth.",
            "practice": "Take fifteen minutes alone in silence and ask one honest question.",
            "journal": "What can I only hear when I am alone?",
        },
    },
    {
        "id": "wheel_of_fortune", "name": "Wheel of Fortune", "number": 10, "arcana": "major",
        "keywords": ["cycles", "fate", "turning point", "expansion", "luck"],
        "element": "Fire", "astrology": ["Jupiter", "Sagittarius"],
        "upright": "a turning of the cycle; meeting change as opportunity",
        "reversed": "resisting the turn, or blaming fate for everything",
        "lesson": {
            "mythic": "The ever-turning wheel of the cosmos, where rise and fall are one motion.",
            "psychological": "Acceptance of impermanence; locating the still center within the turning.",
            "shadow": "Fatalism, or grasping to keep the wheel from moving.",
            "practice": "Name one thing that is changing. Loosen your grip on the part you cannot control.",
            "journal": "What cycle am I in, and is it cresting or beginning again?",
        },
    },
    {
        "id": "justice", "name": "Justice", "number": 11, "arcana": "major",
        "keywords": ["balance", "truth", "accountability", "fairness", "cause and effect"],
        "element": "Air", "astrology": ["Libra"],
        "upright": "clear sight, fair measure, and ownership of consequence",
        "reversed": "bias, avoidance of truth, or harsh self-judgment",
        "lesson": {
            "mythic": "The blindfolded keeper of the scales and the upright sword of discernment.",
            "psychological": "The honest inner witness that weighs without distortion.",
            "shadow": "Rationalization; punishing the self in the name of fairness.",
            "practice": "Tell one small truth today that you have been softening.",
            "journal": "Where am I out of balance, and what truth would restore it?",
        },
    },
    {
        "id": "hanged_man", "name": "The Hanged Man", "number": 12, "arcana": "major",
        "keywords": ["surrender", "reversal", "new perspective", "pause", "release"],
        "element": "Water", "astrology": ["Neptune", "Pisces"],
        "upright": "the wisdom of surrender and seeing the world upside-down",
        "reversed": "stalling, martyrdom, or clinging to control",
        "lesson": {
            "mythic": "Odin on the world-tree, hung between worlds to win the runes of vision.",
            "psychological": "Voluntary suspension of the will to receive a wider view.",
            "shadow": "Suffering for its own sake; passivity dressed as sacrifice.",
            "practice": "Suspend one decision on purpose today and let a new angle arrive.",
            "journal": "What might I see if I stopped trying to force the outcome?",
        },
    },
    {
        "id": "death", "name": "Death", "number": 13, "arcana": "major",
        "keywords": ["transformation", "ending", "release", "rebirth", "threshold"],
        "element": "Water", "astrology": ["Scorpio", "Pluto"],
        "upright": "the necessary ending that clears ground for what is next",
        "reversed": "clinging to the dead form; fear of letting go",
        "lesson": {
            "mythic": "The reaper who is also the gardener, cutting back so the field can bloom.",
            "psychological": "Ego-death; the composting of an old identity into fertile soil.",
            "shadow": "Refusing endings, or destroying to feel powerful.",
            "practice": "Release one thing — an object, a story, a habit — that belongs to who you were.",
            "journal": "What is already over that I am still pretending is alive?",
        },
    },
    {
        "id": "temperance", "name": "Temperance", "number": 14, "arcana": "major",
        "keywords": ["balance", "alchemy", "patience", "integration", "flow"],
        "element": "Fire", "astrology": ["Sagittarius"],
        "upright": "patient blending of opposites into a third, finer thing",
        "reversed": "imbalance, excess, or impatience with the slow work",
        "lesson": {
            "mythic": "The angel pouring between two cups, mixing fire and water without spilling.",
            "psychological": "The reconciling function that holds tension until a synthesis is born.",
            "shadow": "Bland compromise, or swinging between extremes.",
            "practice": "Find the middle path on one thing today — neither suppress nor indulge.",
            "journal": "What two things in me are asking to be blended rather than chosen between?",
        },
    },
    {
        "id": "devil", "name": "The Devil", "number": 15, "arcana": "major",
        "keywords": ["shadow", "attachment", "desire", "bondage", "embodiment"],
        "element": "Earth", "astrology": ["Capricorn"],
        "upright": "facing the chains you can in fact loosen; reclaiming desire",
        "reversed": "denial of shadow, or breaking free of an old bondage",
        "lesson": {
            "mythic": "The horned guardian of the material gate, whose chains are looser than they look.",
            "psychological": "The disowned shadow; compulsions that run us while we look away.",
            "shadow": "Mistaking appetite for fate; shame that deepens the chain.",
            "practice": "Name one pattern that has you. Notice the chain is around your own neck — and loose.",
            "journal": "What do I tell myself I 'have to' do, and who benefits from that story?",
        },
    },
    {
        "id": "tower", "name": "The Tower", "number": 16, "arcana": "major",
        "keywords": ["rupture", "revelation", "breakthrough", "upheaval", "liberation"],
        "element": "Fire", "astrology": ["Mars"],
        "upright": "the lightning that breaks a false structure to free what it caged",
        "reversed": "clinging to ruins; a collapse delayed and feared",
        "lesson": {
            "mythic": "The lightning-struck tower, the proud edifice undone in a single flash of truth.",
            "psychological": "The sudden collapse of a self-concept that could no longer hold reality.",
            "shadow": "Building higher on a cracked foundation; fearing the freeing fall.",
            "practice": "Notice one structure in your life that is already cracking, and stop defending it.",
            "journal": "What false certainty in me is asking to come down?",
        },
    },
    {
        "id": "star", "name": "The Star", "number": 17, "arcana": "major",
        "keywords": ["hope", "renewal", "faith", "healing", "inspiration"],
        "element": "Air", "astrology": ["Aquarius"],
        "upright": "quiet hope and renewal after the storm; trust restored",
        "reversed": "despair, disconnection, or faith withheld from yourself",
        "lesson": {
            "mythic": "The star-maiden pouring water onto land and stream, replenishing the world by night.",
            "psychological": "The return of hope; vulnerability that heals because it stops hiding.",
            "shadow": "Hope deferred into fantasy; refusing to be replenished.",
            "practice": "Do one small thing tonight purely because it gives you hope.",
            "journal": "Where is hope quietly returning, and how can I make room for it?",
        },
    },
    {
        "id": "moon", "name": "The Moon", "number": 18, "arcana": "major",
        "keywords": ["dream", "illusion", "intuition", "the unconscious", "tides"],
        "element": "Water", "astrology": ["Pisces"],
        "upright": "the path through uncertainty lit only by intuition and dream",
        "reversed": "confusion lifting, or being lost in fear and projection",
        "lesson": {
            "mythic": "The moonlit road between two towers, where the wolf and the dog both howl.",
            "psychological": "The deep unconscious; ancestral and instinctual material surfacing as image.",
            "shadow": "Drowning in fear and fantasy; mistaking projection for reality.",
            "practice": "Record a dream or a strong feeling without explaining it away.",
            "journal": "What am I afraid of in the dark that might be a messenger, not a threat?",
        },
    },
    {
        "id": "sun", "name": "The Sun", "number": 19, "arcana": "major",
        "keywords": ["vitality", "clarity", "joy", "truth", "radiance"],
        "element": "Fire", "astrology": ["Sun"],
        "upright": "clear warmth, vitality, and the joy of being fully seen",
        "reversed": "dimmed light, false cheer, or fear of one's own brightness",
        "lesson": {
            "mythic": "The naked child on the white horse beneath the unclouded sun, hiding nothing.",
            "psychological": "The integrated, radiant self; joy that does not need to perform.",
            "shadow": "Forced positivity, or hiding your light to stay safe.",
            "practice": "Let yourself be seen in one small, true way today.",
            "journal": "Where do I dim myself, and what would it cost to shine?",
        },
    },
    {
        "id": "judgement", "name": "Judgement", "number": 20, "arcana": "major",
        "keywords": ["awakening", "reckoning", "rebirth", "calling", "absolution"],
        "element": "Fire", "astrology": ["Pluto"],
        "upright": "the call to rise, answer honestly, and become who you are",
        "reversed": "self-condemnation, or refusing the call to change",
        "lesson": {
            "mythic": "The trumpet sounding over the graves, summoning the dead to rise renewed.",
            "psychological": "The deep reckoning that integrates the past and frees you to be reborn.",
            "shadow": "Endless self-trial; deafness to the genuine call.",
            "practice": "Forgive yourself one old thing, and name what you are being called toward.",
            "journal": "If I stopped putting myself on trial, what would I finally answer yes to?",
        },
    },
    {
        "id": "world", "name": "The World", "number": 21, "arcana": "major",
        "keywords": ["completion", "wholeness", "integration", "fulfillment", "mastery"],
        "element": "Earth", "astrology": ["Saturn"],
        "upright": "wholeness; a cycle completed and danced to its center",
        "reversed": "loose ends, near-completion, or fear of finishing",
        "lesson": {
            "mythic": "The dancer in the cosmic wreath, encircled by the four living creatures.",
            "psychological": "Individuation: the long work made whole, the parts at last one body.",
            "shadow": "Refusing to complete; staying small to avoid the next beginning.",
            "practice": "Finish one thing you have left almost-done, and mark its completion.",
            "journal": "What in my life is ready to be called complete?",
        },
    },
]

MAJOR_BY_ID: Dict[str, Dict] = {c["id"]: c for c in MAJOR_ARCANA}

# --------------------------------------------------------------------------- #
# Minor Arcana — suit-level correspondences (individual cards added later)
# --------------------------------------------------------------------------- #

SUIT_ELEMENTS: Dict[str, str] = {
    "wands": "Fire",
    "cups": "Water",
    "swords": "Air",
    "pentacles": "Earth",
}

ELEMENT_SUIT: Dict[str, str] = {
    "Fire": "wands",
    "Water": "cups",
    "Air": "swords",
    "Earth": "pentacles",
}

SUIT_THEME: Dict[str, str] = {
    "wands": "will, passion, creativity, and spirit",
    "cups": "feeling, love, intuition, and the inner waters",
    "swords": "mind, language, conflict, and clarity",
    "pentacles": "body, work, money, and the material world",
}

# --------------------------------------------------------------------------- #
# Chart -> card mappings (planet ids are capitalized to match PlanetData.id)
# --------------------------------------------------------------------------- #

# Luminary/archetype mapping: which trump best embodies each natal body.
# (See module docstring for the Pluto->Judgement / Death-as-sign rationale.)
PLANET_MAJOR: Dict[str, str] = {
    "Sun": "sun",
    "Moon": "high_priestess",
    "Mercury": "magician",
    "Venus": "empress",
    "Mars": "tower",
    "Jupiter": "wheel_of_fortune",
    "Saturn": "world",
    "Uranus": "fool",
    "Neptune": "hanged_man",
    "Pluto": "judgement",
    "Chiron": "hermit",        # the wounded healer / lantern-bearer
    "North Node": "star",      # the growth path / guiding star
    "South Node": "moon",      # the inherited, instinctual comfort zone
}

# Golden Dawn zodiacal trump attributions.
SIGN_MAJOR: Dict[str, str] = {
    "Aries": "emperor",
    "Taurus": "hierophant",
    "Gemini": "lovers",
    "Cancer": "chariot",
    "Leo": "strength",
    "Virgo": "hermit",
    "Libra": "justice",
    "Scorpio": "death",
    "Sagittarius": "temperance",
    "Capricorn": "devil",
    "Aquarius": "star",
    "Pisces": "moon",
}

HOUSE_THEMES: Dict[int, str] = {
    1: "identity and embodiment",
    2: "value, money, body, and voice",
    3: "language, learning, and the near world",
    4: "home, ancestry, and the inner root",
    5: "creativity, romance, and play",
    6: "health, craft, devotion, and service",
    7: "partnership and the mirror of the Other",
    8: "shadow, intimacy, death, and shared power",
    9: "belief, travel, and philosophy",
    10: "calling, visibility, and public role",
    11: "community, future, and networks",
    12: "dreams, isolation, spirit, and the unconscious",
}

# --------------------------------------------------------------------------- #
# Alignment activity templates (per natal body) — offline, gentle, optional
# --------------------------------------------------------------------------- #

PLANET_ACTIVITY: Dict[str, str] = {
    "Sun": "Let yourself be seen in one true, small way today. Notice who you are when you stop performing.",
    "Moon": "Write three sentences beginning with 'My body remembers...'. Do not edit them; let the emotional weather speak first.",
    "Mercury": "Write a short spell-poem using five words from your current state. Speak it once aloud and notice what shifts.",
    "Venus": "Choose one color, scent, sound, or texture that softens your body. Place it where you can see it — let beauty be evidence you are allowed to receive.",
    "Mars": "Move your body for five minutes with intention. Let drive become direction instead of pressure.",
    "Jupiter": "Name one belief that has grown too large or too small for you, and adjust it by a single degree.",
    "Saturn": "Choose one small boundary that protects your future self. Write it as a vow and keep it for one day before expanding it.",
    "Uranus": "Do one ordinary thing in a deliberately different way today, just to feel the hinge of freedom.",
    "Neptune": "Spend five minutes with music or water and let your mind un-focus. Note the first image that drifts up.",
    "Pluto": "Write one sentence naming something you are ready to let die, then breathe out slowly three times.",
    "Chiron": "Place a hand where an old hurt lives and tell it, simply, that you are listening now.",
    "North Node": "Take one small step toward the unfamiliar thing that scares and calls you at once.",
    "Ascendant": "Draw your 'mask' as a simple sigil — the face you meet the world with — and thank it.",
    "Midheaven": "Name aloud the work you would do if no one were watching the result.",
}


# --------------------------------------------------------------------------- #
# Minor Arcana — full 56 cards (40 pips + 16 courts)
# --------------------------------------------------------------------------- #
# Pips 2–10 carry their Golden Dawn decan attributions (planet-in-sign) and the
# classic GD card titles; Aces are the "root" of their element; courts use the
# element-of-element dignity (Page=Earth, Knight=Fire, Queen=Water, King=Air).

_RANKS: Dict[int, str] = {
    1: "Ace", 2: "Two", 3: "Three", 4: "Four", 5: "Five",
    6: "Six", 7: "Seven", 8: "Eight", 9: "Nine", 10: "Ten",
}
_SUIT_TITLE: Dict[str, str] = {
    "wands": "Wands", "cups": "Cups", "swords": "Swords", "pentacles": "Pentacles",
}

# suit -> [(number, title, astrology, keywords, upright, reversed)]
_PIPS: Dict[str, list] = {
    "wands": [
        (1, "Root of Fire", "Fire", ["spark", "inspiration", "drive", "potential"],
         "a pure surge of creative fire and new will", "a false start, or scattered, ungrounded energy"),
        (2, "Dominion", "Mars in Aries", ["vision", "planning", "boldness", "choice"],
         "bold vision and the courage to plan a larger life", "hesitation, fear of the unknown, plans stalling"),
        (3, "Established Strength", "Sun in Aries", ["foresight", "expansion", "progress", "enterprise"],
         "foresight rewarded; horizons widening", "delays, over-reach, or looking back instead of forward"),
        (4, "Perfected Work", "Venus in Aries", ["celebration", "harmony", "home", "milestone"],
         "a joyful milestone, harmony, and homecoming", "a muted celebration or unstable foundations"),
        (5, "Strife", "Saturn in Leo", ["competition", "friction", "tension", "conflict"],
         "lively competition and creative friction", "avoidable conflict, exhaustion, ego clashes"),
        (6, "Victory", "Jupiter in Leo", ["triumph", "recognition", "confidence", "success"],
         "earned recognition and public success", "hollow praise, fear of falling, delayed reward"),
        (7, "Valour", "Mars in Leo", ["courage", "defense", "perseverance", "conviction"],
         "holding your ground against the odds", "overwhelm, defensiveness, giving up the high ground"),
        (8, "Swiftness", "Mercury in Sagittarius", ["speed", "movement", "news", "momentum"],
         "rapid movement, news, and aligned momentum", "delays, haste, or scattered energy"),
        (9, "Great Strength", "Moon in Sagittarius", ["resilience", "boundaries", "stamina", "last stand"],
         "resilience and one more reserve of strength", "depletion, paranoia, rigid defensiveness"),
        (10, "Oppression", "Saturn in Sagittarius", ["burden", "responsibility", "overload", "duty"],
         "carrying much; near the finish but heavy-laden", "burnout, or finally setting the burden down"),
    ],
    "cups": [
        (1, "Root of Water", "Water", ["love", "feeling", "intuition", "openness"],
         "the heart opening; a wellspring of feeling", "emotional blockage, or love withheld from yourself"),
        (2, "Love", "Venus in Cancer", ["union", "connection", "attraction", "mutuality"],
         "mutual love and a meeting of hearts", "imbalance, tension, or a connection cooling"),
        (3, "Abundance", "Mercury in Cancer", ["celebration", "friendship", "community", "joy"],
         "joyful community and shared abundance", "overindulgence, gossip, or isolation"),
        (4, "Blended Pleasure", "Moon in Cancer", ["apathy", "contemplation", "reappraisal", "boredom"],
         "contemplative withdrawal; an offer not yet seen", "emerging from apathy; renewed interest"),
        (5, "Disappointment", "Mars in Scorpio", ["grief", "loss", "regret", "mourning"],
         "grief over what spilled; learning to see what remains", "acceptance, recovery, moving forward"),
        (6, "Pleasure", "Sun in Scorpio", ["nostalgia", "memory", "innocence", "reunion"],
         "sweet memory, nostalgia, and reunion", "stuck in the past, or idealizing it"),
        (7, "Illusion", "Venus in Scorpio", ["fantasy", "choices", "temptation", "wishful thinking"],
         "many tempting visions; discernment needed", "clarity returns; a real choice is made"),
        (8, "Abandoned Success", "Saturn in Pisces", ["departure", "seeking", "withdrawal", "quest"],
         "walking away from what no longer fulfills", "fear of leaving, or aimless drifting"),
        (9, "Happiness", "Jupiter in Pisces", ["contentment", "wish", "satisfaction", "gratitude"],
         "emotional contentment; a wish fulfilled", "smugness, or a wish that rings hollow"),
        (10, "Satiety", "Mars in Pisces", ["harmony", "family", "fulfillment", "belonging"],
         "lasting emotional fulfillment and belonging", "discord beneath the surface; idealized harmony"),
    ],
    "swords": [
        (1, "Root of Air", "Air", ["clarity", "truth", "breakthrough", "insight"],
         "a piercing clarity that cuts to truth", "confusion, misused intellect, muddled thinking"),
        (2, "Peace Restored", "Moon in Libra", ["stalemate", "truce", "indecision", "balance"],
         "an uneasy truce; a decision held in balance", "the stalemate breaks; truth surfaces"),
        (3, "Sorrow", "Saturn in Libra", ["heartbreak", "grief", "betrayal", "release"],
         "heartbreak that clears the air", "healing, or sorrow nursed too long"),
        (4, "Rest from Strife", "Jupiter in Libra", ["rest", "recovery", "retreat", "stillness"],
         "necessary rest and quiet recovery", "restlessness, or avoidance of a needed pause"),
        (5, "Defeat", "Venus in Aquarius", ["conflict", "loss", "ego", "hollow victory"],
         "a win that costs more than it gives", "reconciliation, or releasing a grudge"),
        (6, "Earned Success", "Mercury in Aquarius", ["transition", "passage", "moving on", "recovery"],
         "a passage toward calmer water", "resistance to change; baggage carried along"),
        (7, "Unstable Effort", "Moon in Aquarius", ["strategy", "stealth", "cunning", "evasion"],
         "strategy, cunning, acting alone", "self-deception exposed; coming clean"),
        (8, "Shortened Force", "Jupiter in Gemini", ["restriction", "self-limit", "stuckness", "fear"],
         "a self-made cage; the door is unlocked", "stepping free; reclaiming your power"),
        (9, "Cruelty", "Mars in Gemini", ["anxiety", "worry", "nightmares", "mental anguish"],
         "the 3am mind; worry magnified in the dark", "dawn comes; fears named and shrinking"),
        (10, "Ruin", "Sun in Gemini", ["ending", "rock bottom", "collapse", "release"],
         "a painful ending that is also completion", "recovery; the only way left is up"),
    ],
    "pentacles": [
        (1, "Root of Earth", "Earth", ["opportunity", "prosperity", "seed", "manifestation"],
         "a tangible seed of prosperity and new ground", "a missed opportunity or a shaky foundation"),
        (2, "Change", "Jupiter in Capricorn", ["balance", "juggling", "adaptability", "flux"],
         "juggling demands with nimble grace", "overwhelm; dropping one ball too many"),
        (3, "Work", "Mars in Capricorn", ["craft", "collaboration", "skill", "building"],
         "skilled collaboration and good craft", "discord, sloppy work, misaligned effort"),
        (4, "Earthly Power", "Sun in Capricorn", ["security", "control", "saving", "holding"],
         "stability and security held close", "clinging, scarcity-thinking, or learning to let go"),
        (5, "Material Trouble", "Mercury in Taurus", ["hardship", "lack", "insecurity", "exclusion"],
         "hard times; help is nearer than it looks", "recovery, support found, hardship easing"),
        (6, "Material Success", "Moon in Taurus", ["generosity", "giving", "receiving", "balance"],
         "a fair flow of giving and receiving", "strings attached, imbalance, or debt"),
        (7, "Valuelessness", "Saturn in Taurus", ["patience", "assessment", "waiting", "investment"],
         "pausing to assess a long investment", "impatience, sunk-cost clinging, poor yield"),
        (8, "Prudence", "Sun in Virgo", ["diligence", "mastery", "craft", "focus"],
         "devoted practice toward mastery", "perfectionism, or careless shortcuts"),
        (9, "Gain", "Venus in Virgo", ["abundance", "self-sufficiency", "refinement", "reward"],
         "earned abundance and graceful independence", "over-reliance on status; hollow luxury"),
        (10, "Wealth", "Mercury in Virgo", ["legacy", "family", "stability", "completion"],
         "lasting wealth, legacy, and rootedness", "financial strain or family friction over resources"),
    ],
}

# suit -> [(rank, dignity, keywords, upright, reversed)]
_COURTS: Dict[str, list] = {
    "wands": [
        ("Page", "Earth of Fire", ["curiosity", "enthusiasm", "exploration", "free spirit"],
         "an eager spark; a free-spirited explorer", "restlessness, unfinished starts"),
        ("Knight", "Fire of Fire", ["adventure", "passion", "impulse", "momentum"],
         "bold, passionate pursuit of a vision", "recklessness, burnout, scattered haste"),
        ("Queen", "Water of Fire", ["warmth", "confidence", "charisma", "vitality"],
         "radiant confidence and warm magnetism", "self-doubt, or domineering heat"),
        ("King", "Air of Fire", ["leadership", "vision", "boldness", "mastery"],
         "visionary leadership that inspires action", "impulsive or tyrannical command"),
    ],
    "cups": [
        ("Page", "Earth of Water", ["intuition", "tenderness", "creativity", "openness"],
         "a tender, intuitive, creative beginning", "emotional immaturity or escapism"),
        ("Knight", "Fire of Water", ["romance", "idealism", "pursuit", "charm"],
         "the romantic on a heartfelt quest", "moodiness, unrealistic ideals"),
        ("Queen", "Water of Water", ["empathy", "compassion", "intuition", "nurture"],
         "deep empathy and emotional wisdom", "over-giving, boundaries dissolved"),
        ("King", "Air of Water", ["composure", "balance", "wisdom", "diplomacy"],
         "emotional mastery held with calm", "suppressed feeling, or moodiness ruling"),
    ],
    "swords": [
        ("Page", "Earth of Air", ["curiosity", "vigilance", "ideas", "truth-seeking"],
         "a sharp, curious mind hungry for truth", "scattered thoughts, gossip, haste"),
        ("Knight", "Fire of Air", ["drive", "ambition", "directness", "force"],
         "fast, focused, fearless action on an idea", "recklessness, harsh words, no follow-through"),
        ("Queen", "Water of Air", ["clarity", "honesty", "independence", "perception"],
         "clear-eyed honesty and independent judgment", "coldness, bitterness, harsh judgment"),
        ("King", "Air of Air", ["authority", "truth", "ethics", "intellect"],
         "principled authority guided by truth", "cold logic, misused power, manipulation"),
    ],
    "pentacles": [
        ("Page", "Earth of Earth", ["study", "ambition", "opportunity", "diligence"],
         "a grounded student turning a dream practical", "procrastination, unrealistic plans"),
        ("Knight", "Fire of Earth", ["reliability", "routine", "diligence", "patience"],
         "steady, dependable, methodical effort", "stagnation, dullness, over-caution"),
        ("Queen", "Water of Earth", ["nurture", "abundance", "practicality", "care"],
         "nurturing, resourceful, grounded care", "self-neglect, or smothering"),
        ("King", "Air of Earth", ["abundance", "security", "leadership", "stewardship"],
         "abundant, secure, generous stewardship", "greed, control, status obsession"),
    ],
}


def _build_minor_arcana() -> List[Dict]:
    cards: List[Dict] = []
    for suit, pips in _PIPS.items():
        elem = SUIT_ELEMENTS[suit]
        for num, title, astro, kw, up, rev in pips:
            rank = _RANKS[num]
            cards.append({
                "id": f"{rank.lower()}_of_{suit}",
                "name": f"{rank} of {_SUIT_TITLE[suit]}",
                "arcana": "minor", "suit": suit, "number": num, "title": title,
                "keywords": list(kw), "element": elem,
                "astrology": [astro] if astro else [], "upright": up, "reversed": rev,
            })
        for rank, dignity, kw, up, rev in _COURTS[suit]:
            cards.append({
                "id": f"{rank.lower()}_of_{suit}",
                "name": f"{rank} of {_SUIT_TITLE[suit]}",
                "arcana": "minor", "suit": suit, "number": None, "title": dignity,
                "keywords": list(kw), "element": elem,
                "astrology": [dignity], "upright": up, "reversed": rev,
            })
    return cards


MINOR_ARCANA: List[Dict] = _build_minor_arcana()
MINOR_BY_ID: Dict[str, Dict] = {c["id"]: c for c in MINOR_ARCANA}

# Unified lookups over the full 78-card deck.
FULL_DECK: List[Dict] = MAJOR_ARCANA + MINOR_ARCANA
CARD_BY_ID: Dict[str, Dict] = {**MAJOR_BY_ID, **MINOR_BY_ID}
