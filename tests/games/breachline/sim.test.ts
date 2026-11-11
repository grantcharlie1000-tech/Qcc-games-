import { describe, expect, it } from 'vitest';
import { ATK, CHARGE, DEF, KITS, ROUND, TICK, WEAPONS } from '../../../src/games/breachline/config';
import { command, createMatch, drive, interaction, seat, startMatch, step } from '../../../src/games/breachline/sim';
import { ACT, aimOf, idleIntent, roleOf, shotDirs, type Match, type Player } from '../../../src/games/breachline/state';
import { BODY, CELL } from '../../../src/games/breachline/config';

/** A two-person match with no bots: seat 0 attacks first, seat 1 defends. */
function duel(seed = 7) {
  const m = createMatch({ teamSize: 1, bots: false, skill: 'regular' }, seed);
  seat(m, [{ owner: 'a', name: 'Ada' }, { owner: 'b', name: 'Bo' }]);
  startMatch(m);
  return { m, atk: m.players[0], def: m.players[1] };
}
const tick = (m: Match, seconds: number) => { for (let i = 0; i < Math.round(seconds / TICK); i++) step(m, TICK); };
const place = (p: Player, x: number, z: number, yaw = 0, pitch = 0) => { p.x = x; p.z = z; p.yaw = yaw; p.pitch = pitch; };
const shoot = (m: Match, p: Player, seed = 1) => command(m, p.id, { c: 'shot', w: KITS[roleOf(m, p)][p.kit].primary, spread: 0, seed, ...aimOf(p) });
const hold = (m: Match, p: Player, seconds: number) => { command(m, p.id, { c: 'use', on: true, ...aimOf(p) }); tick(m, seconds); };

describe('rounds', () => {
  it('seats people on alternating squads and fills with bots', () => {
    const m = createMatch({ teamSize: 3, bots: true, skill: 'regular' }, 1);
    seat(m, [{ owner: 'a', name: 'Ada' }, { owner: 'b', name: 'Bo' }, { owner: 'c', name: 'Cy' }]);
    expect(m.players).toHaveLength(6);
    expect(m.players.filter(p => p.squad === 0)).toHaveLength(3);
    expect(m.players.filter(p => !p.bot).map(p => p.squad)).toEqual([0, 1, 0]);
    expect(m.players.map(p => p.id)).toEqual([0, 1, 2, 3, 4, 5]);
  });
  it('runs preparation, then gives the round to the defenders when time runs out', () => {
    const { m, atk, def } = duel();
    expect(m.phase).toBe('prep');
    expect(roleOf(m, atk)).toBe(ATK); expect(roleOf(m, def)).toBe(DEF);
    const before = { x: atk.x, z: atk.z };
    drive(m, atk, { ...idleIntent(atk.yaw), mz: 1 }, TICK);
    expect([atk.x, atk.z]).toEqual([before.x, before.z]);
    tick(m, ROUND.prep + 0.1);
    expect(m.phase).toBe('action');
    tick(m, ROUND.action + 0.1);
    expect(m.phase).toBe('end'); expect(m.roundWinner).toBe(def.squad); expect(m.reason).toBe('time'); expect(m.wins).toEqual([0, 1]);
    tick(m, ROUND.end + 0.1);
    expect(m.round).toBe(2); expect(m.phase).toBe('prep'); expect(atk.alive && def.alive).toBe(true);
  });
  it('swaps roles after three rounds and ends the match at four wins', () => {
    const { m, def } = duel();
    for (let r = 0; r < 4; r++) tick(m, ROUND.prep + ROUND.action + ROUND.end + 0.3);
    // Rounds 1-3: seat 1 defends and wins on time. Round 4: seat 1 attacks and loses on time.
    expect(m.wins).toEqual([1, 3]);
    expect(roleOf(m, def)).toBe(ATK);
    for (let r = 0; r < 3; r++) tick(m, ROUND.prep + ROUND.action + ROUND.end + 0.3);
    // Rounds 5-6: seat 0 defends and wins. Round 7: seat 0 attacks again and runs out of time.
    expect(m.phase).toBe('over'); expect(m.winner).toBe(1); expect(m.wins).toEqual([3, 4]);
  });
});

describe('combat', () => {
  it('kills with a headshot, ends the round and scores it', () => {
    const { m, atk, def } = duel();
    tick(m, ROUND.prep + 0.1);
    place(atk, 20, 15); place(def, 20, 5);
    atk.pitch = 0;
    shoot(m, atk);
    expect(def.alive).toBe(false);
    expect(m.events.some(e => e.e === 'kill' && e.head)).toBe(true);
    step(m, TICK);
    expect(m.phase).toBe('end'); expect(m.reason).toBe('eliminated'); expect(m.roundWinner).toBe(atk.squad);
    expect(atk.kills).toBe(1); expect(atk.score).toBe(150);
  });
  it('needs several body shots, refuses fire faster than the weapon allows, and none in preparation', () => {
    const { m, atk, def } = duel();
    place(atk, 20, 15, 0, -0.07); place(def, 20, 5);
    shoot(m, atk); expect(def.hp).toBe(100);
    tick(m, ROUND.prep + 0.1);
    place(atk, 20, 15, 0, -0.07); place(def, 20, 5);
    shoot(m, atk, 1); shoot(m, atk, 2);
    const dmg = WEAPONS[KITS[ATK][atk.kit].primary].damage;
    expect(def.hp).toBe(100 - dmg);
    tick(m, 0.2); shoot(m, atk, 3);
    expect(def.hp).toBe(100 - dmg * 2);
  });
  it('shoots through a soft wall for less damage and leaves a hole', () => {
    const { m, atk, def } = duel();
    tick(m, ROUND.prep + 0.1);
    place(atk, -4, -0.5, 0, -0.07); place(def, -4, -5);
    shoot(m, atk);
    expect(def.hp).toBeLessThan(100); expect(def.hp).toBeGreaterThan(100 - WEAPONS.ar.damage);
    expect(m.events.some(e => e.e === 'cells' && e.cause === 0)).toBe(true);
  });
  it('spreads shotgun pellets the same way for the same seed', () => {
    expect(shotDirs(1, 0.2, 0.06, 8, 42)).toEqual(shotDirs(1, 0.2, 0.06, 8, 42));
    expect(shotDirs(1, 0.2, 0.06, 8, 42)).not.toEqual(shotDirs(1, 0.2, 0.06, 8, 43));
    for (const d of shotDirs(0, 0, 0.06, 8, 5)) { expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 6); expect(d.z).toBeLessThan(-0.99); }
  });
  it('rewinds targets so a guest hits what it saw', () => {
    const { m, atk, def } = duel();
    tick(m, ROUND.prep + 0.1);
    place(atk, 20, 15); place(def, 20, 5);
    tick(m, 0.3);
    place(def, 23, 5);
    tick(m, 0.1);
    command(m, atk.id, { c: 'shot', w: 'ar', spread: 0, seed: 1, ...aimOf(atk) }, 0);
    expect(def.hp).toBe(100);
    tick(m, 0.2); place(def, 23, 5);
    command(m, atk.id, { c: 'shot', w: 'ar', spread: 0, seed: 2, ...aimOf(atk) }, 0.35);
    expect(def.alive).toBe(false);
  });
});

describe('objectives and gadgets', () => {
  it('plants in a site, counts down, and the uplink wins the round', () => {
    const { m, atk } = duel();
    tick(m, ROUND.prep + 0.1);
    place(atk, 20, 15);
    expect(interaction(m, atk, aimOf(atk))).toBeNull();
    place(atk, -1, -4);
    expect(interaction(m, atk, aimOf(atk))).toEqual({ act: ACT.plant, target: 0 });
    hold(m, atk, ROUND.plant - 0.5);
    expect(m.phase).toBe('action'); expect(atk.act).toBe(ACT.plant);
    tick(m, 0.6);
    expect(m.phase).toBe('planted'); expect(m.device).toMatchObject({ site: 0, by: atk.id });
    tick(m, ROUND.fuse + 0.1);
    expect(m.phase).toBe('end'); expect(m.reason).toBe('uplink'); expect(m.roundWinner).toBe(atk.squad);
  });
  it('cancels a plant when Use is released and lets a defender defuse', () => {
    const { m, atk, def } = duel();
    tick(m, ROUND.prep + 0.1);
    place(atk, 3, 5);
    hold(m, atk, 2); command(m, atk.id, { c: 'use', on: false, ...aimOf(atk) });
    tick(m, ROUND.plant);
    expect(m.phase).toBe('action');
    hold(m, atk, ROUND.plant + 0.1);
    expect(m.phase).toBe('planted');
    place(def, 3.8, 5.6);
    hold(m, def, ROUND.defuse + 0.1);
    expect(m.reason).toBe('defused'); expect(m.roundWinner).toBe(def.squad); expect(def.score).toBe(250);
  });
  it('reinforces a wall so nothing gets through it, once per reinforcement', () => {
    const { m, atk, def } = duel();
    def.kit = 0; command(m, def.id, { c: 'kit', kit: 2 });
    expect(def.reinforcements).toBe(KITS[DEF][2].reinforcements);
    place(def, -4, -3.2, Math.PI);
    const what = interaction(m, def, aimOf(def))!;
    expect(what.act).toBe(ACT.reinforce);
    hold(m, def, ROUND.reinforce + 0.1);
    const panel = m.world.panels[what.target];
    expect(panel.reinforced).toBe(true); expect(def.reinforcements).toBe(KITS[DEF][2].reinforcements - 1);
    expect(interaction(m, def, aimOf(def))).toBeNull();
    tick(m, ROUND.prep);
    place(atk, -4, -0.5, 0, -0.07); place(def, -4, -5);
    shoot(m, atk);
    expect(def.hp).toBe(100);
    expect(m.events.some(e => e.e === 'shot')).toBe(true);
  });
  it('rebuilds a doorway barricade unless someone stands in it', () => {
    const { m, atk, def } = duel();
    place(def, -1.25, -3.2, Math.PI);
    const what = interaction(m, def, aimOf(def))!;
    expect(what.act).toBe(ACT.barricade);
    place(atk, -1.25, -2);
    expect(interaction(m, def, aimOf(def))).toBeNull();
    place(atk, 20, 15);
    hold(m, def, ROUND.barricade + 0.1);
    const door = m.world.panels[what.target];
    expect(door.intact).toBe(door.cells.length);
    expect(interaction(m, def, aimOf(def))).toBeNull();
  });
  it('breaches a soft wall with a charge: a hole a fighter can walk through', () => {
    const { m, atk } = duel();
    command(m, atk.id, { c: 'kit', kit: 0 });
    tick(m, ROUND.prep + 0.1);
    place(atk, -4, -0.9, 0, -0.3);
    command(m, atk.id, { c: 'breach', ...aimOf(atk) });
    expect(atk.act).toBe(ACT.charge);
    tick(m, ROUND.charge + 0.1);
    expect(m.charges).toHaveLength(1); expect(atk.charges).toBe(KITS[ATK][0].charges - 1);
    place(atk, -8, 0.6, 0);
    tick(m, CHARGE.arm);
    command(m, atk.id, { c: 'breach', ...aimOf(atk) });
    expect(m.charges).toHaveLength(0);
    expect(m.events.some(e => e.e === 'boom' && e.kind === 'charge')).toBe(true);
    expect(atk.alive).toBe(true);
    place(atk, -4, -0.9, 0);
    for (let i = 0; i < 90; i++) drive(m, atk, { ...idleIntent(0), mz: 1 }, TICK);
    expect(atk.z).toBeLessThan(-2.5);
  });
  it('throws a frag that bursts on its fuse and hurts through an open doorway', () => {
    const { m, atk, def } = duel();
    tick(m, ROUND.prep + 0.1);
    place(atk, -1.25, 0, 0, -0.1); place(def, -3, -8.5);
    command(m, atk.id, { c: 'nade', ...aimOf(atk) });
    expect(m.grenades).toHaveLength(1); expect(atk.grenades).toBe(KITS[ATK][atk.kit].grenades - 1);
    tick(m, 2);
    expect(m.grenades).toHaveLength(1);
    tick(m, 1);
    expect(m.grenades).toHaveLength(0);
    expect(m.events.some(e => e.e === 'boom' && e.kind === 'frag' && e.z < -2)).toBe(true);
    expect(def.hp).toBeLessThan(100);
  });
  it('does not hurt through brick, and an impact grenade opens a wall the moment it lands', () => {
    const { m, atk, def } = duel();
    tick(m, ROUND.prep + 0.1);
    place(atk, 1, 13, 0, 0.3); place(def, 1, 9.4);
    command(m, atk.id, { c: 'nade', ...aimOf(atk) });
    tick(m, 3.2);
    expect(m.events.some(e => e.e === 'boom')).toBe(true);
    expect(def.hp).toBe(100);
    place(def, -4, -4.5, Math.PI, 0);
    command(m, def.id, { c: 'nade', ...aimOf(def) });
    tick(m, 0.5);
    expect(m.events.some(e => e.e === 'boom' && e.kind === 'impact')).toBe(true);
    expect(m.events.some(e => e.e === 'cells' && e.cause === 1)).toBe(true);
  });
  it('opens a wall with a melee swing and kills at arm’s length', () => {
    const { m, atk, def } = duel();
    tick(m, ROUND.prep + 0.1);
    place(atk, -4, -1.4, 0, -0.2);
    command(m, atk.id, { c: 'melee', ...aimOf(atk) });
    expect(m.events.some(e => e.e === 'cells' && e.cause === 2)).toBe(true);
    place(def, -4, -0.2); place(atk, -4, -1.4, Math.PI, 0);
    command(m, atk.id, { c: 'melee', ...aimOf(atk) });
    expect(def.alive).toBe(false);
  });
  it('ignores commands from far away, with bad numbers, or for weapons the fighter does not carry', () => {
    const { m, atk, def } = duel();
    tick(m, ROUND.prep + 0.1);
    place(atk, 20, 15); place(def, 20, 5);
    command(m, atk.id, { c: 'shot', w: 'ar', spread: 0, seed: 1, x: 20, y: 1.6, z: 7, yaw: 0, pitch: 0 });
    command(m, atk.id, { c: 'shot', w: 'dmr', spread: 0, seed: 1, ...aimOf(atk) });
    command(m, atk.id, { c: 'shot', w: 'ar', spread: NaN, seed: 1, ...aimOf(atk) });
    command(m, atk.id, { c: 'shot', w: 'constructor' as never, spread: 0, seed: 1, ...aimOf(atk) });
    command(m, 9, { c: 'reload' }); command(m, atk.id, null as never); command(m, atk.id, { c: 'kit', kit: 99 });
    expect(def.hp).toBe(100); expect(m.events.filter(e => e.e === 'shot')).toHaveLength(0);
    expect(BODY.radius).toBeGreaterThan(CELL);
  });
});
