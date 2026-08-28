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
// This instrument no longer owns an audio context. It is a BUS on the shared
// AudioSession, which owns the one context, the one limiter, the one binaural
// bed and the one clock — see lib/audioSession.ts for why each of those has to
// be singular the moment this instrument and the field one sound together.
// Session discipline (MOBILE_ROADMAP 4.4) is unchanged and now lives there:
// built inside a real user gesture and never before, suspended when the page is
// hidden, visible stop, no wake lock. Reduced-motion is a visual contract
// enforced by the panel — sound is not motion.
import { mulberry32, type SoundtrackSpec } from "@astra/core";
import { bellDecaySeconds, bellHz } from "./resonance";
import { AudioSession, audioSessionSupported, BUS_GAIN } from "./audioSession";

/** The bus this instrument occupies on the shared session. */
export const TORUS_BUS = "torus";

/** True when this device can sound the torus at all. */
export function audioSupported(): boolean {
  return audioSessionSupported();
}

// Gain staging. Two drones plus a bed plus two reference tones must sit well
// under unity before the limiter, or the limiter becomes the instrument.
const DRONE_GAIN = 0.16;
const NATAL_GAIN = 0.045;
const BELL_GAIN = 0.22;
// The instrument's own on/off. The LEVEL is the session bus's business now, so
// this rides at unity and the blend decides how much of it is heard — which
// keeps the two instruments' staging in one place instead of two.
const MASTER_GAIN = 1.0;
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
  private session: AudioSession;
  private ctx: AudioContext;
  private master: GainNode;
  private droneA: Voice;
  private droneB: Voice;
  private natalA: Voice;
  private natalB: Voice;
  private rand: () => number;
  private stopped = false;

  private constructor(session: AudioSession, spec: SoundtrackSpec) {
    this.session = session;
    this.ctx = session.context;
    this.rand = mulberry32(spec.seed32);

    // Into the session's bus, not a limiter of our own. Two limiters is the
    // failure that counterfeits a beat, and the beat is the measurement.
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(session.bus(TORUS_BUS));

    this.droneA = this.makeVoice(220, DRONE_GAIN);
    this.droneB = this.makeVoice(220, DRONE_GAIN);
    this.natalA = this.makeVoice(220, 0);
    this.natalB = this.makeVoice(220, 0);

    // The bed is NOT built here any more. It comes from the same persisted spec
    // the field instrument reads, so two of them is two identical beds at
    // double amplitude — and, on what used to be two contexts, two carriers
    // drifting into a beat nobody chose. The session owns the one.
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

  /**
   * Begin sounding. MUST be called synchronously from a real user gesture —
   * every browser's autoplay policy requires it, and the tab offers no way to
   * start audio that is not a button press.
   */
  static async start(spec: SoundtrackSpec): Promise<TorusVoice | null> {
    // Joins the session if the field instrument already opened one — which is
    // what lets a tab switch blend rather than prompt for a fresh gesture.
    const session = await AudioSession.acquire(spec.binaural);
    if (!session) return null;
    const voice = new TorusVoice(session, spec);
    const t = session.now();
    voice.master.gain.setValueAtTime(0, t);
    voice.master.gain.linearRampToValueAtTime(MASTER_GAIN, t + FADE_S);
    // A bus is created SILENT so an instrument can build its graph unheard.
    // Opening it is the instrument's own business — without this the master
    // ramps up into a closed gate and nothing sounds at all. A later blend()
    // overrides this level once both instruments are up.
    session.fadeBus(TORUS_BUS, BUS_GAIN, FADE_S);
    return voice;
  }

  /** The transiting pair. Glides rather than jumps, so scrubbing sweeps the
   *  interval instead of stepping through it. */
  setPair(freqA: number, freqB: number): void {
    if (this.stopped) return;
    const t = this.session.now();
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
    const t = this.session.now();
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

  /** Fade out and give up this instrument's bus. Idempotent.
   *
   *  Releases the BUS, never the context: the field instrument may still be
   *  sounding on the other one, and closing the session here is exactly how a
   *  crossfade becomes a cut. The session closes itself when its last bus goes.
   */
  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    const t = this.session.now();
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
    ]) {
      try { osc.stop(); } catch { /* already stopped */ }
    }
    await this.session.release(TORUS_BUS);
  }
}
