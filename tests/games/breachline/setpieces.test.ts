/** Map-fill set pieces (plan section 12.3): three states each, every state inside its collision box (only flat floor
 * litter may lie outside it), switched by hits and blasts, and whole again after a reset. */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { MAP } from '../../../src/games/breachline/map';
import { SET_PIECES, TEXTURED_PIECES, isSetPiece } from '../../../src/games/breachline/render/setpieces-data';
import { SetPieces, build } from '../../../src/games/breachline/render/setpieces';
import type { Effects } from '../../../src/games/breachline/effects';

const fx = { debris() {}, dust() {} } as unknown as Effects;

describe('set pieces', () => {
  it('maps each modelled piece to one collision box of the map', () => {
    expect(SET_PIECES.length).toBeGreaterThanOrEqual(36);
    for (const p of SET_PIECES) expect(MAP.boxes.filter(b => b.x0 === p.x0 && b.z0 === p.z0 && b.x1 === p.x1 && b.z1 === p.z1).length, p.name).toBe(1);
    for (const p of SET_PIECES) expect(isSetPiece(p), p.name).toBe(!TEXTURED_PIECES.has(p.name));
  });

  it('keeps every state inside its box; anything outside is litter lying on the floor', () => {
    const v = new THREE.Vector3();
    SET_PIECES.forEach((p, i) => {
      for (let s = 0; s < 3; s++) {
        const g = build(p, s, 1000 + i * 7), pos = g.attributes.position;
        for (let k = 0; k < pos.count; k++) {
          v.fromBufferAttribute(pos, k);
          const inside = v.x >= p.x0 - 0.03 && v.x <= p.x1 + 0.03 && v.z >= p.z0 - 0.03 && v.z <= p.z1 + 0.03 && v.y >= -0.07 && v.y <= p.y1 + 0.03;
          if (!inside) expect(v.y, `${p.name} state ${s} at ${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}`).toBeLessThan(0.25);
        }
        g.dispose();
      }
    });
  });

  it('turns damaged then wrecked under fire and blasts, and whole again on reset', () => {
    const sp = new SetPieces(fx, () => [1, 1, 1]), i = sp.indexOf(SET_PIECES[0]);
    expect(i).toBe(0);
    for (let k = 0; k < 4; k++) sp.hit(i);
    expect(sp.states()[i]).toBe(1);
    for (let k = 0; k < 20; k++) sp.hit(i);
    expect(sp.states()[i]).toBe(2);
    const p = SET_PIECES[5];
    sp.blast((p.x0 + p.x1) / 2, 0.5, (p.z0 + p.z1) / 2, 1.25);
    expect(sp.states()[5]).toBeGreaterThan(0);
    sp.reset();
    expect(sp.states().every(s => s === 0)).toBe(true);
    expect(sp.indexOf({ x0: 999, z0: 0, x1: 1000, z1: 1 })).toBe(-1);
    sp.dispose();
  });
});

describe('set pieces made of models', () => {
  it('keeps every model of every state inside its piece box, and gives each modelled family all three states', async () => {
    const { PIECE_PROPS, MODEL_BOUNDS, MODEL_FAMILIES } = await import('../../../src/games/breachline/render/setpiecemodels');
    const m = new THREE.Matrix4(), v = new THREE.Vector3();
    for (const pl of PIECE_PROPS) {
      const p = SET_PIECES[pl.piece!], b = MODEL_BOUNDS[pl.model];
      m.compose(new THREE.Vector3(pl.x, pl.y, pl.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, pl.yaw, pl.tilt ?? 0, 'YXZ')), new THREE.Vector3().setScalar(pl.scale ?? 1));
      for (const x of [b[0], b[3]]) for (const y of [b[1], b[4]]) for (const z of [b[2], b[5]]) {
        v.set(x, y, z).applyMatrix4(m);
        const where = `${p.name} ${pl.model} states ${pl.states ?? 'all'} at ${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}`;
        expect(v.x, where).toBeGreaterThanOrEqual(p.x0 - 0.03); expect(v.x, where).toBeLessThanOrEqual(p.x1 + 0.03);
        expect(v.z, where).toBeGreaterThanOrEqual(p.z0 - 0.03); expect(v.z, where).toBeLessThanOrEqual(p.z1 + 0.03);
        expect(v.y, where).toBeGreaterThanOrEqual(-0.03); expect(v.y, where).toBeLessThanOrEqual(p.y1 + 0.03);
      }
    }
    SET_PIECES.forEach((p, i) => {
      if (!MODEL_FAMILIES.has(p.family)) return;
      const mine = PIECE_PROPS.filter(q => q.piece === i);
      for (const s of [0, 1, 2]) expect(mine.some(q => !q.states || q.states.includes(s)), `${p.name} state ${s}`).toBe(true);
      expect(new Set(mine.map(q => JSON.stringify(q.states ?? [0, 1, 2]))).size, `${p.name} changes models`).toBeGreaterThan(1);
    });
  });
});
