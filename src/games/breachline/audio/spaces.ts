/** Breachline sound: the acoustic spaces. Each is a synthesised stereo impulse response built from explicit early
 * reflections (the room's size and shape) and a late tail whose decay differs by band (the room's materials).
 * The map's rooms are sorted into four spaces; a sound is sent through the response of the room it is made in. */
import { adExp, biquad, dbToGain, mixInto, rng, seedOf, white, type Rng } from './dsp';

export type Space = 'hard' | 'soft' | 'corridor' | 'yard';
export const SPACES: Space[] = ['hard', 'soft', 'corridor', 'yard'];

/** Which space each named room is (names from map.ts `MAP.rooms`; anything else is outdoors). */
export const ROOM_SPACE: Record<string, Space> = {
  Garage: 'hard', Lab: 'hard', 'Server Room': 'hard', Corridor: 'corridor',
  Lobby: 'soft', Office: 'soft', Archive: 'soft', 'Break Room': 'soft',
};
export const spaceOfRoom = (name: string): Space => ROOM_SPACE[name] ?? 'yard';

interface SpaceDef {
  seconds: number;
  /** Seconds to fall 60 dB in the low (< 400 Hz), mid and high (> 3 kHz) bands. */
  rt: [number, number, number];
  /** Level of the late tail relative to the early reflections, dB. */
  tail: number;
  /** Upper limit of the tail's top band, Hz: how much air absorption and soft surfaces take off the top. */
  bright: number;
  /** Gap before the tail builds up, seconds. */
  predelay: number;
  /** Early reflections: [delay s, level dB, pan -1..1, brightness Hz]. */
  early: (r: Rng) => [number, number, number, number][];
}

const DEFS: Record<Space, SpaceDef> = {
  // Lab, Server Room, Garage: about 10 by 8 m, hard floor and walls; dense, bright early pattern, under a second.
  hard: {
    seconds: 1.15, rt: [1.0, 0.85, 0.5], tail: -7, bright: 10000, predelay: 0.012,
    early: r => Array.from({ length: 14 }, (_, i) => [0.004 + i * 0.0042 + r() * 0.003, -3 - i * 0.9 - r() * 2, r() * 1.6 - 0.8, 9000 - i * 350] as [number, number, number, number]),
  },
  // Office, Archive, Lobby, Break Room: carpet, shelving, ceiling tiles; few weak reflections and a short dull tail.
  soft: {
    seconds: 0.7, rt: [0.55, 0.38, 0.18], tail: -12, bright: 3500, predelay: 0.008,
    early: r => Array.from({ length: 6 }, (_, i) => [0.005 + i * 0.006 + r() * 0.004, -8 - i * 2 - r() * 2, r() * 1.4 - 0.7, 4000 - i * 300] as [number, number, number, number]),
  },
  // Corridor: 30 by 3 m. Side walls make a flutter every ~17 ms; the far ends answer late; long mid-heavy tail.
  corridor: {
    seconds: 1.4, rt: [1.2, 1.15, 0.6], tail: -9, bright: 7000, predelay: 0.018,
    early: r => [
      ...Array.from({ length: 10 }, (_, i) => [0.0088 + i * 0.0175 + r() * 0.0008, -2.5 - i * 1.6, i % 2 ? 0.75 : -0.75, 7000 - i * 450] as [number, number, number, number]),
      [0.075 + r() * 0.01, -9, 0.1, 3000], [0.16 + r() * 0.02, -13, -0.1, 2200],
    ],
  },
  // Yards: open air between the building and the perimeter wall. No dense build-up: a few distinct slaps off the
  // walls, then a long, thin, dark tail that is mostly the far-off surroundings.
  yard: {
    seconds: 1.7, rt: [1.6, 2.0, 0.7], tail: -17, bright: 4500, predelay: 0.06,
    early: r => [
      // The ground-and-structure slap the real recordings show about 70 ms after the shot (STATUS.md).
      [0.035 + r() * 0.01, -6, -0.6, 3500], [0.068 + r() * 0.006, 0, 0.3, 2400], [0.12 + r() * 0.02, -8, -0.3, 2200],
      [0.19 + r() * 0.03, -11, 0.5, 1600], [0.28 + r() * 0.04, -15, -0.6, 1200],
    ],
  },
};

/** A stereo impulse response for a space at a sample rate. Peak-normalised to 1; the engine sets the wet level. */
export function impulse(space: Space, sr: number): [Float32Array, Float32Array] {
  const def = DEFS[space], n = Math.ceil(def.seconds * sr), out: [Float32Array, Float32Array] = [new Float32Array(n), new Float32Array(n)];
  for (let c = 0; c < 2; c++) {
    const r = rng(seedOf(space, c));
    // Late tail: three bands of decorrelated noise, each with its own decay; a slow fade-in models the build-up.
    const bands: [number, 'lowpass' | 'bandpass' | 'highpass', number][] = [[0, 'lowpass', 400], [1, 'bandpass', 1100], [2, 'highpass', 3000]];
    for (const [k, type, hz] of bands) {
      const x = biquad(white(n, r), sr, type, hz, type === 'bandpass' ? 0.5 : 0.707);
      if (type === 'highpass') biquad(x, sr, 'lowpass', def.bright);
      adExp(x, sr, def.predelay * 2.5, def.rt[k] / 6.9078, def.predelay);
      mixInto(out[c], x, 0, dbToGain(def.tail) * (k === 1 ? 1.6 : k === 0 ? 0.4 : 1));
    }
    // Early reflections: short bursts (not single samples), filtered by how much the surface absorbed.
    for (const [t, lv, pan, bright] of def.early(r)) {
      const g = dbToGain(lv) * (c === 0 ? Math.min(1, 1 - pan) : Math.min(1, 1 + pan)), m = Math.ceil(sr * 0.003);
      const tap = biquad(adExp(white(m, r), sr, 0.0002, 0.0006), sr, 'lowpass', Math.min(bright, def.bright));
      mixInto(out[c], tap, t * sr, g * 2.2);
    }
  }
  // Gentle fade at the end and normalisation over both channels.
  let p = 0;
  for (const ch of out) for (let i = 0; i < n; i++) { if (i > n - sr * 0.05) ch[i] *= (n - i) / (sr * 0.05); p = Math.max(p, Math.abs(ch[i])); }
  for (const ch of out) for (let i = 0; i < n; i++) ch[i] /= p || 1;
  return out;
}
