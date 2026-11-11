import { describe, expect, it } from 'vitest';
import { BODY, CELL } from '../../../src/games/breachline/config';
import { MAP, newWorld, roomAt, siteAt } from '../../../src/games/breachline/map';
import { bite, fillPanel, fits, moveBody, obstruction, packPanels, rayBody, trace, unpackPanels, viewDir, clearLine } from '../../../src/games/breachline/world';

const wallAt = (w: ReturnType<typeof newWorld>, axis: 'x' | 'z', pos: number, u: number) => w.panels.find(p => p.kind === 'wall' && p.axis === axis && p.pos === pos && u > p.u0 && u < p.u0 + p.cols * CELL)!;

describe('Tidewater Annex', () => {
  const w = newWorld();
  it('gives every spawn, post and roam point room to stand', () => {
    const spots = [...MAP.attackSpawns.flatMap(g => g.points), ...MAP.defendSpawns, ...MAP.posts[0], ...MAP.posts[1], ...MAP.roam];
    for (const s of spots) expect(fits(w, s.x, s.z), `${s.x},${s.z}`).toBe(true);
  });
  it('starts defenders indoors, attackers in the yard, and posts inside their site', () => {
    for (const s of MAP.defendSpawns) expect(roomAt(s.x, s.z)).not.toMatch(/Yard|Lot|Lane/);
    for (const g of MAP.attackSpawns) for (const s of g.points) expect(roomAt(s.x, s.z)).toMatch(/Yard|Lot|Lane/);
    MAP.posts.forEach((list, site) => { for (const p of list) expect(siteAt(p.x, p.z)).toBe(site); });
  });
  it('keeps every panel on the quarter-metre grid with whole cells', () => {
    for (const p of w.panels) {
      expect(Number.isInteger(p.cols) && p.cols > 0 && Number.isInteger(p.rows) && p.rows > 0).toBe(true);
      expect(Math.abs(p.u0 / CELL - Math.round(p.u0 / CELL))).toBeLessThan(1e-9);
      expect(p.cols * CELL).toBeLessThanOrEqual(4 + 1e-9);
    }
  });
  it('closes outside doors and windows and leaves inside doorways open', () => {
    const outside = w.panels.filter(p => p.kind !== 'wall' && p.closed);
    expect(outside.filter(p => p.kind === 'door')).toHaveLength(4);
    expect(outside.filter(p => p.kind === 'window')).toHaveLength(10);
    for (const p of w.panels.filter(q => q.kind === 'door' && !q.closed)) expect(p.intact).toBe(0);
  });
});

describe('collision', () => {
  it('stops a body at a soft wall and lets it through an inner doorway', () => {
    const w = newWorld();
    const wall = { x: -4, z: -3 }; moveBody(w, wall, 0, 3, BODY.stand);
    expect(wall.z).toBeLessThan(-2 - BODY.radius + 0.01);
    const doorway = { x: -1.25, z: -3 }; moveBody(w, doorway, 0, 3, BODY.stand);
    expect(doorway.z).toBeCloseTo(0, 5);
  });
  it('lets a body through a hole that is wide and tall enough, crouched through a low one', () => {
    const w = newWorld(), panel = wallAt(w, 'x', -2, -4);
    bite(w, panel, -4, 0.6, 0.72);
    const stand = { x: -4, z: -3 }; moveBody(w, stand, 0, 2, BODY.stand);
    expect(stand.z).toBeLessThan(-2);
    const crouched = { x: -4, z: -3 }; moveBody(w, crouched, 0, 2, BODY.crouch);
    expect(crouched.z).toBeCloseTo(-1, 5);
    bite(w, panel, -4, 1.5, 0.72);
    const now = { x: -4, z: -3 }; moveBody(w, now, 0, 2, BODY.stand);
    expect(now.z).toBeCloseTo(-1, 5);
  });
  it('steps over one row of debris but not two', () => {
    const w = newWorld(), panel = wallAt(w, 'x', -2, -4);
    bite(w, panel, -4, 1.2, 1.1);
    for (let c = 0; c < panel.cols; c++) panel.cells[c] = 1;
    const over = { x: -4, z: -3 }; moveBody(w, over, 0, 2, BODY.stand);
    expect(over.z).toBeCloseTo(-1, 5);
    for (let c = 0; c < panel.cols; c++) panel.cells[panel.cols + c] = 1;
    const blocked = { x: -4, z: -3 }; moveBody(w, blocked, 0, 2, BODY.stand);
    expect(blocked.z).toBeLessThan(-2);
  });
  it('never leaves the yard', () => {
    const w = newWorld(), p = { x: 26, z: 20 }; moveBody(w, p, 30, 30, BODY.stand);
    expect(p.x).toBeLessThanOrEqual(MAP.bounds.x1 - BODY.radius + 1e-6); expect(p.z).toBeLessThanOrEqual(MAP.bounds.z1 - BODY.radius + 1e-6);
  });
});

describe('rays', () => {
  it('passes soft walls, recording each cell, and stops at brick', () => {
    const w = newWorld(), t = trace(w, -5, 1.4, -5, 0, 0, 1, 100);
    expect(t.soft.map(s => s.panel.pos)).toEqual([-2, 1]);
    expect(t.solid).toBe(true);
    expect(t.t).toBeCloseTo(15 - 0.15, 5);
    expect(t.nz).toBe(-1);
  });
  it('is stopped by a reinforced wall and sees through a hole', () => {
    const w = newWorld(), panel = wallAt(w, 'x', -2, -4);
    expect(obstruction(w, -4, 1.4, -5, -4, 1.4, -1)).toBe(1);
    bite(w, panel, -4, 1.4, 0.1);
    expect(clearLine(w, -4, 1.4, -5, -4, 1.4, -1)).toBe(true);
    fillPanel(w, panel, true);
    expect(obstruction(w, -4, 1.4, -5, -4, 1.4, -1)).toBe(4);
    expect(trace(w, -4, 1.4, -5, 0, 0, 1, 100).panel).toBe(panel);
    expect(bite(w, panel, -4, 1.4, 1)).toEqual([]);
  });
  it('tells a head hit from a body hit and follows the lean', () => {
    const pose = { x: 0, z: -5, yaw: 0, crouch: 0, lean: 0 };
    expect(rayBody(0, 1.62, 0, 0, 0, -1, pose, 50)).toMatchObject({ head: true });
    expect(rayBody(0, 1, 0, 0, 0, -1, pose, 50)).toMatchObject({ head: false });
    expect(rayBody(0, 1.95, 0, 0, 0, -1, pose, 50)).toBeNull();
    expect(rayBody(0, 1.5, 0, 0, 0, -1, { ...pose, crouch: 1 }, 50)).toBeNull();
    expect(rayBody(BODY.lean, 1.6, 0, 0, 0, -1, { ...pose, lean: 1 }, 50)).toMatchObject({ head: true });
    const d = viewDir(0, 0); expect([d.x, d.y, d.z]).toEqual([-0, 0, -1]);
  });
});

it('round-trips panel state through the wire format', () => {
  const a = newWorld(), b = newWorld();
  bite(a, wallAt(a, 'x', -2, -4), -4, 1, 0.8); fillPanel(a, wallAt(a, 'z', 4, -8), true);
  const door = a.panels.find(p => p.kind === 'door' && p.closed)!; bite(a, door, door.u0 + 0.5, 1, 5);
  expect(unpackPanels(b, JSON.parse(JSON.stringify(packPanels(a))))).toBe(true);
  a.panels.forEach((p, i) => { expect(Array.from(b.panels[i].cells)).toEqual(Array.from(p.cells)); expect(b.panels[i].reinforced).toBe(p.reinforced); expect(b.panels[i].intact).toBe(p.intact); });
  expect(unpackPanels(b, [1, 2])).toBe(false);
});
