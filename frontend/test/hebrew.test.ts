// hebrew — the lexicon, and the three claims that make it more than a glyph table.
//
// What is worth pinning: that the partition really is 3 + 7 + 12 = 22 and the
// gematria/path numbering is the canonical one (a single transposed value would
// be invisible on screen and wrong in every tooltip); that the two attribution
// schemes are each bijections onto the classical seven AND disagree everywhere,
// which is the reason both ship; that the bodies with no letter return null
// rather than a plausible wrong one; and that the three mothers really do
// partition the six coordinate planes of ℝ⁴ into three disjoint pairs, since
// lib/torus4 turns that claim into motion.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  ATTRIBUTIONS,
  DOUBLES,
  ELEMENTALS,
  HEBREW_LETTERS,
  MODERN_OUTERS,
  MOTHERS,
  MOTHER_ELEMENTS,
  MOTHER_PLANE_PAIRS,
  SIGN_LETTERS,
  elementLetter,
  gematria,
  letterAtLongitude,
  letterForBody,
  letterForSignIndex,
  tileWord,
  type Attribution,
} from "../src/lib/hebrew";

// ── The partition ───────────────────────────────────────────────────────────

test("22 letters, partitioned 3 + 7 + 12", () => {
  assert.equal(HEBREW_LETTERS.length, 22);
  assert.equal(MOTHERS.length, 3);
  assert.equal(DOUBLES.length, 7);
  assert.equal(ELEMENTALS.length, 12);
  assert.equal(MOTHERS.length + DOUBLES.length + ELEMENTALS.length, 22);
  // every glyph distinct — a duplicate would silently double a letter's meaning
  assert.equal(new Set(HEBREW_LETTERS.map((l) => l.glyph)).size, 22);
  assert.equal(new Set(HEBREW_LETTERS.map((l) => l.name)).size, 22);
});

test("gematria runs 1–9, then tens, then hundreds", () => {
  const expected = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 40, 50, 60, 70, 80, 90,
                    100, 200, 300, 400];
  assert.deepEqual(HEBREW_LETTERS.map((l) => l.value), expected);
  assert.equal(gematria(HEBREW_LETTERS), 1495); // the whole alphabet
});

test("paths are 11–32 in alphabetical order — the ordinal plus ten", () => {
  HEBREW_LETTERS.forEach((l, i) => assert.equal(l.path, i + 11));
  assert.equal(HEBREW_LETTERS[0].path, 11);
  assert.equal(HEBREW_LETTERS[21].path, 32);
  assert.equal(new Set(HEBREW_LETTERS.map((l) => l.path)).size, 22);
});

test("the five finals are on the five letters that have them", () => {
  const finals = HEBREW_LETTERS.filter((l) => l.final).map((l) => l.name);
  assert.deepEqual(finals.sort(), ["Kaf", "Mem", "Nun", "Pe", "Tsadi"]);
});

// ── The twelve, and the seam ────────────────────────────────────────────────

test("every sign has exactly one elemental letter", () => {
  const names = Object.keys(SIGN_LETTERS);
  assert.equal(names.length, 12);
  const glyphs = names.map((s) => SIGN_LETTERS[s].glyph);
  assert.equal(new Set(glyphs).size, 12);
  for (const s of names) assert.equal(SIGN_LETTERS[s].cls, "elemental");
  // the twelve elementals ARE the twelve sign letters, no letter left over
  assert.deepEqual(new Set(glyphs), new Set(ELEMENTALS.map((l) => l.glyph)));
});

test("letterAtLongitude honours the 30° seams and the 0/360 wrap", () => {
  assert.equal(letterAtLongitude(0).name, "He");        // 0° Aries
  assert.equal(letterAtLongitude(29.999).name, "He");
  assert.equal(letterAtLongitude(30).name, "Vav");      // 0° Taurus
  assert.equal(letterAtLongitude(359.999).name, "Qof"); // late Pisces
  assert.equal(letterAtLongitude(360).name, "He");      // wrapped home
  assert.equal(letterAtLongitude(-0.5).name, "Qof");    // and backwards
  assert.equal(letterForSignIndex(-1).name, "Qof");
  assert.equal(letterForSignIndex(12).name, "He");
});

test("a tile is named by both letters and sums to their gematria", () => {
  const t = tileWord(5, 35); // Aries × Taurus → He (5) and Vav (6)
  assert.equal(t.theta.name, "He");
  assert.equal(t.phi.name, "Vav");
  assert.equal(t.value, 11);
  // written right to left: φ's letter first on the page, θ's last
  assert.equal(t.word, "\u05D5\u05D4"); // vav, he
  assert.equal(t.word, `${t.phi.glyph}${t.theta.glyph}`);
});

// ── The seven, and where the traditions part ────────────────────────────────

const CLASSICAL = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"];

test("each scheme is a bijection between the seven doubles and the seven planets", () => {
  for (const scheme of Object.keys(ATTRIBUTIONS) as Attribution[]) {
    const table = ATTRIBUTIONS[scheme];
    assert.deepEqual(Object.keys(table).sort(), [...CLASSICAL].sort(), scheme);
    const letters = Object.values(table);
    assert.equal(new Set(letters.map((l) => l.glyph)).size, 7, scheme);
    for (const l of letters) assert.equal(l.cls, "double", scheme);
    // and they are exactly the seven doubles, none borrowed from elsewhere
    assert.deepEqual(
      new Set(letters.map((l) => l.glyph)),
      new Set(DOUBLES.map((l) => l.glyph)),
      scheme,
    );
  }
});

test("the two schemes disagree on every single planet — which is why both ship", () => {
  for (const body of CLASSICAL) {
    const y = letterForBody(body, "yetzirah")!.letter.name;
    const g = letterForBody(body, "golden-dawn")!.letter.name;
    assert.notEqual(y, g, `${body}: schemes coincide, one of the tables is wrong`);
  }
  // spot-check both against their printed sources
  assert.equal(letterForBody("Sun", "yetzirah")!.letter.glyph, "כ");
  assert.equal(letterForBody("Sun", "golden-dawn")!.letter.glyph, "ר");
  assert.equal(letterForBody("Saturn", "yetzirah")!.letter.glyph, "ב");
  assert.equal(letterForBody("Saturn", "golden-dawn")!.letter.glyph, "ת");
});

test("bodies the scheme has no letter for return null, not a plausible guess", () => {
  for (const body of ["North Node", "Chiron", "Lilith", "Ascendant", "Midheaven"]) {
    assert.equal(letterForBody(body), null, body);
    assert.equal(letterForBody(body, "golden-dawn", true), null, body);
  }
});

test("the moderns are opt-in, land on the mothers, and are flagged untraditional", () => {
  for (const outer of ["Uranus", "Neptune", "Pluto"]) {
    assert.equal(letterForBody(outer), null, `${outer} must be off by default`);
    const hit = letterForBody(outer, "yetzirah", true)!;
    assert.equal(hit.via, "mother");
    assert.equal(hit.traditional, false);
    assert.equal(hit.letter.cls, "mother");
  }
  assert.equal(MODERN_OUTERS.Uranus.glyph, "א");
  assert.equal(MODERN_OUTERS.Neptune.glyph, "מ");
  assert.equal(MODERN_OUTERS.Pluto.glyph, "ש");
  // one mother each, no doubling up
  assert.equal(new Set(Object.values(MODERN_OUTERS).map((l) => l.glyph)).size, 3);
});

// ── Three mothers, three elements, three plane-pairs ────────────────────────

test("Earth has no mother letter, and says so", () => {
  assert.equal(elementLetter("Earth"), null);
  assert.equal(elementLetter("Air")!.glyph, "א");
  assert.equal(elementLetter("Water")!.glyph, "מ");
  assert.equal(elementLetter("Fire")!.glyph, "ש");
  assert.equal(Object.keys(MOTHER_ELEMENTS).length, 3);
});

test("the mothers partition the six coordinate planes of R4 into three disjoint pairs", () => {
  const pairs = MOTHERS.map((m) => MOTHER_PLANE_PAIRS[m.name]);
  assert.equal(pairs.length, 3);

  // all six planes, each used exactly once
  const flat = pairs.flat();
  assert.equal(flat.length, 6);
  assert.equal(new Set(flat).size, 6);

  // and within a pair the two planes share NO coordinate — "completely
  // orthogonal", which is what makes each mother one motion instead of two
  for (const [p, q] of pairs) {
    const coords = new Set([...p, ...q]);
    assert.equal(coords.size, 4, `${p}/${q} share a coordinate`);
    assert.deepEqual([...coords].sort(), ["w", "x", "y", "z"]);
  }

  // Aleph owns the pair the Clifford torus is already built on
  assert.deepEqual(MOTHER_PLANE_PAIRS.Aleph, ["xy", "zw"]);
});
