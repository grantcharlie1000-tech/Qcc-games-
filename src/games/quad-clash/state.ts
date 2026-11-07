/** Quad Clash match state types and small shared helpers. Everything here is plain data so a match can be saved. */
import { BODY, WEAPONS, type Difficulty, type ModeId, type PrimaryId, type Weapon, type WeaponId } from './config';
import type { MapId } from './map';
import type { Body } from './physics';

/** What one fighter wants to do this step. Look angles are absolute; buttons are held, except the edge actions
 * (reload, swap, slot, grenade), which are true for the single step they were pressed. */
export interface Intent {
  mx: number;
  mz: number;
  jump: boolean;
  fire: boolean;
  ads: boolean;
  reload: boolean;
  swap: boolean;
  slot: -1 | 0 | 1;
  grenade: boolean;
  yaw: number;
  pitch: number;
}
export const idleIntent = (yaw = 0, pitch = 0): Intent => ({ mx: 0, mz: 0, jump: false, fire: false, ads: false, reload: false, swap: false, slot: -1, grenade: false, yaw, pitch });

export interface Fighter extends Body {
  id: number;
  name: string;
  team: number;
  bot: boolean;
  /** Index into the paint palette (FFA) or the house list (teams). */
  paint: number;
  yaw: number;
  pitch: number;
  health: number;
  alive: boolean;
  respawnAt: number;
  lastHurt: number;
  lastAttacker: number;
  primary: PrimaryId;
  nextPrimary: PrimaryId;
  slot: 0 | 1;
  mag: [number, number];
  /** Spare primary rounds. The sidearm never runs dry. */
  reserve: number;
  reloadEnd: number;
  reloadStart: number;
  nextFire: number;
  burstLeft: number;
  burstNext: number;
  bloom: number;
  trigger: boolean;
  /** When a semi-automatic press arrived too early, the time of that press (buffered briefly), else -1. */
  queued: number;
  ads: boolean;
  grenades: number;
  nextGrenade: number;
  kills: number;
  deaths: number;
  score: number;
  streak: number;
  bestStreak: number;
  shieldUntil: number;
  boostUntil: number;
  protectUntil: number;
  headshots: number;
  zoneSeconds: number;
}

export interface Projectile { kind: 'rocket' | 'grenade'; owner: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; fuse: number }
export interface Pickup { id: number; kind: 'ammo' | 'grenade'; x: number; y: number; z: number; active: boolean; respawnAt: number; dropped: boolean; expires: number }

export type SimEvent =
  | { type: 'shot'; owner: number; weapon: WeaponId }
  | { type: 'tracer'; owner: number; weapon: WeaponId; ox: number; oy: number; oz: number; tx: number; ty: number; tz: number; impact: 'world' | 'body' | 'none'; nx: number; ny: number; nz: number }
  | { type: 'hit'; target: number; attacker: number; amount: number; head: boolean; x: number; y: number; z: number; shielded: boolean }
  | { type: 'kill'; killer: number; victim: number; weapon: WeaponId | 'grenade'; head: boolean }
  | { type: 'explode'; x: number; y: number; z: number; r: number; owner: number; kind: 'rocket' | 'grenade' }
  | { type: 'throw'; owner: number }
  | { type: 'reload'; owner: number; weapon: WeaponId }
  | { type: 'dry'; owner: number }
  | { type: 'swap'; owner: number; slot: 0 | 1 }
  | { type: 'pickup'; owner: number; kind: 'ammo' | 'grenade' }
  | { type: 'streak'; owner: number; index: number }
  | { type: 'spawn'; owner: number }
  | { type: 'jump'; owner: number }
  | { type: 'land'; owner: number; speed: number }
  | { type: 'bounce'; x: number; y: number; z: number }
  | { type: 'zone'; index: number }
  | { type: 'score'; team: number }
  | { type: 'end' };

export interface MatchSettings { mode: ModeId; map: MapId; difficulty: Difficulty; primary: PrimaryId; seed: number }

export interface Match {
  version: number;
  settings: MatchSettings;
  rng: number;
  t: number;
  fighters: Fighter[];
  projectiles: Projectile[];
  pickups: Pickup[];
  nextPickupId: number;
  teamScores: [number, number];
  zoneIndex: number;
  zoneNext: number;
  zoneOwner: number;
  zoneAcc: [number, number];
  over: boolean;
  /** Fighter id (free-for-all) or house index (teams); -1 for a draw. */
  winner: number;
  events: SimEvent[];
}

export const weaponOf = (f: Fighter): Weapon => WEAPONS[f.slot === 0 ? f.primary : 'pencil'];
export const eyeY = (f: Fighter) => f.y + BODY.eye;

/** Unit view direction for a yaw/pitch pair: yaw 0 looks toward -z, positive yaw turns left (toward -x). */
export function viewDir(yaw: number, pitch: number, out: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }) {
  const c = Math.cos(pitch);
  out.x = -Math.sin(yaw) * c;
  out.y = Math.sin(pitch);
  out.z = -Math.cos(yaw) * c;
  return out;
}
/** Yaw and pitch that look from one point to another. */
export function lookAt(ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
}
export const wrapAngle = (a: number) => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };

/** Seeded mulberry32 over the match's rng word; returns [0, 1). */
export function random(m: Match): number {
  m.rng = (m.rng + 0x6d2b79f5) >>> 0;
  let t = m.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const enemies = (a: Fighter, b: Fighter) => a.id !== b.id && a.team !== b.team;
