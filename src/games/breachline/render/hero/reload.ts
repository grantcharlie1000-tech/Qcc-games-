/** Reloads authored as timelines of named beats. The beat times come from `reloads.ts` (shared with the sound), so a
 * sound and its motion land together; total time is `WeaponDef.reload`. Each evaluation returns the weapon's extra
 * pose, where the magazine (or shell) is in weapon space, which placement the support hand is attached to, and the
 * bolt/handle travel. The rig turns that into IK targets. */
import * as THREE from 'three';
import type { WeaponId } from '../../config';
import { RELOADS, type ReloadBeat } from '../../reloads';

type V3 = [number, number, number];
export interface ReloadFrame {
  /** Additive weapon pose (camera space position, Euler rotation). */
  gunP: V3; gunR: V3;
  /** Magazine offset from seated (weapon space) and rotation; `magOn` false hides it (dropped, not yet fetched). */
  magP: V3; magR: V3; magOn: boolean;
  /** Support hand: weights for [support hold, on the magazine/shell, on the handle/pump, off-screen pouch]. */
  hand: [number, number, number, number];
  /** Handle (charging handle / slide / pump) travel 0..1 and bolt travel 0..1. */
  handle: number; bolt: number;
  /** Shotgun: shell visible in the hand, and how far it is pushed into the port (0 at the saddle, 1 home). */
  shell: number; shellIn: number;
  /** Trigger finger lifted off the trigger. */
  off: number;
}

const sm = (t: number) => t * t * t * (t * (t * 6 - 15) + 10); // smootherstep
const seg = (t: number, a: number, b: number) => (b <= a ? (t >= b ? 1 : 0) : Math.min(1, Math.max(0, (t - a) / (b - a))));
const ease = (t: number, a: number, b: number) => sm(seg(t, a, b));
/** Out-and-back pulse between a and b peaking at the middle. */
const pulse = (t: number, a: number, b: number) => Math.sin(Math.PI * seg(t, a, b));

export function beats(id: WeaponId, empty: boolean): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const b of (RELOADS[id] as { tactical: ReloadBeat[]; empty: ReloadBeat[] })[empty ? 'empty' : 'tactical']) (out[b.name] ??= []).push(b.at);
  return out;
}

const Z: V3 = [0, 0, 0];
export function idleFrame(): ReloadFrame { return { gunP: [...Z], gunR: [...Z], magP: [...Z], magR: [...Z], magOn: true, hand: [1, 0, 0, 0], handle: 0, bolt: 0, shell: 0, shellIn: 0, off: 0 }; }

/** Magazine-fed weapons (rifles, carbine, SMG, DMR, pistol). `pistol` lifts the gun instead of rolling it. */
function magReload(t: number, B: Record<string, number[]>, empty: boolean, pistol: boolean, f: ReloadFrame) {
  const r = B.release[0], o = B.out[0], fe = B.fetch[0], i = B.in[0], s = B.seat[0], k = B.bolt?.[0] ?? 1;
  const end = empty ? Math.min(1, k + 0.17) : 1;
  // The weapon rolls toward the support hand and tips up for the swap, then settles.
  const tilt = ease(t, 0, r) * (1 - ease(t, empty ? k + 0.04 : s + 0.06, end));
  if (pistol) { f.gunP = [-0.05 * tilt, 0.035 * tilt, 0.03 * tilt]; f.gunR = [0.32 * tilt, 0.25 * tilt, 0.15 * tilt]; }
  else { f.gunP = [-0.07 * tilt, 0.03 * tilt, -0.03 * tilt]; f.gunR = [0.36 * tilt, 0.05 * tilt, -0.55 * tilt]; }
  // Seating knocks the weapon up a little.
  const knock = pulse(t, s, s + 0.06);
  f.gunR[0] += 0.06 * knock; f.gunP[1] += 0.008 * knock;
  // Magazine path: out along its axis, away and down out of view; back up from below, aligned, in short, seated.
  const drop = ease(t, o, o + (fe - o) * 0.7), rise = ease(t, fe, i - 0.05), insert = ease(t, i - 0.05, i), slam = ease(t, i + (s - i) * 0.5, s);
  const draw = ease(t, r, o);
  let y = -0.1 * draw, z = 0, rx = 0, rz = 0, x = 0;
  // The spent magazine falls straight out of the well and out of frame; then, hidden, its bone waits at the lower left
  // where the support hand takes the fresh one from the vest.
  const fall = ease(t, o, o + (fe - o) * 0.3), gone = o + (fe - o) * 0.3;
  if (t >= o && t < gone) { y += -0.42 * fall * fall; rx = -0.12 * fall; }
  else if (t >= gone && t < fe) { y += -0.17 * drop; x = -0.13 * drop; z = 0.05 * drop; rz = 0.95 * drop; rx = -0.35 * drop; }
  if (t >= fe) {
    const away = 1 - rise;
    y = -0.07 * (1 - insert) - 0.012 * insert * (1 - slam) - 0.17 * away; x = -0.13 * away; z = 0.05 * away; rz = 0.95 * away; rx = -0.35 * away + 0.15 * (1 - insert) * rise;
    // A short wind-up before the slam.
    if (t > i && t < s) y -= 0.006 * pulse(t, i, i + (s - i) * 0.5);
  }
  // Seated, then a short downward tug to check it.
  if (t >= s) { y = 0.0015 * pulse(t, s, s + 0.03) - 0.0045 * pulse(t, s + 0.035, s + 0.075); x = z = rx = rz = 0; }
  f.magP = [x, y, z]; f.magR = [rx, 0, rz];
  // The spent magazine is let go at the frame edge and the fresh one comes up from the vest in the same place.
  f.magOn = !(t > gone && t < fe);
  // Support hand: from the hold to the magazine by the release, with it until seated, then home or to the handle.
  // The hand lets the spent magazine fall (back toward the handguard for a moment), then goes for the fresh one.
  const letGo = pulse(t, o, gone + (fe - gone) * 0.4);
  const toMag = ease(t, 0, r * 0.95), offMag = ease(t, s + 0.08, s + 0.14);
  let hold = 1 - toMag + toMag * letGo * 0.85, mag = toMag * (1 - offMag) * (1 - letGo * 0.85), handle = 0;
  if (empty) {
    const toHandle = ease(t, s + 0.02, k - 0.03), offHandle = ease(t, k + 0.05, end);
    handle = toHandle * (1 - offHandle); hold = offHandle; mag = toMag * (1 - toHandle);
  } else hold += offMag;
  // While the magazine is out of view the hand is with it (the pouch is the magazine's own away path).
  f.hand = [hold, mag, handle, 0];
  // Empty: the bolt was locked back; pull the handle (or slide), release, bolt slams forward.
  // Empty: the bolt was locked back until the support palm slaps the catch at the beat.
  if (empty) { f.bolt = t < k ? 1 : 0; f.gunR[2] += 0.05 * pulse(t, k, k + 0.05); }
  f.off = ease(t, 0, 0.08) * (1 - ease(t, end - 0.08, end));
}

/** Shotgun: shells one by one from the saddle into the loading port; an empty gun gets one through the ejection port and
 * a pump first. */
function shellReload(t: number, B: Record<string, number[]>, f: ReloadFrame) {
  const shells = B.shell ?? [], pump = B.pump?.[0];
  const tilt = ease(t, 0, 0.1) * (1 - ease(t, 0.9, 1));
  f.gunP = [-0.06 * tilt, 0.03 * tilt, -0.03 * tilt]; f.gunR = [0.3 * tilt, 0.05 * tilt, -0.75 * tilt];
  f.off = ease(t, 0, 0.06) * (1 - ease(t, 0.92, 1));
  let shell = 0, shellIn = 0, onShell = 0;
  for (const at of shells) {
    // Hand leaves for the saddle ~0.11 before the beat, pushes the shell home at the beat, and comes back.
    const a = at - 0.11, b = at + 0.02;
    if (t >= a && t <= b + 0.03) { onShell = Math.max(onShell, Math.min(seg(t, a, a + 0.03), 1 - seg(t, b, b + 0.03))); shell = 1; shellIn = ease(t, at - 0.05, at); }
  }
  let handle = 0;
  if (pump !== undefined) { const p = pulse(t, pump - 0.06, pump + 0.04); handle = p; f.bolt = p; }
  f.shell = shell; f.shellIn = shellIn;
  // The shell travels from the side saddle (left of the receiver) to the loading port underneath.
  f.magP = [-0.035 * (1 - shellIn), 0.035 * (1 - shellIn), 0.05 * (1 - shellIn)];
  f.hand = [1 - onShell, onShell, 0, 0];
  f.handle = handle;
}

/** Evaluates a reload at progress t (0..1). */
export function reloadFrame(id: WeaponId, t: number, empty: boolean, out = idleFrame()): ReloadFrame {
  const f = Object.assign(out, idleFrame());
  const B = beats(id, empty);
  if (id === 'shotgun') shellReload(t, B, f);
  else magReload(t, B, empty, id === 'pistol', f);
  return f;
}
export const _test = { sm, seg, pulse };
export type { V3 };
export const tmpEuler = new THREE.Euler();
