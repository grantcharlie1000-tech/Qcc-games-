/** Breachline sound: the DSP toolkit every sound is built from. Plain JavaScript on Float32Arrays, deterministic
 * from a seed, so the same code renders in a worker for the game and in Node for the tests. No Web Audio here. */

export type Rng = () => number;

/** mulberry32: small, fast, good enough for sound. */
export function rng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** A stable seed from a name and a number. */
export function seedOf(name: string, n = 0): number {
  let h = 2166136261 ^ n;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return h >>> 0;
}
export const range = (r: Rng, a: number, b: number) => a + (b - a) * r();
export const dbToGain = (db: number) => Math.pow(10, db / 20);

export const buf = (sr: number, seconds: number) => new Float32Array(Math.max(1, Math.ceil(sr * seconds)));

export function white(n: number, r: Rng): Float32Array {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = r() * 2 - 1;
  return x;
}
/** Pink-ish noise (Paul Kellet's economy filter). */
export function pink(n: number, r: Rng): Float32Array {
  const x = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    const w = r() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
    x[i] = (b0 + b1 + b2 + w * 0.1848) * 0.25;
  }
  return x;
}
/** Brown noise (integrated white), for rumble. */
export function brown(n: number, r: Rng): Float32Array {
  const x = new Float32Array(n);
  let v = 0;
  for (let i = 0; i < n; i++) { v = (v + 0.02 * (r() * 2 - 1)) * 0.998; x[i] = v * 3.5; }
  return x;
}

export type FilterType = 'lowpass' | 'highpass' | 'bandpass' | 'peaking' | 'lowshelf' | 'highshelf' | 'notch';

/** RBJ biquad. `f` may be a number or a function of the sample index (re-evaluated every 16 samples). */
export function biquad(x: Float32Array, sr: number, type: FilterType, f: number | ((i: number) => number), q = 0.707, gainDb = 0): Float32Array {
  let b0 = 0, b1 = 0, b2 = 0, a1 = 0, a2 = 0, x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const A = Math.pow(10, gainDb / 40);
  const set = (hz: number) => {
    const w = 2 * Math.PI * Math.min(sr * 0.49, Math.max(10, hz)) / sr, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * q);
    let c0 = 1, c1 = 0, c2 = 0, d0 = 1, d1 = 0, d2 = 0;
    switch (type) {
      case 'lowpass': c0 = (1 - cs) / 2; c1 = 1 - cs; c2 = c0; d0 = 1 + al; d1 = -2 * cs; d2 = 1 - al; break;
      case 'highpass': c0 = (1 + cs) / 2; c1 = -(1 + cs); c2 = c0; d0 = 1 + al; d1 = -2 * cs; d2 = 1 - al; break;
      case 'bandpass': c0 = al; c1 = 0; c2 = -al; d0 = 1 + al; d1 = -2 * cs; d2 = 1 - al; break;
      case 'notch': c0 = 1; c1 = -2 * cs; c2 = 1; d0 = 1 + al; d1 = -2 * cs; d2 = 1 - al; break;
      case 'peaking': c0 = 1 + al * A; c1 = -2 * cs; c2 = 1 - al * A; d0 = 1 + al / A; d1 = -2 * cs; d2 = 1 - al / A; break;
      case 'lowshelf': { const s = 2 * Math.sqrt(A) * al; c0 = A * ((A + 1) - (A - 1) * cs + s); c1 = 2 * A * ((A - 1) - (A + 1) * cs); c2 = A * ((A + 1) - (A - 1) * cs - s); d0 = (A + 1) + (A - 1) * cs + s; d1 = -2 * ((A - 1) + (A + 1) * cs); d2 = (A + 1) + (A - 1) * cs - s; break; }
      case 'highshelf': { const s = 2 * Math.sqrt(A) * al; c0 = A * ((A + 1) + (A - 1) * cs + s); c1 = -2 * A * ((A - 1) + (A + 1) * cs); c2 = A * ((A + 1) + (A - 1) * cs - s); d0 = (A + 1) - (A - 1) * cs + s; d1 = 2 * ((A - 1) - (A + 1) * cs); d2 = (A + 1) - (A - 1) * cs - s; break; }
    }
    b0 = c0 / d0; b1 = c1 / d0; b2 = c2 / d0; a1 = d1 / d0; a2 = d2 / d0;
  };
  const fixed = typeof f === 'number';
  if (fixed) set(f);
  for (let i = 0; i < x.length; i++) {
    if (!fixed && (i & 15) === 0) set(f(i));
    const v = x[i], y = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = v; y2 = y1; y1 = y; x[i] = y;
  }
  return x;
}
/** Exponential glide from a to b over n samples, as a function of the sample index. */
export const glide = (a: number, b: number, n: number) => (i: number) => a * Math.pow(b / a, Math.min(1, i / n));

/** Multiplies by an envelope: linear attack, then exponential decay with time constant tau (seconds). */
export function adExp(x: Float32Array, sr: number, attack: number, tau: number, delay = 0): Float32Array {
  const a = Math.max(1, attack * sr), d = delay * sr;
  for (let i = 0; i < x.length; i++) {
    const j = i - d;
    x[i] *= j < 0 ? 0 : j < a ? j / a : Math.exp(-(j - a) / (tau * sr));
  }
  return x;
}
/** Multiplies by a gate: attack, hold, then exponential release. */
export function ahr(x: Float32Array, sr: number, attack: number, hold: number, tau: number): Float32Array {
  const a = Math.max(1, attack * sr), h = hold * sr;
  for (let i = 0; i < x.length; i++) x[i] *= i < a ? i / a : i < a + h ? 1 : Math.exp(-(i - a - h) / (tau * sr));
  return x;
}
/** A raised-cosine fade at the end, so nothing stops on a hard edge. */
export function fadeOut(x: Float32Array, sr: number, seconds = 0.02): Float32Array {
  const n = Math.min(x.length, Math.round(seconds * sr));
  for (let i = 0; i < n; i++) x[x.length - 1 - i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / n);
  return x;
}
export function fadeIn(x: Float32Array, sr: number, seconds = 0.001): Float32Array {
  const n = Math.min(x.length, Math.max(1, Math.round(seconds * sr)));
  for (let i = 0; i < n; i++) x[i] *= i / n;
  return x;
}

/** Oscillator with a frequency function of time (seconds). */
export function osc(n: number, sr: number, hz: (t: number) => number, shape: 'sine' | 'tri' | 'saw' | 'square' = 'sine', phase = 0): Float32Array {
  const x = new Float32Array(n);
  let p = phase;
  for (let i = 0; i < n; i++) {
    p += hz(i / sr) / sr; p -= Math.floor(p);
    x[i] = shape === 'sine' ? Math.sin(2 * Math.PI * p) : shape === 'tri' ? 1 - 4 * Math.abs(p - 0.5) : shape === 'saw' ? 2 * p - 1 : p < 0.5 ? 1 : -1;
  }
  return x;
}

/** A bank of decaying two-pole resonators driven by `exc`: struck metal, wood, plastic. Modes are
 * [frequency Hz, decay seconds (to -60 dB), amplitude]. */
export function modal(exc: Float32Array, sr: number, modes: [number, number, number][], n = exc.length): Float32Array {
  const out = new Float32Array(n);
  for (const [f, t60, amp] of modes) {
    if (f >= sr * 0.48) continue;
    const r = Math.exp(-6.9078 / (t60 * sr)), w = 2 * Math.PI * f / sr, c = 2 * r * Math.cos(w), g = amp * (1 - r * r) * 4;
    let y1 = 0, y2 = 0;
    for (let i = 0; i < n; i++) { const y = (i < exc.length ? exc[i] : 0) * g + c * y1 - r * r * y2; y2 = y1; y1 = y; out[i] += y; }
  }
  return out;
}

/** Adds `src` into `dst` at a sample offset, scaled. */
export function mixInto(dst: Float32Array, src: Float32Array, at = 0, gain = 1): Float32Array {
  const o = Math.round(at);
  for (let i = 0; i < src.length; i++) { const j = i + o; if (j >= 0 && j < dst.length) dst[j] += src[i] * gain; }
  return dst;
}
export function scale(x: Float32Array, g: number): Float32Array { for (let i = 0; i < x.length; i++) x[i] *= g; return x; }
export function peak(x: Float32Array): number { let p = 0; for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > p) p = a; } return p; }
export function normalize(x: Float32Array, to = 0.9): Float32Array { const p = peak(x); return p > 0 ? scale(x, to / p) : x; }
/** Soft saturation: tanh with a drive, level-matched at small signals. */
export function saturate(x: Float32Array, drive: number): Float32Array { const k = Math.tanh(drive); for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * drive) / k; return x; }
/** Removes DC and sub-sonic drift (one-pole high-pass at ~15 Hz). */
export function dcBlock(x: Float32Array, sr: number, hz = 15): Float32Array {
  const r = Math.exp(-2 * Math.PI * hz / sr);
  let px = 0, py = 0;
  for (let i = 0; i < x.length; i++) { const y = x[i] - px + r * py; px = x[i]; py = y; x[i] = y; }
  return x;
}
/** Trims trailing near-silence (below `floor` of peak), keeping a short fade. */
export function trim(x: Float32Array, sr: number, floor = 3e-4): Float32Array {
  const p = peak(x) * floor;
  let end = x.length;
  while (end > 1 && Math.abs(x[end - 1]) < p) end--;
  const y = x.slice(0, Math.min(x.length, end + Math.round(sr * 0.005)));
  // A long fade when the sound was cut short by its buffer, so it never ends on an edge.
  return fadeOut(y, sr, end >= x.length - 1 ? Math.min(0.06, y.length / sr / 4) : 0.004);
}
/** A short filtered click: the building block of mechanical sounds. */
export function click(sr: number, r: Rng, hz: number, q: number, seconds = 0.012, tau = 0.002): Float32Array {
  return adExp(biquad(white(Math.ceil(sr * seconds), r), sr, 'bandpass', hz, q), sr, 0.0002, tau);
}
/** Final tidy-up every rendered sound goes through. */
export function finish(x: Float32Array, sr: number, to = 0.9): Float32Array {
  return normalize(trim(dcBlock(x, sr), sr), to);
}
