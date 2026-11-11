/** Online play. The host runs the only authoritative match; every device runs its own fighter's movement and weapon
 * handling and sends the host pose reports and commands. The host answers with events (reliable, in order) and
 * 15 snapshots a second. A solo game is simply a host with no guests. */
import { ROUND, SKILLS, type SkillId } from './config';
import { createBrain, stepBots, type Brain } from './bots';
import { command, createMatch, drive, freeSeat, penFor, report, seat, startMatch, step, takeSeat } from './sim';
import { ACT, control, equip, newPlayer, type ActId, type Command, type Intent, type Match, type MatchConfig, type Phase, type SimEvent } from './state';
import { fillPanel, packPanels, removeCells, resetPanels, unpackPanels, type PanelState } from './world';
import type { RoomEvent, RosterEntry } from '../../multiplayer/room';

export const NET_VERSION = 'breachline-4';
export const MAX_PLAYERS = ROUND.maxTeam * 2;
const SNAPSHOT_TICKS = 4, POSE_TICKS = 3, PLAYER_FIELDS = 17;
const PHASES: Phase[] = ['lobby', 'prep', 'action', 'planted', 'end', 'over'];

/** The part of a Room this game uses (tests substitute an in-memory pair). */
export interface RoomLike {
  readonly role: 'host' | 'guest';
  readonly id: string;
  readonly players: readonly RosterEntry[];
  send(data: unknown, to?: string): void;
  on(listener: (event: RoomEvent) => void): () => void;
  rtt(id?: string): number;
}
interface SeatInfo { id: number; squad: 0 | 1; name: string; bot: boolean; owner: string; kit: number; alive: boolean; hp: number; x: number; z: number; yaw: number; kills: number; deaths: number; score: number }
interface Welcome {
  you: number; cfg: MatchConfig; phase: number; t: number; round: number; wins: [number, number]; attackers: 0 | 1; spawn: number;
  winner: number; roundWinner: number; reason: string;
  device: Match['device']; seats: SeatInfo[]; panels: PanelState[]; charges: Match['charges'];
}
type Snapshot = { n: number; ph: number; t: number; p: number[]; g: number[] };
type HostMsg = ['w', Welcome] | ['s', Snapshot] | ['e', SimEvent[]];
type GuestMsg = ['p', number, number, number, number, number, number, number, number] | ['c', Command] | ['team'];

const r2 = (v: number) => Math.round(v * 100) / 100, r3 = (v: number) => Math.round(v * 1000) / 1000;

export interface Session {
  readonly m: Match;
  /** This device's seat, or -1 while watching. */
  readonly self: number;
  readonly host: boolean;
  readonly online: boolean;
  /** One fixed step with this device's intent. */
  step(intent: Intent, dt: number): void;
  /** Events since the last call, for sound, effects and the HUD. */
  drain(): SimEvent[];
  kit(kit: number): void;
  dispose(): void;
}

// ---- Host ------------------------------------------------------------------------------------------------------------------
export class HostSession implements Session {
  readonly host = true;
  m: Match;
  brain: Brain;
  private out: SimEvent[] = [];
  private room: RoomLike | null = null;
  private off: (() => void) | null = null;
  private squads = new Map<string, 0 | 1>();
  constructor(public name: string, cfg: MatchConfig, seed: number) {
    this.m = createMatch(cfg, seed); this.brain = createBrain(this.m);
    this.reseat();
  }
  get online() { return !!this.room; }
  get self() { return this.m.players.find(p => p.owner === 'host')?.id ?? -1; }
  rename(name: string) { this.name = name; const p = this.m.players.find(q => q.owner === 'host'); if (p) p.name = name; this.reseat(); }
  private people() {
    const list = [{ owner: 'host', name: this.name, squad: this.squads.get('host') }];
    if (this.room) for (const p of this.room.players) if (p.id !== this.room.id) list.push({ owner: p.id, name: p.name, squad: this.squads.get(p.id) });
    return list;
  }
  private seatOf(owner: string) { return this.m.players.find(p => p.owner === owner)?.id ?? -1; }
  /** Lobby only: rebuild the seats from who is here and the settings. */
  reseat() { if (this.m.phase !== 'lobby') return; seat(this.m, this.people()); this.welcomeAll(); }
  configure(cfg: Partial<MatchConfig>) {
    if (this.m.phase !== 'lobby') return;
    const c = this.m.cfg;
    if (typeof cfg.teamSize === 'number') c.teamSize = Math.max(1, Math.min(ROUND.maxTeam, Math.floor(cfg.teamSize)));
    if (typeof cfg.bots === 'boolean') c.bots = cfg.bots;
    if (cfg.skill && SKILLS.includes(cfg.skill)) c.skill = cfg.skill;
    this.reseat();
  }
  /** Lobby only: move a person to the other squad. */
  swapSquad(owner = 'host') {
    const p = this.m.players.find(q => q.owner === owner);
    if (!p || this.m.phase !== 'lobby') return;
    this.squads.set(owner, p.squad ? 0 : 1);
    this.reseat();
  }
  /** Starts a match from the lobby or the result screen. False when a squad has nobody in it. */
  start(): boolean {
    if (this.m.phase !== 'lobby' && this.m.phase !== 'over') return false;
    if (this.m.phase === 'over') { this.m.phase = 'lobby'; seat(this.m, this.people()); }
    if (!this.m.players.some(p => p.squad === 0) || !this.m.players.some(p => p.squad === 1)) { this.welcomeAll(); return false; }
    // Bots plan afresh, and guests learn the seats before the round's own events reach them.
    this.brain = createBrain(this.m);
    this.welcomeAll();
    startMatch(this.m);
    return true;
  }
  /** Back to the lobby (the host chose to end the match). */
  toLobby() { this.m.phase = 'lobby'; this.m.round = 0; this.m.wins = [0, 0]; for (const p of this.m.players) p.alive = false; this.brain = createBrain(this.m); this.reseat(); }

  attach(room: RoomLike | null) {
    this.off?.(); this.off = null; this.room = room;
    if (room) this.off = room.on(e => this.onRoom(e));
    if (this.m.phase === 'lobby') this.reseat();
    else if (!room) for (const p of this.m.players) if (p.owner && p.owner !== 'host') freeSeat(this.m, p.owner);
  }
  private onRoom(e: RoomEvent) {
    if (e.type === 'joined') {
      if (this.m.phase === 'lobby') this.reseat();
      else { takeSeat(this.m, e.player.id, e.player.name); this.welcomeAll(); }
    } else if (e.type === 'left') {
      this.squads.delete(e.player.id);
      if (this.m.phase === 'lobby') this.reseat();
      else { freeSeat(this.m, e.player.id); this.welcomeAll(); }
    } else if (e.type === 'message') this.onGuest(e.from.id, e.data);
  }
  private onGuest(from: string, data: unknown) {
    if (!Array.isArray(data)) return;
    const msg = data as GuestMsg, id = this.seatOf(from);
    if (msg[0] === 'team') { this.swapSquad(from); return; }
    if (id < 0) return;
    if (msg[0] === 'p' && msg.length === 9 && msg.slice(1).every(v => typeof v === 'number')) report(this.m, id, msg[1], msg[2], msg[3], msg[4], msg[5], msg[6], msg[7], msg[8]);
    else if (msg[0] === 'c' && msg[1] && typeof msg[1] === 'object') {
      const rtt = this.room?.rtt(from) ?? 0;
      command(this.m, id, msg[1], Math.min(0.35, (Number.isFinite(rtt) ? rtt : 80) / 2000 + 0.1));
    }
  }
  private welcome(owner: string): Welcome {
    const m = this.m;
    return {
      you: this.seatOf(owner), cfg: { ...m.cfg }, phase: PHASES.indexOf(m.phase), t: r2(m.t), round: m.round, wins: [m.wins[0], m.wins[1]], attackers: m.attackers, spawn: m.spawn,
      winner: m.winner, roundWinner: m.roundWinner, reason: m.reason, device: m.device ? { ...m.device } : null,
      seats: m.players.map(p => ({ id: p.id, squad: p.squad, name: p.name, bot: p.bot, owner: p.owner, kit: p.kit, alive: p.alive, hp: p.hp, x: r2(p.x), z: r2(p.z), yaw: r3(p.yaw), kills: p.kills, deaths: p.deaths, score: p.score })),
      panels: packPanels(m.world), charges: m.charges.map(c => ({ ...c })),
    };
  }
  private welcomeAll() { if (this.room) for (const p of this.room.players) if (p.id !== this.room.id) this.room.send(['w', this.welcome(p.id)] satisfies HostMsg, p.id); }
  private snapshot(): Snapshot {
    const m = this.m, p: number[] = [], g: number[] = [];
    for (const q of m.players) p.push(r2(q.x), r2(q.z), r3(q.yaw), r3(q.pitch), r2(q.crouch), r2(q.lean),
      (q.crouching ? 1 : 0) | (q.ads ? 2 : 0) | (q.sprint ? 4 : 0) | (q.alive ? 8 : 0) | (q.slot ? 16 : 0), q.hp, q.act, r2(q.actT), q.charges, q.grenades, q.reinforcements, r2(q.pace), q.kills, q.deaths, q.score);
    for (const q of m.grenades) g.push(q.id, q.kind === 'frag' ? 0 : 1, r2(q.x), r2(q.y), r2(q.z));
    return { n: m.tick, ph: PHASES.indexOf(m.phase), t: r2(m.t), p, g };
  }
  step(intent: Intent, dt: number) {
    const m = this.m, me = m.players[this.self];
    if (m.phase !== 'lobby' && m.phase !== 'over') {
      if (me) drive(m, me, intent, dt);
      stepBots(this.brain, m, dt);
    }
    step(m, dt);
    if (m.events.length) {
      const events = m.events.splice(0);
      this.out.push(...events);
      this.room?.send(['e', events] satisfies HostMsg);
    }
    if (this.room && m.tick % SNAPSHOT_TICKS === 0 && m.phase !== 'lobby') this.room.send(['s', this.snapshot()] satisfies HostMsg);
  }
  drain() { return this.out.splice(0); }
  kit(kit: number) { const id = this.self; if (id >= 0) command(this.m, id, { c: 'kit', kit }); }
  dispose() { this.off?.(); this.off = null; this.room = null; }
}

// ---- Guest -----------------------------------------------------------------------------------------------------------------
export class GuestSession implements Session {
  readonly host = false;
  readonly online = true;
  m: Match;
  self = -1;
  /** True once the host has described the match. */
  ready = false;
  private out: SimEvent[] = [];
  private off: () => void;
  private cmds: Command[] = [];
  constructor(private room: RoomLike) {
    this.m = createMatch({ teamSize: 1, bots: false, skill: 'regular' }, 1);
    this.off = room.on(e => { if (e.type === 'message') this.onHost(e.data); });
  }
  private onHost(data: unknown) {
    if (!Array.isArray(data)) return;
    const msg = data as HostMsg;
    if (msg[0] === 'w') this.welcome(msg[1]);
    else if (!this.ready) return;
    else if (msg[0] === 's') this.snapshot(msg[1]);
    else if (msg[0] === 'e' && Array.isArray(msg[1])) for (const e of msg[1]) {
      this.apply(e);
      // Our own shots, reloads and swings were already shown when we made them.
      const own = (e.e === 'shot' || e.e === 'reload' || e.e === 'melee') && e.id === this.self;
      if (!own && this.out.length < 600) this.out.push(e);
    }
  }
  private welcome(w: Welcome) {
    if (!w || !Array.isArray(w.seats) || w.seats.length > MAX_PLAYERS) return;
    const m = this.m, old = this.self >= 0 ? m.players[this.self] : null, sameSeat = !!old && w.you === this.self && w.seats[w.you]?.owner === old.owner;
    const was = this.ready ? `${m.phase}${m.round}` : '';
    m.cfg = { teamSize: Number(w.cfg?.teamSize) || 1, bots: !!w.cfg?.bots, skill: SKILLS.includes(w.cfg?.skill as SkillId) ? w.cfg.skill : 'regular' };
    m.phase = PHASES[w.phase] ?? 'lobby'; m.t = Number(w.t) || 0; m.round = w.round | 0; m.wins = [w.wins?.[0] | 0, w.wins?.[1] | 0]; m.attackers = w.attackers ? 1 : 0; m.spawn = w.spawn | 0;
    m.winner = (w.winner === 0 || w.winner === 1 ? w.winner : -1); m.roundWinner = (w.roundWinner === 0 || w.roundWinner === 1 ? w.roundWinner : -1); m.reason = (w.reason as Match['reason']) || '';
    m.device = w.device ? { site: w.device.site ? 1 : 0, x: Number(w.device.x) || 0, z: Number(w.device.z) || 0, by: w.device.by | 0 } : null;
    m.charges = Array.isArray(w.charges) ? w.charges.filter(c => c && m.world.panels[c.panel]).map(c => ({ ...c })) : [];
    m.players = w.seats.map((s, i) => {
      if (sameSeat && i === this.self && old) { old.name = String(s.name); old.squad = s.squad ? 1 : 0; old.kit = s.kit | 0; return old; }
      const p = newPlayer(i, s.squad ? 1 : 0, String(s.name).slice(0, 24), !!s.bot, String(s.owner));
      p.kit = s.kit | 0; p.alive = !!s.alive; p.hp = Number(s.hp) || 0; p.x = Number(s.x) || 0; p.z = Number(s.z) || 0; p.yaw = Number(s.yaw) || 0;
      p.kills = s.kills | 0; p.deaths = s.deaths | 0; p.score = s.score | 0;
      equip(m, p);
      return p;
    });
    unpackPanels(m.world, w.panels);
    const changed = this.self !== w.you || !sameSeat;
    this.self = Number.isInteger(w.you) && w.you >= 0 && w.you < m.players.length ? w.you : -1;
    this.ready = true;
    // Tell the presentation when the phase is news (a first welcome, or one that changes it); a roster change
    // mid-round must not replay the round's banners and sounds.
    if (was !== `${m.phase}${m.round}`) this.out.push({ e: 'phase', phase: m.phase, round: m.round, attackers: m.attackers, wins: [m.wins[0], m.wins[1]], spawn: m.spawn, winner: m.phase === 'over' ? m.winner : m.roundWinner, reason: m.reason });
    if (changed && this.self >= 0) { const me = m.players[this.self]; this.out.push({ e: 'spawn', at: [[me.id, me.x, me.z, me.yaw]] }); }
  }
  private snapshot(s: Snapshot) {
    const m = this.m;
    if (!s || !Array.isArray(s.p) || s.p.length !== m.players.length * PLAYER_FIELDS) return;
    const phase = PHASES[s.ph];
    if (phase && phase === m.phase && Number.isFinite(s.t)) m.t = s.t;
    m.players.forEach((p, n) => {
      const i = n * PLAYER_FIELDS, f = s.p[i + 6];
      if (n !== this.self) {
        p.x = s.p[i]; p.z = s.p[i + 1]; p.yaw = s.p[i + 2]; p.pitch = s.p[i + 3]; p.crouch = s.p[i + 4]; p.lean = s.p[i + 5];
        p.crouching = !!(f & 1); p.ads = !!(f & 2); p.sprint = !!(f & 4); p.slot = f & 16 ? 1 : 0; p.pace = s.p[i + 13];
      }
      p.alive = !!(f & 8); p.hp = s.p[i + 7]; p.act = s.p[i + 8] as ActId; p.actT = s.p[i + 9];
      p.charges = s.p[i + 10]; p.grenades = s.p[i + 11]; p.reinforcements = s.p[i + 12];
      p.kills = s.p[i + 14]; p.deaths = s.p[i + 15]; p.score = s.p[i + 16];
    });
    if (Array.isArray(s.g)) {
      m.grenades = [];
      for (let i = 0; i + 4 < s.g.length; i += 5) m.grenades.push({ id: s.g[i], kind: s.g[i + 1] ? 'impact' : 'frag', by: -1, x: s.g[i + 2], y: s.g[i + 3], z: s.g[i + 4], vx: 0, vy: 0, vz: 0, fuse: 1 });
    }
  }
  /** Applies a host event to the local copy of the match. */
  private apply(e: SimEvent) {
    const m = this.m, me = this.self;
    switch (e.e) {
      case 'phase':
        m.phase = e.phase; m.round = e.round; m.attackers = e.attackers; m.wins = [e.wins[0], e.wins[1]]; m.spawn = e.spawn;
        if (e.phase === 'over') m.winner = e.winner; else m.roundWinner = e.winner;
        m.reason = e.reason;
        m.t = e.phase === 'prep' ? ROUND.prep : e.phase === 'action' ? ROUND.action : e.phase === 'planted' ? ROUND.fuse : e.phase === 'end' ? ROUND.end : 0;
        if (e.phase === 'prep') { resetPanels(m.world); m.charges = []; m.grenades = []; m.device = null; }
        break;
      case 'spawn':
        for (const [id, x, z, yaw] of e.at) {
          const p = m.players[id];
          if (!p) continue;
          p.alive = true; p.hp = 100; p.x = x; p.z = z; p.yaw = yaw; p.pitch = 0; p.vx = p.vz = 0; p.crouch = p.lean = 0; p.act = ACT.none; p.actT = 0;
          equip(m, p);
        }
        break;
      case 'cells': { const p = m.world.panels[e.p]; if (p && Array.isArray(e.c)) removeCells(m.world, p, e.c); break; }
      case 'panel': { const p = m.world.panels[e.p]; if (p) fillPanel(m.world, p, e.s === 2); break; }
      case 'hit': { const p = m.players[e.on]; if (p) p.hp = e.hp; break; }
      case 'kill': { const p = m.players[e.on]; if (p) { p.alive = false; p.hp = 0; p.act = ACT.none; } break; }
      case 'charge': if (m.world.panels[e.p]) m.charges.push({ id: e.id, by: e.by, panel: e.p, u: e.u, y: e.y, side: e.side, age: 0 }); break;
      case 'chargeOff': m.charges = m.charges.filter(c => c.id !== e.id); break;
      case 'plant': m.device = { site: e.site, x: e.x, z: e.z, by: e.by }; break;
      case 'kit': { const p = m.players[e.id]; if (p) { p.kit = e.kit; if (m.phase === 'prep' && p.alive) equip(m, p); } break; }
      case 'fix': if (e.id === me && m.players[me]) { m.players[me].x = e.x; m.players[me].z = e.z; m.players[me].vx = m.players[me].vz = 0; } break;
    }
  }
  step(intent: Intent, dt: number) {
    const m = this.m, me = m.players[this.self];
    m.tick++; m.time += dt;
    if (m.phase !== 'lobby' && m.phase !== 'over') m.t = Math.max(0, m.t - dt);
    for (const c of m.charges) c.age += dt;
    if (!this.ready || !me || m.phase === 'lobby' || m.phase === 'over') return;
    this.cmds.length = 0;
    control(m, me, intent, dt, this.cmds, penFor(m, me));
    for (const c of this.cmds) {
      this.room.send(['c', c] satisfies GuestMsg);
      // Show our own shots at once; the host's echo of them is dropped in drain().
      if (c.c === 'shot') this.out.push({ e: 'shot', id: me.id, w: c.w, x: c.x, y: c.y, z: c.z, yaw: c.yaw, pitch: c.pitch, spread: c.spread, seed: c.seed });
      else if (c.c === 'reload') this.out.push({ e: 'reload', id: me.id });
      else if (c.c === 'melee') this.out.push({ e: 'melee', id: me.id });
    }
    if (m.tick % POSE_TICKS === 0 && me.alive) {
      this.room.send(['p', r2(me.x), r2(me.z), r3(me.yaw), r3(me.pitch), r2(me.crouch), r2(me.lean), (me.crouching ? 1 : 0) | (me.ads ? 2 : 0) | (me.sprint ? 4 : 0), me.slot] satisfies GuestMsg);
    }
  }
  drain() { return this.out.splice(0); }
  kit(kit: number) { this.room.send(['c', { c: 'kit', kit }] satisfies GuestMsg); }
  swapSquad() { this.room.send(['team'] satisfies GuestMsg); }
  dispose() { this.off(); }
}

