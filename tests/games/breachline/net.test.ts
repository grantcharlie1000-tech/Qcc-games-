import { describe, expect, it } from 'vitest';
import { ROUND, TICK } from '../../../src/games/breachline/config';
import { GuestSession, HostSession, type RoomLike } from '../../../src/games/breachline/net';
import { aimOf, idleIntent, roleOf, type Intent } from '../../../src/games/breachline/state';
import { packPanels } from '../../../src/games/breachline/world';
import type { RoomEvent, RosterEntry } from '../../../src/multiplayer/room';

/** An in-memory room: a host and any number of guests, with every message passed through JSON like the wire. */
function hub() {
  const roster: RosterEntry[] = [{ id: 'h', seat: 0, name: 'Hana', host: true }];
  const hostListeners = new Set<(e: RoomEvent) => void>(), guests = new Map<string, Set<(e: RoomEvent) => void>>();
  const wire = (v: unknown) => JSON.parse(JSON.stringify(v));
  const emit = (set: Set<(e: RoomEvent) => void> | undefined, e: RoomEvent) => { for (const l of [...(set ?? [])]) l(e); };
  const host: RoomLike = {
    role: 'host', id: 'h', get players() { return roster; }, rtt: () => 40,
    send(data, to) { for (const [id, set] of guests) if (!to || to === id) emit(set, { type: 'message', from: roster[0], data: wire(data) }); },
    on(l) { hostListeners.add(l); return () => hostListeners.delete(l); },
  };
  function join(id: string, name: string): RoomLike {
    const entry = { id, seat: roster.length, name, host: false }, set = new Set<(e: RoomEvent) => void>();
    guests.set(id, set); roster.push(entry);
    queueMicrotask(() => {});
    const room: RoomLike = {
      role: 'guest', id, get players() { return roster; }, rtt: () => 40,
      send(data) { emit(hostListeners, { type: 'message', from: entry, data: wire(data) }); },
      on(l) { set.add(l); return () => set.delete(l); },
    };
    return room;
  }
  const admit = (id: string) => emit(hostListeners, { type: 'joined', player: roster.find(p => p.id === id)! });
  const leave = (id: string) => { const i = roster.findIndex(p => p.id === id), [entry] = roster.splice(i, 1); guests.delete(id); emit(hostListeners, { type: 'left', player: entry, reason: 'left' }); };
  return { host, join, admit, leave };
}
function both(host: HostSession, guest: GuestSession, seconds: number, guestIntent: () => Intent = () => idleIntent(guest.m.players[guest.self]?.yaw ?? 0)) {
  for (let i = 0; i < Math.round(seconds / TICK); i++) { host.step(idleIntent(host.m.players[host.self]?.yaw ?? 0), TICK); guest.step(guestIntent(), TICK); }
}

describe('online', () => {
  it('seats a guest in the lobby and starts the same round on both devices', () => {
    const h = hub(), host = new HostSession('Hana', { teamSize: 2, bots: true, skill: 'regular' }, 5);
    host.attach(h.host);
    const guest = new GuestSession(h.join('g', 'Gus')); h.admit('g');
    expect(guest.ready).toBe(true);
    expect(host.m.players.map(p => p.name).slice(0, 2)).toEqual(['Hana', 'Gus']);
    expect(guest.m.players.map(p => [p.name, p.squad, p.bot])).toEqual(host.m.players.map(p => [p.name, p.squad, p.bot]));
    expect(guest.self).toBe(1); expect(host.self).toBe(0);
    guest.swapSquad();
    expect(host.m.players.find(p => p.owner === 'g')!.squad).toBe(0);
    expect(guest.m.players[guest.self].name).toBe('Gus');
    guest.swapSquad();
    host.start();
    both(host, guest, 0.5);
    expect(guest.m.phase).toBe('prep'); expect(guest.m.round).toBe(1);
    const me = guest.m.players[guest.self], theirs = host.m.players[guest.self];
    expect(me.alive).toBe(true); expect([me.x, me.z]).toEqual([theirs.x, theirs.z]);
    expect(guest.drain().some(e => e.e === 'spawn')).toBe(true);
  });
  it('moves the guest on its own device, reports it, and judges its shots on the host', () => {
    const h = hub(), host = new HostSession('Hana', { teamSize: 1, bots: false, skill: 'regular' }, 5);
    host.attach(h.host);
    const guest = new GuestSession(h.join('g', 'Gus')); h.admit('g');
    host.start();
    both(host, guest, ROUND.prep + 0.2);
    expect(guest.m.phase).toBe('action');
    const g = guest.m.players[guest.self], hSelf = host.m.players[host.self];
    expect(roleOf(guest.m, g)).toBe(1);
    const z0 = g.z;
    both(host, guest, 1, () => ({ ...idleIntent(g.yaw), mz: 1 }));
    expect(Math.hypot(g.z - z0, 0)).toBeGreaterThan(0.5);
    const seen = host.m.players[guest.self];
    expect(Math.hypot(seen.x - g.x, seen.z - g.z)).toBeLessThan(0.4);
    // Stand the host's fighter in front of the guest (host-side, as if it walked there) and let the guest fire.
    g.x = 20; g.z = 15; seen.x = 20; seen.z = 15; hSelf.x = 20; hSelf.z = 5;
    both(host, guest, 0.5, () => idleIntent(0, 0));
    expect(guest.m.players[host.self].z).toBeCloseTo(5, 1);
    host.drain(); guest.drain();
    both(host, guest, 0.6, () => ({ ...idleIntent(0, -0.07), fire: true }));
    expect(hSelf.hp).toBeLessThan(100);
    expect(guest.m.players[host.self].hp).toBe(hSelf.hp);
    const mine = guest.drain().filter(e => e.e === 'shot' && e.id === guest.self), theirs = host.drain().filter(e => e.e === 'shot' && e.id === guest.self);
    expect(mine.length).toBeGreaterThan(2); expect(mine.length).toBe(theirs.length);
    expect(g.mag[0]).toBe(30 - mine.length);
  });
  it('keeps destruction identical on both devices', () => {
    const h = hub(), host = new HostSession('Hana', { teamSize: 1, bots: false, skill: 'regular' }, 5);
    host.attach(h.host);
    const guest = new GuestSession(h.join('g', 'Gus')); h.admit('g');
    host.start();
    both(host, guest, ROUND.prep + 0.2);
    const g = guest.m.players[guest.self];
    g.x = -4; g.z = -3.2;
    both(host, guest, 0.3, () => idleIntent(Math.PI, -0.1));
    both(host, guest, 1.5, () => ({ ...idleIntent(Math.PI, -0.1), fire: true }));
    both(host, guest, 0.3, () => ({ ...idleIntent(Math.PI, -0.3), melee: true }));
    both(host, guest, ROUND.reinforce + 0.6, () => ({ ...idleIntent(Math.PI / 2, 0), use: true }));
    expect(host.m.world.panels.some(p => p.kind === 'wall' && p.intact < p.cells.length)).toBe(true);
    expect(host.m.world.panels.some(p => p.reinforced)).toBe(true);
    expect(packPanels(guest.m.world)).toEqual(packPanels(host.m.world));
    expect(guest.m.players[guest.self].reinforcements).toBe(host.m.players[guest.self].reinforcements);
  });
  it('lets a late guest take over a bot mid-round with the world as it stands, and hands the seat back', () => {
    const h = hub(), host = new HostSession('Hana', { teamSize: 2, bots: true, skill: 'regular' }, 9);
    host.attach(h.host);
    host.start();
    for (let i = 0; i < (ROUND.prep + 6) / TICK; i++) host.step(idleIntent(), TICK);
    const guest = new GuestSession(h.join('g', 'Gus')); h.admit('g');
    expect(guest.self).toBeGreaterThan(0);
    const seat = host.m.players[guest.self];
    expect(seat.bot).toBe(false); expect(seat.name).toBe('Gus'); expect(seat.squad).not.toBe(host.m.players[host.self].squad);
    expect(guest.m.phase).toBe(host.m.phase); expect(guest.m.round).toBe(1);
    expect(packPanels(guest.m.world)).toEqual(packPanels(host.m.world));
    expect([guest.m.players[guest.self].x, guest.m.players[guest.self].z]).toEqual([Math.round(seat.x * 100) / 100, Math.round(seat.z * 100) / 100]);
    h.leave('g');
    expect(seat.bot).toBe(true); expect(seat.owner).toBe('');
  });
  it('refuses a teleporting guest and puts it back', () => {
    const h = hub(), host = new HostSession('Hana', { teamSize: 1, bots: false, skill: 'regular' }, 5);
    host.attach(h.host);
    const guest = new GuestSession(h.join('g', 'Gus')); h.admit('g');
    host.start();
    both(host, guest, ROUND.prep + 0.5);
    const g = guest.m.players[guest.self], before = { x: host.m.players[guest.self].x, z: host.m.players[guest.self].z };
    g.x += 12;
    both(host, guest, 0.2);
    expect(host.m.players[guest.self].x).toBeCloseTo(before.x, 1);
    expect(g.x).toBeCloseTo(before.x, 1);
    expect(aimOf(g).y).toBeGreaterThan(1);
  });
});
