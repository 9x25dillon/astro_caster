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
// Like its sibling, this instrument no longer owns an audio context: it is a
// BUS on the shared AudioSession, which owns the one context, the one limiter,
// the one binaural bed and the one clock (lib/audioSession.ts). Session
// discipline (MOBILE_ROADMAP 4.4) lives there now — gesture-gated, suspends
// when hidden, visible stop, no wake lock. Reduced-motion is a visual contract
// enforced by the panel; sound is not motion.
import type { FieldVoice } from "./natalField";
import { AudioSession, audioSessionSupported, BUS_GAIN } from "./audioSession";

/** The bus this instrument occupies on the shared session. */
export const FIELD_BUS = "field";

export function fieldAudioSupported(): boolean {
  return audioSessionSupported();
}

// Fourteen voices must sit far below unity before the limiter, or the limiter
// becomes the instrument. The per-voice crowd gain multiplies this.
const VOICE_GAIN = 0.085;
// Unity: the LEVEL is the session bus's business, so the blend decides how much
// of the field is heard and the two instruments' staging lives in one place.
const MASTER_GAIN = 1.0;
const FADE_S = 0.9;
const ENTRY_STAGGER_S = 0.28; // between successive drones arriving
const ENTRY_RAMP_S = 1.4; // each drone's own fade-in

export interface FieldBed {
  carrier_hz: number;
  beat_hz: number;
}

export class FieldVoicePlayer {
  private session: AudioSession;
  private master: GainNode;
  private oscs: OscillatorNode[] = [];
  private gains: GainNode[] = [];
  private stopped = false;

  private constructor(session: AudioSession, voices: readonly FieldVoice[]) {
    this.session = session;
    const ctx = session.context;

    // Into the session's bus. No limiter of our own: two compressors that
    // cannot see each other modulate at a few Hz, which is indistinguishable
    // from the beat this instrument exists to make audible.
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(session.bus(FIELD_BUS));

    const t0 = session.now();
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

    // The bed is NOT built here any more — the session owns the one, read from
    // the same persisted spec both instruments consume. Two of it was two
    // identical beds at double amplitude, drifting into a beat nobody chose.
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
    if (voices.length === 0) return null;
    // Joins the session if the torus instrument already opened one.
    const session = await AudioSession.acquire(bed);
    if (!session) return null;
    const player = new FieldVoicePlayer(session, voices);
    const t = session.now();
    player.master.gain.setValueAtTime(0, t);
    player.master.gain.linearRampToValueAtTime(MASTER_GAIN, t + FADE_S);
    // See torusAudio: a bus is created silent, and opening it is the
    // instrument's job. Without this the field builds perfectly and is mute.
    session.fadeBus(FIELD_BUS, BUS_GAIN, FADE_S);
    return player;
  }

  /** Solo one drone (index into the voices array) or clear with null. Soloing
   *  is how a listener finds a single body inside a fourteen-voice mass. */
  solo(index: number | null): void {
    if (this.stopped) return;
    const t = this.session.now();
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
    const t = this.session.now();
    this.gains.forEach((g, i) => {
      const v = voices[i];
      if (!v) return;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), t);
      g.gain.setTargetAtTime(VOICE_GAIN * v.gain, t, 0.12);
    });
  }

  /** Fade out and give up this instrument's bus. Releases the BUS, never the
   *  context — the torus may still be sounding on the other one. */
  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    const t = this.session.now();
    try {
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(this.master.gain.value, t);
      this.master.gain.linearRampToValueAtTime(0.0001, t + FADE_S / 2);
    } catch {
      /* context already gone */
    }
    await new Promise((r) => setTimeout(r, (FADE_S / 2) * 1000 + 60));
    for (const osc of this.oscs) {
      try { osc.stop(); } catch { /* already stopped */ }
    }
    await this.session.release(FIELD_BUS);
  }
}
