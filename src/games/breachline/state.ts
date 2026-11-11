/** Shared match state, and the per-fighter controller that every device runs for its own fighter (and the host runs
 * for bots): movement, stance, lean and weapon handling. It turns an Intent into Commands for the host to judge. */
import { ATK, DEF, KITS, MOVE, WEAPONS, type Role, type SkillId, type WeaponId } from './config';
import { bodyHeight, eyeOf, moveBody, viewDir, type Bounds, type World } from './world';

export type Phase = 'lobby' | 'prep' | 'action' | 'planted' | 'end' | 'over';
export const ACT = { none: 0, plant: 1, defuse: 2, reinforce: 3, barricade: 4, charge: 5 } as const;
export type ActId = typeof ACT[keyof typeof ACT];

export interface Player {
  id: number;
  squad: 0 | 1;
  name: string;
  bot: boolean;
  /** Room id of the person in this seat; '' for a bot. */
  owner: string;
  kit: number;
  alive: boolean;
  hp: number;
  x: number; z: number; vx: number; vz: number;
  yaw: number; pitch: number;
  /** 0 standing to 1 crouched, and -1 left to 1 right. */
  crouch: number; lean: number;
  crouching: boolean; ads: boolean; sprint: boolean;
  /** 0 to 1 share of walking speed, for footsteps and animation. */
  pace: number;
  slot: 0 | 1;
  mag: [number, number]; reserve: [number, number];
  cool: number; reload: number; swap: number; bloom: number; adsT: number; meleeCool: number; throwCool: number;
  trigger: boolean; using: boolean;
  charges: number; grenades: number; reinforcements: number;
  act: ActId; actT: number; actTarget: number;
  kills: number; deaths: number; score: number;
  /** Host bookkeeping: rate limits, the movement allowance for pose reports, and a seat nobody fills. */
  lastShot: number; actX: number; actZ: number; poseAt: number;
  shotTokens: number; shotAt: number; lastMelee: number; lastReload: number; slack: number; gone: boolean;
}

export interface Grenade { id: number; kind: 'frag' | 'impact'; by: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; fuse: number }
export interface Charge { id: number; by: number; panel: number; u: number; y: number; side: 1 | -1; age: number }
export interface Device { site: 0 | 1; x: number; z: number; by: number }
export interface MatchConfig { teamSize: number; bots: boolean; skill: SkillId }

export interface Match {
  world: World;
  cfg: MatchConfig;
  players: Player[];
  phase: Phase;
  /** Seconds left in the phase. */
  t: number;
  time: number;
  tick: number;
  round: number;
  wins: [number, number];
  /** The squad attacking this round. */
  attackers: 0 | 1;
  spawn: number;
  device: Device | null;
  roundWinner: -1 | 0 | 1;
  reason: EndReason;
  winner: -1 | 0 | 1;
  grenades: Grenade[];
  charges: Charge[];
  nextId: number;
  events: SimEvent[];
  rng: number;
}
export type EndReason = '' | 'eliminated' | 'time' | 'uplink' | 'defused';

export type Aim = { x: number; y: number; z: number; yaw: number; pitch: number };
export type Command =
  | ({ c: 'shot'; w: WeaponId; spread: number; seed: number } & Aim)
  | ({ c: 'melee' } & Aim)
  | ({ c: 'nade' } & Aim)
  | ({ c: 'breach' } & Aim)
  | ({ c: 'use'; on: boolean } & Aim)
  | { c: 'reload' }
  | { c: 'kit'; kit: number };

export type SimEvent =
  | { e: 'phase'; phase: Phase; round: number; attackers: 0 | 1; wins: [number, number]; spawn: number; winner: -1 | 0 | 1; reason: EndReason }
  | { e: 'spawn'; at: [number, number, number, number][] }
  | { e: 'shot'; id: number; w: WeaponId; x: number; y: number; z: number; yaw: number; pitch: number; spread: number; seed: number }
  | { e: 'cells'; p: number; c: number[]; cause: 0 | 1 | 2 }
  | { e: 'panel'; p: number; s: 1 | 2; by: number }
  | { e: 'hit'; by: number; on: number; dmg: number; head: boolean; hp: number }
  | { e: 'kill'; by: number; on: number; w: string; head: boolean }
  | { e: 'melee'; id: number }
  | { e: 'throw'; id: number; kind: 'frag' | 'impact' }
  | { e: 'bounce'; x: number; y: number; z: number }
  | { e: 'boom'; kind: 'frag' | 'impact' | 'charge'; x: number; y: number; z: number }
  | { e: 'charge'; id: number; by: number; p: number; u: number; y: number; side: 1 | -1 }
  | { e: 'chargeOff'; id: number }
  | { e: 'plant'; by: number; site: 0 | 1; x: number; z: number }
  | { e: 'defused'; by: number }
  | { e: 'reload'; id: number }
  | { e: 'kit'; id: number; kit: number }
  | { e: 'fix'; id: number; x: number; z: number };

export interface Intent {
  mx: number; mz: number; yaw: number; pitch: number;
  fire: boolean; ads: boolean; crouch: boolean; sprint: boolean; lean: -1 | 0 | 1;
  /** Held: plant, defuse, reinforce or barricade, whichever applies. */
  use: boolean;
  /** One-step edges. */
  reload: boolean; swap: boolean; slot: -1 | 0 | 1; melee: boolean; grenade: boolean; breach: boolean;
}
export const idleIntent = (yaw = 0, pitch = 0): Intent => ({ mx: 0, mz: 0, yaw, pitch, fire: false, ads: false, crouch: false, sprint: false, lean: 0, use: false, reload: false, swap: false, slot: -1, melee: false, grenade: false, breach: false });

export const roleOf = (m: { attackers: 0 | 1 }, p: { squad: 0 | 1 }): Role => (p.squad === m.attackers ? ATK : DEF);
export const kitOf = (m: { attackers: 0 | 1 }, p: Player) => KITS[roleOf(m, p)][p.kit] ?? KITS[roleOf(m, p)][0];
export const weaponIdOf = (m: { attackers: 0 | 1 }, p: Player): WeaponId => (p.slot === 0 ? kitOf(m, p).primary : 'pistol');
export const weaponOf = (m: { attackers: 0 | 1 }, p: Player) => WEAPONS[weaponIdOf(m, p)];
export const aimOf = (p: Player): Aim => { const e = eyeOf(p); return { x: e.x, y: e.y, z: e.z, yaw: p.yaw, pitch: p.pitch }; };

export function newPlayer(id: number, squad: 0 | 1, name: string, bot: boolean, owner = ''): Player {
  return {
    id, squad, name, bot, owner, kit: bot ? id % 3 : 1, alive: false, hp: 100, x: 0, z: 0, vx: 0, vz: 0, yaw: 0, pitch: 0, crouch: 0, lean: 0,
    crouching: false, ads: false, sprint: false, pace: 0, slot: 0, mag: [0, 0], reserve: [0, 0], cool: 0, reload: 0, swap: 0, bloom: 0, adsT: 0, meleeCool: 0, throwCool: 0,
    trigger: false, using: false, charges: 0, grenades: 0, reinforcements: 0, act: ACT.none, actT: 0, actTarget: -1, kills: 0, deaths: 0, score: 0, lastShot: -1, actX: 0, actZ: 0, poseAt: 0,
    shotTokens: 1, shotAt: 0, lastMelee: -9, lastReload: -9, slack: 0.5, gone: false,
  };
}
/** Fresh weapons and gadgets for the fighter's current role and kit. */
export function equip(m: { attackers: 0 | 1 }, p: Player) {
  const kit = kitOf(m, p), primary = WEAPONS[kit.primary], side = WEAPONS.pistol;
  p.slot = 0; p.mag = [primary.mag, side.mag]; p.reserve = [primary.reserve, side.reserve];
  p.cool = p.reload = p.swap = p.bloom = p.adsT = p.meleeCool = p.throwCool = 0; p.trigger = false; p.using = false;
  p.charges = kit.charges; p.grenades = kit.grenades; p.reinforcements = kit.reinforcements;
}

/** Fighters who may not walk right now: the dead, attackers during preparation, anyone between rounds or mid-action. */
export function frozen(m: Match, p: Player): boolean {
  return !p.alive || p.act !== ACT.none || m.phase === 'end' || m.phase === 'over' || m.phase === 'lobby' || (m.phase === 'prep' && roleOf(m, p) === ATK);
}
export function mayFire(m: Match, p: Player): boolean {
  return p.alive && p.act === ACT.none && (m.phase === 'action' || m.phase === 'planted' || (m.phase === 'prep' && roleOf(m, p) === DEF));
}
export const living = (m: Match, squad: 0 | 1) => m.players.reduce((n, p) => n + (p.alive && p.squad === squad ? 1 : 0), 0);

export function nextRandom(m: { rng: number }): number {
  let t = (m.rng = (m.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
/** The projectile directions of one trigger pull. Every device derives the same pattern from the seed. */
export function shotDirs(yaw: number, pitch: number, spread: number, pellets: number, seed: number): { x: number; y: number; z: number }[] {
  const f = viewDir(yaw, pitch), cy = Math.cos(yaw), sy = Math.sin(yaw);
  const ux = sy * f.y, uy = -sy * f.x - cy * f.z, uz = cy * f.y, state = { rng: seed | 0 }, out = [];
  for (let i = 0; i < pellets; i++) {
    const r = Math.tan(Math.sqrt(nextRandom(state)) * spread), a = nextRandom(state) * Math.PI * 2, rc = r * Math.cos(a), rs = r * Math.sin(a);
    const x = f.x + cy * rc + ux * rs, y = f.y + uy * rs, z = f.z - sy * rc + uz * rs, l = Math.hypot(x, y, z);
    out.push({ x: x / l, y: y / l, z: z / l });
  }
  return out;
}

const approach = (v: number, target: number, step: number) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));

/** Advances one fighter by one step from its intent. Returns the commands the host must judge. `pen` keeps defenders
 * inside the building during preparation. */
export function control(m: Match, p: Player, it: Intent, dt: number, out: Command[], pen?: Bounds | null): void {
  if (!p.alive) { p.vx = p.vz = 0; p.pace = 0; p.trigger = false; return; }
  const world = m.world, lock = frozen(m, p), def = weaponOf(m, p);
  p.yaw = it.yaw; p.pitch = Math.max(-1.45, Math.min(1.45, it.pitch));
  p.crouching = it.crouch;
  p.crouch = approach(p.crouch, it.crouch ? 1 : 0, MOVE.stanceRate * dt);
  const moving = !lock && (it.mx !== 0 || it.mz !== 0);
  p.sprint = moving && it.sprint && it.mz > 0.3 && !it.ads && !it.crouch && p.reload <= 0;
  p.lean = approach(p.lean, p.sprint ? 0 : it.lean, MOVE.leanRate * dt);
  p.ads = it.ads && !p.sprint && p.reload <= 0 && p.swap <= 0 && !lock;
  p.adsT = approach(p.adsT, p.ads ? 1 : 0, dt / 0.2);

  // Movement.
  let wx = 0, wz = 0;
  if (moving) {
    const len = Math.max(1, Math.hypot(it.mx, it.mz)), fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    const speed = (p.sprint ? MOVE.sprint : it.crouch ? MOVE.crouch : p.ads ? MOVE.ads : MOVE.walk) * def.speed;
    wx = (fx * it.mz + rx * it.mx) / len * speed; wz = (fz * it.mz + rz * it.mx) / len * speed;
  }
  const dvx = wx - p.vx, dvz = wz - p.vz, dv = Math.hypot(dvx, dvz), step = MOVE.accel * dt;
  if (dv <= step) { p.vx = wx; p.vz = wz; } else { p.vx += dvx / dv * step; p.vz += dvz / dv * step; }
  if (p.vx || p.vz) {
    const ox = p.x, oz = p.z;
    moveBody(world, p, p.vx * dt, p.vz * dt, bodyHeight(p.crouch));
    if (pen) { p.x = Math.max(pen.x0, Math.min(pen.x1, p.x)); p.z = Math.max(pen.z0, Math.min(pen.z1, p.z)); }
    // Speed is what was actually covered, so running into a wall is quiet.
    p.pace = Math.min(1.6, Math.hypot(p.x - ox, p.z - oz) / dt / MOVE.walk);
  } else p.pace = 0;

  // Weapon timers.
  p.cool = Math.max(0, p.cool - dt); p.meleeCool = Math.max(0, p.meleeCool - dt); p.throwCool = Math.max(0, p.throwCool - dt);
  p.bloom = Math.max(0, p.bloom - dt * 0.09);
  if (p.swap > 0) p.swap = Math.max(0, p.swap - dt);
  if (p.reload > 0) {
    p.reload -= dt;
    if (p.reload <= 0) {
      p.reload = 0;
      const need = def.mag - p.mag[p.slot], take = Math.min(need, p.reserve[p.slot]);
      p.mag[p.slot] += take; p.reserve[p.slot] -= take;
    }
  }
  const wantSlot = it.slot >= 0 ? it.slot : it.swap ? (p.slot ? 0 : 1) : -1;
  if (wantSlot >= 0 && wantSlot !== p.slot) { p.slot = wantSlot as 0 | 1; p.swap = 0.42; p.reload = 0; p.cool = Math.max(p.cool, 0.1); p.trigger = it.fire; return; }
  const can = mayFire(m, p), aim = aimOf(p);
  if (it.use !== p.using) { p.using = it.use; out.push({ c: 'use', on: it.use, ...aim }); }
  if (!can) { p.trigger = it.fire; return; }
  if (it.reload && p.reload <= 0 && p.swap <= 0 && p.mag[p.slot] < def.mag && p.reserve[p.slot] > 0) { p.reload = def.reload; out.push({ c: 'reload' }); }
  if (it.melee && p.meleeCool <= 0 && p.swap <= 0) { p.meleeCool = 0.75; p.cool = Math.max(p.cool, 0.5); p.reload = 0; out.push({ c: 'melee', ...aim }); }
  if (it.grenade && p.throwCool <= 0 && p.grenades > 0) { p.throwCool = 0.9; p.cool = Math.max(p.cool, 0.45); out.push({ c: 'nade', ...aim }); }
  if (it.breach && p.throwCool <= 0) { p.throwCool = 0.35; out.push({ c: 'breach', ...aim }); }
  const pull = it.fire && (def.auto || !p.trigger);
  p.trigger = it.fire;
  if (pull && p.cool <= 0 && p.reload <= 0 && p.swap <= 0 && !p.sprint) {
    if (p.mag[p.slot] > 0) {
      p.mag[p.slot]--; p.cool = def.interval;
      const spread = def.hip + (def.ads - def.hip) * p.adsT + def.moveSpread * Math.min(1, p.pace) * (1 - 0.5 * p.adsT) + p.bloom * (1 - 0.6 * p.adsT) - (p.crouching ? def.hip * 0.2 * (1 - p.adsT) : 0);
      p.bloom = Math.min(0.06, p.bloom + def.bloom);
      out.push({ c: 'shot', w: def.id, spread: Math.max(0, spread), seed: (Math.floor(nextRandom(m) * 0x7fffffff) ^ (p.id * 7919)) | 0, ...aim });
    } else if (p.reserve[p.slot] > 0) { p.reload = def.reload; out.push({ c: 'reload' }); }
  }
}

