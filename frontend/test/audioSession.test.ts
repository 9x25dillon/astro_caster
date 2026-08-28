// One context, one limiter, one bed, one clock.
//
// These are the invariants that make the torus and the field able to sound
// TOGETHER, and every one of them is invisible to the ear until it is wrong —
// at which point it is wrong in the way that matters most, because each failure
// mode counterfeits or destroys a BEAT, and the beat is the measurement.
//
// The audio players have never had tests: they need a Web Audio context, which
// node has not got. So this file brings a fake one that records the graph it is
// asked to build. That is enough for the questions worth asking here, which are
// all topological — what connects to what, and how many of it there are.
import { strict as assert } from "node:assert";
import { test } from "node:test";

// ── a recording fake ────────────────────────────────────────────────────────

function mkParam(v = 0) {
  const p: Record<string, unknown> = { value: v, ramps: [] as Array<[number, number]> };
  p.cancelScheduledValues = () => {};
  p.setValueAtTime = (x: number) => { p.value = x; };
  p.linearRampToValueAtTime = (x: number, t: number) => {
    (p.ramps as Array<[number, number]>).push([x, t]);
    p.value = x;
  };
  p.setTargetAtTime = (x: number) => { p.value = x; };
  p.exponentialRampToValueAtTime = (x: number) => { p.value = x; };
  return p as unknown as AudioParam & { ramps: Array<[number, number]> };
}

class FakeNode {
  outs: FakeNode[] = [];
  constructor(public kind: string) {}
  connect(n: FakeNode) { this.outs.push(n); return n; }
  disconnect() { this.outs = []; }
}
class FakeGain extends FakeNode {
  gain = mkParam(1);
  constructor() { super("gain"); }
}
class FakeOsc extends FakeNode {
  frequency = mkParam(440);
  detune = mkParam(0);
  type = "sine";
  started = false;
  stopped = false;
  constructor() { super("osc"); }
  start() { this.started = true; }
  stop() { this.stopped = true; }
}
class FakeComp extends FakeNode {
  threshold = mkParam(0); knee = mkParam(0); ratio = mkParam(1);
  attack = mkParam(0); release = mkParam(0);
  constructor() { super("compressor"); }
}
class FakePanner extends FakeNode {
  pan = mkParam(0);
  constructor() { super("panner"); }
}

class FakeCtx {
  static built = 0;
  destination = new FakeNode("destination");
  currentTime = 0;
  state = "running";
  nodes: FakeNode[] = [];
  closed = false;
  constructor() { FakeCtx.built++; }
  private keep<T extends FakeNode>(n: T): T { this.nodes.push(n); return n; }
  createGain() { return this.keep(new FakeGain()); }
  createOscillator() { return this.keep(new FakeOsc()); }
  createDynamicsCompressor() { return this.keep(new FakeComp()); }
  createStereoPanner() { return this.keep(new FakePanner()); }
  async resume() { this.state = "running"; }
  async suspend() { this.state = "suspended"; }
  async close() { this.closed = true; }
}

// Install the fake before importing the module under test — it reads
// `window.AudioContext` lazily, per call, so this is enough.
(globalThis as Record<string, unknown>).window = globalThis;
(globalThis as Record<string, unknown>).document = {
  hidden: false,
  addEventListener: () => {},
  removeEventListener: () => {},
};
(globalThis as Record<string, unknown>).AudioContext = FakeCtx;

const { AudioSession, BUS_GAIN } = await import("../src/lib/audioSession");

const BED = { carrier_hz: 136.1, beat_hz: 7.83 };

async function fresh() {
  const s = AudioSession.active();
  if (s) await s.close();
  FakeCtx.built = 0;
  return (await AudioSession.acquire(BED))!;
}

function countKind(ctx: FakeCtx, kind: string): number {
  return ctx.nodes.filter((n) => n.kind === kind).length;
}

// ── the invariants ──────────────────────────────────────────────────────────

test("both instruments join ONE context — two would be two clocks", async () => {
  const s = await fresh();
  s.bus("torus");
  s.bus("field");
  // A second acquire is the field arriving while the torus already sounds.
  const again = await AudioSession.acquire(BED);
  assert.equal(again, s);
  assert.equal(FakeCtx.built, 1, "a second AudioContext was constructed");
  await s.close();
});

test("ONE limiter, and every bus sums into it before the destination", async () => {
  const s = await fresh();
  const ctx = s.context as unknown as FakeCtx;
  const a = s.bus("torus") as unknown as FakeGain;
  const b = s.bus("field") as unknown as FakeGain;

  // Two compressors is the failure that counterfeits a beat: a limiter's gain
  // envelope moving at a few Hz is indistinguishable from a beat at a few Hz,
  // and two of them cannot see each other.
  assert.equal(countKind(ctx, "compressor"), 1);
  const limiter = ctx.nodes.find((n) => n.kind === "compressor")!;
  assert.deepEqual(a.outs, [limiter]);
  assert.deepEqual(b.outs, [limiter]);
  assert.deepEqual(limiter.outs, [ctx.destination as unknown as FakeNode]);
  await s.close();
});

test("ONE bed, owned by the session — two would beat against each other", async () => {
  const s = await fresh();
  const ctx = s.context as unknown as FakeCtx;
  s.bus("torus");
  s.bus("field");

  // Both players used to build the bed themselves from the same spec. Together
  // that is double amplitude AND, on two contexts, two carriers drifting at a
  // rate nobody chose. The bed is the field itself; there is one of it.
  const oscs = ctx.nodes.filter((n) => n.kind === "osc") as FakeOsc[];
  assert.equal(oscs.length, 2, "expected exactly the two bed tones");
  const hz = oscs.map((o) => o.frequency.value).sort((x, y) => x - y);
  assert.deepEqual(hz, [
    BED.carrier_hz - BED.beat_hz / 2,
    BED.carrier_hz + BED.beat_hz / 2,
  ]);
  // The bed does not pass through either instrument's bus — muting the torus
  // must not take the field's ground with it.
  const busGains = [s.bus("torus"), s.bus("field")] as unknown as FakeGain[];
  for (const o of oscs) {
    const reachesBus = JSON.stringify(o.outs).length > 0 &&
      busGains.some((bg) => o.outs.includes(bg as unknown as FakeNode));
    assert.equal(reachesBus, false);
  }
  await s.close();
});

test("a bus starts SILENT, so an instrument can build before it is heard", async () => {
  const s = await fresh();
  const g = s.bus("torus") as unknown as FakeGain;
  assert.equal(g.gain.value, 0);
  await s.close();
});

// ── the blend ───────────────────────────────────────────────────────────────

test("the blend is EQUAL POWER — the midpoint is where the instrument is played", async () => {
  const s = await fresh();
  const a = s.bus("torus") as unknown as FakeGain;
  const b = s.bus("field") as unknown as FakeGain;

  s.blend("torus", "field", 0.5);
  // Linear would give 0.5/0.5 and a ~3 dB hole. Equal power gives 0.707 each,
  // so total power is constant across the sweep — and the midpoint, where both
  // the pair and the fourteen are audible at comparable amplitude, is exactly
  // the condition under which a beat between them is strongest.
  const sumSq = (a.gain.value / BUS_GAIN) ** 2 + (b.gain.value / BUS_GAIN) ** 2;
  assert.ok(Math.abs(sumSq - 1) < 1e-9, `power ${sumSq} should be 1`);
  assert.ok(Math.abs(a.gain.value - b.gain.value) < 1e-9);
  await s.close();
});

test("constant power holds across the whole sweep, not just the middle", async () => {
  const s = await fresh();
  const a = s.bus("torus") as unknown as FakeGain;
  const b = s.bus("field") as unknown as FakeGain;
  for (let i = 0; i <= 20; i++) {
    s.blend("torus", "field", i / 20);
    const p = (a.gain.value / BUS_GAIN) ** 2 + (b.gain.value / BUS_GAIN) ** 2;
    assert.ok(Math.abs(p - 1) < 1e-9, `mix ${i / 20} → power ${p}`);
  }
  await s.close();
});

test("the ends of the blend are the tab positions", async () => {
  const s = await fresh();
  const a = s.bus("torus") as unknown as FakeGain;
  const b = s.bus("field") as unknown as FakeGain;
  s.blend("torus", "field", 0);
  assert.ok(Math.abs(a.gain.value - BUS_GAIN) < 1e-9);
  assert.ok(Math.abs(b.gain.value) < 1e-9);
  s.blend("torus", "field", 1);
  assert.ok(Math.abs(a.gain.value) < 1e-9);
  assert.ok(Math.abs(b.gain.value - BUS_GAIN) < 1e-9);
  await s.close();
});

test("both buses open at once stay under the limiter's threshold", async () => {
  const s = await fresh();
  const a = s.bus("torus") as unknown as FakeGain;
  const b = s.bus("field") as unknown as FakeGain;
  s.blend("torus", "field", 0.5);
  // The staging exists so the limiter NEVER engages in ordinary use: a limiter
  // with a release in the tens of milliseconds-to-a-quarter-second responds in
  // the same 0-8 Hz band the beats live in, and one that tracks the beat
  // modulates the very null the sweep is hunting.
  const worst = a.gain.value + b.gain.value;
  assert.ok(worst < 0.5, `summed bus gain ${worst} is too hot for a safety-net limiter`);
  await s.close();
});

test("fadeBus OPENS a bus — a silent bus is an instrument that builds and is mute", async () => {
  const s = await fresh();
  const g = s.bus("torus") as unknown as FakeGain;
  // The bus is created closed on purpose, so an instrument can wire its whole
  // graph before a sound escapes. The consequence is that opening it is the
  // instrument's own job, and forgetting is silent in the worst way: every
  // oscillator running, every gain correct, nothing audible, no error.
  assert.equal(g.gain.value, 0);
  s.fadeBus("torus", BUS_GAIN);
  assert.ok(Math.abs(g.gain.value - BUS_GAIN) < 1e-9);
  await s.close();
});

test("fading a bus that was never created is a no-op, not a throw", async () => {
  const s = await fresh();
  s.fadeBus("nobody", 0.5);
  s.blend("nobody", "nor-me", 0.5);
  await s.close();
});

// ── lifetime ────────────────────────────────────────────────────────────────

test("releasing one bus does NOT close the session the other is still using", async () => {
  const s = await fresh();
  const ctx = s.context as unknown as FakeCtx;
  s.bus("torus");
  s.bus("field");

  // The tab switch. Closing here is exactly how a crossfade becomes a cut —
  // the context dying under the instrument being faded UP.
  await s.release("torus");
  assert.equal(ctx.closed, false);
  assert.equal(AudioSession.active(), s);

  await s.release("field");
  assert.equal(ctx.closed, true);
  assert.equal(AudioSession.active(), null);
});

test("closing is idempotent and clears the singleton", async () => {
  const s = await fresh();
  s.bus("torus");
  await s.close();
  await s.close();
  assert.equal(AudioSession.active(), null);
  // And the next acquire genuinely builds a new one rather than handing back
  // a dead context.
  FakeCtx.built = 0;
  const s2 = (await AudioSession.acquire(BED))!;
  assert.equal(FakeCtx.built, 1);
  assert.notEqual(s2, s);
  await s2.close();
});

test("a second acquire does not re-tune the bed", async () => {
  const s = await fresh();
  const ctx = s.context as unknown as FakeCtx;
  await AudioSession.acquire({ carrier_hz: 999, beat_hz: 40 });
  const oscs = ctx.nodes.filter((n) => n.kind === "osc") as FakeOsc[];
  // Both instruments read the bed from the SAME persisted spec. If they ever
  // disagree that is a bug upstream, and silently re-tuning the field on a tab
  // switch would hide it — and re-deal the thing the spec exists to pin.
  assert.equal(oscs.length, 2);
  assert.ok(oscs.every((o) => Math.abs(o.frequency.value - 999) > 1));
  await s.close();
});
