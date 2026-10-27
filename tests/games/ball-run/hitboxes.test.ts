import { describe, expect, it } from 'vitest';
import { sweepSphereBox } from '../../../src/core/collision';
import * as THREE from 'three';
import { getCourse } from '../../../src/games/ball-run/course';
import { setObstacleTransform } from '../../../src/games/ball-run/scene';
import { RADIUS, STEP, CONFIG, SLOPE, type ObstaclePose } from '../../../src/games/ball-run/config';

const half = [1, 1, .3], center = [0, 0, 0];
const hit = (p: number[]) => sweepSphereBox(p, p, center, half, RADIUS);

describe('Ball Run sphere and box contact', () => {
  it('touches every face, edge and corner but misses one millimetre farther out', () => {
    for (const mask of [1, 2, 4, 3, 5, 6, 7]) for (let signs = 0; signs < 8; signs++) {
      const n = [0, 1, 2].filter(i => mask & (1 << i)).length;
      const p = half.map((h, i) => mask & (1 << i) ? (signs & (1 << i) ? 1 : -1) * (h + RADIUS / Math.sqrt(n)) : 0);
      expect(hit(p), `${mask} ${signs}`).toBe(true);
      const away = p.map((v, i) => mask & (1 << i) ? v + Math.sign(v) * .001 / Math.sqrt(n) : v);
      expect(hit(away), `${mask} ${signs} outside`).toBe(false);
    }
  });

  it('sweeps through a minimum-depth block at the maximum fixed-step speed', () => {
    const travel = CONFIG.hard.maxSpeed * STEP;
    expect(travel).toBeCloseTo(.62, 9);
    expect(sweepSphereBox([0, 0, -.3 - RADIUS - .01], [0, 0, -.3 - RADIUS - .01 + travel], center, half, RADIUS)).toBe(true);
    expect(sweepSphereBox([1 + RADIUS + .001, 0, -.7], [1 + RADIUS + .001, 0, .7], center, half, RADIUS)).toBe(false);
  });
});

describe('rendered obstacle transform', () => {
  it('matches every generated pattern, including sliders and banked boxes, through origin snaps', () => {
    const course = getCourse(42, 'hard'), patterns = new Set<string>();
    const p: ObstaclePose = { x: 0, y: 0, distance: 0, roll: 0, halfWidth: 0, halfHeight: 0, halfDepth: 0 };
    const object = new THREE.Object3D(), point = new THREE.Vector3();
    let sliders = 0, banked = 0;
    course.forEachObstacle(0, 20000, o => {
      patterns.add(o.pattern);
      if (o.slide) sliders++;
      for (const time of [0, .517]) {
        course.pose(o, time, p);
        if (Math.abs(p.roll) > .01) banked++;
        const distance = Math.floor(o.distance * 2) / 2 + .37, origin = Math.floor(distance * 2) / 2;
        setObstacleTransform(object, p, origin);
        object.updateMatrix();
        point.set(.5, .5, .5).applyMatrix4(object.matrix);
        point.y += (distance - origin) * SLOPE;
        point.z += distance - origin;
        expect(point.x).toBeCloseTo(p.x + Math.cos(p.roll) * p.halfWidth + Math.sin(p.roll) * p.halfHeight, 9);
        expect(point.y).toBeCloseTo(p.y + SLOPE * distance - Math.sin(p.roll) * p.halfWidth + Math.cos(p.roll) * p.halfHeight, 9);
        expect(point.z).toBeCloseTo(-(p.distance - distance) + p.halfDepth, 9);
      }
    });
    expect(patterns.size).toBe(10);
    expect(sliders).toBeGreaterThan(0);
    expect(banked).toBeGreaterThan(0);
  });
});
