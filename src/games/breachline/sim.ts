/** The authoritative match, run by the host (and by a solo player's own device). It owns rounds, seats, damage,
 * destruction, gadgets and objectives. Fighters reach it only through Commands and pose reports. */
import { ATK, BOT_NAMES, CELL, CHARGE, DEF, GRENADE, HEAD_MULT, INTERACT_REACH, KITS, MAX_PENETRATIONS, MELEE, MOVE, PENETRATION, ROUND, TICK, WEAPONS, type WeaponId } from './config';
import { MAP, newWorld, siteAt } from './map';
import { ACT, control, equip, frozen, kitOf, living, mayFire, newPlayer, nextRandom, roleOf, shotDirs, type ActId, type Aim, type Command, type EndReason, type Intent, type Match, type MatchConfig, type Player } from './state';
import { bite, bodyHeight, fillPanel, obstruction, panelPoint, panelU, panelV, rayBody, resetPanels, resolve, trace, viewDir, type Panel, type Pose, type World } from './world';

const HISTORY = 48;
/** Poses of every seat for the last HISTORY ticks, so a shot is judged against what the shooter saw. */
const history = new WeakMap<Match, { frames: Float32Array[]; head: number }>();

export function createMatch(cfg: MatchConfig, seed: number): Match {
  const m: Match = {
    world: newWorld(), cfg: { ...cfg, teamSize: Math.max(1, Math.min(ROUND.maxTeam, Math.floor(cfg.teamSize))) }, players: [], phase: 'lobby', t: 0, time: 0, tick: 0, round: 0,
    wins: [0, 0], attackers: 0, spawn: 0, device: null, roundWinner: -1, reason: '', winner: -1, grenades: [], charges: [], nextId: 1, events: [], rng: seed | 0,
  };
  history.set(m, { frames: Array.from({ length: HISTORY }, () => new Float32Array(ROUND.maxTeam * 2 * 5)), head: 0 });
  return m;
}

// ---- Seats -------------------------------------------------------------------------------------------------------------
/** Rebuilds the seats in the lobby: people first, alternating squads, then bots up to the team size. */
export function seat(m: Match, people: readonly { owner: string; name: string; squad?: 0 | 1 }[]) {
  const size = Math.max(m.cfg.teamSize, Math.ceil(people.length / 2)), counts = [0, 0];
  const old = new Map(m.players.filter(p => p.owner).map(p => [p.owner, p]));
  m.players = [];
  const add = (squad: 0 | 1, name: string, bot: boolean, owner: string) => {
    const p = newPlayer(m.players.length, squad, name, bot, owner), was = old.get(owner);
    if (was && owner) { p.kit = was.kit; p.kills = was.kills; p.deaths = was.deaths; p.score = was.score; }
    m.players.push(p); counts[squad]++;
  };
  for (const h of people) {
    let squad: 0 | 1 = h.squad ?? (old.get(h.owner)?.squad ?? (counts[0] <= counts[1] ? 0 : 1));
    if (counts[squad] >= size) squad = squad ? 0 : 1;
    add(squad, h.name, false, h.owner);
  }
  if (m.cfg.bots) {
    let n = 0;
    for (const squad of [0, 1] as const) while (counts[squad] < size) add(squad, BOT_NAMES[n++ % BOT_NAMES.length], true, '');
  }
  m.players.forEach((p, i) => { p.id = i; });
}
/** Someone joined mid-match: they take over a bot (their own squad's choice does not apply). -1 when no seat is free. */
export function takeSeat(m: Match, owner: string, name: string): number {
  const mine = m.players.find(p => p.owner === owner);
  if (mine) return mine.id;
  const counts = [0, 1].map(s => m.players.filter(p => p.squad === s && !p.bot).length);
  const bots = m.players.filter(p => p.bot).sort((a, b) => counts[a.squad] - counts[b.squad] || Number(b.alive) - Number(a.alive) || a.id - b.id);
  const p = bots[0];
  if (!p) return -1;
  p.bot = false; p.gone = false; p.owner = owner; p.name = name;
  return p.id;
}
/** Someone left: a bot takes the seat, or the fighter falls if bots are off. */
export function freeSeat(m: Match, owner: string) {
  const p = m.players.find(q => q.owner === owner);
  if (!p) return;
  p.owner = ''; p.bot = true; p.using = false;
  if (m.cfg.bots) { p.name = BOT_NAMES[p.id % BOT_NAMES.length]; return; }
  // Bots are off: the seat stays empty for the rest of the match.
  p.gone = true; p.name = `${p.name} (left)`;
  if (p.alive && m.phase !== 'lobby') eliminate(m, p, p, 'left', false);
}

// ---- Rounds ------------------------------------------------------------------------------------------------------------
function phaseEvent(m: Match) { m.events.push({ e: 'phase', phase: m.phase, round: m.round, attackers: m.attackers, wins: [m.wins[0], m.wins[1]], spawn: m.spawn, winner: m.phase === 'over' ? m.winner : m.roundWinner, reason: m.reason }); }
export function startMatch(m: Match) {
  m.wins = [0, 0]; m.round = 0; m.winner = -1;
  for (const p of m.players) { p.kills = p.deaths = p.score = 0; }
  startRound(m);
}
export function startRound(m: Match) {
  m.round++;
  m.attackers = (Math.floor((m.round - 1) / ROUND.swapAfter) % 2) as 0 | 1;
  m.spawn = Math.floor(nextRandom(m) * MAP.attackSpawns.length);
  m.device = null; m.grenades = []; m.charges = []; m.roundWinner = -1; m.reason = '';
  resetPanels(m.world);
  const n = [0, 0], at: [number, number, number, number][] = [];
  for (const p of m.players) {
    if (p.gone) { p.alive = false; p.hp = 0; p.act = ACT.none; continue; }
    const role = roleOf(m, p), s = role === ATK ? MAP.attackSpawns[m.spawn].points[n[0]++ % 5] : MAP.defendSpawns[n[1]++ % MAP.defendSpawns.length];
    p.alive = true; p.hp = 100; p.x = s.x; p.z = s.z; p.yaw = s.yaw; p.pitch = 0; p.vx = p.vz = 0; p.crouch = p.lean = 0; p.crouching = false; p.pace = 0;
    p.act = ACT.none; p.actT = 0; p.actTarget = -1; p.lastShot = -1; p.poseAt = m.time; p.slack = 0.5; p.shotTokens = 1; p.shotAt = m.time;
    if (p.kit >= KITS[role].length) p.kit = 0;
    equip(m, p);
    at.push([p.id, s.x, s.z, s.yaw]);
  }
  m.phase = 'prep'; m.t = ROUND.prep;
  phaseEvent(m);
  m.events.push({ e: 'spawn', at });
}
function endRound(m: Match, squad: 0 | 1, reason: EndReason) {
  if (m.phase === 'end' || m.phase === 'over') return;
  m.roundWinner = squad; m.reason = reason; m.wins[squad]++;
  for (const p of m.players) { if (p.squad === squad) p.score += 50; p.act = ACT.none; p.actT = 0; p.using = false; }
  m.phase = 'end'; m.t = ROUND.end;
  phaseEvent(m);
}

// ---- Damage ------------------------------------------------------------------------------------------------------------
function eliminate(m: Match, target: Player, by: Player, weapon: string, head: boolean) {
  target.alive = false; target.hp = 0; target.deaths++; target.act = ACT.none; target.actT = 0; target.using = false; target.vx = target.vz = 0; target.pace = 0;
  if (by !== target && by.squad !== target.squad) { by.kills++; by.score += 100; }
  m.events.push({ e: 'kill', by: by.id, on: target.id, w: weapon, head });
}
export function hurt(m: Match, target: Player, by: Player, amount: number, weapon: string, head: boolean) {
  if (!target.alive || amount <= 0 || m.phase === 'end' || m.phase === 'over') return;
  const dmg = Math.max(1, Math.round(amount));
  target.hp = Math.max(0, target.hp - dmg);
  m.events.push({ e: 'hit', by: by.id, on: target.id, dmg, head, hp: target.hp });
  if (target.hp <= 0) eliminate(m, target, by, weapon, head);
}
function chew(m: Match, panel: Panel, u: number, y: number, radius: number, cause: 0 | 1 | 2) {
  const c = bite(m.world, panel, u, y, radius);
  if (c.length) m.events.push({ e: 'cells', p: panel.id, c, cause });
  return c.length;
}

function poseAt(m: Match, p: Player, rewind: number): Pose {
  const h = history.get(m), back = Math.min(HISTORY - 1, Math.round(rewind / TICK));
  if (!h || back <= 0 || p.id * 5 + 4 >= h.frames[0].length) return p;
  const f = h.frames[(h.head - back + HISTORY * 2) % HISTORY], i = p.id * 5;
  // A seat that only just spawned has no history worth using.
  if (f[i + 4] === 0 && f[i] === 0 && f[i + 1] === 0) return p;
  return { x: f[i], z: f[i + 1], yaw: f[i + 2], crouch: f[i + 3], lean: f[i + 4] - 2 };
}
function record(m: Match) {
  const h = history.get(m);
  if (!h) return;
  h.head = (h.head + 1) % HISTORY;
  const f = h.frames[h.head];
  for (const p of m.players) { const i = p.id * 5; if (i + 4 >= f.length) break; f[i] = p.x; f[i + 1] = p.z; f[i + 2] = p.yaw; f[i + 3] = p.crouch; f[i + 4] = p.lean + 2; }
}

const falloff = (w: WeaponId, dist: number) => { const [a, b, min] = WEAPONS[w].falloff; return dist <= a ? 1 : dist >= b ? min : 1 - (1 - min) * (dist - a) / (b - a); };
const validAim = (a: Aim) => [a.x, a.y, a.z, a.yaw, a.pitch].every(Number.isFinite) && a.y > 0.2 && a.y < 2.2;
/** A command's origin must be near where the host believes the fighter stands. */
function near(p: Player, a: Aim, slack = 2.2) { return validAim(a) && Math.hypot(a.x - p.x, a.z - p.z) <= slack; }

function fire(m: Match, p: Player, c: Extract<Command, { c: 'shot' }>, rewind: number) {
  const kit = kitOf(m, p), def = WEAPONS[c.w];
  if (!mayFire(m, p) || !def || (c.w !== kit.primary && c.w !== 'pistol') || !near(p, c)) return;
  if (!(c.spread >= 0 && c.spread < 0.5)) return;
  // Shots can arrive in a bunch after a network hiccup, so allow a short burst but never a faster average.
  const cap = def.interval < 0.25 ? 3 : 1.2;
  p.shotTokens = Math.min(cap, p.shotTokens + (m.time - p.shotAt) / (def.interval * 0.92)); p.shotAt = m.time;
  if (p.shotTokens < 1) return;
  p.shotTokens -= 1;
  p.lastShot = m.time;
  m.events.push({ e: 'shot', id: p.id, w: c.w, x: c.x, y: c.y, z: c.z, yaw: c.yaw, pitch: c.pitch, spread: c.spread, seed: c.seed });
  const damage = new Map<Player, { amount: number; head: boolean }>();
  for (const d of shotDirs(c.yaw, c.pitch, c.spread, def.pellets, c.seed)) {
    const tr = trace(m.world, c.x, c.y, c.z, d.x, d.y, d.z, 120);
    let stop = tr.t;
    // More layers than a round can pass: it dies in the last one it reaches.
    if (tr.soft.length > MAX_PENETRATIONS) stop = tr.soft[MAX_PENETRATIONS].t + 1e-3;
    let hit: Player | null = null, head = false;
    for (const q of m.players) {
      if (q === p || !q.alive || q.squad === p.squad) continue;
      const r = rayBody(c.x, c.y, c.z, d.x, d.y, d.z, poseAt(m, q, rewind), stop);
      if (r) { stop = r.t; hit = q; head = r.head; }
    }
    let power = 1, layers = 0;
    for (const s of tr.soft) {
      if (s.t > stop || layers > MAX_PENETRATIONS) break;
      layers++;
      power *= PENETRATION[s.panel.kind === 'wall' ? 0 : 1];
      chew(m, s.panel, panelU(s.panel, c.x + d.x * s.t, c.z + d.z * s.t), c.y + d.y * s.t, def.bite, 0);
    }
    if (hit) {
      const amount = def.damage * falloff(c.w, stop) * power * (head ? HEAD_MULT : 1), was = damage.get(hit);
      damage.set(hit, { amount: (was?.amount ?? 0) + amount, head: head || !!was?.head });
    }
  }
  for (const [q, v] of damage) hurt(m, q, p, v.amount, def.name, v.head);
}

function melee(m: Match, p: Player, a: Aim, rewind: number) {
  if (!mayFire(m, p) || !near(p, a) || m.time - p.lastMelee < MELEE.interval * 0.8) return;
  p.lastMelee = m.time;
  m.events.push({ e: 'melee', id: p.id });
  const d = viewDir(a.yaw, a.pitch), tr = trace(m.world, a.x, a.y, a.z, d.x, d.y, d.z, MELEE.range);
  const wall = tr.soft[0], limit = wall ? wall.t : tr.t;
  for (const q of m.players) {
    if (q === p || !q.alive || q.squad === p.squad) continue;
    if (rayBody(a.x, a.y - 0.15, a.z, d.x, d.y, d.z, poseAt(m, q, rewind), limit + 0.25)) { hurt(m, q, p, MELEE.damage, 'Melee', false); return; }
  }
  if (wall) chew(m, wall.panel, panelU(wall.panel, a.x + d.x * wall.t, a.z + d.z * wall.t), a.y + d.y * wall.t, wall.panel.kind === 'wall' ? MELEE.bite : MELEE.plank, 2);
}

/** Blast: opens every destructible panel in reach and hurts fighters with a path to the centre. */
function explode(m: Match, x: number, y: number, z: number, by: Player, kind: 'frag' | 'impact' | 'charge', wall: number, radius: number, damage: number, name: string) {
  m.events.push({ e: 'boom', kind, x, y, z });
  for (const p of m.world.panels) {
    if (!p.intact || p.reinforced) continue;
    const u = panelU(p, x, z), dist = Math.abs(panelV(p, x, z) - p.pos);
    if (dist >= wall || u < p.u0 - wall || u > p.u0 + p.cols * CELL + wall) continue;
    chew(m, p, u, y, Math.sqrt(wall * wall - dist * dist), 1);
  }
  for (const q of m.players) {
    if (!q.alive || (q.squad === by.squad && q !== by)) continue;
    const dist = Math.hypot(q.x - x, 0.9 - y, q.z - z);
    if (dist >= radius) continue;
    const block = Math.min(obstruction(m.world, x, y, z, q.x, 1.0, q.z), obstruction(m.world, x, y, z, q.x, 0.35, q.z));
    if (block >= 4) continue;
    hurt(m, q, by, damage * (1 - dist / radius) * Math.pow(0.5, block), name, false);
  }
}

function throwGrenade(m: Match, p: Player, a: Aim) {
  if (!mayFire(m, p) || p.grenades <= 0 || !near(p, a)) return;
  p.grenades--;
  const kind = roleOf(m, p) === ATK ? 'frag' : 'impact', g = GRENADE[kind], d = viewDir(a.yaw, Math.min(1.3, a.pitch + 0.1));
  m.grenades.push({ id: m.nextId++, kind, by: p.id, x: a.x + d.x * 0.35, y: a.y - 0.1 + d.y * 0.35, z: a.z + d.z * 0.35, vx: d.x * g.speed + p.vx * 0.5, vy: d.y * g.speed + 1.2, vz: d.z * g.speed + p.vz * 0.5, fuse: g.fuse });
  m.events.push({ e: 'throw', id: p.id, kind });
}
function stepGrenades(m: Match, dt: number) {
  for (let i = m.grenades.length - 1; i >= 0; i--) {
    const g = m.grenades[i], def = GRENADE[g.kind], owner = m.players[g.by];
    g.fuse -= dt; g.vy -= 15 * dt;
    let left = dt, burst = g.fuse <= 0;
    for (let n = 0; n < 3 && left > 1e-5 && !burst; n++) {
      const speed = Math.hypot(g.vx, g.vy, g.vz);
      if (speed < 1e-4) break;
      const dx = g.vx / speed, dy = g.vy / speed, dz = g.vz / speed, len = speed * left;
      const tr = trace(m.world, g.x, g.y, g.z, dx, dy, dz, len + 0.08), soft = tr.soft[0];
      const t = soft ? soft.t : tr.solid ? tr.t : Infinity;
      if (t > len + 0.08) { g.x += dx * len; g.y += dy * len; g.z += dz * len; break; }
      const back = Math.max(0, t - 0.08);
      g.x += dx * back; g.y += dy * back; g.z += dz * back;
      if (g.kind === 'impact') { burst = true; break; }
      let nx = tr.nx, ny = tr.ny, nz = tr.nz;
      if (soft) { nx = soft.panel.axis === 'z' ? -Math.sign(dx) : 0; ny = 0; nz = soft.panel.axis === 'x' ? -Math.sign(dz) : 0; }
      const dot = g.vx * nx + g.vy * ny + g.vz * nz;
      g.vx = (g.vx - 2 * dot * nx) * 0.5; g.vy = (g.vy - 2 * dot * ny) * (ny ? 0.38 : 0.5); g.vz = (g.vz - 2 * dot * nz) * 0.5;
      if (ny > 0.5) { g.vx *= 0.72; g.vz *= 0.72; if (Math.abs(g.vy) < 0.9) g.vy = 0; }
      if (Math.abs(dot) > 1.5) m.events.push({ e: 'bounce', x: g.x, y: g.y, z: g.z });
      left *= 1 - back / Math.max(len, 1e-6);
    }
    if (g.y < 0.06) { g.y = 0.06; if (g.vy < 0) g.vy = 0; }
    if (burst) {
      m.grenades.splice(i, 1);
      if (owner) explode(m, g.x, Math.max(0.15, g.y), g.z, owner, g.kind, def.wall, def.radius, def.damage, g.kind === 'frag' ? 'Frag grenade' : 'Impact grenade');
    }
  }
}

// ---- Panels a fighter is facing ----------------------------------------------------------------------------------------
/** The panel rectangle (whole or open) the aim crosses first within reach, unless something solid is in the way. */
export function aimedPanel(world: World, a: Aim, reach: number): { panel: Panel; u: number; y: number; t: number; side: 1 | -1 } | null {
  const d = viewDir(a.yaw, a.pitch), solid = trace(world, a.x, a.y, a.z, d.x, d.y, d.z, reach);
  let best: { panel: Panel; u: number; y: number; t: number; side: 1 | -1 } | null = null;
  for (const p of world.panels) {
    const dv = p.axis === 'x' ? d.z : d.x, ov = p.axis === 'x' ? a.z : a.x;
    if (Math.abs(dv) < 1e-6) continue;
    const t = (p.pos - ov) / dv;
    if (t <= 0.05 || t > reach || t > (solid.panel === p ? solid.t + 0.01 : solid.t) || (best && t >= best.t)) continue;
    const u = (p.axis === 'x' ? a.x + d.x * t : a.z + d.z * t), y = a.y + d.y * t;
    if (u < p.u0 || u > p.u0 + p.cols * CELL || y < p.y0 || y > p.y0 + p.rows * CELL) continue;
    best = { panel: p, u, y, t, side: ov < p.pos ? -1 : 1 };
  }
  return best;
}
const doorwayBusy = (m: Match, panel: Panel) => m.players.some(q => q.alive && Math.abs(panelV(panel, q.x, q.z) - panel.pos) < 0.42 && panelU(panel, q.x, q.z) > panel.u0 - 0.3 && panelU(panel, q.x, q.z) < panel.u0 + panel.cols * CELL + 0.3);
/** What holding Use would do right now (also drives the on-screen prompt). */
export function interaction(m: Match, p: Player, a: Aim): { act: ActId; target: number } | null {
  if (!p.alive) return null;
  const role = roleOf(m, p);
  if (role === ATK) return m.phase === 'action' && !m.device && siteAt(p.x, p.z) >= 0 ? { act: ACT.plant, target: siteAt(p.x, p.z) } : null;
  if (m.phase === 'planted' && m.device && Math.hypot(m.device.x - p.x, m.device.z - p.z) < 1.9) return { act: ACT.defuse, target: 0 };
  if (m.phase !== 'prep' && m.phase !== 'action' && m.phase !== 'planted') return null;
  const hit = aimedPanel(m.world, a, INTERACT_REACH);
  if (!hit) return null;
  const panel = hit.panel;
  if (panel.kind === 'wall') return !panel.reinforced && p.reinforcements > 0 ? { act: ACT.reinforce, target: panel.id } : null;
  return panel.intact < panel.cells.length && !doorwayBusy(m, panel) ? { act: ACT.barricade, target: panel.id } : null;
}
const ACT_TIME: Record<number, number> = { [ACT.plant]: ROUND.plant, [ACT.defuse]: ROUND.defuse, [ACT.reinforce]: ROUND.reinforce, [ACT.barricade]: ROUND.barricade, [ACT.charge]: ROUND.charge };
export const actDuration = (act: number) => ACT_TIME[act] ?? 1;

function beginAct(m: Match, p: Player, act: ActId, target: number) { p.act = act; p.actT = 0; p.actTarget = target; p.actX = p.x; p.actZ = p.z; p.vx = p.vz = 0; }
function use(m: Match, p: Player, c: Extract<Command, { c: 'use' }>) {
  if (!c.on) { if (p.act !== ACT.none && p.act !== ACT.charge) { p.act = ACT.none; p.actT = 0; } return; }
  if (p.act !== ACT.none || !near(p, c)) return;
  const what = interaction(m, p, c);
  if (what) beginAct(m, p, what.act, what.target);
}
function breach(m: Match, p: Player, a: Aim) {
  if (!mayFire(m, p) || roleOf(m, p) !== ATK || !near(p, a)) return;
  const mine = m.charges.find(c => c.by === p.id);
  if (mine) { if (mine.age >= CHARGE.arm) detonate(m, mine); return; }
  if (p.charges <= 0) return;
  const hit = aimedPanel(m.world, a, CHARGE.reach);
  if (!hit || hit.panel.reinforced) return;
  const col = Math.floor((hit.u - hit.panel.u0) / CELL), row = Math.floor((hit.y - hit.panel.y0) / CELL);
  if (!hit.panel.cells[row * hit.panel.cols + col]) return;
  beginAct(m, p, ACT.charge, hit.panel.id);
  // Remember where on the panel it goes.
  p.actX = hit.u; p.actZ = hit.y;
  pendingSide.set(p, hit.side);
}
const pendingSide = new WeakMap<Player, 1 | -1>();
function detonate(m: Match, c: { id: number; by: number; panel: number; u: number; y: number; side: 1 | -1 }) {
  const panel = m.world.panels[c.panel], owner = m.players[c.by];
  m.charges = m.charges.filter(v => v.id !== c.id);
  m.events.push({ e: 'chargeOff', id: c.id });
  if (!panel || !owner) return;
  const at = panelPoint(panel, c.u, c.y, c.side * 0.12);
  explode(m, at.x, at.y, at.z, owner, 'charge', CHARGE.wall, CHARGE.radius, CHARGE.damage, 'Breach charge');
}

function finishAct(m: Match, p: Player) {
  const act = p.act, target = p.actTarget;
  p.act = ACT.none; p.actT = 0; p.using = false;
  if (act === ACT.plant) {
    const site = siteAt(p.x, p.z);
    if (m.phase !== 'action' || m.device || site === -1) return;
    m.device = { site, x: p.x, z: p.z, by: p.id }; p.score += 150;
    m.events.push({ e: 'plant', by: p.id, site, x: p.x, z: p.z });
    m.phase = 'planted'; m.t = ROUND.fuse; phaseEvent(m);
  } else if (act === ACT.defuse) {
    if (m.phase !== 'planted') return;
    p.score += 200;
    m.events.push({ e: 'defused', by: p.id });
    endRound(m, p.squad, 'defused');
  } else if (act === ACT.reinforce || act === ACT.barricade) {
    const panel = m.world.panels[target];
    if (!panel) return;
    if (act === ACT.reinforce) { if (p.reinforcements <= 0 || panel.reinforced || panel.kind !== 'wall') return; p.reinforcements--; }
    else if (doorwayBusy(m, panel)) return;
    fillPanel(m.world, panel, act === ACT.reinforce);
    m.events.push({ e: 'panel', p: panel.id, s: act === ACT.reinforce ? 2 : 1, by: p.id });
    for (const c of m.charges.filter(v => v.panel === panel.id && act === ACT.reinforce)) { m.charges = m.charges.filter(v => v !== c); m.events.push({ e: 'chargeOff', id: c.id }); }
  } else if (act === ACT.charge) {
    const panel = m.world.panels[target];
    if (!panel || panel.reinforced || p.charges <= 0) return;
    p.charges--;
    const c = { id: m.nextId++, by: p.id, panel: panel.id, u: p.actX, y: p.actZ, side: pendingSide.get(p) ?? 1, age: 0 };
    m.charges.push(c);
    m.events.push({ e: 'charge', id: c.id, by: c.by, p: c.panel, u: c.u, y: c.y, side: c.side });
  }
}
function stepActs(m: Match, dt: number) {
  for (const p of m.players) {
    if (p.act === ACT.none) continue;
    const anchor = p.act === ACT.charge ? null : { x: p.actX, z: p.actZ };
    const ok = p.alive && (m.phase === 'prep' || m.phase === 'action' || m.phase === 'planted')
      && (!anchor || Math.hypot(p.x - anchor.x, p.z - anchor.z) < 1.2)
      && (p.act !== ACT.plant || (m.phase === 'action' && !m.device)) && (p.act !== ACT.defuse || m.phase === 'planted');
    if (!ok) { p.act = ACT.none; p.actT = 0; continue; }
    p.actT += dt;
    if (p.actT >= actDuration(p.act)) finishAct(m, p);
  }
  for (const c of [...m.charges]) {
    c.age += dt;
    const panel = m.world.panels[c.panel], col = Math.floor((c.u - panel.u0) / CELL), row = Math.floor((c.y - panel.y0) / CELL);
    // A charge falls off when its patch of wall is gone, and is lost with its owner.
    if (!panel.cells[row * panel.cols + col] || panel.reinforced || !m.players[c.by]?.alive) { m.charges = m.charges.filter(v => v !== c); m.events.push({ e: 'chargeOff', id: c.id }); }
  }
}

// ---- Commands and poses from fighters -----------------------------------------------------------------------------------
/** Judges one command. `rewind` is how far behind the host this fighter's view runs, in seconds. */
export function command(m: Match, id: number, c: Command, rewind = 0) {
  const p = m.players[id];
  if (!p || !c || typeof c !== 'object') return;
  switch (c.c) {
    case 'shot': fire(m, p, c, rewind); break;
    case 'melee': melee(m, p, c, rewind); break;
    case 'nade': throwGrenade(m, p, c); break;
    case 'breach': breach(m, p, c); break;
    case 'use': use(m, p, c); break;
    case 'reload': if (p.alive && m.time - p.lastReload > 0.5) { p.lastReload = m.time; m.events.push({ e: 'reload', id }); } break;
    case 'kit': {
      const kit = Math.floor(c.kit);
      if (!(kit >= 0 && kit < KITS[roleOf(m, p)].length) || kit === p.kit) break;
      // A kit is chosen while preparing (or between rounds, for the next one), never mid-fight.
      if (m.phase === 'action' || m.phase === 'planted') break;
      p.kit = kit;
      if (m.phase === 'prep' && p.alive) equip(m, p);
      m.events.push({ e: 'kit', id, kit });
      break;
    }
  }
}
/** A guest's report of where its fighter is. The host accepts it only if the fighter could have walked there:
 * within the distance a sprint allows since the last accepted report, not while frozen, not inside anything solid,
 * and not out of the building while defenders are penned in. Otherwise it is refused and the guest is put back. */
export function report(m: Match, id: number, x: number, z: number, yaw: number, pitch: number, crouch: number, lean: number, flags: number, slot: number) {
  const p = m.players[id];
  if (!p || !p.alive || ![x, z, yaw, pitch, crouch, lean].every(Number.isFinite) || Math.abs(yaw) > 1e4) return;
  p.yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw)); p.pitch = Math.max(-1.45, Math.min(1.45, pitch));
  p.crouch = Math.max(0, Math.min(1, crouch)); p.lean = Math.max(-1, Math.min(1, lean));
  p.crouching = !!(flags & 1); p.ads = !!(flags & 2); p.sprint = !!(flags & 4); p.slot = slot === 1 ? 1 : 0;
  // The allowance grows with host time only, so a burst of reports cannot add up to a teleport; it holds about
  // half a second of sprinting, enough for reports that arrive in a bunch after a network hiccup.
  const dt = Math.max(0, m.time - p.poseAt), far = Math.hypot(x - p.x, z - p.z);
  const budget = Math.min(2.5, p.slack + MOVE.sprint * 1.25 * dt), still = frozen(m, p);
  p.poseAt = m.time; p.slack = budget;
  const refuse = () => { p.pace = 0; m.events.push({ e: 'fix', id, x: p.x, z: p.z }); };
  if (still ? far > 0.05 : far > budget) return refuse();
  // The way there must be open: sample the straight path closely enough that no wall panel fits between samples.
  const height = bodyHeight(p.crouch), steps = Math.max(1, Math.ceil(far / 0.2)), at = { x: 0, z: 0 };
  for (let i = 1; i <= steps; i++) {
    const sx = p.x + (x - p.x) * i / steps, sz = p.z + (z - p.z) * i / steps;
    at.x = sx; at.z = sz;
    resolve(m.world, at, height);
    if (Math.hypot(at.x - sx, at.z - sz) > (i === steps ? 0.06 : 0.2)) return refuse();
  }
  const hold = penFor(m, p);
  if (hold && (x < hold.x0 - 0.05 || x > hold.x1 + 0.05 || z < hold.z0 - 0.05 || z > hold.z1 + 0.05)) return refuse();
  p.slack = budget - far;
  p.pace = Math.min(1.6, far / Math.max(dt, TICK) / MOVE.walk);
  p.x = x; p.z = z;
}

const pen = { x0: MAP.building.x0 + 0.5, z0: MAP.building.z0 + 0.5, x1: MAP.building.x1 - 0.5, z1: MAP.building.z1 - 0.5 };
/** Defenders stay indoors until the round opens. */
export const penFor = (m: Match, p: Player) => (m.phase === 'prep' && roleOf(m, p) === DEF ? pen : null);
const scratch: Command[] = [];
/** Runs a fighter the host controls (its own person, or a bot) for one step. */
export function drive(m: Match, p: Player, intent: Intent, dt: number) {
  scratch.length = 0;
  control(m, p, intent, dt, scratch, penFor(m, p));
  p.poseAt = m.time;
  for (const c of scratch) command(m, p.id, c, 0);
}

/** Advances the match clock, gadgets, actions and win conditions by one step. */
export function step(m: Match, dt: number) {
  m.tick++; m.time += dt;
  if (m.phase === 'lobby' || m.phase === 'over') return;
  stepActs(m, dt);
  stepGrenades(m, dt);
  record(m);
  m.t -= dt;
  const atk = m.attackers, def = (atk ? 0 : 1) as 0 | 1;
  if (m.phase === 'prep') { if (m.t <= 0) { m.phase = 'action'; m.t = ROUND.action; phaseEvent(m); } }
  else if (m.phase === 'action') {
    if (!living(m, def)) endRound(m, atk, 'eliminated');
    else if (!living(m, atk)) endRound(m, def, 'eliminated');
    else if (m.t <= 0 && !m.players.some(p => p.act === ACT.plant)) endRound(m, def, 'time');
  } else if (m.phase === 'planted') {
    if (m.t <= 0) endRound(m, atk, 'uplink');
    else if (!living(m, def)) endRound(m, atk, 'eliminated');
  } else if (m.phase === 'end' && m.t <= 0) {
    const lead = m.wins[0] >= ROUND.toWin ? 0 : m.wins[1] >= ROUND.toWin ? 1 : -1;
    if (lead >= 0) { m.winner = lead; m.phase = 'over'; m.t = 0; phaseEvent(m); }
    else startRound(m);
  }
}

