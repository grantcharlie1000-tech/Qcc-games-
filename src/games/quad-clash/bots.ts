/** Bot brains. Each bot perceives with line of sight, reacts after a skill-based delay, aims with drifting error,
 * strafes while fighting and paths around the arena on the nav grid. Bots press the same buttons the player does. */
import { BODY, SKILL, WEAPONS, type BotSkill, type PrimaryId } from './config';
import { findPath, navFor, nearestNode, randomNode, type Nav } from './nav';
import { clearLine } from './physics';
import { enemies, eyeY, idleIntent, lookAt, random, weaponOf, wrapAngle, type Fighter, type Intent, type Match } from './state';
import { inZone, mapOf, step, worldFor } from './sim';

export interface Ai {
  target: number;
  seenAt: number;
  visible: boolean;
  lastX: number; lastY: number; lastZ: number; lastSeen: number;
  aimHead: boolean;
  ex: number; ey: number; errUntil: number;
  path: number[]; pathI: number; goal: number; repathAt: number;
  thinkAt: number;
  strafe: number; strafeUntil: number;
  stuckAt: number; sx: number; sz: number;
  trig: boolean;
  burstUntil: number;
  pauseUntil: number;
  jumpCool: number;
  wantJump: boolean;
  grenadeCool: number;
  role: 'hunter' | 'holder';
  /** Testing only: stand still and do nothing. */
  frozen?: boolean;
}

export function createAi(id: number): Ai {
  return {
    target: -1, seenAt: 0, visible: false, lastX: 0, lastY: 0, lastZ: 0, lastSeen: -99, aimHead: false, ex: 0, ey: 0, errUntil: 0,
    path: [], pathI: 0, goal: -1, repathAt: 0, thinkAt: 0, strafe: 1, strafeUntil: 0, stuckAt: 0, sx: 0, sz: 0, trig: false, burstUntil: 0, pauseUntil: 0,
    jumpCool: 0, wantJump: false, grenadeCool: 0, role: id % 3 === 0 ? 'hunter' : 'holder',
  };
}

const IDEAL: Record<PrimaryId | 'pencil', number> = { detention: 5, recess: 11, bell: 17, triple: 20, hallpass: 26, valedictorian: 38, firedrill: 15, pencil: 12 };
const gauss = (m: Match) => (random(m) + random(m) + random(m) - 1.5) / 1.5;

/** Can `f` see `g`? Checks head and chest from the eye. */
function sees(m: Match, f: Fighter, g: Fighter): boolean {
  const w = worldFor(m), ey = eyeY(f);
  return clearLine(w, f.x, ey, f.z, g.x, g.y + 1.42, g.z) || clearLine(w, f.x, ey, f.z, g.x, g.y + 0.9, g.z);
}

function perceive(m: Match, f: Fighter, ai: Ai) {
  let best: Fighter | null = null, bestD = Infinity;
  for (const g of m.fighters) {
    if (!g.alive || !enemies(m, f, g)) continue;
    const dx = g.x - f.x, dz = g.z - f.z, d = Math.hypot(dx, dz, g.y - f.y);
    if (d > 65) continue;
    const facing = Math.abs(wrapAngle(Math.atan2(-dx, -dz) - f.yaw)) < 0.9;
    const hurtBy = f.lastAttacker === g.id && m.t - f.lastHurt < 1.6;
    if (!facing && !hurtBy && d > 7) continue;
    if (!sees(m, f, g)) continue;
    // Stick with the current target unless a new one is much closer.
    const score = d * (g.id === ai.target ? 0.7 : 1) * (hurtBy ? 0.6 : 1);
    if (score < bestD) { bestD = score; best = g; }
  }
  if (best) {
    if (best.id !== ai.target || !ai.visible) {
      if (best.id !== ai.target || m.t - ai.lastSeen > 1.2) ai.seenAt = m.t;
      ai.target = best.id;
      ai.aimHead = random(m) < skillOf(m).headChance;
    }
    ai.visible = true;
    ai.lastX = best.x; ai.lastY = best.y; ai.lastZ = best.z; ai.lastSeen = m.t;
  } else ai.visible = false;
}

const skillOf = (m: Match): BotSkill => SKILL[m.settings.difficulty];

function pathTo(m: Match, nav: Nav, f: Fighter, ai: Ai, goal: number) {
  const start = nearestNode(nav, f.x, f.y, f.z);
  if (!start) { ai.path = []; return; }
  ai.goal = goal;
  ai.path = findPath(nav, start.id, goal);
  ai.pathI = Math.min(1, ai.path.length - 1);
  ai.repathAt = m.t + 2.5 + random(m);
}

function chooseGoal(m: Match, nav: Nav, f: Fighter, ai: Ai): number {
  const map = mapOf(m);
  if (m.settings.mode === 'quad' && (ai.role === 'holder' || random(m) < 0.5) && !inZone(m, f)) {
    const z = map.zones[m.zoneIndex];
    const a = random(m) * Math.PI * 2, r = random(m) * z.r * 0.6;
    const n = nearestNode(nav, z.x + Math.cos(a) * r, z.y + 0.2, z.z + Math.sin(a) * r, true);
    if (n) return n.id;
  }
  const wpn = WEAPONS[f.primary];
  if (f.reserve < wpn.mag && f.slot === 0) {
    let best = -1, bestD = Infinity;
    for (const p of m.pickups) {
      if (!p.active || p.kind !== 'ammo') continue;
      const d = Math.hypot(p.x - f.x, p.z - f.z);
      if (d < bestD) { const n = nearestNode(nav, p.x, p.y + 0.2, p.z, true); if (n) { bestD = d; best = n.id; } }
    }
    if (best >= 0) return best;
  }
  if (m.t - ai.lastSeen < 5 && ai.target >= 0) {
    const n = nearestNode(nav, ai.lastX, ai.lastY + 0.2, ai.lastZ, true);
    if (n) return n.id;
  }
  // Hunt: head toward a random living enemy's area, or roam.
  const foes = m.fighters.filter(g => g.alive && enemies(m, f, g));
  if (foes.length && random(m) < 0.7) {
    const g = foes[Math.floor(random(m) * foes.length)];
    const n = nearestNode(nav, g.x + (random(m) - 0.5) * 8, g.y + 0.2, g.z + (random(m) - 0.5) * 8, true);
    if (n) return n.id;
  }
  return randomNode(nav, random(m)).id;
}

/** Turns toward a desired angle by at most `rate` radians. */
const turn = (from: number, to: number, rate: number) => { const d = wrapAngle(to - from); return from + Math.max(-rate, Math.min(rate, d)); };

/** World-space movement wish converted to local forward/right for the fighter's yaw. */
function local(intent: Intent, yaw: number, wx: number, wz: number) {
  const s = Math.sin(yaw), c = Math.cos(yaw);
  intent.mz = -s * wx - c * wz;
  intent.mx = c * wx - s * wz;
}

export function think(m: Match, f: Fighter, ai: Ai, dt: number): Intent {
  const intent = idleIntent(f.yaw, f.pitch);
  if (!f.alive) { ai.path = []; ai.target = -1; ai.visible = false; return intent; }
  if (ai.frozen) return intent;
  const skill = skillOf(m), nav = navFor(worldFor(m)), wpn = weaponOf(f);
  if (m.t >= ai.thinkAt) { ai.thinkAt = m.t + 0.12 + random(m) * 0.05; perceive(m, f, ai); }
  const target = ai.target >= 0 ? m.fighters[ai.target] : null;
  const engaged = ai.visible && target && target.alive;
  let wantYaw = f.yaw, wantPitch = 0, wx = 0, wz = 0;

  if (engaged && target) {
    const tracking = m.t - ai.seenAt;
    if (m.t >= ai.errUntil) { ai.ex = gauss(m) * skill.aimError; ai.ey = gauss(m) * skill.aimError * 0.7; ai.errUntil = m.t + 0.35 + random(m) * 0.3; }
    const settle = 0.6 + 0.8 / (1 + tracking * 1.5);
    const dist = Math.hypot(target.x - f.x, target.z - f.z);
    let ax = target.x, ay = target.y + (ai.aimHead ? 1.42 : 0.95), az = target.z;
    if (wpn.kind === 'rocket') { const lead = dist / (wpn.rocketSpeed ?? 30); ax += target.vx * lead; az += target.vz * lead; ay = target.y + 0.35; }
    const aim = lookAt(f.x, eyeY(f), f.z, ax, ay, az);
    wantYaw = aim.yaw + ai.ex * settle; wantPitch = aim.pitch + ai.ey * settle;
    // Fighting movement: hold the weapon's preferred range and strafe.
    const ideal = IDEAL[f.slot === 0 ? f.primary : 'pencil'];
    const tx = (target.x - f.x) / (dist || 1), tz = (target.z - f.z) / (dist || 1);
    const approach = dist > ideal * 1.25 ? 1 : dist < ideal * 0.55 ? -0.7 : 0;
    if (m.t >= ai.strafeUntil) { ai.strafe = random(m) < 0.5 ? -1 : 1; ai.strafeUntil = m.t + 0.5 + random(m) * 1.1; }
    const close = wpn.id === 'detention' || wpn.id === 'recess';
    const strafe = wpn.id === 'valedictorian' && f.ads ? 0.25 : close && dist > ideal ? 0.45 : 0.85;
    wx = tx * approach + -tz * ai.strafe * strafe; wz = tz * approach + tx * ai.strafe * strafe;
    if (m.settings.difficulty !== 'easy' && random(m) < 0.006) ai.wantJump = true;
    // Shoot once the bot has reacted and its aim is on target.
    const err = Math.abs(wrapAngle(wantYaw - f.yaw)) + Math.abs(wantPitch - f.pitch);
    const size = Math.atan2(0.5, Math.max(1, dist));
    const ready = tracking >= skill.react && err < skill.fireTolerance + size && dist < wpn.range * 0.9;
    if (ready && f.mag[f.slot] > 0) {
      if (wpn.auto) {
        // Controlled bursts: fire for a moment, then let the spread settle.
        if (m.t >= ai.pauseUntil && ai.burstUntil < m.t) ai.burstUntil = m.t + 0.3 + random(m) * 0.5;
        if (m.t < ai.burstUntil) intent.fire = true;
        else if (ai.pauseUntil < ai.burstUntil) ai.pauseUntil = m.t + 0.2 + random(m) * 0.35;
      }
      else { ai.trig = !ai.trig; intent.fire = ai.trig; }
    }
    intent.ads = (wpn.zoom >= 1.45 && dist > 13) || wpn.id === 'valedictorian';
    if (f.grenades > 0 && dist > 7 && dist < 22 && m.t >= ai.grenadeCool && random(m) < skill.grenadeChance * dt * 6) {
      intent.grenade = true;
      wantPitch = aim.pitch + 0.12 + dist * 0.012;
      ai.grenadeCool = m.t + 6;
    }
    ai.path = [];
  } else {
    // Navigate.
    if (!ai.path.length || ai.pathI >= ai.path.length || m.t >= ai.repathAt) pathTo(m, nav, f, ai, chooseGoal(m, nav, f, ai));
    if (ai.path.length && ai.pathI < ai.path.length) {
      let node = nav.nodes[ai.path[ai.pathI]];
      if (Math.hypot(node.x - f.x, node.z - f.z) < 0.55 && Math.abs(node.y - f.y) < 0.7) {
        ai.pathI++;
        if (ai.pathI < ai.path.length) node = nav.nodes[ai.path[ai.pathI]];
      }
      // Look a couple of nodes ahead for smoother turns.
      const ahead = nav.nodes[ai.path[Math.min(ai.path.length - 1, ai.pathI + 2)]];
      const dx = node.x - f.x, dz = node.z - f.z, d = Math.hypot(dx, dz) || 1;
      wx = dx / d; wz = dz / d;
      if (node.y > f.y + BODY.step - 0.05 && d < 1.7 && f.grounded) ai.wantJump = true;
      const look = lookAt(f.x, 0, f.z, ahead.x, 0, ahead.z);
      wantYaw = d > 0.2 ? look.yaw : f.yaw;
      wantPitch = 0;
      // Glance toward where an enemy was last seen.
      if (m.t - ai.lastSeen < 3) wantYaw = lookAt(f.x, 0, f.z, ai.lastX, 0, ai.lastZ).yaw;
    }
    if (f.mag[f.slot] < wpn.mag * 0.5 && m.t - ai.lastSeen > 1) intent.reload = true;
  }
  if (f.slot === 0 && f.mag[0] === 0 && f.reserve === 0) intent.slot = 1;
  else if (f.slot === 1 && (f.reserve > 0 || f.mag[0] > 0) && !engaged) intent.slot = 0;
  // Stuck detection: if barely moving while trying to, hop and pick a new route.
  if (m.t >= ai.stuckAt) {
    const moved = Math.hypot(f.x - ai.sx, f.z - ai.sz);
    if (moved < 0.35 && (wx || wz)) { ai.wantJump = true; ai.strafe = -ai.strafe; ai.repathAt = m.t; }
    ai.sx = f.x; ai.sz = f.z; ai.stuckAt = m.t + 0.8;
  }
  const rate = skill.turn * dt * (engaged ? 1 : 0.8);
  intent.yaw = turn(f.yaw, wantYaw, rate);
  intent.pitch = f.pitch + Math.max(-rate, Math.min(rate, wantPitch - f.pitch));
  local(intent, intent.yaw, wx, wz);
  if (ai.wantJump && m.t >= ai.jumpCool && f.grounded) { intent.jump = true; ai.jumpCool = m.t + 0.6; }
  ai.wantJump = false;
  return intent;
}

/** One fixed step with every bot thinking first. `player` drives fighter 0 (a bot brain drives it when `autopilot`). */
export function stepWithBots(m: Match, ais: Ai[], dt: number, player: Intent | undefined, autopilot = false) {
  const intents: (Intent | undefined)[] = [];
  for (const f of m.fighters) intents.push(f.id === 0 && !autopilot ? player : think(m, f, ais[f.id], dt));
  step(m, dt, intents);
}
