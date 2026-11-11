import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LevelBuilder, emitLevel, type FaceRec } from '../../../src/games/breachline/levelmesh';
import { PAD, REGIONS, collectFaces, faceArrays, packAtlas } from '../../../src/games/breachline/render/levelgeo';

const area = (fs: FaceRec[]) => fs.reduce((a, f) => a + f.lu * f.lv, 0);
const bakeInfo = (name: string) => {
  const file = `public/game-art/breachline/bake/${name}.json`;
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) as { width: number; height: number; density: number } : null;
};

describe('Breachline level geometry for the asset renderer', () => {
  it('splits faces between the art rooms and the rest without losing or doubling any surface', () => {
    const all: FaceRec[] = [];
    emitLevel(new LevelBuilder({ light: () => [1, 1, 1], probe: () => [1, 1, 1] }, f => { all.push(f); return []; }));
    const { byRegion, rest } = collectFaces();
    expect(area([...byRegion.flat(), ...rest])).toBeCloseTo(area(all), 6);
    expect(byRegion[0].length).toBeGreaterThan(50);
    // Everything claimed for a room faces into it.
    for (const [i, faces] of byRegion.entries()) for (const f of faces) {
      const r = REGIONS[i], n = [f.u[1] * f.v[2] - f.u[2] * f.v[1], f.u[2] * f.v[0] - f.u[0] * f.v[2], f.u[0] * f.v[1] - f.u[1] * f.v[0]];
      const cx = f.o[0] + (f.u[0] * f.lu + f.v[0] * f.lv) / 2 + n[0] * 0.05, cz = f.o[2] + (f.u[2] * f.lu + f.v[2] * f.lv) / 2 + n[2] * 0.05;
      expect(cx > r.x0 - 1e-6 && cx < r.x1 + 1e-6 && cz > r.z0 - 1e-6 && cz < r.z1 + 1e-6).toBe(true);
    }
  });

  it('builds the same atlas every time, with charts inside it and apart', () => {
    const faces = collectFaces().byRegion[0].filter(f => !f.glow);
    const a = packAtlas(faces, 12), b = packAtlas(collectFaces().byRegion[0].filter(f => !f.glow), 12);
    expect(JSON.stringify(faceArrays(a))).toBe(JSON.stringify(faceArrays(b)));
    const taken = new Uint8Array(a.width * a.height);
    for (const c of a.charts) {
      expect(c.x + c.w + PAD * 2).toBeLessThanOrEqual(a.width);
      expect(c.y + c.h + PAD * 2).toBeLessThanOrEqual(a.height);
      for (let j = 0; j < c.h + PAD * 2; j++) for (let i = 0; i < c.w + PAD * 2; i++) {
        const k = (c.y + j) * a.width + c.x + i;
        expect(taken[k]).toBe(0);
        taken[k] = 1;
      }
    }
  });

  it('matches the shipped lightmaps (rebake after changing the map or the art rooms)', () => {
    const { byRegion } = collectFaces();
    for (const [i, r] of REGIONS.entries()) {
      const info = bakeInfo(r.name);
      if (!info) continue;
      const a = packAtlas(byRegion[i].filter(f => !f.glow), info.density);
      expect([a.width, a.height]).toEqual([info.width, info.height]);
    }
  });
});
