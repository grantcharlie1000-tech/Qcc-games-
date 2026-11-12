/** Breachline sound: every sound in the game as a seeded generator. Each returns one mono variant; the bank renders
 * several variants per sound and playback picks among them, so nothing repeats. All original synthesis: no
 * recordings, nothing downloaded. Levels here are shape only (each variant is peak-normalised); `level` in the
 * catalogue sets how loud a sound plays. */
import type { WeaponId } from '../config';
import { RELOADS, type ReloadBeat } from '../reloads';
import {
  adExp, ahr, biquad, brown, buf, click, dcBlock, dbToGain, fadeIn, finish, glide, mixInto, modal, osc, pink, range, rng, saturate, scale, seedOf, white,
  type Rng,
} from './dsp';

export type Floor = 'asphalt' | 'grass' | 'slab' | 'tile' | 'lino' | 'carpet' | 'planks' | 'raised' | 'check';
export const FLOORS: Floor[] = ['asphalt', 'grass', 'slab', 'tile', 'lino', 'carpet', 'planks', 'raised', 'check'];
export type ReloadClass = 'rifle' | 'smg' | 'pistol' | 'shotgun';
export const RELOAD_CLASS: Record<WeaponId, ReloadClass> = { ar: 'rifle', carbine: 'rifle', dmr: 'rifle', smg: 'smg', pistol: 'pistol', shotgun: 'shotgun' };
export const BEATS: ReloadBeat['name'][] = ['release', 'out', 'fetch', 'in', 'seat', 'bolt', 'shell', 'pump'];

type Gen = (r: Rng, sr: number) => Float32Array;

// ---- Weapons ------------------------------------------------------------------------------------------------------

/** Each gun is built from the same five layers in its own proportions, so it has its own identity:
 * crack (the supersonic bullet and the muzzle's first pressure edge), blast (the gas: band noise falling in pitch,
 * saturated), punch (a short low burst felt in the chest), sizzle (the high air after the crack) and action (the
 * bolt or slide, heard only by the shooter). Tails are not baked: each room's reverb gives them. */
interface Gun {
  /** Crack: high-pass corner Hz, length s, level dB (−60 for none: subsonic 9 mm has no crack). */
  crack: [number, number, number];
  /** Blast: band centre Hz (start, end of the fall), decay s, width Q, level dB, saturation drive. */
  blast: [number, number, number, number, number, number];
  /** Punch: sine start and end Hz, decay s, noise low-pass Hz, level dB. */
  punch: [number, number, number, number, number];
  /** Sizzle: level dB and decay s. */
  sizzle: [number, number];
  /** Action: base Hz of the moving part, ring s, delay after the shot s, level dB, and a spring ring Hz (0 none). */
  action: [number, number, number, number, number];
}

export const GUNS: Record<WeaponId, Gun> = {
  // 5.56 rifle: hard crack, a mid blast, solid punch.
  ar: { crack: [3800, 0.008, -1.5], blast: [1500, 600, 0.05, 0.8, 0, 2.6], punch: [120, 62, 0.04, 220, 0], sizzle: [-7, 0.026], action: [2400, 0.05, 0.016, -11, 5200] },
  // Short-barrel carbine: brighter and snappier, a little less low end, a quicker action.
  carbine: { crack: [4600, 0.005, -1.5], blast: [1900, 800, 0.04, 0.9, 0, 2.8], punch: [135, 72, 0.036, 260, 1], sizzle: [-10, 0.018], action: [2900, 0.045, 0.013, -10, 6100] },
  // 9 mm SMG: no crack; a chunky, compact pop and a busy open-bolt clatter.
  smg: { crack: [3000, 0.002, -60], blast: [1500, 650, 0.034, 0.8, 0, 2.4], punch: [150, 85, 0.03, 380, 0], sizzle: [-16, 0.012], action: [1600, 0.07, 0.011, -3, 3400] },
  // 12 gauge: a wide, low, long boom with little crack.
  shotgun: { crack: [2600, 0.004, -9], blast: [900, 300, 0.06, 0.55, 1.5, 2.8], punch: [95, 44, 0.06, 180, 2], sizzle: [-16, 0.03], action: [1400, 0.08, 0.02, -18, 0] },
  // 7.62 marksman rifle: the heaviest crack and the longest blast; a deep punch.
  dmr: { crack: [3300, 0.011, 0], blast: [1200, 450, 0.075, 0.65, 1, 3.0], punch: [105, 50, 0.055, 200, 1.5], sizzle: [-5, 0.034], action: [2100, 0.07, 0.018, -20, 4600] },
  // Pistol: snappy and light, a bright slide clack.
  pistol: { crack: [3500, 0.002, -60], blast: [2800, 1300, 0.024, 1.3, -1, 2.0], punch: [200, 120, 0.024, 420, -3.5], sizzle: [-20, 0.01], action: [3100, 0.04, 0.009, -9, 6800] },
};

/** The shape of each gun's report, fitted against the CC0 references (AR-15, SKS, Carl Gustav M45, Benelli Nova,
 * Mosin-Nagant, Walther PPQ): body and air levels in dB under the spike, decay constants in seconds, hump in Hz. */
export interface Shape { spikeTau: number; hump: number; body: number; bodyTau: number; air: number; airTau: number; rumble: number; rumbleTau: number }
export const SHAPES: Record<WeaponId, Shape> = {
  ar: { spikeTau: 0.0006, hump: 244, body: -3.4, bodyTau: 0.0088, air: -12, airTau: 0.0062, rumble: -25, rumbleTau: 0.042 }, // fitted against the AR-15 near take
  carbine: { spikeTau: 0.0007, hump: 480, body: -6, bodyTau: 0.011, air: -12, airTau: 0.006, rumble: -16, rumbleTau: 0.1 },
  smg: { spikeTau: 0.0006, hump: 520, body: -5, bodyTau: 0.009, air: -16, airTau: 0.005, rumble: -18, rumbleTau: 0.08 },
  shotgun: { spikeTau: 0.00066, hump: 385, body: -0.1, bodyTau: 0.022, air: -11, airTau: 0.0063, rumble: -18, rumbleTau: 0.1 }, // fitted against the Benelli Nova near take
  dmr: { spikeTau: 0.0009, hump: 380, body: -5, bodyTau: 0.016, air: -13, airTau: 0.007, rumble: -12, rumbleTau: 0.14 },
  pistol: { spikeTau: 0.0005, hump: 600, body: -6, bodyTau: 0.008, air: -16, airTau: 0.004, rumble: -20, rumbleTau: 0.07 },
};

/** One shot. `view` is how it is heard: first person (own gun, action audible), third (someone else's, near), or
 * far (beyond ~40 m: the crack and the low pop survive, the middle and top are gone). */
export function gunshot(w: WeaponId, view: 'fp' | 'tp' | 'far', r: Rng, sr: number): Float32Array {
  const g = GUNS[w], k = range(r, 0.96, 1.04), lv = () => dbToGain(range(r, -1, 1));
  const out = buf(sr, view === 'far' ? 1.0 : 0.42), pre = Math.round(sr * 0.0015);
  if (view === 'far') {
    // Far: a dull pop with a short low-mid body and a rolling tail (the yard's echoes come from the reverb). A
    // supersonic round keeps a dry crack on the front.
    const n = Math.ceil(sr * 0.8);
    mixInto(out, adExp(biquad(biquad(pink(n, r), sr, 'lowpass', 800 * k, 0.7), sr, 'highpass', 110), sr, 0.002, 0.045 + g.blast[2] * 0.3), pre, 4 * lv());
    mixInto(out, adExp(biquad(biquad(brown(n, r), sr, 'lowpass', 500), sr, 'highpass', 60), sr, 0.03, 0.15 + g.punch[2]), pre, 0.9 * lv());
    if (g.crack[2] > -30) mixInto(out, adExp(biquad(white(Math.ceil(sr * 0.01), r), sr, 'bandpass', Math.min(sr * 0.4, 3000), 1.5), sr, 0.0002, 0.002), 0, 0.5 * lv());
    saturate(out, 1.5);
    return finish(biquad(out, sr, 'highpass', 45, 0.6), sr);
  }
  const tp = view === 'tp', sh = SHAPES[w];
  // Built to match real recordings (docs/evidence/breachline/audio/STATUS.md, "Real recordings"): a sub-2 ms
  // broadband spike carries the peak; the body is a wide low-mid hump with the top shelved down, decaying fast;
  // a slow sub rumble rolls on underneath. No pitched layer anywhere.
  // 1. The spike: a pressure edge (one N-wave) and a very short burst of white noise.
  const nw = Math.max(2, Math.round(sr * 0.0005));
  for (let i = 0; i < nw; i++) out[pre + i] += (1 - 2 * i / nw);
  mixInto(out, adExp(white(Math.ceil(sr * 0.006), r), sr, 0.00005, sh.spikeTau), pre, 0.8 * lv());
  // 2. The body: pink noise through a wide hump at `hump` Hz, highs shelved down, decaying with `bodyTau`.
  const bn = Math.ceil(sr * sh.bodyTau * 8), body = biquad(biquad(pink(bn, r), sr, 'lowpass', 2600 * k, 0.5), sr, 'highpass', 90, 0.5);
  biquad(body, sr, 'peaking', sh.hump * k, 0.5, 6);
  biquad(body, sr, 'highshelf', 6000, 0.7, -6);
  mixInto(out, scale(adExp(body, sr, 0.0002, sh.bodyTau * range(r, 0.85, 1.15)), 4), pre, dbToGain(sh.body - (tp ? 1 : 0)) * lv());
  // 3. High air that dies fast (real highs fall 20 dB in 20-40 ms).
  mixInto(out, adExp(biquad(white(Math.ceil(sr * 0.05), r), sr, 'highpass', 3500, 0.6), sr, 0.0001, sh.airTau), pre, dbToGain(sh.air) * lv());
  // 4. Sub rumble: rises slower than the rest and rolls on for a few hundred ms.
  const rn = Math.ceil(sr * 0.5), rumble = adExp(biquad(biquad(brown(rn, r), sr, 'lowpass', 110), sr, 'highpass', 30), sr, 0.006, sh.rumbleTau);
  mixInto(out, scale(rumble, 3), pre, dbToGain(sh.rumble - (tp ? 2 : 0)) * lv());
  saturate(out, 1.2);
  // Action: the bolt or slide cycling, and its spring, heard only by the shooter.
  if (!tp) {
    const [ab, ar, at, al, spring] = g.action;
    const act = modal(click(sr, r, ab * 1.4, 0.9, 0.003, 0.0007), sr, [[ab * range(r, 0.97, 1.03), ar, 1], [ab * 1.63, ar * 0.7, 0.6], [ab * 2.71, ar * 0.5, 0.35]], Math.ceil(sr * 0.14));
    if (spring) mixInto(act, modal(click(sr, r, spring, 2, 0.002, 0.0004), sr, [[spring * range(r, 0.98, 1.02), 0.12, 1]], Math.ceil(sr * 0.14)), 0, 0.15);
    // Well under the bang: a bolt louder than the shot was one of the cartoon tells.
    mixInto(out, act, pre + sr * at * range(r, 0.92, 1.08), dbToGain(al) * 1.3);
  }
  return finish(biquad(out, sr, 'highpass', 38, 0.6), sr);
}

/** A spent case landing: brass rings on a hard floor; a shotgun hull is a dull plastic tap. */
export const casingSound = (shell: boolean): Gen => (r, sr) => {
  const o = buf(sr, 0.5);
  if (shell) {
    for (const [t, lv] of [[0, 1], [range(r, 0.08, 0.12), 0.4]] as const) mixInto(o, modal(click(sr, r, 1200, 1, 0.003, 0.0008), sr, [[range(r, 650, 800), 0.03, 1], [range(r, 1500, 1800), 0.02, 0.5]], Math.ceil(sr * 0.08)), t * sr, lv);
  } else {
    let t = 0, lv = 1;
    for (let i = 0; i < 3; i++) {
      mixInto(o, modal(click(sr, r, 6000, 1.5, 0.002, 0.0003), sr, [[range(r, 4800, 5600), 0.09, 1], [range(r, 8200, 9400), 0.06, 0.6], [range(r, 11800, 12800), 0.04, 0.3]], Math.ceil(sr * 0.15)), t * sr, lv);
      t += range(r, 0.07, 0.13) * lv; lv *= range(r, 0.35, 0.55);
    }
  }
  return finish(o, sr);
};

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
  const n = Math.ceil(sr * seconds), x = biquad(biquad(white(n, r), sr, 'bandpass', glide(hz * (rising ? 0.8 : 1.2), hz * (rising ? 1.2 : 0.8), n), 2.2), sr, 'highpass', 250);
  let a = 0;
  // Rough but smooth: a new target level every ~2 ms, glided to (a hard step every block would buzz).
  let target = 0.75;
  for (let i = 0; i < n; i++) { if ((i & 63) === 0) target = 0.5 + r() * 0.5; a += (target - a) * 0.02; const t = i / n; x[i] *= a * Math.sin(Math.PI * t) ** 0.6; }
  return x;
}
/** Cloth and webbing: a soft rustle. */
function rustle(r: Rng, sr: number, seconds: number, bright = 2200): Float32Array {
  const n = Math.ceil(sr * seconds), x = biquad(biquad(white(n, r), sr, 'bandpass', bright, 0.6), sr, 'highpass', 600);
  let a = 0, target = 0;
  for (let i = 0; i < n; i++) { if ((i & 255) === 0) target = r() ** 2; a += (target - a) * 0.01; x[i] *= a * Math.sin(Math.PI * i / n); }
  return x;
}

const RELOAD_PITCH: Record<ReloadClass, number> = { rifle: 1, smg: 1.12, pistol: 1.3, shotgun: 0.9 };
/** The gun's body answering a firm hit: a short low knock. */
function bodyKnock(r: Rng, sr: number, hz: number, tau = 0.014): Float32Array {
  const n = Math.ceil(sr * tau * 6), x = adExp(osc(n, sr, t => hz * (1 + 0.6 * Math.exp(-t / 0.004))), sr, 0.0005, tau);
  return mixInto(x, adExp(biquad(pink(n, r), sr, 'lowpass', hz * 3), sr, 0.0005, tau * 0.6), 0, 1.5);
}
/** A spring's brief ring after a part slams home. */
const springRing = (r: Rng, sr: number, hz: number) => modal(click(sr, r, hz, 2, 0.002, 0.0004), sr, [[hz * range(r, 0.97, 1.03), 0.18, 1], [hz * 1.52, 0.1, 0.4]], Math.ceil(sr * 0.22));

/** One beat of a reload (names from reloads.ts). Each class has its own pitch and weight; the seat and the bolt are
 * the beats a player listens for, so they carry a body knock. */
export function reloadBeat(cls: ReloadClass, beat: ReloadBeat['name'], r: Rng, sr: number): Float32Array {
  const p = RELOAD_PITCH[cls] * range(r, 0.97, 1.03), out = buf(sr, 0.45), heavy = cls === 'pistol' ? 0.6 : 1;
  switch (beat) {
    case 'release': // the release button, then the magazine dropping free of the catch
      mixInto(out, click(sr, r, 4200 * p, 2.5, 0.006, 0.0008), 0, 0.5);
      mixInto(out, clack(r, sr, 2500 * p, 0.035, 0.08), sr * 0.012, 0.7); break;
    case 'out': // the magazine sliding out of the well
      mixInto(out, scrape(r, sr, 1600 * p, 0.09, false), 0, 0.7);
      mixInto(out, clack(r, sr, 1100 * p, 0.04, 0.08), sr * 0.085, 0.35); break;
    case 'fetch': // a fresh one from the pouch: webbing, a flap, the magazine tapping gear
      mixInto(out, rustle(r, sr, 0.24, 1700), 0, 1);
      mixInto(out, clack(r, sr, 850 * p, 0.03, 0.06), sr * range(r, 0.12, 0.18), 0.3); break;
    case 'in': // the new magazine's lips entering the well
      mixInto(out, scrape(r, sr, 1400 * p, 0.07, true), 0, 0.8);
      mixInto(out, click(sr, r, 3000 * p, 2, 0.006, 0.001), sr * 0.06, 0.3); break;
    case 'seat': // the catch engaging: a firm clack and the gun body's knock
      mixInto(out, clack(r, sr, 1250 * p, 0.06, 0.14), 0, 1);
      mixInto(out, bodyKnock(r, sr, 210 * p), 0, 0.6 * heavy);
      mixInto(out, click(sr, r, 5200 * p, 3, 0.004, 0.0006), sr * 0.004, 0.3); break;
    case 'bolt': // charging handle (or slide) pulled back against its spring, released, slamming home
      mixInto(out, scrape(r, sr, 2300 * p, 0.06, true), 0, 0.45);
      mixInto(out, clack(r, sr, 1900 * p, 0.04, 0.08), sr * 0.06, 0.6);
      mixInto(out, clack(r, sr, 1350 * p, 0.08, 0.16), sr * 0.15, 1);
      mixInto(out, bodyKnock(r, sr, 180 * p, 0.018), sr * 0.15, 0.55 * heavy);
      mixInto(out, springRing(r, sr, 4300 * p), sr * 0.15, 0.12); break;
    case 'shell': // a shell thumbed into the tube past the spring: a plastic brush and a click
      mixInto(out, scrape(r, sr, 1100, 0.05, true), 0, 0.5);
      mixInto(out, clack(r, sr, 1700, 0.035, 0.07), sr * 0.05, 0.8);
      mixInto(out, bodyKnock(r, sr, 260, 0.012), sr * 0.05, 0.4); break;
    case 'pump': // the fore-end racked back and driven forward
      mixInto(out, scrape(r, sr, 950, 0.07, false), 0, 0.6); mixInto(out, clack(r, sr, 880, 0.07, 0.12), sr * 0.07, 0.9);
      mixInto(out, scrape(r, sr, 1050, 0.06, true), sr * 0.16, 0.5); mixInto(out, clack(r, sr, 1200, 0.08, 0.14), sr * 0.22, 1);
      mixInto(out, bodyKnock(r, sr, 190, 0.012), sr * 0.22, 0.35); break;
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
  slab: { thud: 130, thudTau: 0.02, click: 2400, clickQ: 0.9, clickLv: 0.9, scrape: 3200, scrapeLv: 0.2, modes: [], modeLv: 0, grit: 0.45 },
  tile: { thud: 150, thudTau: 0.015, click: 3800, clickQ: 1.4, clickLv: 0.8, scrape: 5000, scrapeLv: 0.1, modes: [[2700, 0.03, 1]], modeLv: 0.15, grit: 0 },
  lino: { thud: 140, thudTau: 0.018, click: 1500, clickQ: 1.1, clickLv: 0.35, scrape: 2600, scrapeLv: 0.12, modes: [], modeLv: 0, grit: 0 },
  carpet: { thud: 100, thudTau: 0.025, click: 0, clickQ: 1, clickLv: 0, scrape: 1200, scrapeLv: 0.15, modes: [], modeLv: 0, grit: 0 },
  planks: { thud: 120, thudTau: 0.03, click: 1500, clickQ: 1, clickLv: 0.5, scrape: 2200, scrapeLv: 0.08, modes: [[210, 0.09, 0.7], [520, 0.08, 1], [980, 0.06, 0.7], [1700, 0.04, 0.4]], modeLv: 1.2, grit: 0 },
  raised: { thud: 160, thudTau: 0.02, click: 2600, clickQ: 1, clickLv: 0.5, scrape: 3000, scrapeLv: 0.08, modes: [[330, 0.14, 0.45], [880, 0.12, 1], [1650, 0.09, 0.8], [2950, 0.06, 0.5]], modeLv: 0.9, grit: 0 },
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
  // Lino and vinyl now and then squeak under a rubber sole.
  if ((floor === 'lino' || floor === 'check') && r() < 0.35) { const n = Math.ceil(sr * 0.05), f0 = range(r, 1700, 2400); mixInto(o, ahr(osc(n, sr, t => f0 * (1 + 0.15 * t / 0.05)), sr, 0.005, 0.02, 0.01), toe, 0.12); }
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
  const o = buf(sr, near ? 1.9 : 2.4), k = range(r, 0.93, 1.07), size = impact ? 0.75 : 1;
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
export function ambience(bed: Bed, r: Rng, sr: number, seconds = 4): Float32Array {
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
      { const air = biquad(biquad(brown(n, r), sr, 'lowpass', 300), sr, 'highpass', 70); for (let i = 0; i < n; i++) air[i] *= 0.8 + 0.2 * Math.sin(2 * Math.PI * i / n * 3); mixInto(x, air, 0, 0.8); }
      mixInto(x, biquad(pink(n, r), sr, 'bandpass', 1500, 0.5), 0, 0.06); break;
    case 'yard': // wind in gusts and a far-off city
      { const w = biquad(pink(n, r), sr, 'bandpass', 450, 0.5); let a = 0.5; for (let i = 0; i < n; i++) { if ((i & 1023) === 0) a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(2 * Math.PI * i / n * 2 + Math.sin(i / n * 13))); w[i] *= a; } mixInto(x, w, 0, 0.9); }
      mixInto(x, biquad(biquad(brown(n, r), sr, 'lowpass', 150), sr, 'highpass', 45), 0, 0.6); break;
  }
  dcBlock(x, sr, 25);
  const out = x.slice(0, n - fade);
  for (let i = 0; i < fade; i++) { const t = i / fade; out[i] = out[i] * Math.sqrt(t) + x[n - fade + i] * Math.sqrt(1 - t); }
  scale(out, 0.9 / Math.max(1e-6, out.reduce((p, v) => Math.max(p, Math.abs(v)), 0)));
  return out;
}

// ---- Impacts by material (bullets), glass, set pieces, bodies, reinforcement -----------------------------------------

/** Materials a stopped round can hit, as named by render/surfacehit.ts (plus metal). */
export type ImpactMat = 'wall' | 'concrete' | 'brick' | 'wood' | 'fabric' | 'earth' | 'ceiling' | 'tile' | 'plastic' | 'glass' | 'cardboard' | 'metal' | 'leaf';
export const IMPACT_MATS: ImpactMat[] = ['wall', 'concrete', 'brick', 'wood', 'fabric', 'earth', 'ceiling', 'tile', 'plastic', 'glass', 'cardboard', 'metal', 'leaf'];

/** A bullet stopping in a material: the hit, the material's own answer, and its debris. */
export function impact(mat: ImpactMat, r: Rng, sr: number): Float32Array {
  const o = buf(sr, 0.6), k = range(r, 0.92, 1.08);
  const thud = (hz: number, tau: number, lv: number) => mixInto(o, adExp(biquad(pink(Math.ceil(sr * tau * 6), r), sr, 'bandpass', hz * k, 0.9), sr, 0.0004, tau), 0, lv);
  switch (mat) {
    case 'wall': thud(700, 0.012, 3); grains(o, r, sr, 34, 0.2, 1000, 4500, 0.9); mixInto(o, rustle(r, sr, 0.25, 2500), sr * 0.02, 0.15); break;
    case 'concrete': mixInto(o, click(sr, r, 2600 * k, 1.2, 0.01, 0.0015), 0, 1.4); grains(o, r, sr, 26, 0.15, 2200, 7000, 1.0); thud(400, 0.01, 1.2); break;
    case 'brick': mixInto(o, click(sr, r, 1700 * k, 1, 0.012, 0.002), 0, 1.3); thud(320, 0.015, 2); grains(o, r, sr, 34, 0.2, 1400, 5500, 1.0); break;
    case 'wood': mixInto(o, modal(click(sr, r, 900, 0.7, 0.004, 0.001), sr, [[230 * k, 0.07, 1], [560 * k, 0.05, 0.6], [1040 * k, 0.03, 0.4]], Math.ceil(sr * 0.2)), 0, 1.4); grains(o, r, sr, 18, 0.12, 900, 3500, 0.7); break;
    case 'fabric': thud(450, 0.02, 3); mixInto(o, adExp(biquad(white(Math.ceil(sr * 0.2), r), sr, 'bandpass', 3200, 0.6), sr, 0.005, 0.04), sr * 0.005, 0.15); break;
    case 'earth': thud(160, 0.025, 3); grains(o, r, sr, 50, 0.25, 800, 3200, 0.6, 0.6); break;
    case 'ceiling': thud(900, 0.01, 2); grains(o, r, sr, 40, 0.4, 1500, 5000, 0.6, 0.8); break;
    case 'tile': mixInto(o, modal(click(sr, r, 4500, 1.2, 0.003, 0.0006), sr, [[3100 * k, 0.05, 1], [5600 * k, 0.035, 0.6], [8200 * k, 0.02, 0.3]], Math.ceil(sr * 0.12)), 0, 1); grains(o, r, sr, 20, 0.14, 3000, 8000, 0.8); break;
    case 'plastic': mixInto(o, modal(click(sr, r, 1500, 0.8, 0.003, 0.0008), sr, [[620 * k, 0.04, 1], [1450 * k, 0.03, 0.6], [2700 * k, 0.02, 0.3]], Math.ceil(sr * 0.1)), 0, 1.5); break;
    case 'glass': mixInto(o, glassCrack(r, sr), 0, 1); break;
    case 'cardboard': thud(520, 0.018, 3); mixInto(o, rustle(r, sr, 0.15, 1800), 0, 0.3); break;
    case 'metal': mixInto(o, modal(click(sr, r, 3000, 0.9, 0.003, 0.0006), sr, [[1850 * k, 0.25, 1], [3950 * k, 0.18, 0.7], [6300 * k, 0.12, 0.4], [920 * k, 0.15, 0.4]], Math.ceil(sr * 0.5)), 0, 1.2); break;
    case 'leaf': mixInto(o, rustle(r, sr, 0.18, 3000), 0, 1); break;
  }
  return finish(o, sr);
}
/** A round glancing off: a falling whine with a flutter. */
export const ricochet: Gen = (r, sr) => {
  const n = Math.ceil(sr * 0.45), f0 = range(r, 2600, 3600), f1 = f0 * range(r, 0.35, 0.5), flutter = range(r, 25, 45);
  const x = osc(n, sr, t => f1 + (f0 - f1) * Math.exp(-t / 0.12));
  for (let i = 0; i < n; i++) x[i] *= (0.7 + 0.3 * Math.sin(2 * Math.PI * flutter * i / sr)) * Math.exp(-i / (sr * 0.12)) * Math.min(1, i / (sr * 0.004));
  mixInto(x, adExp(biquad(white(Math.ceil(sr * 0.2), r), sr, 'bandpass', f0, 3), sr, 0.002, 0.06), 0, 0.3);
  return finish(x, sr);
};

/** Glass cracking: a sharp tick and the crack running across the pane. */
function glassCrack(r: Rng, sr: number): Float32Array {
  const o = buf(sr, 0.3);
  mixInto(o, click(sr, r, 6000, 1.5, 0.004, 0.0005), 0, 1.4);
  for (let i = 0; i < 18; i++) mixInto(o, click(sr, r, range(r, 3500, 9000), range(r, 4, 9), 0.006, 0.0008), sr * range(r, 0.002, 0.07) ** 1.3 * 2, range(r, 0.2, 0.6));
  mixInto(o, modal(click(sr, r, 5000, 2, 0.002, 0.0004), sr, [[range(r, 4200, 4800), 0.15, 1], [range(r, 7300, 7900), 0.1, 0.5]], Math.ceil(sr * 0.25)), 0, 0.12);
  return o;
}
export const glassCrackSound: Gen = (r, sr) => finish(glassCrack(r, sr), sr);
/** A pane shattering: the crash, then shards falling and settling for over a second. */
export const glassShatter: Gen = (r, sr) => {
  const o = buf(sr, 1.6);
  mixInto(o, adExp(biquad(white(Math.ceil(sr * 0.15), r), sr, 'highpass', 2500), sr, 0.0005, 0.03), 0, 2.5);
  mixInto(o, glassCrack(r, sr), 0, 0.8);
  for (let i = 0; i < 70; i++) {
    const t = 0.02 + range(r, 0, 1) ** 1.8 * 1.3, f = range(r, 3000, 10000);
    mixInto(o, modal(click(sr, r, f, 3, 0.002, 0.0004), sr, [[f, range(r, 0.02, 0.07), 1], [f * 1.7, 0.03, 0.4]], Math.ceil(sr * 0.08)), t * sr, range(r, 0.15, 0.6) * Math.exp(-t * 1.6));
  }
  return finish(o, sr);
};

/** Set pieces breaking, by what they are made of. */
export type BreakKind = 'wood' | 'metal' | 'fabric' | 'shelf' | 'drum' | 'crate';
export const BREAKS: BreakKind[] = ['wood', 'metal', 'fabric', 'shelf', 'drum', 'crate'];
export function breakSound(kind: BreakKind, r: Rng, sr: number): Float32Array {
  const o = buf(sr, kind === 'shelf' ? 1.4 : 0.9), metal = (hz: number, ring: number, lv: number, at = 0) =>
    mixInto(o, modal(click(sr, r, hz * 2, 0.7, 0.006, 0.0015), sr, [[hz * range(r, 0.95, 1.05), ring, 1], [hz * 2.6, ring * 0.6, 0.6], [hz * 5.1, ring * 0.4, 0.3]], Math.ceil(sr * (ring + 0.1))), at * sr, lv);
  switch (kind) {
    case 'wood': // a board splitting along the grain: a crack, a creak and the halves knocking
      mixInto(o, click(sr, r, 2200, 0.8, 0.01, 0.002), 0, 1.5); grains(o, r, sr, 30, 0.25, 700, 3500, 0.7);
      mixInto(o, modal(click(sr, r, 600, 0.7, 0.005, 0.001), sr, [[range(r, 170, 220), 0.12, 1], [range(r, 450, 520), 0.08, 0.6]], Math.ceil(sr * 0.3)), sr * 0.12, 1); break;
    case 'metal': // sheet steel denting, then a door springing open on its hinge
      metal(140, 0.35, 1.2); mixInto(o, adExp(biquad(biquad(brown(Math.ceil(sr * 0.2), r), sr, 'lowpass', 300), sr, 'highpass', 70), sr, 0.002, 0.03), 0, 0.9);
      mixInto(o, scrape(r, sr, 1800, 0.12, true), sr * 0.18, 0.3); metal(420, 0.25, 0.6, 0.3); break;
    case 'fabric': // fabric tearing and the stuffing giving way
      { const n = Math.ceil(sr * 0.35), t = biquad(white(n, r), sr, 'bandpass', 2400, 0.7); let g = 0; for (let i = 0; i < n; i++) { if ((i & 127) === 0) g = r() < 0.7 ? range(r, 0.4, 1) : 0.1; t[i] *= g * Math.sin(Math.PI * i / n); } mixInto(o, t, 0, 1); }
      mixInto(o, adExp(biquad(pink(Math.ceil(sr * 0.15), r), sr, 'lowpass', 500), sr, 0.005, 0.04), sr * 0.3, 1.5); break;
    case 'shelf': // a shelf collapsing: the frame folding and its contents falling
      metal(240, 0.3, 1); for (let i = 0; i < 9; i++) { const t = range(r, 0.08, 1.0); mixInto(o, i % 3 ? adExp(biquad(pink(Math.ceil(sr * 0.06), r), sr, 'bandpass', range(r, 300, 900), 1), sr, 0.001, 0.015) : modal(click(sr, r, 2000, 1, 0.003, 0.0006), sr, [[range(r, 900, 2200), 0.08, 1]], Math.ceil(sr * 0.12)), t * sr, 1.2 * Math.exp(-t)); }
      metal(180, 0.25, 0.8, 0.45); break;
    case 'drum': // a steel drum holed: a hollow boom and a leak hissing
      metal(95, 0.5, 1.3); { const n = Math.ceil(sr * 0.7); mixInto(o, ahr(biquad(biquad(white(n, r), sr, 'bandpass', 3800, 3), sr, 'highpass', 1500), sr, 0.03, 0.3, 0.15), sr * 0.08, 0.3); } break;
    case 'crate': // a crate bursting: boards splitting and what was inside spilling
      mixInto(o, click(sr, r, 2000, 0.8, 0.01, 0.002), 0, 1.3); grains(o, r, sr, 50, 0.4, 500, 3000, 0.8, 0.7);
      for (let i = 0; i < 4; i++) mixInto(o, modal(click(sr, r, 700, 0.7, 0.004, 0.001), sr, [[range(r, 180, 320), 0.08, 1]], Math.ceil(sr * 0.15)), sr * range(r, 0.05, 0.5), 0.6); break;
  }
  return finish(o, sr);
};

/** A body and its kit hitting the floor. */
export const bodyFall: Gen = (r, sr) => {
  const o = buf(sr, 0.9);
  for (const [t, lv] of [[0, 1], [range(r, 0.12, 0.2), 0.7], [range(r, 0.3, 0.42), 0.35]] as const) {
    mixInto(o, adExp(biquad(biquad(pink(Math.ceil(sr * 0.15), r), sr, 'lowpass', 350), sr, 'highpass', 50), sr, 0.003, 0.03), t * sr, 3 * lv);
    mixInto(o, adExp(osc(Math.ceil(sr * 0.12), sr, x => 70 + 50 * Math.exp(-x / 0.01)), sr, 0.002, 0.03), t * sr, 0.6 * lv);
  }
  mixInto(o, rustle(r, sr, 0.5, 1800), sr * 0.02, 0.35);
  for (let i = 0; i < 3; i++) mixInto(o, clack(r, sr, range(r, 1400, 2600), 0.04, 0.08), sr * range(r, 0.02, 0.4), 0.25);
  return finish(o, sr);
};
/** The body coming to rest: a last shift of cloth and kit. */
export const bodySettle: Gen = (r, sr) => { const o = buf(sr, 0.4); mixInto(o, rustle(r, sr, 0.3, 1500), 0, 1); mixInto(o, clack(r, sr, 1800, 0.03, 0.06), sr * range(r, 0.05, 0.2), 0.2); return finish(o, sr); };
/** A dropped weapon clattering: two or three hits, each smaller. */
export const weaponDrop: Gen = (r, sr) => {
  const o = buf(sr, 0.7); let t = 0, lv = 1;
  for (let i = 0; i < 3; i++) {
    mixInto(o, modal(click(sr, r, 2500, 0.8, 0.004, 0.001), sr, [[range(r, 700, 900), 0.06, 1], [range(r, 1700, 2100), 0.05, 0.7], [range(r, 3300, 3900), 0.04, 0.4]], Math.ceil(sr * 0.15)), t * sr, lv);
    mixInto(o, adExp(biquad(pink(Math.ceil(sr * 0.05), r), sr, 'lowpass', 400), sr, 0.001, 0.01), t * sr, 2 * lv);
    t += range(r, 0.1, 0.18) * lv; lv *= range(r, 0.4, 0.6);
  }
  return finish(o, sr);
};
/** A round hitting someone: a wet slap on flesh, or a dull thud and a plate tick on armour. */
export const fleshHit = (armour: boolean): Gen => (r, sr) => {
  const o = buf(sr, 0.2);
  mixInto(o, adExp(biquad(pink(Math.ceil(sr * 0.08), r), sr, 'lowpass', armour ? 600 : 1300), sr, 0.0005, 0.012), 0, 3);
  if (armour) mixInto(o, modal(click(sr, r, 2000, 1, 0.003, 0.0006), sr, [[range(r, 1050, 1250), 0.05, 1], [range(r, 2600, 2900), 0.03, 0.4]], Math.ceil(sr * 0.1)), 0, 0.5);
  else { const n = Math.ceil(sr * 0.07); mixInto(o, adExp(biquad(white(n, r), sr, 'bandpass', glide(900, 300, n), 3), sr, 0.002, 0.02), sr * 0.006, 1.2); }
  return finish(o, sr);
};

/** Reinforcement deploying, in stages: the plate lifting, unfolding, and anchors firing into the wall. */
export type ReinforceStage = 'lift' | 'unfold' | 'anchor';
export function reinforceStage(stage: ReinforceStage, r: Rng, sr: number): Float32Array {
  const o = buf(sr, stage === 'lift' ? 0.8 : 0.5);
  if (stage === 'lift') {
    // A servo whine rising as it lifts, not a drone: thin, mid-pitched and well under the anchors.
    const n = Math.ceil(sr * 0.7), motor = osc(n, sr, t => 230 + 120 * Math.min(1, t / 0.5), 'saw');
    mixInto(o, ahr(biquad(biquad(motor, sr, 'lowpass', 1600), sr, 'highpass', 180), sr, 0.06, 0.42, 0.06), 0, 0.12);
    for (let i = 0; i < 10; i++) mixInto(o, clack(r, sr, 2400, 0.015, 0.03), sr * (0.05 + i * 0.06), 0.15);
  } else if (stage === 'unfold') {
    mixInto(o, scrape(r, sr, 1300, 0.15, true), 0, 0.5);
    mixInto(o, modal(click(sr, r, 600, 0.6, 0.008, 0.002), sr, [[range(r, 170, 200), 0.35, 1], [range(r, 430, 470), 0.25, 0.6], [range(r, 1100, 1200), 0.15, 0.3]], Math.ceil(sr * 0.4)), sr * 0.14, 1.4);
  } else {
    mixInto(o, adExp(biquad(white(Math.ceil(sr * 0.04), r), sr, 'bandpass', 1100, 0.8), sr, 0.0003, 0.006), 0, 3);
    mixInto(o, modal(click(sr, r, 3000, 1, 0.003, 0.0006), sr, [[range(r, 2300, 2600), 0.12, 1], [range(r, 5200, 5600), 0.08, 0.4]], Math.ceil(sr * 0.2)), sr * 0.003, 0.5);
    mixInto(o, adExp(biquad(pink(Math.ceil(sr * 0.06), r), sr, 'lowpass', 300), sr, 0.001, 0.012), 0, 2);
  }
  return finish(o, sr);
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
  add('casing.brass', 4, 32000, -24, 2, casingSound(false));
  add('casing.shell', 3, 32000, -22, 2, casingSound(true));
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
  for (const mat of IMPACT_MATS) add(`impact.${mat}`, 2, 22050, -8, 4, (r, sr) => impact(mat, r, sr));
  add('glass.crack', 2, 32000, -6, 5, glassCrackSound);
  add('glass.shatter', 2, 24000, -6, 5, glassShatter);
  for (const b of BREAKS) add(`break.${b}`, 1, 22050, -6, 6, (r, sr) => breakSound(b, r, sr));
  add('body.fall', 2, 22050, -8, 6, bodyFall);
  add('body.settle', 2, 16000, -16, 6, bodySettle);
  add('drop.weapon', 2, 22050, -12, 6, weaponDrop);
  add('flesh', 3, 22050, -12, 4, fleshHit(false));
  add('armour', 2, 22050, -12, 4, fleshHit(true));
  for (const st of ['lift', 'unfold', 'anchor'] as ReinforceStage[]) add(`rf.${st}`, st === 'anchor' ? 2 : 1, 22050, -6, 6, (r, sr) => reinforceStage(st, r, sr));
  add('debris', 2, 16000, -8, 5, debris);
  add('boom.near', 1, 22050, 4, 5, (r, sr) => blast(true, false, r, sr));
  add('boom.impact', 1, 22050, 2, 5, (r, sr) => blast(true, true, r, sr));
  add('boom.far', 2, 12000, 2, 6, (r, sr) => blast(false, false, r, sr));
  add('throw', 2, 32000, -10, 5, throwSound);
  add('bounce', 4, 32000, -10, 5, bounceSound);
  add('charge.set', 2, 32000, -8, 5, chargeSetSound);
  add('beep', 1, 32000, -14, 5, beepSound(false));
  add('beep.urgent', 1, 32000, -12, 5, beepSound(true));
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
  for (const c of ['start', 'go', 'win', 'lose', 'planted', 'matchWin', 'matchLose'] as CueKind[]) add(`cue.${c}`, 1, 16000, -14, 7, cueSound(c));
  for (const b of ['hard', 'soft', 'corridor', 'yard'] as Bed[]) add(`amb.${b}`, 1, b === 'hard' ? 16000 : 12000, 0, 8, (r, sr) => ambience(b, r, sr), true);
  return d;
}

/** Renders variant `v` of a sound. Deterministic: the same key and variant always give the same samples. */
export function renderSound(def: SoundDef, v: number): Float32Array {
  const x = def.gen(rng(seedOf(def.key, v)), def.sr);
  return def.loop ? x : fadeIn(x, def.sr, 0.0003);
}
