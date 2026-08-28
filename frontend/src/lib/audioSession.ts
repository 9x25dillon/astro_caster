// audioSession.ts — one context, one limiter, one bed, one clock.
//
// The torus instrument sounds a PAIR; the field instrument sounds all FOURTEEN.
// Until now each built its own AudioContext, which was fine while only one
// could play. It stops being fine the moment they are meant to sound TOGETHER,
// and the reason is specific rather than tidy-minded:
//
//  · TWO LIMITERS ARE TWO INSTRUMENTS. Each context ended in its own
//    DynamicsCompressor before its own destination, so summing them happened in
//    the OS mixer — after two compressors that cannot see each other. A
//    compressor's gain envelope moving at a few Hz is indistinguishable from a
//    BEAT at a few Hz, which is the one signal this pairing exists to reveal.
//  · TWO BEDS ARE A THIRD BEAT. Both players built the binaural bed from the
//    same persisted spec. Played together that is two identical beds at double
//    amplitude, and — since two contexts have independent clocks and independent
//    oscillator phase — their carriers drift against each other and beat at a
//    rate nobody chose and nothing means.
//  · TWO CLOCKS CANNOT CROSSFADE. `ctx.currentTime` is per-context, so there is
//    no shared instant to schedule a ramp against.
//
// So the session owns the parts that must be singular, and each instrument
// becomes a BUS feeding it. What an instrument still owns is its own voices.
//
// Lifetime is REFERENCE-COUNTED, not owned by whoever started first. A tab
// switch releases one bus while the other is still sounding, and the context
// must survive that — closing it on the first release is how a crossfade turns
// into a cut.
//
// Session discipline is unchanged and inherited from both players
// (MOBILE_ROADMAP 4.4): built inside a real user gesture and never before,
// suspends when the page is hidden — background audio is deliberately NO,
// because the visual field is half the instrument — resumes on return, visible
// stop, no wake lock.

type Ctor = typeof AudioContext;

function audioContextCtor(): Ctor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** True when this device can sound anything at all. */
export function audioSessionSupported(): boolean {
  return audioContextCtor() !== null;
}

/** The binaural bed, straight from the persisted SoundtrackSpec. */
export interface BinauralBed {
  carrier_hz: number;
  beat_hz: number;
}

// ── Gain staging ────────────────────────────────────────────────────────────
//
// THE NUMBER THAT MATTERS. Both instruments used to run a master of 0.5 into
// their own limiter, which was correct while only one of them existed. Summed
// on one bus they reach 1.0 and the shared limiter engages continuously — and a
// limiter with a ~0.25 s release responds at about 4 Hz, which sits squarely
// inside the 0–8 Hz band the beats live in. A limiter tracking the beat does
// not merely colour it; it MODULATES THE THING BEING MEASURED, deepening or
// cancelling the very null the sweep is hunting for.
//
// So the staging is set for the loud case — both buses open at once — and the
// limiter is a safety net that must never engage in ordinary use. 0.34 each,
// two buses, equal-power blend: worst case ≈ 0.48, comfortably under a −10 dB
// (≈0.32 linear on peaks, well above this sum's RMS) threshold.
export const BUS_GAIN = 0.34;
const BED_GAIN = 0.05;
const FADE_S = 0.8;

/** The one limiter. Slow enough that it cannot chase a beat even if it fires. */
function makeLimiter(ctx: AudioContext): DynamicsCompressorNode {
  const l = ctx.createDynamicsCompressor();
  l.threshold.value = -10;
  l.knee.value = 6;
  l.ratio.value = 12;
  l.attack.value = 0.005;
  // 0.4 s ≈ 2.5 Hz. Deliberately BELOW the slowest beat worth hearing, so on
  // the rare peak that reaches it the limiter rides the programme rather than
  // articulating it. See the staging note above for why it should not fire.
  l.release.value = 0.4;
  return l;
}

export class AudioSession {
  private static current: AudioSession | null = null;

  private ctx: AudioContext;
  private limiter: DynamicsCompressorNode;
  private bedGain: GainNode;
  private bedL: OscillatorNode;
  private bedR: OscillatorNode;
  private buses = new Map<string, GainNode>();
  private onVisibility: () => void;
  private closed = false;

  private constructor(ctx: AudioContext, bed: BinauralBed) {
    this.ctx = ctx;
    this.limiter = makeLimiter(ctx);
    this.limiter.connect(ctx.destination);

    // The bed belongs to the SESSION, not to an instrument: it is the field
    // itself rather than a decoration of either view of it, and one of it is
    // the only correct number.
    this.bedGain = ctx.createGain();
    this.bedGain.gain.value = BED_GAIN;
    this.bedGain.connect(this.limiter);
    this.bedL = this.makeBedTone(bed.carrier_hz - bed.beat_hz / 2, -1);
    this.bedR = this.makeBedTone(bed.carrier_hz + bed.beat_hz / 2, 1);

    this.onVisibility = () => {
      if (this.closed) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    };
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  private makeBedTone(hz: number, pan: number): OscillatorNode {
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = hz;
    if (typeof this.ctx.createStereoPanner === "function") {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      osc.connect(p).connect(this.bedGain);
    } else {
      osc.connect(this.bedGain);       // older WebKit: mono bed, still correct
    }
    osc.start();
    return osc;
  }

  /**
   * Open the session, or join the one already sounding.
   *
   * MUST be called synchronously from a real user gesture the FIRST time —
   * every browser's autoplay policy requires it. A second instrument joining an
   * already-running session needs no gesture of its own, which is what lets a
   * tab switch blend instead of prompting.
   *
   * `bed` is honoured only by the call that actually opens the session. A
   * second caller's bed is IGNORED rather than applied, because both read it
   * from the same persisted spec: if they ever disagree, the disagreement is a
   * bug upstream and silently re-tuning the field would hide it.
   */
  static async acquire(bed: BinauralBed): Promise<AudioSession | null> {
    if (AudioSession.current && !AudioSession.current.closed) {
      return AudioSession.current;
    }
    const Ctor = audioContextCtor();
    if (!Ctor) return null;
    const ctx = new Ctor();
    const s = new AudioSession(ctx, bed);
    // Safari hands back a suspended context even inside the gesture.
    if (ctx.state === "suspended") await ctx.resume();
    AudioSession.current = s;
    return s;
  }

  /** The session currently sounding, if any. */
  static active(): AudioSession | null {
    const s = AudioSession.current;
    return s && !s.closed ? s : null;
  }

  /** The context every instrument must build its voices on. */
  get context(): AudioContext {
    return this.ctx;
  }

  /** THE one clock. Every ramp in every instrument schedules against this, which
   *  is the whole reason a crossfade between them can be sample-accurate. */
  now(): number {
    return this.ctx.currentTime;
  }

  /**
   * The bus an instrument connects its master to — created silent, so the
   * instrument can build its graph before anything is heard and the caller
   * decides when it arrives. Idempotent per name.
   */
  bus(name: string): GainNode {
    const existing = this.buses.get(name);
    if (existing) return existing;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.connect(this.limiter);
    this.buses.set(name, g);
    return g;
  }

  /** Ramp one bus to a level, on the shared clock. */
  fadeBus(name: string, to: number, seconds = FADE_S): void {
    const g = this.buses.get(name);
    if (!g || this.closed) return;
    const t = this.now();
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.linearRampToValueAtTime(to, t + seconds);
  }

  /**
   * Blend between two buses. `mix` 0 = all `a`, 1 = all `b`, 0.5 = both.
   *
   * EQUAL POWER (cos/sin), not linear. A linear crossfade of two uncorrelated
   * sources dips about 3 dB at the midpoint — and here the midpoint is not a
   * transitional artefact to hurry through, it is the useful place to stand:
   * both the fourteen-drone field and the sweeping pair audible at comparable
   * amplitude, which is the condition under which a beat between them is
   * strongest. A hole in the middle of the blend would be a hole exactly where
   * the instrument is meant to be played.
   */
  blend(a: string, b: string, mix: number, seconds = 0.25): void {
    const m = Math.max(0, Math.min(1, mix));
    const theta = (m * Math.PI) / 2;
    this.fadeBus(a, Math.cos(theta) * BUS_GAIN, seconds);
    this.fadeBus(b, Math.sin(theta) * BUS_GAIN, seconds);
  }

  /**
   * Release one instrument's bus. The session survives while any other bus
   * remains — a tab switch must not close the context out from under the
   * instrument being faded UP. Closes, and stops the bed, only when the last
   * bus is gone.
   */
  async release(name: string): Promise<void> {
    const g = this.buses.get(name);
    if (g) {
      try { g.disconnect(); } catch { /* already torn down */ }
      this.buses.delete(name);
    }
    if (this.buses.size > 0 || this.closed) return;
    await this.close();
  }

  /** Tear the session down. Idempotent. */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    document.removeEventListener("visibilitychange", this.onVisibility);
    for (const osc of [this.bedL, this.bedR]) {
      try { osc.stop(); } catch { /* already stopped */ }
    }
    if (AudioSession.current === this) AudioSession.current = null;
    try { await this.ctx.close(); } catch { /* already closed */ }
  }
}
