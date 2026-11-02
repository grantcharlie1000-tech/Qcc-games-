import { describe, expect, it } from 'vitest';
import { loopArea, ownerLoops } from '../../../src/games/claimline/outline';

const GRID = 40;
function field(fill: (x: number, y: number) => boolean, id = 1): { owner: Uint8Array; cells: number } {
  const owner = new Uint8Array(GRID * GRID);
  let cells = 0;
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) if (fill(x + 0.5, y + 0.5)) { owner[y * GRID + x] = id; cells++; }
  return { owner, cells };
}
const disc = (cx: number, cy: number, r: number) => (x: number, y: number) => Math.hypot(x - cx, y - cy) < r;
const evenOdd = (loops: number[][]) => Math.abs(loops.reduce((sum, loop) => sum + loopArea(loop), 0));

describe('ownerLoops', () => {
  it('returns no loops for an empty field or an id that owns nothing', () => {
    expect(ownerLoops(new Uint8Array(GRID * GRID), GRID, 1)).toEqual([]);
    expect(ownerLoops(field(disc(20, 20, 6), 2).owner, GRID, 1)).toEqual([]);
  });

  it('traces a disc as one closed loop whose area is within 10% of its cell count', () => {
    const { owner, cells } = field(disc(20, 20, 8));
    const loops = ownerLoops(owner, GRID, 1);
    expect(loops).toHaveLength(1);
    const loop = loops[0];
    expect(loop.length).toBeGreaterThan(40);
    expect([loop[0], loop[1]]).toEqual([loop[loop.length - 2], loop[loop.length - 1]]);
    expect(Math.abs(loopArea(loop))).toBeGreaterThan(cells * 0.9);
    expect(Math.abs(loopArea(loop))).toBeLessThan(cells * 1.1);
    for (const v of loop) expect(Number.isFinite(v)).toBe(true);
  });

  it('keeps every vertex within a cell of the owned region (cell centre is +.5)', () => {
    const { owner } = field(disc(20, 20, 8));
    const loop = ownerLoops(owner, GRID, 1)[0];
    for (let i = 0; i < loop.length; i += 2) expect(Math.hypot(loop[i] - 20, loop[i + 1] - 20)).toBeGreaterThan(6.8);
    for (let i = 0; i < loop.length; i += 2) expect(Math.hypot(loop[i] - 20, loop[i + 1] - 20)).toBeLessThan(8.6);
  });

  it('traces a ring as two loops of opposite winding whose even-odd area matches the ring cells', () => {
    const outer = disc(20, 20, 10), inner = disc(20, 20, 4);
    const { owner, cells } = field((x, y) => outer(x, y) && !inner(x, y));
    const loops = ownerLoops(owner, GRID, 1);
    expect(loops).toHaveLength(2);
    expect(Math.sign(loopArea(loops[0]))).toBe(-Math.sign(loopArea(loops[1])));
    expect(evenOdd(loops)).toBeGreaterThan(cells * 0.9);
    expect(evenOdd(loops)).toBeLessThan(cells * 1.1);
  });

  it('traces two separate discs as two loops', () => {
    const a = disc(10, 10, 5), b = disc(29, 29, 5);
    const { owner, cells } = field((x, y) => a(x, y) || b(x, y));
    const loops = ownerLoops(owner, GRID, 1);
    expect(loops).toHaveLength(2);
    expect(loops.map(loopArea).every(area => Math.sign(area) === Math.sign(loopArea(loops[0])))).toBe(true);
    expect(evenOdd(loops)).toBeGreaterThan(cells * 0.88);
  });

  it('separates owners and is deterministic', () => {
    const left = disc(12, 20, 6), right = disc(28, 20, 6);
    const { owner } = field((x, y) => left(x, y) || right(x, y), 1);
    for (let i = 0; i < owner.length; i++) if (owner[i] === 1 && (i % GRID) >= 20) owner[i] = 2;
    expect(ownerLoops(owner, GRID, 1)).toHaveLength(1);
    expect(ownerLoops(owner, GRID, 2)).toHaveLength(1);
    expect(ownerLoops(owner, GRID, 1)).toEqual(ownerLoops(owner, GRID, 1));
  });

  it('closes shapes that touch the grid border and a single cell', () => {
    const edge = field((x, y) => x < 6 && y < 6);
    const loops = ownerLoops(edge.owner, GRID, 1);
    expect(loops).toHaveLength(1);
    expect(Math.abs(loopArea(loops[0]))).toBeGreaterThan(edge.cells * 0.8);
    const dot = new Uint8Array(GRID * GRID); dot[5 * GRID + 5] = 3;
    const single = ownerLoops(dot, GRID, 3);
    expect(single).toHaveLength(1);
    expect(Math.abs(loopArea(single[0]))).toBeGreaterThan(0.2);
  });

  it('keeps diagonal-only neighbours as separate loops (deterministic saddle)', () => {
    const owner = new Uint8Array(GRID * GRID);
    owner[5 * GRID + 5] = 1; owner[6 * GRID + 6] = 1;
    expect(ownerLoops(owner, GRID, 1)).toHaveLength(2);
  });

  it('rounds square corners instead of drawing raw cell corners', () => {
    const { owner, cells } = field((x, y) => x > 5 && x < 15 && y > 5 && y < 15);
    const loop = ownerLoops(owner, GRID, 1)[0];
    let nearest = Infinity;
    for (let i = 0; i < loop.length; i += 2) nearest = Math.min(nearest, Math.hypot(loop[i] - 5, loop[i + 1] - 5));
    expect(nearest).toBeGreaterThan(0.6);
    expect(Math.abs(loopArea(loop))).toBeGreaterThan(cells * 0.9);
  });
});
