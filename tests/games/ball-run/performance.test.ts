import { describe, expect, it } from 'vitest';
import { BoxGeometry, Color, InstancedMesh, Matrix4, MeshBasicMaterial } from 'three';
import { RetainedInstances } from '../../../src/games/ball-run/instances';
import { AdaptiveResolution } from '../../../src/games/ball-run/resolution';

describe('Ball Run retained geometry', () => {
  it('retains identical buffers, updates moving instances, and compacts expired ones without losing colors', () => {
    const mesh = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 8);
    mesh.setColorAt(0, new Color());
    const pool = new RetainedInstances(mesh), matrix = new Matrix4(), color = new Color();
    const write = (key: number, x: number) => {
      const slot = pool.keep(key);
      mesh.setMatrixAt(slot, matrix.makeTranslation(x, 2, 3));
      mesh.setColorAt(slot, color.setRGB(key / 10, 0, 0));
      pool.changed(slot, true);
    };
    pool.begin(); write(1, 10); write(2, 20); write(3, 30); pool.end();
    const buffer = mesh.instanceMatrix.array, version = mesh.instanceMatrix.version;
    pool.begin(); pool.keep(1); pool.keep(2); pool.keep(3); pool.end();
    expect(mesh.instanceMatrix.version).toBe(version);
    pool.begin(); pool.keep(3); write(2, 21); pool.end();
    expect(mesh.count).toBe(2);
    expect(mesh.instanceMatrix.array).toBe(buffer);
    const found = new Map<number, number>();
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix); mesh.getColorAt(i, color);
      found.set(Math.round(color.r * 10), matrix.elements[12]);
    }
    expect(found).toEqual(new Map([[3, 30], [2, 21]]));
    expect(pool.has(1)).toBe(false);
    pool.reset(); pool.begin(); write(1, 100); pool.end();
    expect(mesh.count).toBe(1);
    mesh.getMatrixAt(0, matrix); expect(matrix.elements[12]).toBe(100);
  });

  it('recycles a bounded buffer while thousands of road pieces enter and leave', () => {
    const mesh = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 8);
    const pool = new RetainedInstances(mesh), matrix = new Matrix4();
    const buffer = mesh.instanceMatrix.array;
    for (let window = 0; window < 2000; window++) {
      pool.begin();
      for (let key = window; key < window + 4; key++) {
        const slot = pool.keep(key);
        expect(slot).toBeGreaterThanOrEqual(0);
        if (pool.fresh) { mesh.setMatrixAt(slot, matrix.makeTranslation(key, 0, 0)); pool.changed(slot); }
      }
      pool.end();
      expect(mesh.count).toBe(4);
      expect(pool.has(window - 1)).toBe(false);
      const positions: number[] = [];
      for (let i = 0; i < mesh.count; i++) { mesh.getMatrixAt(i, matrix); positions.push(matrix.elements[12]); }
      expect(positions.sort((a, b) => a - b)).toEqual([window, window + 1, window + 2, window + 3]);
    }
    expect(mesh.instanceMatrix.array).toBe(buffer);
  });
});

describe('Ball Run adaptive resolution', () => {
  it('keeps full quality for fast frames, steps down on sustained load, and recovers slowly', () => {
    const resolution = new AdaptiveResolution();
    for (let i = 0; i < 600; i++) resolution.observe(1000 / 60);
    expect(resolution.cap).toBe(1.5);
    // Allow the partially filled fast-frame window to drain before two slow windows.
    for (let i = 0; i < 60; i++) resolution.observe(40);
    expect(resolution.cap).toBe(1.25);
    for (let i = 0; i < 150; i++) resolution.observe(40);
    expect(resolution.cap).toBe(1);
    for (let i = 0; i < 100; i++) resolution.observe(16);
    expect(resolution.cap).toBe(1);
    for (let i = 0; i < 1000; i++) resolution.observe(16);
    expect(resolution.cap).toBe(1.5);
  });

  it('ignores pause/resume gaps and isolated slow frames', () => {
    const resolution = new AdaptiveResolution();
    for (const time of [0, -10, NaN, Infinity, 5000]) resolution.observe(time);
    for (let i = 0; i < 10; i++) {
      resolution.observe(100);
      for (let frame = 0; frame < 120; frame++) resolution.observe(16);
    }
    expect(resolution.cap).toBe(1.5);
  });
});
