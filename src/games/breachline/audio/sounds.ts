/** Breachline sound: every sound in the game as a seeded generator. Each returns one mono variant; the bank renders
 * several variants per sound and playback picks among them, so nothing repeats. All original synthesis: no
 * recordings, nothing downloaded. Levels here are shape only (each variant is peak-normalised); `level` in the
 * catalogue sets how loud a sound plays. */
import type { WeaponId } from '../config';
import { RELOADS, type ReloadBeat } from '../reloads';
import {
  adExp, ahr, biquad, brown, buf, click, dbToGain, fadeIn, finish, glide, mixInto, modal, osc, pink, range, rng, saturate, scale, seedOf, white,
  type Rng,
} from './dsp';

export type Floor = 'asphalt' | 'grass' | 'slab' | 'tile' | 'lino' | 'carpet' | 'planks' | 'raised' | 'check';
export const FLOORS: Floor[] = ['asphalt', 'grass', 'slab', 'tile', 'lino', 'carpet', 'planks', 'raised', 'check'];
export type ReloadClass = 'rifle' | 'smg' | 'pistol' | 'shotgun';
export const RELOAD_CLASS: Record<WeaponId, ReloadClass> = { ar: 'rifle', carbine: 'rifle', dmr: 'rifle', smg: 'smg', pistol: 'pistol', shotgun: 'shotgun' };
export const BEATS: ReloadBeat['name'][] = ['release', 'out', 'fetch', 'in', 'seat', 'bolt', 'shell', 'pump'];

type Gen = (r: Rng, sr: number) => Float32Array;

// ---- Weapons ------------------------------------------------------------------------------------------------------

interface Gun {
  /** Supersonic crack: centre Hz and length s (0 for none). */
  crack: number; crackLen: number;
  /** Muzzle blast body: band centre Hz, decay time constant s, width (Q). */
  body: number; bodyTau: number; bodyQ: number;
  /** Low thump: start and end Hz, decay s. */
  thump: [number, number]; thumpTau: number;
  /** Action: modes of the bolt or slide, and when it moves after the shot. */
  mech: [number, number, number][]; mechAt: number; mechLevel: number;
  /** Saturation drive, which sets density. */
  drive: number;
  /** Layer levels in dB: crack, body, thump. */
  mix: [number, number, number];
}

export const GUNS: Record<WeaponId, Gun> = {
  ar: { crack: 5200, crackLen: 0.006, body: 950, bodyTau: 0.055, bodyQ: 0.7, thump: [150, 62], thumpTau: 0.07, mech: [[2650, 0.05, 1], [4150, 0.04, 0.6], [6900, 0.03, 0.3]], mechAt: 0.016, mechLevel: -14, drive: 2.4, mix: [-4, 0, -2] },
  carbine: { crack: 6300, crackLen: 0.005, body: 1250, bodyTau: 0.045, bodyQ: 0.8, thump: [170, 72], thumpTau: 0.055, mech: [[3100, 0.045, 1], [5200, 0.03, 0.5], [7600, 0.02, 0.3]], mechAt: 0.014, mechLevel: -13, drive: 2.6, mix: [-2, 0, -4] },
  smg: { crack: 0, crackLen: 0, body: 1700, bodyTau: 0.032, bodyQ: 1.0, thump: [210, 95], thumpTau: 0.04, mech: [[1900, 0.06, 1], [3400, 0.05, 0.7], [5600, 0.03, 0.4]], mechAt: 0.011, mechLevel: -9, drive: 2.0, mix: [-30, 0, -5] },
  shotgun: { crack: 3200, crackLen: 0.004, body: 520, bodyTau: 0.1, bodyQ: 0.55, thump: [110, 42], thumpTau: 0.13, mech: [[1500, 0.08, 1], [2900, 0.05, 0.5]], mechAt: 0.02, mechLevel: -20, drive: 3.2, mix: [-8, 0, 0] },
  dmr: { crack: 4600, crackLen: 0.008, body: 780, bodyTau: 0.08, bodyQ: 0.6, thump: [130, 50], thumpTau: 0.1, mech: [[2300, 0.06, 1], [3700, 0.05, 0.6], [6100, 0.03, 0.3]], mechAt: 0.018, mechLevel: -15, drive: 2.8, mix: [-1, 0, -1] },
  pistol: { crack: 0, crackLen: 0, body: 1900, bodyTau: 0.028, bodyQ: 1.1, thump: [240, 120], thumpTau: 0.035, mech: [[3300, 0.04, 1], [5100, 0.03, 0.6]], mechAt: 0.01, mechLevel: -12, drive: 2.0, mix: [-30, 0, -6] },
};

/** One shot. `view` is how it is heard: first person (own gun, mechanism audible), third (someone else's, near),
 * or far (beyond ~40 m: the crack and the low boom survive, the middle is gone). */
export function gunshot(w: WeaponId, view: 'fp' | 'tp' | 'far', r: Rng, sr: number): Float32Array {
  const g = GUNS[w], k = range(r, 0.95, 1.05), lv = () => dbToGain(range(r, -1.2, 1.2));
  const len = view === 'far' ? 1.1 : view === 'fp' ? 0.45 : 0.4, out = buf(sr, len);
  const pre = Math.round(sr * 0.0015);
  if (view !== 'far') {
    // Crack: a pressure pulse (one sharp N-wave) then a short bright hiss.
    if (g.crackLen > 0) {
      const n = Math.ceil(sr * g.crackLen), hiss = adExp(biquad(white(n, r), sr, 'highpass', g.crack * k, 0.8), sr, 0.0001, g.crackLen / 3);
      const nw = Math.max(2, Math.round(sr * 0.0007));
      for (let i = 0; i < nw; i++) out[pre + i] += (1 - 2 * i / nw) * 0.9;
      mixInto(out, hiss, pre, dbToGain(g.mix[0] + (view === 'tp' ? 3 : 0)) * lv());
    }
    // Muzzle blast: noise in a band that falls in pitch as the gas expands; saturated for density. Only the crack
    // and the blast are saturated: saturating the low layers lifts their tails into a drone.
    const n = Math.ceil(sr * g.bodyTau * 7), body = biquad(pink(n, r), sr, 'bandpass', glide(g.body * 1.8 * k, g.body * 0.55 * k, n), g.bodyQ);
    biquad(body, sr, 'peaking', g.body * 2.6 * k, 1.2, 4);
    adExp(body, sr, 0.0004, g.bodyTau * range(r, 0.9, 1.1));
    mixInto(out, scale(body, 4), pre, dbToGain(g.mix[1]) * lv());
    saturate(out, g.drive);
    // Low thump: a falling sine, felt more than heard; quieter for someone else's gun.
    const tn = Math.ceil(sr * g.thumpTau * 6), f0 = g.thump[0] * k, f1 = g.thump[1] * k;
    const thump = adExp(osc(tn, sr, t => f1 + (f0 - f1) * Math.exp(-t / 0.012)), sr, 0.0006, g.thumpTau * 0.7);
    mixInto(out, thump, pre, 0.8 * dbToGain(g.mix[2] - (view === 'tp' ? 6 : 0)) * lv());
    // A short low-mid push so the shot has weight after the attack, kept out of the sub-bass.
    const push = adExp(biquad(biquad(brown(Math.ceil(sr * 0.15), r), sr, 'lowpass', 380), sr, 'highpass', 50), sr, 0.002, 0.03);
    mixInto(out, push, pre, 0.45 * lv());
    // The action cycling: only audible to the shooter.
    if (view === 'fp') {
      const exc = click(sr, r, 3000, 0.8, 0.004, 0.0008);
      const mech = modal(exc, sr, g.mech.map(([f, t, a]) => [f * range(r, 0.97, 1.03), t, a] as [number, number, number]), Math.ceil(sr * 0.12));
      mixInto(out, mech, pre + sr * g.mechAt * range(r, 0.9, 1.1), dbToGain(g.mechLevel) * 6);
    }
  } else {
    // Far: the bang has lost its top; a dull pop with a short low-mid body and a rolling tail (the yard's own
    // echoes come from the reverb). For supersonic rounds a dry crack sits on the front.
    const n = Math.ceil(sr * 0.9), pop = adExp(biquad(biquad(pink(n, r), sr, 'lowpass', 1300 * k, 0.7), sr, 'highpass', 120), sr, 0.002, 0.05);
    mixInto(out, scale(pop, 4), pre, lv());
    const roll = adExp(biquad(biquad(brown(n, r), sr, 'lowpass', 500), sr, 'highpass', 60), sr, 0.03, 0.18);
    mixInto(out, roll, pre, 0.9 * lv());
    const tn = Math.ceil(sr * 0.3), f0 = g.thump[0] * k, f1 = g.thump[1] * k;
    mixInto(out, adExp(osc(tn, sr, t => f1 + (f0 - f1) * Math.exp(-t / 0.02)), sr, 0.003, g.thumpTau * 0.8), pre, 0.5);
    if (g.crackLen > 0) mixInto(out, adExp(biquad(white(Math.ceil(sr * 0.01), r), sr, 'bandpass', Math.min(sr * 0.4, 3000), 1.5), sr, 0.0002, 0.002), 0, 0.5 * lv());
    saturate(out, 1.5);
  }
  return finish(out, sr);
}

/** Dry fire: the hammer or striker falling on nothing. */
export const dryFire: Gen = (r, sr) => finish(modal(click(sr, r, 3500, 1, 0.003, 0.0006), sr, [[2400 * range(r, 0.95, 1.05), 0.03, 1], [5200, 0.02, 0.5], [7300, 0.012, 0.3]], Math.ceil(sr * 0.08)), sr);

// ---- Mechanical foley ------------------------------------------------------------------------------------------------

/** A struck metal part: a click exciting a few modes. */
function clack(r: Rng, sr: number, base: number, ring: number, len = 0.12): Float32Array {
  const k = range(r, 0.94, 1.06);
  return modal(click(sr, r, base * 1.5, 0.9, 0.004, 0.0008), sr, [[base * k, ring, 1], [base * 2.31 * k, ring * 0.7, 0.6], [base * 3.9 * k, ring * 0.4, 0.35], [base * 0.52 * k, ring * 0.8, 0.4]], Math.ceil(sr * len));
}
/** A part sliding against another: band noise with a rough, rising or falling amplitude. */
function scrape(r: Rng, sr: number, hz: number, seconds: number, rising: boolean): Float32Array {
  const n = Math.ceil(sr * seconds), x = biquad(white(n, r), sr, 'bandpass', glide(hz * (rising ? 0.8 : 1.2), hz * (rising ? 1.2 : 0.8), n), 2.2);
  let a = 0;
  for (let i = 0; i < n; i++) { if ((i & 63) === 0) a = 0.5 + r() * 0.5; const t = i / n; x[i] *= a * Math.sin(Math.PI * t) ** 0.6; }
  return x;
}
/** Cloth and webbing: a soft rustle. */
function rustle(r: Rng, sr: number, seconds: number, bright = 2200): Float32Array {
  const n = Math.ceil(sr * seconds), x = biquad(biquad(white(n, r), sr, 'bandpass', bright, 0.6), sr, 'highpass', 600);
  let a = 0, target = 0;
  for (let i = 0; i < n; i++) { if ((i & 255) === 0) target = r() ** 2; a += (target - a) * 0.01; x[i] *= a * Math.sin(Math.PI * i / n); }
  return x;
}

const RELOAD_PITCH: Record<ReloadClass, number> = { rifle: 1, smg: 1.15, pistol: 1.35, shotgun: 0.9 };

export function reloadBeat(cls: ReloadClass, beat: ReloadBeat['name'], r: Rng, sr: number): Float32Array {
  const p = RELOAD_PITCH[cls], out = buf(sr, 0.45);
  switch (beat) {
    case 'release': mixInto(out, clack(r, sr, 2900 * p, 0.04, 0.08), 0, 0.8); mixInto(out, click(sr, r, 5200 * p, 2, 0.006, 0.001), 0, 0.4); break;
    case 'out': mixInto(out, scrape(r, sr, 1700 * p, 0.12, false), 0, 0.6); mixInto(out, clack(r, sr, 1300 * p, 0.05, 0.1), sr * 0.1, 0.5); break;
    case 'fetch': mixInto(out, rustle(r, sr, 0.22, 1800), 0, 0.9); mixInto(out, clack(r, sr, 900 * p, 0.03, 0.06), sr * 0.16, 0.3); break;
    case 'in': mixInto(out, scrape(r, sr, 1500 * p, 0.09, true), 0, 0.7); break;
    case 'seat': mixInto(out, clack(r, sr, 1150 * p, 0.07, 0.15), 0, 1); mixInto(out, adExp(osc(Math.ceil(sr * 0.08), sr, () => 180 * p), sr, 0.001, 0.015), 0, 0.5); break;
    case 'bolt':
      mixInto(out, scrape(r, sr, 2200 * p, 0.07, true), 0, 0.5); mixInto(out, clack(r, sr, 2000 * p, 0.05, 0.08), sr * 0.07, 0.6);
      mixInto(out, clack(r, sr, 1400 * p, 0.08, 0.15), sr * 0.16, 1); break;
    case 'shell': mixInto(out, scrape(r, sr, 1200, 0.06, true), 0, 0.5); mixInto(out, clack(r, sr, 1700, 0.04, 0.08), sr * 0.05, 0.8); break;
    case 'pump':
      mixInto(out, scrape(r, sr, 1000, 0.08, false), 0, 0.6); mixInto(out, clack(r, sr, 900, 0.07, 0.12), sr * 0.08, 0.9);
      mixInto(out, scrape(r, sr, 1100, 0.07, true), sr * 0.17, 0.5); mixInto(out, clack(r, sr, 1250, 0.08, 0.14), sr * 0.24, 1); break;
  }
  return finish(out, sr);
}

/** Weapon swap: sling and cloth, then a grip clack. */
export const swapSound: Gen = (r, sr) => { const o = buf(sr, 0.4); mixInto(o, rustle(r, sr, 0.25, 1600), 0, 0.8); mixInto(o, clack(r, sr, 1500, 0.04, 0.1), sr * 0.24, 0.6); return finish(o, sr); };
/** Melee: a fast swish, then a dull hit. */
export const meleeSound: Gen = (r, sr) => {
  const o = buf(sr, 0.35), n = Math.ceil(sr * 0.18), sw = biquad(white(n, r), sr, 'bandpass', glide(600, 2600, n), 1.2);
  for (let i = 0; i < n; i++) sw[i] *= Math.sin(Math.PI * i / n) ** 2;
  mixInto(o, sw, 0, 0.5);
  mixInto(o, adExp(biquad(pink(Math.ceil(sr * 0.1), r), sr, 'lowpass', 500), sr, 0.001, 0.02), sr * 0.15, 3);
  mixInto(o, adExp(osc(Math.ceil(sr * 0.1), sr, t => 70 + 90 * Math.exp(-t / 0.01)), sr, 0.001, 0.025), sr * 0.15, 0.8);
  return finish(o, sr);
};
/** Gear: webbing, pouches and a sling swivel, heard with movement. */
export const gearSound: Gen = (r, sr) => { const o = buf(sr, 0.3); mixInto(o, rustle(r, sr, 0.25, 2600), 0, 1); if (r() < 0.6) mixInto(o, clack(r, sr, 3800, 0.02, 0.05), sr * range(r, 0.05, 0.2), 0.15); return finish(o, sr); };

// ---- Footsteps -------------------------------------------------------------------------------------------------------

interface FloorDef { thud: number; thudTau: number; click: number; clickQ: number; clickLv: number; scrape: number; scrapeLv: number; modes: [number, number, number][]; modeLv: number; grit: number }
const FLOOR: Record<Floor, FloorDef> = {
  asphalt: { thud: 110, thudTau: 0.02, click: 2400, clickQ: 0.7, clickLv: 0.25, scrape: 3500, scrapeLv: 0.35, modes: [], modeLv: 0, grit: 0.6 },
  grass: { thud: 90, thudTau: 0.03, click: 0, clickQ: 1, clickLv: 0, scrape: 4200, scrapeLv: 0.9, modes: [], modeLv: 0, grit: 0 },
  slab: { thud: 130, thudTau: 0.02, click: 2000, clickQ: 0.9, clickLv: 0.5, scrape: 3200, scrapeLv: 0.15, modes: [], modeLv: 0, grit: 0.2 },
  tile: { thud: 150, thudTau: 0.015, click: 3800, clickQ: 1.4, clickLv: 0.8, scrape: 5000, scrapeLv: 0.1, modes: [[2700, 0.03, 1]], modeLv: 0.15, grit: 0 },
  lino: { thud: 140, thudTau: 0.018, click: 1500, clickQ: 1.1, clickLv: 0.35, scrape: 2600, scrapeLv: 0.12, modes: [], modeLv: 0, grit: 0 },
  carpet: { thud: 100, thudTau: 0.025, click: 0, clickQ: 1, clickLv: 0, scrape: 1200, scrapeLv: 0.15, modes: [], modeLv: 0, grit: 0 },
  planks: { thud: 120, thudTau: 0.03, click: 1100, clickQ: 1, clickLv: 0.3, scrape: 2200, scrapeLv: 0.08, modes: [[190, 0.09, 1], [430, 0.07, 0.7], [790, 0.05, 0.4]], modeLv: 0.8, grit: 0 },
  raised: { thud: 160, thudTau: 0.02, click: 2600, clickQ: 1, clickLv: 0.3, scrape: 3000, scrapeLv: 0.08, modes: [[330, 0.16, 1], [880, 0.12, 0.6], [1650, 0.09, 0.5], [2950, 0.06, 0.3]], modeLv: 0.7, grit: 0 },
  check: { thud: 145, thudTau: 0.017, click: 2900, clickQ: 1.2, clickLv: 0.6, scrape: 4000, scrapeLv: 0.1, modes: [], modeLv: 0, grit: 0 },
};

/** A footstep: heel strike, then the roll to the toe a few tens of ms later, coloured by the floor. */
export function footstep(floor: Floor, r: Rng, sr: number): Float32Array {
  const d = FLOOR[floor], o = buf(sr, 0.32), k = range(r, 0.92, 1.08), toe = Math.round(sr * range(r, 0.035, 0.07));
  for (const [at, lv] of [[0, 1], [toe, range(r, 0.45, 0.7)]] as const) {
    const n = Math.ceil(sr * 0.12);
    mixInto(o, adExp(biquad(biquad(pink(n, r), sr, 'lowpass', d.thud * 4 * k), sr, 'highpass', 60), sr, 0.002, d.thudTau), at, 1.4 * lv);
    mixInto(o, adExp(osc(n, sr, t => d.thud * k * (1 + Math.exp(-t / 0.006))), sr, 0.001, d.thudTau * 0.7), at, 0.35 * lv);
    if (d.clickLv) mixInto(o, click(sr, r, d.click * k, d.clickQ, 0.02, 0.003), at, d.clickLv * lv * 3.5);
    if (d.modes.length) mixInto(o, modal(click(sr, r, 800, 0.7, 0.004, 0.001), sr, d.modes.map(([f, t, a]) => [f * k, t, a] as [number, number, number]), Math.ceil(sr * 0.2)), at, d.modeLv * lv);
  }
  if (d.scrapeLv) mixInto(o, scrape(r, sr, d.scrape * k, floor === 'grass' ? 0.16 : 0.07, false), toe * 0.5, d.scrapeLv);
  if (d.grit) for (let i = 0; i < 6; i++) mixInto(o, click(sr, r, range(r, 3000, 7000), 3, 0.004, 0.0006), range(r, 0, toe + sr * 0.04), d.grit * 0.3);
  return finish(o, sr);
}

// ---- Destruction -------------------------------------------------------------------------------------------------------

/** Grains: many short filtered ticks scattered with a density that decays. */
function grains(o: Float32Array, r: Rng, sr: number, count: number, spread: number, lo: number, hi: number, lv: number, decay = 0.4) {
  for (let i = 0; i < count; i++) {
    const t = -Math.log(1 - r() * 0.98) * spread * decay;
    if (t * sr >= o.length) continue;
    mixInto(o, click(sr, r, range(r, lo, hi), range(r, 1.5, 5), 0.01, range(r, 0.0006, 0.002)), t * sr, lv * range(r, 0.3, 1) * Math.exp(-t / spread));
  }
}
/** Wallboard giving way: a gypsum crunch, a paper tear and dust. */
export const crumbleBoard: Gen = (r, sr) => {
  const o = buf(sr, 0.7);
  mixInto(o, adExp(biquad(pink(Math.ceil(sr * 0.3), r), sr, 'bandpass', 900, 0.6), sr, 0.002, 0.06), 0, 2);
  grains(o, r, sr, 60, 0.25, 1200, 6500, 0.9);
  mixInto(o, adExp(osc(Math.ceil(sr * 0.1), sr, t => 90 + 60 * Math.exp(-t / 0.01)), sr, 0.002, 0.03), 0, 0.5);
  return finish(o, sr);
};
/** A barricade plank splitting: a sharp crack, splinters, the plank's hollow knock. */
export const crumbleWood: Gen = (r, sr) => {
  const o = buf(sr, 0.7);
  mixInto(o, click(sr, r, 2500, 0.8, 0.008, 0.0015), 0, 2);
  mixInto(o, modal(click(sr, r, 700, 0.7, 0.005, 0.001), sr, [[range(r, 180, 240), 0.12, 1], [range(r, 480, 560), 0.08, 0.6], [range(r, 900, 1100), 0.05, 0.4]], Math.ceil(sr * 0.3)), 0, 1.2);
  grains(o, r, sr, 40, 0.2, 700, 3500, 0.8);
  return finish(o, sr);
};
/** Debris settling after a breach: chunks and grit falling for a second or more, thinning out. */
export const debris: Gen = (r, sr) => {
  const o = buf(sr, 1.6);
  for (let i = 0; i < 18; i++) {
    const t = range(r, 0.05, 1.3) ** 1.6, at = t * sr;
    mixInto(o, adExp(biquad(pink(Math.ceil(sr * 0.06), r), sr, 'bandpass', range(r, 250, 900), 1.2), sr, 0.001, 0.012), at, range(r, 0.6, 1.4) * Math.exp(-t * 1.5) * 3);
  }
  grains(o, r, sr, 120, 0.9, 1500, 7000, 0.5, 0.7);
  const dust = adExp(biquad(pink(o.length, r), sr, 'bandpass', 2500, 0.5), sr, 0.05, 0.4);
  mixInto(o, dust, 0, 0.25);
  return finish(o, sr);
};

// ---- Blasts, grenades, charges -------------------------------------------------------------------------------------

/** An explosion. `near` keeps the pressure crack and the debris; far is the low boom and its long roll. */
export function blast(near: boolean, impact: boolean, r: Rng, sr: number): Float32Array {
  const o = buf(sr, near ? 2.4 : 2.8), k = range(r, 0.93, 1.07), size = impact ? 0.75 : 1;
  if (near) {
    const nw = Math.round(sr * 0.0018);
    for (let i = 0; i < nw; i++) o[i] += (1 - 2 * i / nw) * 1.5;
    mixInto(o, adExp(biquad(white(Math.ceil(sr * 0.06), r), sr, 'highpass', 2000), sr, 0.0002, 0.012), 0, 1.2);
    mixInto(o, adExp(biquad(pink(Math.ceil(sr * 1.0), r), sr, 'lowpass', glide(5000 * k, 300, sr * 0.6)), sr, 0.001, 0.12 * size), 0, 5);
    grains(o, r, sr, 70, 0.8, 800, 6000, 0.4, 0.8);
  } else {
    mixInto(o, adExp(biquad(pink(Math.ceil(sr * 1.2), r), sr, 'lowpass', 600 * k), sr, 0.01, 0.15 * size), 0, 4);
  }
  mixInto(o, adExp(osc(Math.ceil(sr * 1.5), sr, t => 32 * k + 60 * Math.exp(-t / 0.05)), sr, 0.002, 0.28 * size), 0, 2.2);
  mixInto(o, adExp(biquad(brown(Math.ceil(sr * 2.3), r), sr, 'lowpass', near ? 400 : 220), sr, 0.02, 0.6 * size), 0, 3);
  saturate(o, 2.4);
  return finish(o, sr);
}
/** Grenade pin pulled and the throw. */
export const throwSound: Gen = (r, sr) => {
  const o = buf(sr, 0.5);
  mixInto(o, modal(click(sr, r, 5000, 1, 0.003, 0.0005), sr, [[range(r, 4200, 4600), 0.18, 1], [range(r, 6700, 7100), 0.12, 0.5]], Math.ceil(sr * 0.25)), 0, 0.5);
  const n = Math.ceil(sr * 0.22), sw = biquad(white(n, r), sr, 'bandpass', glide(500, 1800, n), 1.2);
  for (let i = 0; i < n; i++) sw[i] *= Math.sin(Math.PI * i / n) ** 2;
  mixInto(o, sw, sr * 0.2, 0.7);
  return finish(o, sr);
};
/** A grenade body bouncing: a dull cast-metal clunk. */
export const bounceSound: Gen = (r, sr) => finish(modal(click(sr, r, 1500, 0.7, 0.004, 0.001), sr, [[range(r, 820, 980), 0.08, 1], [range(r, 1900, 2200), 0.05, 0.5], [range(r, 3300, 3700), 0.03, 0.3]], Math.ceil(sr * 0.15)), sr);
/** A breach charge pressed onto a wall: a knock, the adhesive, the clip. */
export const chargeSetSound: Gen = (r, sr) => {
  const o = buf(sr, 0.4);
  mixInto(o, adExp(biquad(pink(Math.ceil(sr * 0.08), r), sr, 'lowpass', 600), sr, 0.001, 0.015), 0, 3);
  mixInto(o, scrape(r, sr, 2600, 0.1, false), sr * 0.03, 0.25);
  mixInto(o, clack(r, sr, 2400, 0.03, 0.06), sr * 0.18, 0.6);
  return finish(o, sr);
};
/** An electronic tone with a soft edge (charge arming, uplink pulse). */
function tone(sr: number, hz: number, seconds: number, harm = 0.25): Float32Array {
  const n = Math.ceil(sr * seconds), x = osc(n, sr, () => hz);
  mixInto(x, osc(n, sr, () => hz * 3), 0, harm);
  return ahr(x, sr, 0.003, seconds * 0.6, seconds * 0.12);
}
export const beepSound = (urgent: boolean): Gen => (_r, sr) => finish(tone(sr, urgent ? 2350 : 1760, urgent ? 0.06 : 0.09), sr);

// ---- Building and working ----------------------------------------------------------------------------------------------

/** Reinforcement deploying: a ratchet, then the steel plate slamming home. */
export const reinforceSound: Gen = (r, sr) => {
  const o = buf(sr, 1.2);
  for (let i = 0; i < 5; i++) mixInto(o, clack(r, sr, 2600, 0.02, 0.04), sr * i * 0.03, 0.35);
  mixInto(o, modal(click(sr, r, 600, 0.6, 0.008, 0.002), sr, [[range(r, 160, 190), 0.6, 1], [range(r, 410, 450), 0.45, 0.7], [range(r, 1050, 1150), 0.3, 0.4], [range(r, 2300, 2500), 0.15, 0.2]], Math.ceil(sr * 1)), sr * 0.17, 1.4);
  mixInto(o, adExp(biquad(pink(Math.ceil(sr * 0.15), r), sr, 'lowpass', 300), sr, 0.001, 0.03), sr * 0.17, 3);
  return finish(o, sr);
};
/** A few turns of a ratchet strap. */
export const ratchetSound: Gen = (r, sr) => { const o = buf(sr, 0.2); for (let i = 0; i < 3; i++) mixInto(o, clack(r, sr, 2400, 0.02, 0.04), sr * i * 0.045, 0.6); return finish(o, sr); };
/** One hammer blow on a plank. */
export const hammerSound: Gen = (r, sr) => {
  const o = buf(sr, 0.35);
  mixInto(o, click(sr, r, 3000, 1, 0.006, 0.001), 0, 0.8);
  mixInto(o, modal(click(sr, r, 600, 0.7, 0.004, 0.001), sr, [[range(r, 200, 260), 0.1, 1], [range(r, 520, 600), 0.07, 0.6], [range(r, 1150, 1300), 0.04, 0.3]], Math.ceil(sr * 0.3)), 0, 1.4);
  return finish(o, sr);
};
/** Planting the uplink: keypad presses. */
export const keypadSound: Gen = (r, sr) => {
  const o = buf(sr, 0.18);
  mixInto(o, click(sr, r, 2200, 1.5, 0.006, 0.001), 0, 0.6);
  mixInto(o, tone(sr, [1175, 1319, 1480, 1568][Math.floor(r() * 4)], 0.07, 0.1), sr * 0.01, 0.5);
  return finish(o, sr);
};
/** Shutting it down: a probe scratching on a board and a short confirm chirp. */
export const defuseSound: Gen = (r, sr) => {
  const o = buf(sr, 0.22);
  mixInto(o, scrape(r, sr, 3200, 0.1, true), 0, 0.5);
  mixInto(o, tone(sr, 990, 0.04, 0.05), sr * 0.12, 0.25);
  return finish(o, sr);
};
/** Tape and clips on a breach charge. */
export const tapeSound: Gen = (r, sr) => { const o = buf(sr, 0.2); mixInto(o, scrape(r, sr, 2800, 0.15, false), 0, 0.8); return finish(o, sr); };

// ---- Feedback ---------------------------------------------------------------------------------------------------------

export const hitSound = (head: boolean): Gen => (r, sr) => {
  const o = buf(sr, head ? 0.3 : 0.12);
  mixInto(o, adExp(biquad(pink(Math.ceil(sr * 0.05), r), sr, 'bandpass', 1400, 1), sr, 0.0005, 0.01), 0, 2);
  mixInto(o, adExp(osc(Math.ceil(sr * 0.08), sr, () => 1850), sr, 0.001, 0.02), 0, 0.5);
  if (head) mixInto(o, modal(click(sr, r, 4000, 1, 0.003, 0.0005), sr, [[3150, 0.25, 1], [4730, 0.15, 0.4]], Math.ceil(sr * 0.25)), sr * 0.012, 0.6);
  return finish(o, sr);
};
export const killSound: Gen = (_r, sr) => {
  const o = buf(sr, 0.4);
  mixInto(o, ahr(osc(Math.ceil(sr * 0.25), sr, () => 740), sr, 0.004, 0.06, 0.05), 0, 0.5);
  mixInto(o, ahr(osc(Math.ceil(sr * 0.3), sr, () => 1109), sr, 0.004, 0.08, 0.07), sr * 0.07, 0.5);
  return finish(o, sr);
};
export const hurtSound: Gen = (r, sr) => {
  const o = buf(sr, 0.35);
  mixInto(o, adExp(osc(Math.ceil(sr * 0.3), sr, t => 55 + 70 * Math.exp(-t / 0.02)), sr, 0.002, 0.07), 0, 1);
  mixInto(o, adExp(biquad(pink(Math.ceil(sr * 0.15), r), sr, 'lowpass', 700), sr, 0.001, 0.03), 0, 2);
  return finish(o, sr);
};
export const uiSound: Gen = (_r, sr) => finish(ahr(osc(Math.ceil(sr * 0.06), sr, t => 900 + 300 * Math.min(1, t / 0.03)), sr, 0.002, 0.015, 0.012), sr);

// ---- Cues --------------------------------------------------------------------------------------------------------------

export type CueKind = 'start' | 'go' | 'win' | 'lose' | 'planted' | 'matchWin' | 'matchLose';
/** A soft synth voice: detuned saws through a falling low-pass. */
function pad(sr: number, hz: number, seconds: number, bright = 2400): Float32Array {
  const n = Math.ceil(sr * seconds), x = new Float32Array(n);
  for (const d of [0.996, 1, 1.004]) mixInto(x, osc(n, sr, () => hz * d, 'saw', d), 0, 0.33);
  biquad(x, sr, 'lowpass', glide(bright, bright * 0.35, n), 0.9);
  return ahr(x, sr, 0.02, seconds * 0.4, seconds * 0.25);
}
const CUES: Record<CueKind, [number, number, number][]> = {
  // [semitones from A3 (220 Hz), start s, length s]
  start: [[-5, 0, 0.9], [2, 0.12, 0.8], [7, 0.24, 0.7]],
  go: [[3, 0, 0.25], [10, 0.11, 0.45]],
  win: [[0, 0, 0.5], [4, 0.12, 0.5], [7, 0.24, 0.5], [12, 0.36, 0.9]],
  lose: [[3, 0, 0.6], [2, 0.16, 0.6], [-2, 0.32, 0.6], [-5, 0.48, 1]],
  planted: [[15, 0, 0.18], [10, 0.2, 0.18], [15, 0.4, 0.18], [10, 0.6, 0.3]],
  matchWin: [[0, 0, 0.6], [4, 0.13, 0.6], [7, 0.26, 0.6], [12, 0.39, 0.6], [16, 0.52, 0.6], [19, 0.65, 1.3]],
  matchLose: [[7, 0, 0.7], [6, 0.18, 0.7], [3, 0.36, 0.7], [1, 0.54, 0.7], [-5, 0.72, 1.4]],
};
export const cueSound = (kind: CueKind): Gen => (_r, sr) => {
  const notes = CUES[kind], end = Math.max(...notes.map(([, s, l]) => s + l)) + 0.2, o = buf(sr, end);
  for (const [st, s, l] of notes) mixInto(o, pad(sr, 220 * 2 ** (st / 12), l, kind === 'planted' ? 4000 : 2400), s * sr, 0.6);
  return finish(o, sr);
};

// ---- Ambience ------------------------------------------------------------------------------------------------------------

export type Bed = 'hard' | 'soft' | 'corridor' | 'yard';
/** A seamless loop for a space: rendered longer than needed and cross-faded end into start. */
export function ambience(bed: Bed, r: Rng, sr: number, seconds = 5): Float32Array {
  const fade = Math.round(sr * 0.5), n = Math.ceil(sr * seconds) + fade, x = new Float32Array(n);
  const hum = (hz: number, lv: number) => { for (const [m, a] of [[1, 1], [2, 0.5], [3, 0.2]]) mixInto(x, osc(n, sr, () => hz * m), 0, lv * a); };
  switch (bed) {
    case 'hard': // server fans and lab refrigeration: a steady broadband whoosh, a fan tone and its beating twin
      mixInto(x, biquad(pink(n, r), sr, 'bandpass', 700, 0.4), 0, 0.5);
      mixInto(x, osc(n, sr, () => 241), 0, 0.012); mixInto(x, osc(n, sr, () => 243.5), 0, 0.01);
      hum(100, 0.006); break;
    case 'soft': // fluorescent ballast hum, very quiet air
      mixInto(x, biquad(pink(n, r), sr, 'lowpass', 500), 0, 0.15); hum(120, 0.01); break;
    case 'corridor': // air handling: a duct rumble with slow swells
      { const air = biquad(brown(n, r), sr, 'lowpass', 300); for (let i = 0; i < n; i++) air[i] *= 0.8 + 0.2 * Math.sin(2 * Math.PI * i / n * 3); mixInto(x, air, 0, 0.8); }
      mixInto(x, biquad(pink(n, r), sr, 'bandpass', 1500, 0.5), 0, 0.06); break;
    case 'yard': // wind in gusts and a far-off city
      { const w = biquad(pink(n, r), sr, 'bandpass', 450, 0.5); let a = 0.5; for (let i = 0; i < n; i++) { if ((i & 1023) === 0) a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(2 * Math.PI * i / n * 2 + Math.sin(i / n * 13))); w[i] *= a; } mixInto(x, w, 0, 0.9); }
      mixInto(x, biquad(brown(n, r), sr, 'lowpass', 150), 0, 0.6); break;
  }
  const out = x.slice(0, n - fade);
  for (let i = 0; i < fade; i++) { const t = i / fade; out[i] = out[i] * Math.sqrt(t) + x[n - fade + i] * Math.sqrt(1 - t); }
  scale(out, 0.9 / Math.max(1e-6, out.reduce((p, v) => Math.max(p, Math.abs(v)), 0)));
  return out;
}

// ---- Catalogue ---------------------------------------------------------------------------------------------------------

export interface SoundDef {
  key: string;
  variants: number;
  sr: number;
  /** Play level in dB at full gain. */
  level: number;
  /** Lower renders first. */
  order: number;
  gen: Gen;
  loop?: boolean;
}
const W: WeaponId[] = ['ar', 'carbine', 'smg', 'shotgun', 'dmr', 'pistol'];
const beatsUsed = (c: ReloadClass) => new Set(W.filter(w => RELOAD_CLASS[w] === c).flatMap(w => [...RELOADS[w].tactical, ...RELOADS[w].empty].map(b => b.name)));
const GUN_LEVEL: Record<WeaponId, number> = { ar: 0, carbine: -0.5, smg: -2, shotgun: 1, dmr: 0.5, pistol: -2.5 };

export function catalogue(): SoundDef[] {
  const d: SoundDef[] = [];
  const add = (key: string, variants: number, sr: number, level: number, order: number, gen: Gen, loop = false) => d.push({ key, variants, sr, level, order, gen, loop });
  for (const w of W) {
    add(`gun.${w}.fp`, 6, 32000, GUN_LEVEL[w], 0, (r, sr) => gunshot(w, 'fp', r, sr));
    add(`gun.${w}.tp`, 3, 32000, GUN_LEVEL[w], 2, (r, sr) => gunshot(w, 'tp', r, sr));
    add(`gun.${w}.far`, 2, 12000, GUN_LEVEL[w], 4, (r, sr) => gunshot(w, 'far', r, sr));
  }
  for (const f of FLOORS) add(`step.${f}`, 4, 24000, -6, 1, (r, sr) => footstep(f, r, sr));
  add('dry', 3, 32000, -10, 1, dryFire);
  // Each class renders the beats its weapons use in reloads.ts; play-time falls back to the rifle's for any other.
  for (const c of ['rifle', 'smg', 'pistol', 'shotgun'] as ReloadClass[]) for (const b of BEATS) {
    if (c !== 'rifle' && !beatsUsed(c).has(b)) continue;
    add(`rl.${c}.${b}`, c === 'shotgun' && b === 'shell' ? 4 : 2, 32000, b === 'fetch' ? -16 : -9, 3, (r, sr) => reloadBeat(c, b, r, sr));
  }
  add('swap', 3, 32000, -12, 3, swapSound);
  add('melee', 3, 32000, -5, 3, meleeSound);
  add('gear', 4, 24000, -20, 3, gearSound);
  add('crumble.board', 4, 32000, -3, 5, crumbleBoard);
  add('crumble.wood', 4, 32000, -3, 5, crumbleWood);
  add('debris', 2, 16000, -8, 5, debris);
  add('boom.near', 2, 24000, 4, 5, (r, sr) => blast(true, false, r, sr));
  add('boom.impact', 2, 24000, 2, 5, (r, sr) => blast(true, true, r, sr));
  add('boom.far', 2, 12000, 2, 6, (r, sr) => blast(false, false, r, sr));
  add('throw', 2, 32000, -10, 5, throwSound);
  add('bounce', 4, 32000, -10, 5, bounceSound);
  add('charge.set', 2, 32000, -8, 5, chargeSetSound);
  add('beep', 1, 32000, -14, 5, beepSound(false));
  add('beep.urgent', 1, 32000, -12, 5, beepSound(true));
  add('build.reinforce', 2, 32000, -4, 6, reinforceSound);
  add('hammer', 4, 32000, -8, 6, hammerSound);
  add('work.plant', 4, 32000, -16, 6, keypadSound);
  add('work.defuse', 3, 32000, -16, 6, defuseSound);
  add('work.tape', 3, 32000, -16, 6, tapeSound);
  add('work.ratchet', 3, 32000, -14, 6, ratchetSound);
  add('hit', 3, 32000, -12, 2, hitSound(false));
  add('hit.head', 2, 32000, -11, 2, hitSound(true));
  add('kill', 1, 32000, -12, 2, killSound);
  add('hurt', 3, 32000, -8, 2, hurtSound);
  add('ui', 1, 32000, -16, 0, uiSound);
  for (const c of ['start', 'go', 'win', 'lose', 'planted', 'matchWin', 'matchLose'] as CueKind[]) add(`cue.${c}`, 1, 24000, -14, 7, cueSound(c));
  for (const b of ['hard', 'soft', 'corridor', 'yard'] as Bed[]) add(`amb.${b}`, 1, 16000, 0, 8, (r, sr) => ambience(b, r, sr), true);
  return d;
}

/** Renders variant `v` of a sound. Deterministic: the same key and variant always give the same samples. */
export function renderSound(def: SoundDef, v: number): Float32Array {
  const x = def.gen(rng(seedOf(def.key, v)), def.sr);
  return def.loop ? x : fadeIn(x, def.sr, 0.0003);
}
