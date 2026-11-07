/** The Quad Clash match simulation: movement, weapons, grenades, rockets, damage, streaks, pickups, objectives and the
 * end of a match. Deterministic for a given seed and sequence of intents. No DOM, audio or Three.js. */
import {
  BODY, BOT_NAMES, BOOST_TIME, DROP_LIFETIME, GRENADE, HITBOX, MAX_GRENADES, MODES, PICKUP_RESPAWN, POINTS, RESPAWN_TIME,
  SAVE_VERSION, SHIELD_TIME, SPAWN_PROTECT, STREAKS, WEAPONS, isPrimary, type PrimaryId, type Weapon, type WeaponId, DIFFICULTIES, MODE_IDS,
} from './config';
import { getMap, isMapId, type MapDef } from './map';
import { clearLine, compile, floorAt, moveBody, overlaps, pointSolid, rayBox, rayEllipsoid, rayWorld, type RayHit, type World } from './physics';
import { enemies, eyeY, idleIntent, random, viewDir, weaponOf, type Fighter, type Intent, type Match, type MatchSettings, type Pickup, type Projectile } from './state';

export const FIGHTERS = 8;
const worlds = new Map<string, World>();
export function worldFor(m: Match | MapDef): World {
  const map = 'settings' in m ? getMap(m.settings.map) : m;
  let w = worlds.get(map.id);
  if (!w) { w = compile(map); worlds.set(map.id, w); }
  return w;
}
export const mapOf = (m: Match) => getMap(m.settings.map);
export const modeOf = (m: Match) => MODES[m.settings.mode];

/** Bots favour the all-rounders; launchers and snipers are rarer. */
const BOT_WEAPONS: readonly PrimaryId[] = ['bell', 'bell', 'triple', 'triple', 'recess', 'recess', 'detention', 'detention', 'hallpass', 'hallpass', 'valedictorian', 'firedrill'];

export function createMatch(settings: MatchSettings): Match {
  const m: Match = {
    version: SAVE_VERSION, settings: { ...settings }, rng: (settings.seed >>> 0) || 1, t: 0, fighters: [], projectiles: [], pickups: [], nextPickupId: 1,
    teamScores: [0, 0], zoneIndex: 0, zoneNext: 60, zoneOwner: -1, zoneAcc: [0, 0], over: false, winner: -1, events: [],
  };
  const teams = modeOf(m).teams;
  const names = [...BOT_NAMES];
  for (let i = 0; i < FIGHTERS; i++) {
    const bot = i > 0;
    const pick = Math.floor(random(m) * names.length);
    const name = bot ? names.splice(pick, 1)[0] : 'You';
    const primary = bot ? BOT_WEAPONS[Math.floor(random(m) * BOT_WEAPONS.length)] : settings.primary;
    const team = teams ? (i < FIGHTERS / 2 ? 0 : 1) : i;
    m.fighters.push(blankFighter(i, name, team, bot, teams ? team : i, primary));
  }
  for (const spot of mapOf(m).pickups) {
    const y = floorAt(worldFor(m), spot.x, spot.z, spot.y + 0.6, 0.2);
    m.pickups.push({ id: m.nextPickupId++, kind: spot.kind, x: spot.x, y, z: spot.z, active: true, respawnAt: 0, dropped: false, expires: 0 });
  }
  for (const f of m.fighters) respawn(m, f);
  m.events.length = 0;
  return m;
}

function blankFighter(id: number, name: string, team: number, bot: boolean, paint: number, primary: PrimaryId): Fighter {
  return {
    id, name, team, bot, paint, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, grounded: true, yaw: 0, pitch: 0, health: BODY.maxHealth, alive: false, respawnAt: 0,
    lastHurt: -99, lastAttacker: -1, primary, nextPrimary: primary, slot: 0, mag: [WEAPONS[primary].mag, WEAPONS.pencil.mag], reserve: WEAPONS[primary].reserve,
    reloadEnd: 0, reloadStart: 0, nextFire: 0, burstLeft: 0, burstNext: 0, bloom: 0, trigger: false, queued: -1, ads: false, grenades: 1, nextGrenade: 0,
    kills: 0, deaths: 0, score: 0, streak: 0, bestStreak: 0, shieldUntil: 0, boostUntil: 0, protectUntil: 0, headshots: 0, zoneSeconds: 0,
  };
}

/** The spawn point farthest from living enemies (a little randomness among the safest few). */
function chooseSpawn(m: Match, f: Fighter) {
  const map = mapOf(m), teams = modeOf(m).teams;
  const spots = map.spawns.filter(s => !teams || s.team === f.team);
  const scored = spots.map(s => {
    let near = 99, crowd = false;
    for (const g of m.fighters) {
      if (g === f || !g.alive) continue;
      const d = Math.hypot(g.x - s.x, g.z - s.z);
      if (d < 1.6) crowd = true;
      if (enemies(f, g)) near = Math.min(near, d);
    }
    return { s, score: crowd ? -1 : near };
  }).sort((a, b) => b.score - a.score);
  const best = scored[0].score;
  const good = scored.filter(c => c.score >= 0 && (c.score >= best * 0.85 || c.score >= 40));
  return good.length ? good[Math.floor(random(m) * good.length)].s : scored[0].s;
}

export function respawn(m: Match, f: Fighter) {
  const s = chooseSpawn(m, f), w = worldFor(m);
  f.x = s.x; f.z = s.z; f.y = floorAt(w, s.x, s.z, 1.5);
  f.vx = f.vy = f.vz = 0; f.grounded = true;
  f.yaw = s.yaw; f.pitch = 0;
  f.alive = true; f.health = BODY.maxHealth; f.lastHurt = -99; f.lastAttacker = -1;
  f.primary = f.nextPrimary; f.slot = 0;
  f.mag = [WEAPONS[f.primary].mag, WEAPONS.pencil.mag]; f.reserve = WEAPONS[f.primary].reserve;
  f.reloadEnd = 0; f.nextFire = m.t + 0.3; f.burstLeft = 0; f.bloom = 0; f.trigger = true; f.queued = -1; f.ads = false;
  f.grenades = 1; f.nextGrenade = m.t + 0.5;
  f.streak = 0; f.shieldUntil = 0; f.boostUntil = 0; f.protectUntil = m.t + SPAWN_PROTECT;
  m.events.push({ type: 'spawn', owner: f.id });
}

/** Advances the match by one fixed step. `intents[i]` drives fighter i (missing entries stand still). */
export function step(m: Match, dt: number, intents: readonly (Intent | undefined)[]) {
  if (m.over) return;
  m.t += dt;
  const w = worldFor(m);
  for (const f of m.fighters) {
    if (!f.alive) { if (m.t >= f.respawnAt) respawn(m, f); continue; }
    const intent = intents[f.id] ?? idleIntent(f.yaw, f.pitch);
    look(f, intent);
    move(m, w, f, intent, dt);
    weapons(m, w, f, intent, dt);
    if (f.alive && m.t - f.lastHurt > BODY.regenDelay && f.health < BODY.maxHealth) f.health = Math.min(BODY.maxHealth, f.health + BODY.regenRate * dt);
  }
  projectiles(m, w, dt);
  pickups(m);
  objective(m, dt);
  if (!m.over && m.t >= modeOf(m).duration) finish(m);
}

function look(f: Fighter, intent: Intent) {
  if (Number.isFinite(intent.yaw)) f.yaw = intent.yaw;
  if (Number.isFinite(intent.pitch)) f.pitch = Math.max(-1.45, Math.min(1.45, intent.pitch));
}

function move(m: Match, w: World, f: Fighter, intent: Intent, dt: number) {
  const wpn = weaponOf(f);
  f.ads = intent.ads && !f.reloadEnd;
  const speed = BODY.speed * wpn.speed * (m.t < f.boostUntil ? 1.3 : 1) * (f.ads ? 0.62 : 1);
  let mx = Number.isFinite(intent.mx) ? intent.mx : 0, mz = Number.isFinite(intent.mz) ? intent.mz : 0;
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  const s = Math.sin(f.yaw), c = Math.cos(f.yaw);
  // forward (-sin, -cos), right (cos, -sin)
  const tx = (-s * mz + c * mx) * speed, tz = (-c * mz - s * mx) * speed;
  const accel = (f.grounded ? BODY.accel : BODY.airAccel) * dt;
  const ax = tx - f.vx, az = tz - f.vz, al = Math.hypot(ax, az);
  if (al > 0) { const k = Math.min(1, accel / al); f.vx += ax * k; f.vz += az * k; }
  if (intent.jump && f.grounded) { f.vy = BODY.jump; f.grounded = false; m.events.push({ type: 'jump', owner: f.id }); }
  f.vy -= BODY.gravity * dt;
  const falling = f.vy;
  const wasAir = !f.grounded;
  moveBody(w, f, dt);
  if (wasAir && f.grounded && falling < -7) m.events.push({ type: 'land', owner: f.id, speed: -falling });
  if (f.y < -5 || overlaps(w, f.x, f.y + 0.05, f.z, BODY.radius * 0.6, BODY.height * 0.6)) {
    // Out of the world or wedged (an explosion shove into a corner): put back on the nearest floor.
    f.y = floorAt(w, f.x, f.z, f.y + BODY.height);
    if (overlaps(w, f.x, f.y + 0.05, f.z)) respawnInPlace(m, f);
  }
}

function respawnInPlace(m: Match, f: Fighter) {
  const s = chooseSpawn(m, f);
  f.x = s.x; f.z = s.z; f.y = floorAt(worldFor(m), s.x, s.z, 1.5); f.vx = f.vy = f.vz = 0;
}

function startReload(m: Match, f: Fighter, wpn: Weapon) {
  const slot = f.slot;
  if (f.reloadEnd || f.mag[slot] >= wpn.mag) return;
  if (slot === 0 && f.reserve <= 0) return;
  f.reloadStart = m.t;
  f.reloadEnd = m.t + wpn.reload * (m.t < f.boostUntil ? 0.6 : 1);
  f.burstLeft = 0;
  m.events.push({ type: 'reload', owner: f.id, weapon: wpn.id });
}

function weapons(m: Match, w: World, f: Fighter, intent: Intent, dt: number) {
  const wantSlot = intent.swap ? (f.slot === 0 ? 1 : 0) : intent.slot;
  if (wantSlot >= 0 && wantSlot !== f.slot) {
    f.slot = wantSlot as 0 | 1;
    f.reloadEnd = 0; f.burstLeft = 0; f.nextFire = Math.max(f.nextFire, m.t + 0.32);
    m.events.push({ type: 'swap', owner: f.id, slot: f.slot });
  }
  const wpn = weaponOf(f), slot = f.slot;
  if (f.reloadEnd && m.t >= f.reloadEnd) {
    const need = wpn.mag - f.mag[slot];
    const take = slot === 1 ? need : Math.min(need, f.reserve);
    f.mag[slot] += take;
    if (slot === 0) f.reserve -= take;
    f.reloadEnd = 0;
  }
  if (intent.reload) startReload(m, f, wpn);
  // A semi-automatic press a moment too early still fires as soon as the weapon is ready.
  if (intent.fire && !f.trigger && !wpn.auto) f.queued = m.t;
  const wants = wpn.auto ? intent.fire : f.queued >= 0 && m.t - f.queued <= 0.18;
  if (f.burstLeft > 0 && f.mag[slot] <= 0) f.burstLeft = 0;
  if (f.burstLeft > 0 && m.t >= f.burstNext && f.mag[slot] > 0) {
    fireOnce(m, w, f, wpn);
    f.burstLeft--;
    f.burstNext = m.t + wpn.burstGap;
  } else if (wants && m.t >= f.nextFire && !f.reloadEnd) {
    f.queued = -1;
    if (f.mag[slot] > 0) {
      fireOnce(m, w, f, wpn);
      f.nextFire = m.t + wpn.interval;
      if (wpn.burst > 1) { f.burstLeft = wpn.burst - 1; f.burstNext = m.t + wpn.burstGap; }
    } else if (slot === 1 || f.reserve > 0) startReload(m, f, wpn);
    else {
      // Out of everything: click, then draw the sidearm.
      m.events.push({ type: 'dry', owner: f.id });
      f.slot = 1; f.nextFire = m.t + 0.32; f.burstLeft = 0;
      m.events.push({ type: 'swap', owner: f.id, slot: 1 });
    }
  }
  f.trigger = intent.fire;
  if (f.mag[slot] <= 0 && !intent.fire && !f.reloadEnd && (slot === 1 || f.reserve > 0)) startReload(m, f, wpn);
  f.bloom = Math.max(0, f.bloom - dt * 0.1);
  if (intent.grenade && f.grenades > 0 && m.t >= f.nextGrenade) throwGrenade(m, f);
}

const dir = { x: 0, y: 0, z: 0 };
const hit: RayHit = { t: 0, nx: 0, ny: 0, nz: 0 };

export function spreadOf(f: Fighter, wpn: Weapon = weaponOf(f)) {
  const moving = Math.hypot(f.vx, f.vz) > 1.5;
  return (f.ads ? wpn.ads : wpn.hip) * (moving ? 1.5 : 1) * (f.grounded ? 1 : 1.8) + f.bloom;
}

function fireOnce(m: Match, w: World, f: Fighter, wpn: Weapon) {
  f.protectUntil = 0;
  f.mag[f.slot]--;
  const spread = spreadOf(f, wpn);
  f.bloom = Math.min(0.06, f.bloom + wpn.bloom);
  const ox = f.x, oy = eyeY(f), oz = f.z;
  m.events.push({ type: 'shot', owner: f.id, weapon: wpn.id });
  viewDir(f.yaw, f.pitch, dir);
  // An orthonormal basis around the aim for the spread cone.
  const ux = -dir.z, uz = dir.x, ul = Math.hypot(ux, uz) || 1;
  const rx = ux / ul, rz = uz / ul; // right (horizontal)
  const upx = dir.y * rz, upy = dir.z * rx - dir.x * rz, upz = -dir.y * rx; // dir × right
  for (let p = 0; p < wpn.pellets; p++) {
    const a = spread * Math.sqrt(random(m)), phi = random(m) * Math.PI * 2;
    const ca = Math.cos(phi) * Math.tan(a), sa = Math.sin(phi) * Math.tan(a);
    let dx = dir.x + rx * ca + upx * sa, dy = dir.y + upy * sa, dz = dir.z + rz * ca + upz * sa;
    const dl = Math.hypot(dx, dy, dz); dx /= dl; dy /= dl; dz /= dl;
    if (wpn.kind === 'rocket') {
      const sp = wpn.rocketSpeed ?? 30;
      // Never spawn inside a wall the shooter is hugging: stop just short of it, so the rocket bursts on that wall.
      const near = rayWorld(w, ox, oy, oz, dx, dy, dz, 0.6, hit);
      const k = near ? Math.max(0, near.t - 0.05) : 0.6;
      m.projectiles.push({ kind: 'rocket', owner: f.id, x: ox + dx * k, y: oy + dy * k, z: oz + dz * k, vx: dx * sp, vy: dy * sp, vz: dz * sp, age: 0, fuse: 4 });
      continue;
    }
    const wall = rayWorld(w, ox, oy, oz, dx, dy, dz, wpn.range, hit);
    let best = wall ? wall.t : wpn.range, target: Fighter | null = null, head = false;
    for (const g of m.fighters) {
      if (!g.alive || !enemies(f, g)) continue;
      const th = rayEllipsoid(ox, oy, oz, dx, dy, dz, g.x, g.y + HITBOX.headY, g.z, HITBOX.headR, HITBOX.headRY, HITBOX.headRZ);
      if (th >= 0 && th < best) { best = th; target = g; head = true; }
      const tb = rayBox(ox, oy, oz, dx, dy, dz, g.x - BODY.radius, g.y, g.z - BODY.radius, g.x + BODY.radius, g.y + HITBOX.bodyTop, g.z + BODY.radius);
      if (tb >= 0 && tb < best - 1e-4) { best = tb; target = g; head = false; }
    }
    const tx = ox + dx * best, ty = oy + dy * best, tz = oz + dz * best;
    m.events.push({ type: 'tracer', owner: f.id, weapon: wpn.id, ox, oy, oz, tx, ty, tz, impact: target ? 'body' : wall ? 'world' : 'none', nx: wall?.nx ?? 0, ny: wall?.ny ?? 0, nz: wall?.nz ?? 0 });
    if (target) {
      const [start, end, min] = wpn.falloff;
      const fall = best <= start ? 1 : best >= end ? min : 1 - (1 - min) * (best - start) / (end - start);
      damage(m, target, f, wpn.damage * fall * (head ? wpn.head : 1), wpn.id, head, tx, ty, tz);
    }
  }
}

function throwGrenade(m: Match, f: Fighter) {
  viewDir(f.yaw, f.pitch, dir);
  const oy = eyeY(f) - 0.15;
  // Released short of any wall the thrower is touching, so the flask never starts inside it.
  const near = rayWorld(worldFor(m), f.x, oy, f.z, dir.x, dir.y, dir.z, 0.5, hit);
  const k = near ? Math.max(0, near.t - 0.15) : 0.5;
  m.projectiles.push({ kind: 'grenade', owner: f.id, x: f.x + dir.x * k, y: oy + dir.y * k, z: f.z + dir.z * k, vx: dir.x * GRENADE.speed + f.vx * 0.5, vy: dir.y * GRENADE.speed + GRENADE.up, vz: dir.z * GRENADE.speed + f.vz * 0.5, age: 0, fuse: GRENADE.fuse });
  f.grenades--;
  f.nextGrenade = m.t + GRENADE.cooldown;
  f.protectUntil = 0;
  m.events.push({ type: 'throw', owner: f.id });
}

/** Applies damage from `attacker` to `target`. Returns the damage dealt. */
export function damage(m: Match, target: Fighter, attacker: Fighter, amount: number, weapon: WeaponId | 'grenade', head: boolean, x: number, y: number, z: number): number {
  if (!target.alive || m.over || amount <= 0) return 0;
  if (m.t < target.protectUntil) return 0;
  if (target !== attacker && !enemies(attacker, target)) return 0;
  const shielded = m.t < target.shieldUntil;
  if (shielded) amount *= 0.5;
  target.health -= amount;
  target.lastHurt = m.t;
  if (target !== attacker) target.lastAttacker = attacker.id;
  m.events.push({ type: 'hit', target: target.id, attacker: attacker.id, amount, head, x, y, z, shielded });
  if (target.health <= 0.0001) eliminate(m, target, attacker, weapon, head);
  return amount;
}

function eliminate(m: Match, victim: Fighter, killer: Fighter, weapon: WeaponId | 'grenade', head: boolean) {
  victim.alive = false; victim.health = 0; victim.respawnAt = m.t + RESPAWN_TIME; victim.deaths++;
  victim.streak = 0; victim.reloadEnd = 0; victim.ads = false; victim.shieldUntil = 0; victim.boostUntil = 0; victim.burstLeft = 0;
  victim.vx = victim.vz = 0;
  drop(m, victim.x, victim.y, victim.z, 'ammo');
  if (random(m) < 0.35) drop(m, victim.x + 0.7, victim.y, victim.z, 'grenade');
  m.events.push({ type: 'kill', killer: killer.id, victim: victim.id, weapon, head });
  if (killer === victim) return;
  killer.kills++;
  killer.streak++;
  killer.bestStreak = Math.max(killer.bestStreak, killer.streak);
  killer.score += POINTS.kill + (head ? POINTS.head : 0);
  if (head) killer.headshots++;
  STREAKS.forEach((s, i) => { if (killer.streak === s.kills) reward(m, killer, i); });
  const mode = modeOf(m);
  if (m.settings.mode === 'house') {
    m.teamScores[killer.team]++;
    m.events.push({ type: 'score', team: killer.team });
    if (m.teamScores[killer.team] >= mode.limit) finish(m);
  } else if (m.settings.mode === 'brawl' && killer.kills >= mode.limit) finish(m);
}

function reward(m: Match, f: Fighter, index: number) {
  f.score += POINTS.streak;
  if (index === 0) {
    f.reserve = WEAPONS[f.primary].reserve;
    f.mag[0] = Math.max(f.mag[0], WEAPONS[f.primary].mag);
    f.grenades = Math.min(MAX_GRENADES, f.grenades + 1);
  } else if (index === 1) f.shieldUntil = m.t + SHIELD_TIME;
  else f.boostUntil = m.t + BOOST_TIME;
  m.events.push({ type: 'streak', owner: f.id, index });
}

function drop(m: Match, x: number, y: number, z: number, kind: 'ammo' | 'grenade') {
  const w = worldFor(m);
  if (overlaps(w, x, y + 0.05, z, 0.2, 0.4)) { x -= 0.7; if (overlaps(w, x, y + 0.05, z, 0.2, 0.4)) return; }
  const fy = floorAt(w, x, z, y + 0.3, 0.2);
  m.pickups.push({ id: m.nextPickupId++, kind, x, y: fy, z, active: true, respawnAt: 0, dropped: true, expires: m.t + DROP_LIFETIME });
  // Keep the list bounded in long matches.
  const dropped = m.pickups.filter(p => p.dropped);
  if (dropped.length > 24) m.pickups.splice(m.pickups.indexOf(dropped[0]), 1);
}

function pickups(m: Match) {
  for (let i = m.pickups.length - 1; i >= 0; i--) {
    const p = m.pickups[i];
    if (p.dropped && m.t >= p.expires) { m.pickups.splice(i, 1); continue; }
    if (!p.active) { if (m.t >= p.respawnAt) p.active = true; else continue; }
    for (const f of m.fighters) {
      if (!f.alive || Math.hypot(f.x - p.x, f.z - p.z) > 1.1 || f.y - p.y > 1.4 || p.y - f.y > 1.2) continue;
      if (!collect(f, p)) continue;
      m.events.push({ type: 'pickup', owner: f.id, kind: p.kind });
      if (p.dropped) m.pickups.splice(i, 1);
      else { p.active = false; p.respawnAt = m.t + PICKUP_RESPAWN; }
      break;
    }
  }
}

function collect(f: Fighter, p: Pickup): boolean {
  if (p.kind === 'grenade') {
    if (f.grenades >= MAX_GRENADES) return false;
    f.grenades++;
    return true;
  }
  const wpn = WEAPONS[f.primary];
  if (f.reserve >= wpn.reserve) return false;
  f.reserve = Math.min(wpn.reserve, f.reserve + Math.ceil(wpn.mag * 1.5));
  return true;
}

function projectiles(m: Match, w: World, dt: number) {
  const subs = 2, h = dt / subs;
  outer: for (let i = m.projectiles.length - 1; i >= 0; i--) {
    const p = m.projectiles[i];
    for (let s = 0; s < subs; s++) {
      p.age += h;
      if (p.kind === 'rocket') {
        const sp = Math.hypot(p.vx, p.vy, p.vz), dx = p.vx / sp, dy = p.vy / sp, dz = p.vz / sp, len = sp * h;
        const wall = rayWorld(w, p.x, p.y, p.z, dx, dy, dz, len, hit);
        let best = wall ? wall.t : Infinity;
        const owner = m.fighters[p.owner];
        for (const g of m.fighters) {
          if (!g.alive || (g.id === p.owner && p.age < 0.3) || (owner && g.id !== p.owner && !enemies(owner, g))) continue;
          const tb = rayBox(p.x, p.y, p.z, dx, dy, dz, g.x - BODY.radius, g.y, g.z - BODY.radius, g.x + BODY.radius, g.y + BODY.height, g.z + BODY.radius);
          if (tb >= 0 && tb <= len && tb < best) best = tb;
        }
        if (best <= len || p.age >= p.fuse) {
          const t = Math.max(0, Math.min(best, len) - 0.05);
          explode(m, w, p.x + dx * t, p.y + dy * t, p.z + dz * t, WEAPONS.firedrill.splash ?? 4, WEAPONS.firedrill.damage, p.owner, 'firedrill', 'rocket');
          m.projectiles.splice(i, 1);
          continue outer;
        }
        p.x += p.vx * h; p.y += p.vy * h; p.z += p.vz * h;
      } else {
        p.vy -= BODY.gravity * h;
        let bounced = false;
        for (const axis of ['x', 'y', 'z'] as const) {
          const v = axis === 'x' ? p.vx : axis === 'y' ? p.vy : p.vz;
          const prev = p[axis];
          p[axis] = prev + v * h;
          if (pointSolid(w, p.x, p.y, p.z, 0.12)) {
            p[axis] = prev;
            if (axis === 'x') p.vx = -p.vx * GRENADE.bounce; else if (axis === 'y') p.vy = -p.vy * GRENADE.bounce; else p.vz = -p.vz * GRENADE.bounce;
            if (Math.abs(v) > 2.5) bounced = true;
            if (axis === 'y') { p.vx *= 0.65; p.vz *= 0.65; }
          }
        }
        if (bounced) m.events.push({ type: 'bounce', x: p.x, y: p.y, z: p.z });
        if (p.age >= p.fuse) {
          explode(m, w, p.x, p.y + 0.1, p.z, GRENADE.radius, GRENADE.damage, p.owner, 'grenade', 'grenade');
          m.projectiles.splice(i, 1);
          continue outer;
        }
      }
    }
  }
}

export function explode(m: Match, w: World, x: number, y: number, z: number, radius: number, dmg: number, ownerId: number, weapon: WeaponId | 'grenade', kind: 'rocket' | 'grenade') {
  m.events.push({ type: 'explode', x, y, z, r: radius, owner: ownerId, kind });
  const owner = m.fighters[ownerId];
  for (const g of m.fighters) {
    if (!g.alive) continue;
    const cy = g.y + 0.9, d = Math.max(0, Math.hypot(g.x - x, cy - y, g.z - z) - 0.4);
    if (d >= radius) continue;
    if (!clearLine(w, x, y, z, g.x, cy, g.z) && !clearLine(w, x, y, z, g.x, g.y + HITBOX.headY, g.z)) continue;
    const k = 1 - d / radius;
    // Knock back the owner (rocket jumps are allowed) and enemies without a spawn shield; teammates are untouched.
    const shove = g === owner || (!!owner && enemies(owner, g) && m.t >= g.protectUntil);
    if (shove) {
    const dx = g.x - x, dz = g.z - z, dl = Math.hypot(dx, dz) || 1;
    g.vx += (dx / dl) * 8 * k; g.vz += (dz / dl) * 8 * k; g.vy = Math.max(g.vy, 6.5 * k); g.grounded = false;
    }
    if (!owner) continue;
    damage(m, g, owner, dmg * k * (g === owner ? 0.45 : 1), weapon, false, g.x, cy, g.z);
  }
}

function objective(m: Match, dt: number) {
  if (m.settings.mode !== 'quad' || m.over) return;
  const zones = mapOf(m).zones;
  if (m.t >= m.zoneNext) {
    m.zoneIndex = (m.zoneIndex + 1) % zones.length;
    m.zoneNext += 60;
    m.zoneAcc = [0, 0];
    m.events.push({ type: 'zone', index: m.zoneIndex });
  }
  // The house with more members standing in the zone holds it; equal numbers contest it.
  const count = [0, 0];
  for (const f of m.fighters) if (f.alive && inZone(m, f)) count[f.team]++;
  if (!count[0] && !count[1]) { m.zoneOwner = -1; return; }
  if (count[0] === count[1]) { m.zoneOwner = -2; return; }
  const team: 0 | 1 = count[0] > count[1] ? 0 : 1;
  m.zoneOwner = team;
  m.zoneAcc[team] += dt;
  while (m.zoneAcc[team] >= 1) {
    m.zoneAcc[team] -= 1;
    m.teamScores[team]++;
    m.events.push({ type: 'score', team });
    for (const f of m.fighters) if (f.alive && f.team === team && inZone(m, f)) { f.score += POINTS.zone; f.zoneSeconds++; }
    if (m.teamScores[team] >= MODES.quad.limit) { finish(m); return; }
  }
}

export function inZone(m: Match, f: Fighter): boolean {
  const zone = mapOf(m).zones[m.zoneIndex];
  return Math.hypot(f.x - zone.x, f.z - zone.z) <= zone.r && f.y >= zone.y - 0.6 && f.y <= zone.y + 2.5;
}

function finish(m: Match) {
  if (m.over) return;
  m.over = true;
  if (modeOf(m).teams) m.winner = m.teamScores[0] === m.teamScores[1] ? -1 : m.teamScores[0] > m.teamScores[1] ? 0 : 1;
  else {
    const ranked = standings(m);
    m.winner = ranked.length > 1 && ranked[0].kills === ranked[1].kills && ranked[0].score === ranked[1].score ? -1 : ranked[0].id;
  }
  const you = m.fighters[0];
  you.score += POINTS.finish;
  if (playerWon(m)) you.score += POINTS.win;
  m.events.push({ type: 'end' });
}

export const playerWon = (m: Match) => m.over && (modeOf(m).teams ? m.winner === m.fighters[0].team : m.winner === 0);

/** Fighters ordered for the scoreboard: kills, then score, then fewest deaths. */
export function standings(m: Match): Fighter[] {
  return [...m.fighters].sort((a, b) => b.kills - a.kills || b.score - a.score || a.deaths - b.deaths || a.id - b.id);
}

/** Changes the loadout used at the next respawn (and right away if the fighter has not fired since spawning). */
export function chooseLoadout(m: Match, f: Fighter, primary: PrimaryId) {
  f.nextPrimary = primary;
  if (f.alive && m.t < f.protectUntil && f.primary !== primary) {
    f.primary = primary; f.slot = 0; f.mag[0] = WEAPONS[primary].mag; f.reserve = WEAPONS[primary].reserve; f.reloadEnd = 0; f.burstLeft = 0;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------------------------------------------------

export function serialize(m: Match): unknown {
  return { ...m, mapRevision: mapOf(m).revision ?? 1, events: [], fighters: m.fighters.map(f => ({ ...f, mag: [...f.mag] })), projectiles: m.projectiles.map(p => ({ ...p })), pickups: m.pickups.map(p => ({ ...p })) };
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const FIGHTER_NUMBERS = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'yaw', 'pitch', 'health', 'respawnAt', 'lastHurt', 'lastAttacker', 'reserve', 'reloadEnd', 'reloadStart', 'nextFire', 'burstLeft', 'burstNext', 'bloom', 'grenades', 'nextGrenade', 'kills', 'deaths', 'score', 'streak', 'bestStreak', 'shieldUntil', 'boostUntil', 'protectUntil', 'headshots', 'zoneSeconds', 'queued'] as const;

/** Rebuilds a saved match, or returns null for anything malformed or from another version. */
export function restore(value: unknown): Match | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<Match> & { mapRevision?: number };
  const s = v.settings as Partial<MatchSettings> | undefined;
  if (v.version !== SAVE_VERSION || !s || !MODE_IDS.includes(s.mode!) || !isMapId(s.map) || !DIFFICULTIES.includes(s.difficulty!) || !isPrimary(s.primary) || !num(s.seed)) return null;
  if (!num(v.t) || v.t < 0 || !num(v.rng) || !Array.isArray(v.fighters) || v.fighters.length !== FIGHTERS) return null;
  const m = createMatch({ mode: s.mode!, map: s.map, difficulty: s.difficulty!, primary: s.primary, seed: s.seed });
  const layoutChanged = (v.mapRevision ?? 1) !== (mapOf(m).revision ?? 1);
  m.t = v.t; m.rng = v.rng >>> 0; m.events.length = 0;
  for (let i = 0; i < FIGHTERS; i++) {
    const src = v.fighters[i] as unknown as Record<string, unknown>, f = m.fighters[i] as unknown as Record<string, unknown>;
    if (!src || typeof src !== 'object' || src.id !== i) return null;
    for (const k of FIGHTER_NUMBERS) { if (!num(src[k])) return null; f[k] = src[k]; }
    for (const k of ['alive', 'grounded', 'trigger', 'ads'] as const) { if (typeof src[k] !== 'boolean') return null; f[k] = src[k]; }
    if (!isPrimary(src.primary) || !isPrimary(src.nextPrimary) || (src.slot !== 0 && src.slot !== 1)) return null;
    if (!Array.isArray(src.mag) || src.mag.length !== 2 || !src.mag.every(num)) return null;
    if (typeof src.name !== 'string' || src.name.length > 40) return null;
    f.primary = src.primary; f.nextPrimary = src.nextPrimary; f.slot = src.slot; f.mag = [...src.mag]; f.name = src.name;
    const g = m.fighters[i];
    g.health = Math.max(0, Math.min(BODY.maxHealth, g.health));
    g.mag[0] = Math.max(0, Math.min(WEAPONS[g.primary].mag, Math.floor(g.mag[0])));
    g.mag[1] = Math.max(0, Math.min(WEAPONS.pencil.mag, Math.floor(g.mag[1])));
    g.reserve = Math.max(0, Math.min(WEAPONS[g.primary].reserve, Math.floor(g.reserve)));
    g.grenades = Math.max(0, Math.min(MAX_GRENADES, Math.floor(g.grenades)));
    g.kills = Math.max(0, Math.floor(g.kills)); g.deaths = Math.max(0, Math.floor(g.deaths)); g.score = Math.max(0, Math.floor(g.score));
    g.pitch = Math.max(-1.45, Math.min(1.45, g.pitch));
    if (g.lastAttacker < -1 || g.lastAttacker >= FIGHTERS) g.lastAttacker = -1;
    g.lastAttacker = Math.floor(g.lastAttacker);
    if (g.alive && g.health <= 0) g.health = 1;
    if (g.alive && (layoutChanged || overlaps(worldFor(m), g.x, g.y + 0.02, g.z))) respawnInPlace(m, g);
  }
  if (!Array.isArray(v.teamScores) || v.teamScores.length !== 2 || !v.teamScores.every(num)) return null;
  m.teamScores = [Math.max(0, Math.floor(v.teamScores[0])), Math.max(0, Math.floor(v.teamScores[1]))];
  const zones = mapOf(m).zones.length;
  if (!num(v.zoneIndex) || v.zoneIndex < 0 || (!layoutChanged && v.zoneIndex >= zones) || !num(v.zoneNext) || !num(v.zoneOwner)) return null;
  m.zoneIndex = layoutChanged ? 0 : Math.floor(v.zoneIndex); m.zoneNext = Math.max(m.t, v.zoneNext); m.zoneOwner = Math.max(-2, Math.min(1, Math.floor(v.zoneOwner)));
  const acc = (n: number) => Math.max(0, Math.min(0.999, n));
  if (Array.isArray(v.zoneAcc) && v.zoneAcc.length === 2 && v.zoneAcc.every(num)) m.zoneAcc = [acc(v.zoneAcc[0]), acc(v.zoneAcc[1])];
  m.over = v.over === true;
  m.winner = num(v.winner) ? v.winner : -1;
  m.projectiles = !layoutChanged && Array.isArray(v.projectiles) ? (v.projectiles as Projectile[]).filter(p => p && (p.kind === 'rocket' || p.kind === 'grenade') && [p.x, p.y, p.z, p.vx, p.vy, p.vz, p.age, p.fuse].every(num) && Number.isInteger(p.owner) && p.owner >= 0 && p.owner < FIGHTERS
      && (p.kind === 'grenade' || Math.hypot(p.vx, p.vy, p.vz) > 1) && Math.hypot(p.vx, p.vy, p.vz) < 100)
      .slice(0, 32).map(p => ({ ...p, age: Math.max(0, p.age), fuse: Math.max(0, Math.min(5, p.fuse)) })) : [];
  if (!layoutChanged && Array.isArray(v.pickups)) {
    const list = (v.pickups as Pickup[]).filter(p => p && (p.kind === 'ammo' || p.kind === 'grenade') && [p.id, p.x, p.y, p.z, p.respawnAt, p.expires].every(num) && typeof p.active === 'boolean' && typeof p.dropped === 'boolean').slice(0, 48);
    const ids = new Set<number>();
    m.pickups = list.filter(p => !ids.has(p.id) && ids.add(p.id)).map(p => ({ ...p }));
    m.nextPickupId = Math.max(1, ...m.pickups.map(p => p.id + 1));
  }
  return m;
}
