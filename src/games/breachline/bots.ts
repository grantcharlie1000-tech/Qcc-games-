/** Bots. They see through the same sight lines, walk the same collision and send the same commands as people.
 * Defenders set up a site (reinforce, barricade), hold angles and go for the defuse; attackers pick a site, break
 * barricades by hand, breach soft walls with charges, plant and guard. All randomness comes from the match seed. */
import { ATK, BOT_SKILL, CHARGE, DEF } from './config';
import { MAP, siteAt, type Post } from './map';
import { blocker, cellX, cellZ, createNav, crossing, route, type Nav } from './nav';
import { command, drive, interaction } from './sim';
import { ACT, aimOf, idleIntent, nextRandom, roleOf, weaponOf, type Intent, type Match, type Player } from './state';
import { clearLine, eyeHeight, eyeOf, panelCenter, panelPoint, viewDir, type Panel } from './world';

interface Job { kind: 'reinforce' | 'barricade'; panel: number; x: number; z: number }
interface Mind {
  path: number[] | null; step: number; pathGoalX: number; pathGoalZ: number; repath: number; version: number;
  goalX: number; goalZ: number;
  target: number; reactAt: number; seenAt: number; knownX: number; knownZ: number; knownAt: number; head: boolean;
  yaw: number; pitch: number; errYaw: number; errPitch: number; errAt: number;
  burstEnd: number; restEnd: number; semiAt: number;
  post: Post | null; jobs: Job[]; jobSince: number; stage: { x: number; z: number } | null;
  stuckAt: number; stuckX: number; stuckZ: number; nudge: number; nudgeDir: number;
  breachAt: number; strafe: number; strafeAt: number; crouchUntil: number; roamer: boolean;
}
export interface Brain { nav: Nav; minds: Map<number, Mind>; round: number; site: 0 | 1; planter: number }

const newMind = (): Mind => ({
  path: null, step: 0, pathGoalX: 0, pathGoalZ: 0, repath: 0, version: -1, goalX: 0, goalZ: 0, target: -1, reactAt: 0, seenAt: -9, knownX: 0, knownZ: 0, knownAt: -99, head: false,
  yaw: 0, pitch: 0, errYaw: 0, errPitch: 0, errAt: 0, burstEnd: 0, restEnd: 0, semiAt: 0, post: null, jobs: [], jobSince: 0, stage: null,
  stuckAt: 0, stuckX: 0, stuckZ: 0, nudge: 0, nudgeDir: 1, breachAt: 0, strafe: 0, strafeAt: 0, crouchUntil: 0, roamer: false,
});
export function createBrain(m: Match): Brain { return { nav: createNav(m.world), minds: new Map(), round: -1, site: 0, planter: -1 }; }

const wrap = (a: number) => { a = (a + Math.PI) % (Math.PI * 2); return (a < 0 ? a + Math.PI * 2 : a) - Math.PI; };
const yawTo = (dx: number, dz: number) => Math.atan2(-dx, -dz);

function wallNear(m: Match, x: number, z: number): Panel | null {
  let best: Panel | null = null, bd = 1.5;
  for (const p of m.world.panels) {
    if (p.kind !== 'wall') continue;
    const c = panelCenter(p), d = Math.hypot(c.x - x, c.z - z);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
/** Where to stand to work on a panel from the side nearest a reference point. */
function standBy(p: Panel, rx: number, rz: number): { x: number; z: number } {
  const c = panelCenter(p), side = (p.axis === 'x' ? rz : rx) >= p.pos ? 1 : -1;
  const at = panelPoint(p, p.axis === 'x' ? c.x : c.z, 0, side * 1.15);
  return { x: at.x, z: at.z };
}

/** A new round: choose kits, a target site, posts and set-up jobs. */
function plan(b: Brain, m: Match) {
  b.round = m.round;
  b.site = nextRandom(m) < 0.5 ? 0 : 1;
  b.planter = -1;
  const bots = m.players.filter(p => p.bot), atk = bots.filter(p => roleOf(m, p) === ATK), def = bots.filter(p => roleOf(m, p) === DEF);
  const spawn = MAP.attackSpawns[m.spawn].points[2];
  const doors = m.world.panels.filter(p => p.kind === 'door' && p.closed).map(p => panelCenter(p))
    .sort((u, v) => Math.hypot(u.x - spawn.x, u.z - spawn.z) - Math.hypot(v.x - spawn.x, v.z - spawn.z));
  atk.forEach((p, i) => {
    const mind = newMind(); b.minds.set(p.id, mind);
    mind.yaw = p.yaw;
    command(m, p.id, { c: 'kit', kit: i === 0 ? 0 : 1 + Math.floor(nextRandom(m) * 2) });
    mind.post = MAP.posts[b.site][(i + 1) % MAP.posts[b.site].length];
    // Two groups, through the two nearest outside doors.
    const d = doors[i % Math.min(2, doors.length)];
    if (d) { const out = Math.abs(d.x) > Math.abs(d.z) * 1.5 ? { x: d.x + Math.sign(d.x) * 1.6, z: d.z } : { x: d.x, z: d.z + Math.sign(d.z) * 1.6 }; mind.stage = out; }
  });
  const used = [0, 0], reinforced = [0, 0], barricaded = [0, 0];
  def.forEach((p, i) => {
    const mind = newMind(); b.minds.set(p.id, mind);
    mind.yaw = p.yaw;
    const roam = def.length >= 4 && i === def.length - 1;
    command(m, p.id, { c: 'kit', kit: roam ? 1 : i % 2 === 0 ? 0 : 2 });
    if (roam) { mind.roamer = true; mind.post = MAP.roam[Math.floor(nextRandom(m) * MAP.roam.length)]; return; }
    const site = (i % 2) as 0 | 1, rect = MAP.sites[site], cx = (rect.x0 + rect.x1) / 2, cz = (rect.z0 + rect.z1) / 2;
    mind.post = MAP.posts[site][used[site]++ % MAP.posts[site].length];
    for (let n = 0; n < p.reinforcements && reinforced[site] < MAP.reinforce[site].length; n++) {
      const h = MAP.reinforce[site][reinforced[site]++], w = wallNear(m, h.x, h.z);
      if (w) mind.jobs.push({ kind: 'reinforce', panel: w.id, ...standBy(w, cx, cz) });
    }
    const siteDoors = m.world.panels.filter(d => d.kind === 'door' && !d.closed && (() => { const c = panelCenter(d); return c.x >= rect.x0 - 0.3 && c.x <= rect.x1 + 0.3 && c.z >= rect.z0 - 0.3 && c.z <= rect.z1 + 0.3; })());
    if (siteDoors.length) { const d = siteDoors[barricaded[site]++ % siteDoors.length]; mind.jobs.push({ kind: 'barricade', panel: d.id, ...standBy(d, cx, cz) }); }
  });
}

function perceive(b: Brain, m: Match, p: Player, mind: Mind) {
  const skill = BOT_SKILL[m.cfg.skill], eye = eyeOf(p), look = viewDir(mind.yaw, 0);
  let best = -1, bd = Infinity;
  for (const q of m.players) {
    if (!q.alive || q.squad === p.squad) continue;
    const dx = q.x - p.x, dz = q.z - p.z, dist = Math.hypot(dx, dz);
    if (dist > 60) continue;
    const heard = (m.time - q.lastShot < 0.5 && dist < 30) || (q.sprint && dist < 8);
    if (heard && m.time - mind.knownAt > 0.4) { mind.knownX = q.x + (nextRandom(m) - 0.5) * 2; mind.knownZ = q.z + (nextRandom(m) - 0.5) * 2; mind.knownAt = m.time; }
    if (dist > 3.5 && (dx * look.x + dz * look.z) / dist < 0.2) continue;
    const qe = eyeOf(q);
    if (!clearLine(m.world, eye.x, eye.y, eye.z, qe.x, qe.y, qe.z) && !clearLine(m.world, eye.x, eye.y, eye.z, q.x, eyeHeight(q.crouch) * 0.55, q.z)) continue;
    if (dist < bd) { bd = dist; best = q.id; }
  }
  if (best >= 0) {
    if (mind.target !== best) {
      const alert = m.time - mind.seenAt < 2 || m.time - mind.knownAt < 2;
      mind.reactAt = m.time + skill.react * (alert ? 0.55 : 1) * (0.75 + nextRandom(m) * 0.5);
      mind.head = nextRandom(m) < (m.cfg.skill === 'veteran' ? 0.5 : m.cfg.skill === 'regular' ? 0.28 : 0.12);
      mind.target = best;
    }
    const q = m.players[best];
    mind.seenAt = m.time; mind.knownX = q.x; mind.knownZ = q.z; mind.knownAt = m.time;
  } else if (mind.target >= 0 && m.time - mind.seenAt > 0.45) mind.target = -1;
}

/** Sets the goal for this step and returns whether the bot should hold Use there. */
function decide(b: Brain, m: Match, p: Player, mind: Mind): { use: boolean; lookX: number; lookZ: number; look: boolean } {
  const role = roleOf(m, p), post = mind.post, out = { use: false, lookX: 0, lookZ: 0, look: false };
  const at = (x: number, z: number, r = 0.7) => Math.hypot(p.x - x, p.z - z) < r;
  if (role === DEF) {
    if (m.phase === 'planted' && m.device) {
      mind.goalX = m.device.x; mind.goalZ = m.device.z;
      if (at(m.device.x, m.device.z, 1.6) && (mind.target < 0 || m.t < 14 || p.act === ACT.defuse)) { out.use = true; out.look = true; out.lookX = m.device.x; out.lookZ = m.device.z; }
      return out;
    }
    const job = mind.jobs[0];
    if (job && (m.phase === 'prep' || (m.phase === 'action' && mind.target < 0 && m.time - mind.knownAt > 4))) {
      const panel = m.world.panels[job.panel], done = job.kind === 'reinforce' ? panel.reinforced || p.reinforcements <= 0 : panel.intact === panel.cells.length;
      if (done || m.time - mind.jobSince > 14) { mind.jobs.shift(); mind.jobSince = m.time; return decide(b, m, p, mind); }
      mind.goalX = job.x; mind.goalZ = job.z;
      if (at(job.x, job.z, 0.55)) { const c = panelCenter(panel); out.use = true; out.look = true; out.lookX = c.x; out.lookZ = c.z; }
      return out;
    }
    if (mind.roamer && m.phase !== 'prep' && m.time - mind.knownAt < 6 && Math.hypot(mind.knownX - p.x, mind.knownZ - p.z) < 16) { mind.goalX = mind.knownX; mind.goalZ = mind.knownZ; return out; }
    if (post) { mind.goalX = post.x; mind.goalZ = post.z; if (at(post.x, post.z)) { out.look = true; out.lookX = post.lx; out.lookZ = post.lz; } }
    return out;
  }
  // Attackers.
  if (m.phase === 'planted' && m.device) {
    const hold = MAP.posts[m.device.site][(p.id + 1) % MAP.posts[m.device.site].length];
    mind.goalX = hold.x; mind.goalZ = hold.z;
    if (at(hold.x, hold.z)) { out.look = true; out.lookX = hold.lx; out.lookZ = hold.lz; }
    return out;
  }
  if (mind.stage) {
    if (at(mind.stage.x, mind.stage.z, 2.2) || siteAt(p.x, p.z) >= 0) mind.stage = null;
    else { mind.goalX = mind.stage.x; mind.goalZ = mind.stage.z; return out; }
  }
  if (m.time - mind.knownAt < 5 && mind.target < 0 && Math.hypot(mind.knownX - p.x, mind.knownZ - p.z) < 12 && b.planter !== p.id) { mind.goalX = mind.knownX; mind.goalZ = mind.knownZ; return out; }
  if (post) {
    mind.goalX = post.x; mind.goalZ = post.z;
    if (b.planter === p.id && siteAt(p.x, p.z) === b.site && (at(post.x, post.z, 1.4) || m.t < 30) && (mind.target < 0 || p.act === ACT.plant || m.t < 25)) { out.use = true; out.look = true; out.lookX = post.lx; out.lookZ = post.lz; }
    else if (at(post.x, post.z)) { out.look = true; out.lookX = post.lx; out.lookZ = post.lz; }
  }
  return out;
}

/** Walks the route toward the goal. Returns the world direction to move in, or handles a barrier in the way. */
function travel(b: Brain, m: Match, p: Player, mind: Mind, it: Intent): { x: number; z: number; aimX?: number; aimY?: number; aimZ?: number } | null {
  const nav = b.nav, role = roleOf(m, p), own = m.charges.find(c => c.by === p.id);
  const moved = Math.hypot(mind.goalX - mind.pathGoalX, mind.goalZ - mind.pathGoalZ) > 1;
  if (!mind.path || moved || m.time > mind.repath || (mind.version !== m.world.version && m.time > mind.repath - 1.2)) {
    mind.path = route(nav, p.x, p.z, mind.goalX, mind.goalZ, { barricade: role === ATK ? 6 : 14, wall: role === ATK && (p.charges > 0 || own) ? 16 : Infinity });
    mind.step = 1; mind.pathGoalX = mind.goalX; mind.pathGoalZ = mind.goalZ; mind.repath = m.time + 2.5 + nextRandom(m); mind.version = m.world.version;
  }
  const path = mind.path;
  if (!path) return null;
  while (mind.step < path.length && Math.hypot(cellX(path[mind.step]) - p.x, cellZ(path[mind.step]) - p.z) < 0.34) mind.step++;
  if (mind.step >= path.length) {
    const dx = mind.goalX - p.x, dz = mind.goalZ - p.z, d = Math.hypot(dx, dz);
    return d > 0.25 && d < 1.5 ? { x: dx / d, z: dz / d } : null;
  }
  const next = path[mind.step], prev = path[mind.step - 1], gate = crossing(nav, prev, next);
  if (gate && !gate.open) {
    const panel = gate.panel, mx = (cellX(prev) + cellX(next)) / 2, mz = (cellZ(prev) + cellZ(next)) / 2;
    const dist = Math.abs((panel.axis === 'x' ? p.z : p.x) - panel.pos);
    if (panel.kind === 'door') {
      // Knock the barricade out by hand, aiming at whatever still blocks the way.
      const hole = blocker(nav, prev, next), at = hole ? panelPoint(panel, hole.u, hole.y) : { x: mx, y: 1.1, z: mz };
      if (dist > 1.25) return { x: cellX(prev) - p.x, z: cellZ(prev) - p.z, aimX: at.x, aimY: at.y, aimZ: at.z };
      const e = eyeOf(p), yaw = yawTo(at.x - e.x, at.z - e.z), pitch = Math.atan2(at.y - e.y, Math.hypot(at.x - e.x, at.z - e.z));
      if (p.meleeCool <= 0 && Math.abs(wrap(yaw - mind.yaw)) < 0.12 && Math.abs(pitch - mind.pitch) < 0.12) it.melee = true;
      return { x: 0, z: 0, aimX: at.x, aimY: at.y, aimZ: at.z };
    }
    if (own) {
      // Back away from the charge, then set it off.
      const away = panel.axis === 'x' ? { x: 0, z: Math.sign(p.z - panel.pos) || 1 } : { x: Math.sign(p.x - panel.pos) || 1, z: 0 };
      const far = Math.hypot(p.x - panelPoint(panel, own.u, 0).x, p.z - panelPoint(panel, own.u, 0).z);
      if (far > CHARGE.radius + 0.3 || m.time - mind.breachAt > 2.6) { if (own.age >= CHARGE.arm && m.time - mind.breachAt > 0.7) it.breach = true; return { x: 0, z: 0, aimX: mx, aimY: 1.2, aimZ: mz }; }
      return { x: away.x, z: away.z, aimX: mx, aimY: 1.2, aimZ: mz };
    }
    if (p.act === ACT.charge) return { x: 0, z: 0, aimX: mx, aimY: 1.2, aimZ: mz };
    if (role === ATK && p.charges > 0) {
      if (dist > 1.3) return { x: cellX(prev) - p.x, z: cellZ(prev) - p.z, aimX: mx, aimY: 1.2, aimZ: mz };
      if (m.time - mind.breachAt > 0.8 && Math.abs(wrap(yawTo(mx - p.x, mz - p.z) - mind.yaw)) < 0.2) { it.breach = true; mind.breachAt = m.time; }
      return { x: 0, z: 0, aimX: mx, aimY: 1.2, aimZ: mz };
    }
    mind.path = null;
    return null;
  }
  return { x: cellX(next) - p.x, z: cellZ(next) - p.z };
}

function think(b: Brain, m: Match, p: Player, mind: Mind, dt: number): Intent {
  const it = idleIntent(mind.yaw, mind.pitch), skill = BOT_SKILL[m.cfg.skill], def = weaponOf(m, p), rnd = () => nextRandom(m);
  if (!p.alive) return it;
  if ((m.tick + p.id * 3) % 8 === 0) perceive(b, m, p, mind);
  const plan = decide(b, m, p, mind), eye = eyeOf(p);
  const target = mind.target >= 0 ? m.players[mind.target] : null;
  let wantYaw = mind.yaw, wantPitch = 0, move: { x: number; z: number } | null = null;
  const fighting = !!target && target.alive;

  if (fighting && target) {
    const te = eyeOf(target), ty = mind.head ? te.y : eyeHeight(target.crouch) * 0.62;
    const dx = target.x - eye.x, dz = target.z - eye.z, dist = Math.hypot(dx, dz);
    if (m.time > mind.errAt) {
      const k = skill.error * (1 + Math.min(1.5, target.pace) * 0.7 + p.pace * 0.5) * (m.time - mind.reactAt < 0.5 ? 1.6 : 1);
      mind.errYaw = (rnd() - 0.5) * 2 * k; mind.errPitch = (rnd() - 0.5) * 1.4 * k; mind.errAt = m.time + 0.3 + rnd() * 0.2;
    }
    wantYaw = yawTo(dx, dz) + mind.errYaw; wantPitch = Math.atan2(ty - eye.y, dist) + mind.errPitch;
    it.ads = dist > 6;
    if (m.time >= mind.reactAt && Math.abs(wrap(wantYaw - mind.yaw)) < 0.07 + 0.4 / Math.max(2, dist)) {
      if (def.auto) {
        if (m.time > mind.restEnd && mind.burstEnd <= mind.restEnd) mind.burstEnd = m.time + (0.22 + rnd() * 0.45) * skill.burst;
        if (m.time < mind.burstEnd) it.fire = true;
        else if (mind.burstEnd > mind.restEnd) mind.restEnd = m.time + 0.2 + rnd() * 0.3;
      } else if (m.time >= mind.semiAt) { it.fire = true; mind.semiAt = m.time + def.interval + 0.1 + rnd() * 0.18 / skill.burst; }
    }
    if (m.time > mind.strafeAt) { mind.strafe = Math.floor(rnd() * 3) - 1; mind.strafeAt = m.time + 0.7 + rnd(); if (rnd() < 0.3 && dist > 5) mind.crouchUntil = m.time + 1.5 + rnd() * 2; }
    if (!plan.use && p.act === ACT.none) move = { x: Math.cos(mind.yaw) * mind.strafe * 0.55, z: -Math.sin(mind.yaw) * mind.strafe * 0.55 };
    it.use = plan.use && (p.act !== ACT.none || m.t < 14);
  } else {
    const step = plan.use ? null : travel(b, m, p, mind, it);
    it.use = plan.use;
    if (step && (step.x || step.z)) { const l = Math.hypot(step.x, step.z); move = { x: step.x / l, z: step.z / l }; }
    if (step && step.aimX !== undefined) { wantYaw = yawTo(step.aimX - eye.x, step.aimZ! - eye.z); wantPitch = Math.atan2(step.aimY! - eye.y, Math.hypot(step.aimX - eye.x, step.aimZ! - eye.z)); }
    else if (plan.look) {
      const job = mind.jobs[0], y = plan.use && job && roleOf(m, p) === DEF && m.phase !== 'planted' ? 1.3 : plan.use ? 0.3 : 1.4;
      wantYaw = yawTo(plan.lookX - eye.x, plan.lookZ - eye.z); wantPitch = Math.atan2(y - eye.y, Math.hypot(plan.lookX - eye.x, plan.lookZ - eye.z));
      // Sweep a little while holding an angle.
      if (!plan.use) wantYaw += Math.sin(m.time * 0.7 + p.id) * 0.35;
    } else if (m.time - mind.knownAt < 2.5 && !move) wantYaw = yawTo(mind.knownX - eye.x, mind.knownZ - eye.z);
    else if (move && mind.path) {
      const ahead = mind.path[Math.min(mind.path.length - 1, mind.step + 3)];
      wantYaw = yawTo(cellX(ahead) - p.x, cellZ(ahead) - p.z);
    }
    if (p.mag[p.slot] < def.mag * 0.4 && p.reserve[p.slot] > 0 && p.reload <= 0 && m.time - mind.seenAt > 1.5) it.reload = true;
    it.sprint = !!move && m.time - mind.knownAt > 4 && Math.hypot(mind.goalX - p.x, mind.goalZ - p.z) > 7;
  }
  // Use needs the action to be available from here; if it is not, step closer instead of standing still.
  if (it.use && p.act === ACT.none && !interaction(m, p, aimOf(p)) && roleOf(m, p) === DEF && m.phase !== 'planted') {
    const job = mind.jobs[0];
    if (job && m.time - mind.jobSince > 6) { mind.jobs.shift(); mind.jobSince = m.time; }
  }

  // Turn toward the wanted aim at a human rate.
  const dy = wrap(wantYaw - mind.yaw), max = skill.turn * dt;
  mind.yaw = wrap(mind.yaw + Math.max(-max, Math.min(max, dy * Math.min(1, 14 * dt) + Math.sign(dy) * Math.min(Math.abs(dy), max * 0.35))));
  mind.pitch += Math.max(-max, Math.min(max, wantPitch - mind.pitch));
  it.yaw = mind.yaw; it.pitch = mind.pitch;
  it.crouch = m.time < mind.crouchUntil && fighting;

  // Unstick: a sidestep when nothing has moved for a while.
  if (move && p.act === ACT.none) {
    if (m.time - mind.stuckAt > 1.3) {
      if (Math.hypot(p.x - mind.stuckX, p.z - mind.stuckZ) < 0.25 && !fighting && !it.melee) { mind.nudge = m.time + 0.45; mind.nudgeDir = rnd() < 0.5 ? -1 : 1; mind.path = null; }
      mind.stuckAt = m.time; mind.stuckX = p.x; mind.stuckZ = p.z;
    }
    if (m.time < mind.nudge) move = { x: move.z * mind.nudgeDir, z: -move.x * mind.nudgeDir };
    const fx = -Math.sin(mind.yaw), fz = -Math.cos(mind.yaw), rx = Math.cos(mind.yaw), rz = -Math.sin(mind.yaw);
    it.mz = move.x * fx + move.z * fz; it.mx = move.x * rx + move.z * rz;
    if (it.sprint && it.mz < 0.7) it.sprint = false;
  } else { mind.stuckAt = m.time; mind.stuckX = p.x; mind.stuckZ = p.z; }
  return it;
}

/** Runs every bot for one step. */
export function stepBots(b: Brain, m: Match, dt: number) {
  if (m.phase === 'lobby' || m.phase === 'over') return;
  if (b.nav.world !== m.world) b.nav = createNav(m.world);
  if (b.round !== m.round) plan(b, m);
  if (m.tick % 30 === 0 || b.planter < 0 || !m.players[b.planter]?.alive || !m.players[b.planter]?.bot) {
    // The living attacking bot nearest the chosen site carries the uplink.
    const rect = MAP.sites[b.site], cx = (rect.x0 + rect.x1) / 2, cz = (rect.z0 + rect.z1) / 2;
    let best = -1, bd = Infinity;
    for (const p of m.players) if (p.bot && p.alive && roleOf(m, p) === ATK) { const d = Math.hypot(p.x - cx, p.z - cz) + (p.id === b.planter ? -6 : 0); if (d < bd) { bd = d; best = p.id; } }
    b.planter = best;
  }
  for (const p of m.players) {
    if (!p.bot) continue;
    let mind = b.minds.get(p.id);
    if (!mind) { mind = newMind(); mind.yaw = p.yaw; mind.post = MAP.posts[roleOf(m, p) === ATK ? b.site : p.id % 2][p.id % 5]; b.minds.set(p.id, mind); }
    drive(m, p, think(b, m, p, mind, dt), dt);
  }
}

