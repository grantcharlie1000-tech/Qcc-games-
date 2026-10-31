/** Hopway's sound table: short Web Audio oscillator recipes. No audio files and no network.
 * Sound is opt-in: the caller passes `enabled`, and every method is a silent no-op unless that
 * returns true, an AudioContext exists and the sfx has not been disposed. Audio is optional,
 * so nothing here throws into the game loop. */

export interface Sfx {
  hop(forward: boolean): void; bonk(): void; hit(): void; splash(): void; bell(): void;
  rumble(): void; ufoWarn(): void; beam(): void; chime(): void; dispose(): void;
}

type Build = (ctx: AudioContext, out: GainNode, t: number) => void;

const FLOOR = 0.0001; // exponential ramps cannot reach 0
const ATTACK = 0.005; // seconds from silence to peak, so a note does not click on
const MASTER = 0.5;

/** Gain that rises to `peak` after ATTACK and decays exponentially to FLOOR at `at + dur`, feeding `dest`. */
function envelope(ctx: AudioContext, dest: AudioNode, at: number, dur: number, peak: number): GainNode {
  const env = ctx.createGain();
  env.gain.setValueAtTime(FLOOR, at);
  env.gain.exponentialRampToValueAtTime(peak, at + ATTACK);
  env.gain.exponentialRampToValueAtTime(FLOOR, at + dur);
  env.connect(dest);
  return env;
}

/** Oscillator running from `at` to `at + dur`, gliding exponentially to `glideTo` when given. */
function tone(ctx: AudioContext, dest: AudioNode, type: OscillatorType, freq: number, at: number, dur: number, glideTo?: number): OscillatorNode {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (glideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(glideTo, at + dur);
  osc.connect(dest);
  osc.start(at);
  osc.stop(at + dur);
  return osc;
}

/** Biquad filter feeding `dest`. */
function filter(ctx: AudioContext, dest: AudioNode, type: BiquadFilterType, freq: number, q?: number): BiquadFilterNode {
  const node = ctx.createBiquadFilter();
  node.type = type;
  node.frequency.value = freq;
  if (q !== undefined) node.Q.value = q;
  node.connect(dest);
  return node;
}

export function createSfx(enabled: () => boolean): Sfx {
  let audio: AudioContext | undefined;
  let master: GainNode | undefined;
  let disposed = false;

  // Plays one sound. The shared context and its master gain are created on the first audible call.
  const play = (build: Build): void => {
    try {
      if (disposed || !enabled()) return;
      if (!audio) {
        const Ctor: typeof AudioContext | undefined = globalThis.AudioContext ?? (globalThis as any).webkitAudioContext;
        if (!Ctor) return;
        audio = new Ctor();
      }
      if (!master) {
        master = audio.createGain();
        master.gain.value = MASTER;
        master.connect(audio.destination);
      }
      if (audio.state === 'suspended') void audio.resume().catch(() => undefined);
      build(audio, master, audio.currentTime);
    } catch {
      /* Audio is optional. */
    }
  };

  return {
    hop: (forward) => play((ctx, out, t) => {
      tone(ctx, envelope(ctx, out, t, 0.04, 0.05), 'square', 520 * (forward ? 1.1225 : 1), t, 0.04);
    }),
    bonk: () => play((ctx, out, t) => {
      tone(ctx, envelope(ctx, out, t, 0.09, 0.12), 'sine', 110, t, 0.09, 70);
    }),
    hit: () => play((ctx, out, t) => {
      // Two squares falling through one lowpass make the crunch.
      const crunch = filter(ctx, envelope(ctx, out, t, 0.18, 0.08), 'lowpass', 1200);
      tone(ctx, crunch, 'square', 180, t, 0.18, 60);
      tone(ctx, crunch, 'square', 247, t, 0.18, 60);
    }),
    splash: () => play((ctx, out, t) => {
      const swoosh = filter(ctx, envelope(ctx, out, t, 0.25, 0.06), 'bandpass', 700, 0.8);
      tone(ctx, swoosh, 'sawtooth', 900, t, 0.25, 120);
      tone(ctx, envelope(ctx, out, t, 0.08, 0.08), 'sine', 300, t, 0.08, 150);
    }),
    bell: () => play((ctx, out, t) => {
      // Two triangle notes; the second starts 160 ms after the first.
      tone(ctx, envelope(ctx, out, t, 0.12, 0.045), 'triangle', 880, t, 0.12);
      tone(ctx, envelope(ctx, out, t + 0.16, 0.12, 0.045), 'triangle', 660, t + 0.16, 0.12);
    }),
    rumble: () => play((ctx, out, t) => {
      tone(ctx, filter(ctx, envelope(ctx, out, t, 0.6, 0.07), 'lowpass', 200), 'sawtooth', 55, t, 0.6);
    }),
    ufoWarn: () => play((ctx, out, t) => {
      // A 7 Hz LFO, scaled to +/-25 Hz, is added to the rising sine's frequency as vibrato.
      const body = tone(ctx, envelope(ctx, out, t, 0.6, 0.045), 'sine', 300, t, 0.6, 900);
      const depth = ctx.createGain();
      depth.gain.value = 25;
      depth.connect(body.frequency);
      tone(ctx, depth, 'sine', 7, t, 0.6);
    }),
    beam: () => play((ctx, out, t) => {
      tone(ctx, envelope(ctx, out, t, 0.4, 0.04), 'sine', 400, t, 0.4, 1600);
      tone(ctx, envelope(ctx, out, t, 0.4, 0.02), 'triangle', 800, t, 0.4, 3200);
    }),
    chime: () => play((ctx, out, t) => {
      // Two quick triangle notes, each 100 ms after the previous one starts.
      tone(ctx, envelope(ctx, out, t, 0.09, 0.05), 'triangle', 1046.5, t, 0.09);
      tone(ctx, envelope(ctx, out, t + 0.1, 0.09, 0.05), 'triangle', 1318.5, t + 0.1, 0.09);
    }),
    dispose: () => {
      try {
        void audio?.close().catch(() => undefined);
      } catch {
        /* Audio is optional. */
      }
      audio = undefined;
      master = undefined;
      disposed = true;
    },
  };
}
