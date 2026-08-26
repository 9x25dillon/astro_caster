// fieldAudio.ts — the whole natal field, sounding.
//
// Fourteen drones at once, voiced by lib/natalField so a crowded low register
// reads as texture rather than mud, over the binaural bed from the persisted
// spec. Sibling to torusAudio (which sounds a PAIR); same rules, same session
// discipline, no new dependency.
//
// Two deliberate differences from the torus instrument:
//
//  · SINE, not sawtooth. The torus wants harmonics so an opposition's exact 2:1
//    locks audibly between two voices. Fourteen sawtooths at once would stack
//    ~42 partials into two octaves and smear into noise, and the thing worth
//    hearing here is the BEATING between fundamentals, which harmonics only
//    obscure. Pure tones make a 0.4 Hz pulse legible.
//  · A staggered entry. All fourteen arriving together is a chord; arriving one
//    by one in canonical body order is a field assembling, and it lets a listener
//    place each voice before the next one lands.
//
// Audio session (MOBILE_ROADMAP 4.4): built inside a real user gesture, never
// before; suspends when the page is hidden (background audio is deliberately
// NO); visible stop; no wake lock. Reduced-motion is a visual contract enforced
// by the panel — sound is not motion.
import type { FieldVoice } from "./natalField";

type Ctor = typeof AudioContext;

function audioContextCtor(): Ctor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export function fieldAudioSupported(): boolean {
  return audioContextCtor() !== null;
}

// Fourteen voices must sit far below unity before the limiter, or the limiter
// becomes the instrument. The per-voice crowd gain multiplies this.
const VOICE_GAIN = 0.085;
const BED_GAIN = 0.05;
const MASTER_GAIN = 0.5;
const FADE_S = 0.9;
const ENTRY_STAGGER_S = 0.28; // between successive drones arriving
const ENTRY_RAMP_S = 1.4; // each drone's own fade-in

export interface FieldBed {
  carrier_hz: number;
  beat_hz: number;
}

export class FieldVoicePlayer {
  private ctx: AudioContext;
  private master: GainNode;
  private oscs: OscillatorNode[] = [];
  private gains: GainNode[] = [];
  private bedL: OscillatorNode;
  private bedR: OscillatorNode;
  private stopped = false;
  private onVisibility: () => void;

  private constructor(ctx: AudioContext, voices: readonly FieldVoice[], bed: FieldBed) {
    this.ctx = ctx;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.005;
    limiter.release.value = 0.25;
    limiter.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(limiter);

    const t0 = ctx.currentTime;
    voices.forEach((v, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = v.hz;
      const g = ctx.createGain();
      const target = VOICE_GAIN * v.gain;
      // Staggered entry: silent until this voice's turn, then a slow fade.
      const at = t0 + i * ENTRY_STAGGER_S;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(Math.max(target, 0.0002), at + ENTRY_RAMP_S);
      osc.connect(g).connect(this.master);
      osc.start();
      this.oscs.push(osc);
      this.gains.push(g);
    });

    // The bed: carrier ± beat/2, hard-panned. Straight from the persisted spec.
    const bedGain = ctx.createGain();
    bedGain.gain.value = BED_GAIN;
    bedGain.connect(this.master);
    const mk = (hz: number, pan: number) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = hz;
      if (typeof ctx.createStereoPanner === "function") {
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        osc.connect(p).connect(bedGain);
      } else {
        osc.connect(bedGain);
      }
      osc.start();
      return osc;
    };
    this.bedL = mk(bed.carrier_hz - bed.beat_hz / 2, -1);
    this.bedR = mk(bed.carrier_hz + bed.beat_hz / 2, 1);

    this.onVisibility = () => {
      if (this.stopped) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    };
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  /** Total seconds until every drone has arrived — for the panel's readout. */
  static entryDurationS(count: number): number {
    return Math.max(0, count - 1) * ENTRY_STAGGER_S + ENTRY_RAMP_S;
  }

  /** MUST be called synchronously from a real user gesture. */
  static async start(
    voices: readonly FieldVoice[],
    bed: FieldBed
  ): Promise<FieldVoicePlayer | null> {
    const Ctor = audioContextCtor();
    if (!Ctor || voices.length === 0) return null;
    const ctx = new Ctor();
    const player = new FieldVoicePlayer(ctx, voices, bed);
    if (ctx.state === "suspended") await ctx.resume();
    const t = ctx.currentTime;
    player.master.gain.setValueAtTime(0, t);
    player.master.gain.linearRampToValueAtTime(MASTER_GAIN, t + FADE_S);
    return player;
  }

  /** Solo one drone (index into the voices array) or clear with null. Soloing
   *  is how a listener finds a single body inside a fourteen-voice mass. */
  solo(index: number | null): void {
    if (this.stopped) return;
    const t = this.ctx.currentTime;
    this.gains.forEach((g, i) => {
      const on = index === null || i === index;
      const cur = g.gain.value;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(Math.max(cur, 0.0001), t);
      g.gain.setTargetAtTime(on ? Math.max(cur, 0.0001) : 0.0001, t, 0.08);
    });
    if (index !== null) {
      const g = this.gains[index];
      if (g) g.gain.setTargetAtTime(VOICE_GAIN, t, 0.08);
    }
  }

  /** Restore every voice to its crowd-aware level. */
  unsolo(voices: readonly FieldVoice[]): void {
    if (this.stopped) return;
    const t = this.ctx.currentTime;
    this.gains.forEach((g, i) => {
      const v = voices[i];
      if (!v) return;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), t);
      g.gain.setTargetAtTime(VOICE_GAIN * v.gain, t, 0.12);
    });
  }

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
      /* context already gone */
    }
    await new Promise((r) => setTimeout(r, (FADE_S / 2) * 1000 + 60));
    for (const osc of [...this.oscs, this.bedL, this.bedR]) {
      try { osc.stop(); } catch { /* already stopped */ }
    }
    try { await this.ctx.close(); } catch { /* already closed */ }
  }
}
