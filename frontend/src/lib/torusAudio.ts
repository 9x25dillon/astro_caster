// torusAudio.ts — the Web Audio instrument the Torus tab plays.
//
// What it sounds, and why each part is derived rather than chosen:
//
//  · TWO DRONES, one per selected body, at droneHz(λ) — so their interval IS
//    the aspect, continuously. Scrubbing the time slider sweeps it, and the
//    trajectory's crossings of the aspect circles are the moments the interval
//    lands on an exact multiple of 200 cents (see lib/resonance.ts).
//  · THE BEAT between them, which is not synthesized: two oscillators a few Hz
//    apart beat on their own, and that beat collapses to silence exactly at
//    conjunction. The drones are sawtooth-through-a-lowpass rather than sine
//    precisely so a real 2nd harmonic exists — which makes the OPPOSITION's
//    exact 2:1 audible as a second zero-beat lock. Those two aspects are the
//    only rational ones under the bedrock map; the rest get the bell.
//  · A BELL at each crossing, at bellHz(aspect angle) — the aspect's own place
//    on the circle run through the same map, two octaves up. Never a sample.
//    Its detune is drawn from mulberry32(spec.seed32), so the bell belongs to
//    this profile and no other.
//  · THE BINAURAL BED underneath, carrier ± beat/2 hard-panned, straight from
//    spec.binaural — the persisted field the whole resonarium exists to name.
//  · THE NATAL REFERENCE, spec.bedrock_hz for the two bodies, very low: the
//    natal chart is a fixed point on this surface, so its drones are the still
//    tone the transiting pair moves against.
//
// The spec is CONSUMED, never minted. Nothing here derives a seed, and the
// only frequency computed rather than read is the transiting drone, which
// spec.bedrock_hz cannot supply because it is natal-only.
//
// Audio session (MOBILE_ROADMAP 4.4): the context is constructed inside a real
// user gesture and never before; playback suspends when the page is hidden
// (background audio is deliberately NO — the visual field is half the
// instrument) and resumes on return unless the reader stopped it; there is a
// visible stop; no wake lock is taken. Reduced-motion is a visual contract and
// is enforced by the panel, not here — sound is not motion.
import { mulberry32, type SoundtrackSpec } from "@astra/core";
import { bellDecaySeconds, bellHz } from "./resonance";

type Ctor = typeof AudioContext;

function audioContextCtor(): Ctor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** True when this device can sound the torus at all. */
export function audioSupported(): boolean {
  return audioContextCtor() !== null;
}

// Gain staging. Two drones plus a bed plus two reference tones must sit well
// under unity before the limiter, or the limiter becomes the instrument.
const DRONE_GAIN = 0.16;
const NATAL_GAIN = 0.045;
const BED_GAIN = 0.05;
const BELL_GAIN = 0.22;
const MASTER_GAIN = 0.5;
const FADE_S = 0.6; // start/stop ramp — an instrument that clicks is a bug
const GLIDE_S = 0.06; // scrub smoothing; short enough to feel immediate

/** One drone voice: sawtooth → lowpass → gain. The filter tracks the pitch, so
 *  timbre stays constant as the body moves rather than brightening up the
 *  zodiac. */
interface Voice {
  osc: OscillatorNode;
  filter: BiquadFilterNode;
  gain: GainNode;
}

export class TorusVoice {
  private ctx: AudioContext;
  private master: GainNode;
  private droneA: Voice;
  private droneB: Voice;
  private natalA: Voice;
  private natalB: Voice;
  private bedL: OscillatorNode;
  private bedR: OscillatorNode;
  private bedGain: GainNode;
  private rand: () => number;
  private stopped = false;
  private onVisibility: () => void;

  private constructor(ctx: AudioContext, spec: SoundtrackSpec) {
    this.ctx = ctx;
    this.rand = mulberry32(spec.seed32);

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.18;
    limiter.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(limiter);

    this.droneA = this.makeVoice(220, DRONE_GAIN);
    this.droneB = this.makeVoice(220, DRONE_GAIN);
    this.natalA = this.makeVoice(220, 0);
    this.natalB = this.makeVoice(220, 0);

    // The binaural bed: carrier ± beat/2, hard-panned. Both numbers come from
    // the persisted spec — this is the field itself, not a decoration of it.
    const { carrier_hz, beat_hz } = spec.binaural;
    this.bedGain = ctx.createGain();
    this.bedGain.gain.value = BED_GAIN;
    this.bedGain.connect(this.master);
    this.bedL = this.makeBedTone(carrier_hz - beat_hz / 2, -1);
    this.bedR = this.makeBedTone(carrier_hz + beat_hz / 2, 1);

    // No background audio: suspend when hidden, resume on return unless the
    // reader stopped it themselves.
    this.onVisibility = () => {
      if (this.stopped) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    };
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  private makeVoice(hz: number, gain: number): Voice {
    const osc = this.ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = hz;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = hz * 3.5;
    filter.Q.value = 0.7;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    osc.connect(filter).connect(g).connect(this.master);
    osc.start();
    return { osc, filter, gain: g };
  }

  private makeBedTone(hz: number, pan: number): OscillatorNode {
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = hz;
    // StereoPannerNode is absent on older Safari; the bed simply runs centred
    // there, which costs the binaural effect but not the sound.
    if (typeof this.ctx.createStereoPanner === "function") {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      osc.connect(p).connect(this.bedGain);
    } else {
      osc.connect(this.bedGain);
    }
    osc.start();
    return osc;
  }

  /**
   * Begin sounding. MUST be called synchronously from a real user gesture —
   * every browser's autoplay policy requires it, and the tab offers no way to
   * start audio that is not a button press.
   */
  static async start(spec: SoundtrackSpec): Promise<TorusVoice | null> {
    const Ctor = audioContextCtor();
    if (!Ctor) return null;
    const ctx = new Ctor();
    const voice = new TorusVoice(ctx, spec);
    // Safari hands back a suspended context even inside the gesture.
    if (ctx.state === "suspended") await ctx.resume();
    const t = ctx.currentTime;
    voice.master.gain.setValueAtTime(0, t);
    voice.master.gain.linearRampToValueAtTime(MASTER_GAIN, t + FADE_S);
    return voice;
  }

  /** The transiting pair. Glides rather than jumps, so scrubbing sweeps the
   *  interval instead of stepping through it. */
  setPair(freqA: number, freqB: number): void {
    if (this.stopped) return;
    const t = this.ctx.currentTime;
    for (const [v, f] of [[this.droneA, freqA], [this.droneB, freqB]] as const) {
      v.osc.frequency.setTargetAtTime(f, t, GLIDE_S);
      v.filter.frequency.setTargetAtTime(f * 3.5, t, GLIDE_S);
    }
  }

  /** The natal reference drones from spec.bedrock_hz. Either may be null — a
   *  body outside the canonical seed set (Lilith) simply has no natal note, and
   *  is silenced here rather than substituted with one that isn't its own. */
  setNatal(freqA: number | null, freqB: number | null): void {
    if (this.stopped) return;
    const t = this.ctx.currentTime;
    for (const [v, f] of [[this.natalA, freqA], [this.natalB, freqB]] as const) {
      if (f === null) {
        v.gain.gain.setTargetAtTime(0, t, GLIDE_S);
      } else {
        v.osc.frequency.setTargetAtTime(f, t, GLIDE_S);
        v.filter.frequency.setTargetAtTime(f * 3.5, t, GLIDE_S);
        v.gain.gain.setTargetAtTime(NATAL_GAIN, t, GLIDE_S);
      }
    }
  }

  /**
   * Mark a crossing. Partials 1·2·3 over bellHz(angle), decay scaled by the
   * aspect's harmonic number, detune drawn from the profile's own seed — so
   * the same crossing rings the same way for this reader every time, and
   * differently for the next one.
   */
  ring(aspectAngleDeg: number): void {
    if (this.stopped) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const base = bellHz(aspectAngleDeg);
    const decay = bellDecaySeconds(aspectAngleDeg);
    // ±7 cents, deterministic per profile: enough to give the bell a body
    // without moving it off the pitch the aspect angle names.
    const detune = (this.rand() * 2 - 1) * 7;
    const partials: Array<[number, number]> = [[1, 1], [2, 0.45], [3, 0.22]];
    for (const [mult, amp] of partials) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = base * mult;
      osc.detune.value = detune * mult;
      const g = ctx.createGain();
      // A struck envelope: near-instant attack, exponential tail. The
      // structural aspects (n small) ring longest.
      const peak = BELL_GAIN * amp;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay / mult);
      osc.connect(g).connect(this.master);
      osc.start(t);
      osc.stop(t + decay + 0.05);
      osc.onended = () => {
        try { g.disconnect(); } catch { /* already torn down */ }
      };
    }
  }

  /** Fade out and release the audio session. Idempotent. */
  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    document.removeEventListener("visibilitychange", this.onVisibility);
    const t = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(this.master.gain.value, t);
      this.master.gain.linearRampToValueAtTime(0.0001, t + FADE_S / 2);
    } catch {
      /* context already dead — closing below is what matters */
    }
    await new Promise((r) => setTimeout(r, (FADE_S / 2) * 1000 + 40));
    for (const osc of [
      this.droneA.osc, this.droneB.osc, this.natalA.osc, this.natalB.osc,
      this.bedL, this.bedR,
    ]) {
      try { osc.stop(); } catch { /* already stopped */ }
    }
    try { await this.ctx.close(); } catch { /* already closed */ }
  }
}
