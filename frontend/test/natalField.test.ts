// natalField — the whole chart as one sounding field, and its bridge to SPINE.
//
// Two things are pinned here. The VOICING, because "play all fourteen at equal
// gain" is the obvious implementation and it is wrong: the bedrock map is
// exponential, so the low register is always the crowded end, and equal gain
// there is mud. And the EXPORT SHAPE, because `resonarium.state.v2` is a
// contract owned by another repo (beatmI's twin/analyze.py) — if this drifts,
// the file still writes and simply stops being understood at the far end.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { personalSoundtrack, seedChartFromResponse } from "@astra/core";
import {
  BEAT_AUDIBLE_HZ,
  CROWD_CENTS,
  FIELD_KEYS,
  beatHzToBpm,
  beatingPairs,
  fieldVoices,
  pitchClassOf,
  resonariumState,
} from "../src/lib/natalField";
import { droneHz } from "../src/lib/resonance";
import { localChartFixture } from "./fixtures/chart";

const ALL = new Set<string>(FIELD_KEYS);

// ---------------------------------------------------------------------------
// Voicing
// ---------------------------------------------------------------------------

test("a lone drone carries full weight; a crowd shares it", () => {
  // Three tones far apart, then two a few cents apart.
  const lone = fieldVoices([110, 220, 440], new Set(["sun", "moon", "mercury"]));
  assert.deepEqual(lone.map((v) => v.crowd), [0, 0, 0]);
  assert.deepEqual(lone.map((v) => v.gain), [1, 1, 1]);

  const pair = fieldVoices([110, 110.4, 440], new Set(["sun", "moon", "mercury"]));
  assert.deepEqual(pair.map((v) => v.crowd), [1, 1, 0]);
  // 1/sqrt(2) each: two voices in a cluster sum to a lone tone's energy
  assert.ok(Math.abs(pair[0].gain - 1 / Math.SQRT2) < 1e-12);
  assert.equal(pair[2].gain, 1);
});

test("crowding never silences a voice", () => {
  // Fourteen drones piled onto one pitch — the worst case the map allows.
  const hz = new Array(14).fill(200).map((v, i) => v + i * 0.01);
  const voices = fieldVoices(hz, ALL);
  assert.equal(voices.length, 14);
  for (const v of voices) {
    assert.equal(v.crowd, 13);
    assert.ok(v.gain > 0, `${v.label} was silenced`);
    assert.ok(v.gain < 0.3, "a maximal crowd should still step well back");
  }
});

test("the crowd window is a semitone, and it is exclusive at the edge", () => {
  const inside = droneHz(0) * Math.pow(2, (CROWD_CENTS - 5) / 1200);
  const outside = droneHz(0) * Math.pow(2, (CROWD_CENTS + 5) / 1200);
  assert.equal(fieldVoices([droneHz(0), inside], new Set(["sun", "moon"]))[0].crowd, 1);
  assert.equal(fieldVoices([droneHz(0), outside], new Set(["sun", "moon"]))[0].crowd, 0);
});

test("voices follow the COMPACTED bedrock order, not a naive zip", () => {
  // bedrock_hz omits absent keys, so index 2 means `mercury` only if the two
  // before it were present. Drop `moon` and the mapping must shift with it.
  const present = new Set<string>(FIELD_KEYS);
  present.delete("moon");
  const voices = fieldVoices([111, 112, 113], present);
  assert.deepEqual(voices.map((v) => v.key), ["sun", "mercury", "venus"]);
});

// ---------------------------------------------------------------------------
// Beating — the audible signature of a low-register conjunction
// ---------------------------------------------------------------------------

test("beating pairs are found, ordered slowest-pulse-first", () => {
  const voices = fieldVoices([110, 110.4, 116, 300], new Set(["sun", "moon", "mercury", "venus"]));
  const beats = beatingPairs(voices);
  assert.equal(beats.length, 2); // 0.4 Hz and 5.6 Hz; 116→300 is far too wide
  assert.ok(Math.abs(beats[0].beatHz - 0.4) < 1e-9);
  assert.ok(Math.abs(beats[0].periodS - 2.5) < 1e-6, "0.4 Hz is a 2.5-second breath");
  assert.ok(beats[0].beatHz < beats[1].beatHz, "slowest first");
  for (const b of beats) assert.ok(b.beatHz <= BEAT_AUDIBLE_HZ);
});

test("the beat window narrows as the register rises — the structural claim", () => {
  // Same longitude separation, two registers. Low beats; high does not.
  const lowGap = droneHz(10) - droneHz(0);
  const highGap = droneHz(350) - droneHz(340);
  assert.ok(lowGap < highGap, "an equal degree gap is a wider Hz gap up top");
  assert.ok(lowGap <= BEAT_AUDIBLE_HZ, "10° apart at the bottom still beats");
  assert.ok(highGap > BEAT_AUDIBLE_HZ, "10° apart at the top is an interval, not a beat");
});

// ---------------------------------------------------------------------------
// Pitch classes — 15° is a semitone
// ---------------------------------------------------------------------------

test("15 degrees of zodiac is exactly one semitone, and 0° is A", () => {
  assert.equal(pitchClassOf(0), 9);   // A — 110 Hz is A2
  assert.equal(pitchClassOf(15), 10); // A#
  assert.equal(pitchClassOf(30), 11); // B — one sign is a whole tone
  assert.equal(pitchClassOf(45), 0);  // C
  assert.equal(pitchClassOf(180), 9); // an octave later, same class
  assert.equal(pitchClassOf(360), 9);
  assert.equal(pitchClassOf(-15), 8); // negative longitudes wrap, not crash
});

// ---------------------------------------------------------------------------
// The SPINE bridge
// ---------------------------------------------------------------------------

test("beat rate folds to a tempo the way beatmI folds it", () => {
  // Mirrors analyze_resonarium: bpm = hz*60, doubled under 70, halved over 190.
  assert.ok(Math.abs(beatHzToBpm(9.15) - 137.25) < 1e-9); // the measured case
  assert.ok(Math.abs(beatHzToBpm(2.333) - 139.98) < 0.01); // beatmI's own example
  assert.equal(beatHzToBpm(0), 0);
  assert.equal(beatHzToBpm(Number.NaN), 0);
  // the engine's beat_hz is 4 + (|aspects_sum| % 8), i.e. [4, 12)
  for (let hz = 4; hz < 12; hz += 0.05) {
    const bpm = beatHzToBpm(hz);
    assert.ok(bpm >= 70 && bpm <= 190, `beat ${hz} Hz folded to ${bpm} BPM, out of range`);
  }
});

test("the exported state matches the schema analyze.py reads", () => {
  const voices = fieldVoices([110, 220], new Set(["sun", "moon"]));
  const st = resonariumState(408670715, { carrier_hz: 213.865, beat_hz: 9.15 }, voices);

  assert.equal(st.schema, "resonarium.state.v2");
  assert.equal(st.natalSeed, 408670715); // feeds twinRng() — must be a number
  assert.equal(typeof st.natalSeed, "number");

  // singles: `on`, `f`, `lvl` are the three fields add_freq() reads
  assert.equal(st.singles.length, 2);
  for (const s of st.singles) {
    assert.equal(s.on, true);
    assert.ok(s.f > 20, "add_freq() discards anything at or below 20 Hz");
    assert.ok(s.lvl > 0);
  }
  // bins: carrier votes on key, beat becomes the tempo
  assert.equal(st.bins.length, 1);
  assert.equal(st.bins[0].carrier, 213.865);
  assert.equal(st.bins[0].beat, 9.15);
  assert.deepEqual(st.sweeps, []);
});

test("every drone survives analyze.py's 20 Hz floor and its lvl floor", () => {
  // The map spans [110, 440), so no drone is ever discarded — but the crowd
  // gain must not push `lvl` somewhere meaningless either. analyze.py floors it
  // at 0.05, so a crowded voice still votes on key rather than dropping out.
  const chart = localChartFixture();
  const spec = personalSoundtrack(chart);
  const present = new Set(Object.keys(seedChartFromResponse(chart)));
  const voices = fieldVoices(spec.bedrock_hz, present);
  const st = resonariumState(spec.seed32, spec.binaural, voices);

  assert.equal(st.singles.length, spec.bedrock_hz.length);
  for (const s of st.singles) {
    assert.ok(s.f > 20 && s.f < 440, `${s.note} at ${s.f} Hz is outside the map`);
    assert.ok(s.lvl > 0 && s.lvl <= 1);
  }
});

test("a real chart voices without silencing anything, and the field is bounded", () => {
  const chart = localChartFixture();
  const spec = personalSoundtrack(chart);
  const present = new Set(Object.keys(seedChartFromResponse(chart)));
  const voices = fieldVoices(spec.bedrock_hz, present);

  assert.ok(voices.length >= 12, "the fixture should carry a near-full body set");
  for (const v of voices) {
    assert.ok(v.gain > 0 && v.gain <= 1, `${v.label} gain ${v.gain} out of range`);
    assert.ok(v.label !== v.key || v.key === "", `${v.key} has no display label`);
  }
  // Every drone maps back to the same value the engine emitted.
  voices.forEach((v, i) => assert.equal(v.hz, spec.bedrock_hz[i]));
});
