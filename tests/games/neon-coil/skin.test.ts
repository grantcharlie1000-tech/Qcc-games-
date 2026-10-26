import { describe, expect, test } from 'vitest';
import { bandIndex, resampleBody, skinFor, type StampBuffer } from '../../../src/games/neon-coil/skin';
import { createArena, restoreArena, snapshot } from '../../../src/games/neon-coil/model';
const buffer = (): StampBuffer => ({ points: [], count: 0, length: 0 });
describe('render-only snake material', () => {
  test('bands use distance behind the head, independent of position and direction', () => {
    expect([0, 27, 28, 55, 56, 84, 112].map(d => bandIndex(d, 20, 4))).toEqual([0, 0, 1, 1, 2, 3, 0]);
    const a = buffer(), b = buffer();
    resampleBody([{ x: 0, y: 0 }, { x: 100, y: 0 }], { x: 0, y: 0 }, 5, a);
    resampleBody([{ x: 20, y: 30 }, { x: 20, y: 130 }], { x: 20, y: 30 }, 5, b);
    expect(a.points.slice(0,a.count).map(p => bandIndex(p.distance,20,4))).toEqual(b.points.slice(0,b.count).map(p => bandIndex(p.distance,20,4)));
  });
  test('arc-length spacing stays constant across dense, sparse and duplicate body histories', () => {
    const a = buffer(), b = buffer();
    resampleBody([{ x: 0, y: 0 }, { x: 37, y: 0 }], { x: 2, y: 0 }, 4, a);
    // The interpolated head replaces body[0]; dense history starts at body[1].
    resampleBody([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 0 }, ...Array.from({ length: 36 }, (_, x) => ({ x: x+2, y: 0 }))], { x: 2, y: 0 }, 4, b);
    expect(a.length).toBe(35); expect(a.count).toBe(9);
    expect(a.points.slice(0,a.count)).toEqual(b.points.slice(0,b.count));
    expect(a.points.slice(0,a.count).map(p => p.x)).toEqual([2,6,10,14,18,22,26,30,34]);
  });
  test('curves have no gaps even at the tapered tail and reuse stamp objects', () => {
    const out = buffer();
    const path = [{ x: 0, y: 0 }, { x: 31, y: 0 }, { x: 31, y: 29 }, { x: 0, y: 29 }];
    resampleBody(path,path[0],5,out); expect(out.length).toBe(91);
    const first = out.points[0];
    for(let i=1;i<out.count;i++) {
      const a=out.points[i-1],b=out.points[i]; expect(b.distance-a.distance).toBeCloseTo(5);
      expect(Math.hypot(b.x-a.x,b.y-a.y)).toBeLessThanOrEqual(5.001);
      expect(Math.hypot(b.x-a.x,b.y-a.y)).toBeLessThan(20*.45);
    }
    resampleBody(path,{x:1,y:0},5,out); expect(out.points[0]).toBe(first); expect(out.points[0].x).toBe(1);
    resampleBody([],path[0],5,out); expect(out.count).toBe(0);
  });
  test('skins distinguish player from lime bots while leaving legacy colours and saves intact', () => {
    const arena=createArena(), before=snapshot(arena);
    expect(skinFor(0,arena.snakes[0].color).bands).toContain('#22d3ee');
    expect(skinFor(7,arena.snakes[7].color)).not.toBe(skinFor(0,arena.snakes[0].color));
    expect(skinFor(1,'#6bdcf5').bands).toContain('#edf5f7');
    for(const snake of arena.snakes) expect(skinFor(snake.id,snake.color).bands.length).toBeGreaterThan(1);
    expect(arena).toEqual(before); expect(restoreArena(arena)).toEqual(before);
  });
});
