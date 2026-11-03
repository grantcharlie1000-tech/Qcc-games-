import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createScene } from '../../../src/games/ball-run/scene';
import { getCourse } from '../../../src/games/ball-run/course';
import { createRun } from '../../../src/games/ball-run/model';
import { RADIUS, SLOPE, type Obstacle, type ObstaclePose } from '../../../src/games/ball-run/config';

const captured = vi.hoisted(() => ({ scene: null as THREE.Scene | null }));
// Only browser/GPU boundaries are replaced; real Three objects, matrices, pools,
// generated courses, and the complete scene render path run in these tests.
vi.mock('three', async () => {
  const actual = await vi.importActual<typeof THREE>('three');
  return { ...actual, WebGLRenderer: class {
    info = { render: { calls: 6 }, memory: { geometries: 3 } };
    setPixelRatio() {} setClearColor() {} setSize() {} dispose() {} forceContextLoss() {}
    render(scene: THREE.Scene) { captured.scene = scene; scene.updateMatrixWorld(true); }
  } };
});
vi.mock('../../../src/ui/glass-frame-source', () => ({ registerGlassFrameSource: () => () => {}, notifyGlassFrame() {} }));

beforeEach(() => {
  vi.stubGlobal('window', { devicePixelRatio: 3, location: { search: '' }, localStorage: { getItem: () => null } });
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ fillRect() {} }) }) });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('Ball Run road streaming', () => {
  it('reuses the visible road while uploading only newly exposed/changed pieces', () => {
    const scene = createScene({ clientWidth: 390, clientHeight: 844 } as HTMLCanvasElement, { reducedMotion: () => false });
    const run = createRun(11, 1, 'medium'), course = getCourse(11, 'medium');
    const view = { run, course, speed: course.speed(0) };
    scene.render(view);
    const road = captured.scene!.children[0], tiles = road.children[0] as THREE.InstancedMesh, grid = road.children[1] as THREE.InstancedMesh;
    const tileBuffer = tiles.instanceMatrix.array, gridBuffer = grid.instanceMatrix.array;
    const tileVersion = tiles.instanceMatrix.version, gridVersion = grid.instanceMatrix.version;
    scene.render(view);
    expect(tiles.instanceMatrix.version).toBe(tileVersion);
    expect(grid.instanceMatrix.version).toBe(gridVersion);
    run.distance = .6;
    scene.render(view);
    expect(tiles.instanceMatrix.array).toBe(tileBuffer);
    expect(grid.instanceMatrix.array).toBe(gridBuffer);
    const uploaded = grid.instanceMatrix.updateRanges.reduce((sum, range) => sum + range.count, 0);
    expect(uploaded).toBeLessThan(grid.count * 16 / 10);
    scene.dispose();
  });

  it('keeps obstacles aligned with collision poses through motion, rebasing, reset and course changes', () => {
    const scene = createScene({ clientWidth: 1366, clientHeight: 768 } as HTMLCanvasElement, { reducedMotion: () => false });
    const matrix = new THREE.Matrix4();
    let sliders = 0, gates = 0;
    for (const seed of [11, 42]) {
      const course = getCourse(seed, 'hard'), run = createRun(seed, 1, 'hard');
      const view = { run, course, speed: 0 }, obstacles: Obstacle[] = [];
      const pose: ObstaclePose = { x: 0, y: 0, distance: 0, roll: 0, halfWidth: 0, halfHeight: 0, halfDepth: 0 };
      course.forEachObstacle(0, 2000, o => { if (o.slide) obstacles.push(o); });
      expect(obstacles.length).toBeGreaterThan(0);
      // Follow real streaming steps around a slider, a rebase and a gate, then restore backwards.
      const distances = [0, 255, 255.6, 256, 256.6, obstacles[0].distance - 5, obstacles[0].distance - 4.4];
      course.forEachGate(100, 800, gate => { distances.push(gate.start - 1, gate.start + .6); gates++; });
      for (const distance of distances.concat([0])) for (const elapsed of [0, .517]) {
        run.distance = distance; run.elapsed = elapsed;
        run.height = course.surfaceHeight(distance, run.x) + RADIUS;
        view.speed = course.speed(distance);
        scene.render(view);
        const road = captured.scene!.children[0], blocks = road.children[2] as THREE.InstancedMesh;
        const centers: number[][] = [];
        for (let i = 0; i < blocks.count; i++) {
          blocks.getMatrixAt(i, matrix);
          centers.push([matrix.elements[12], matrix.elements[13] + road.position.y, matrix.elements[14] + road.position.z]);
        }
        const origin = Math.floor(distance * 2) / 2;
        course.forEachObstacle(origin - 6, origin + Math.min(260, 160 + 1.6 * view.speed), o => {
          course.pose(o, elapsed, pose);
          const expected = [pose.x, pose.y + SLOPE * distance, distance - pose.distance];
          expect(centers.some(p => p.every((v, axis) => Math.abs(v - expected[axis]) < .0001)), `seed ${seed}, d ${distance}, obstacle ${o.id}`).toBe(true);
          if (o.slide) sliders++;
        });
        expect(blocks.count).toBeLessThanOrEqual(320);
        expect((road.children[0] as THREE.InstancedMesh).count).toBeLessThanOrEqual(420);
        expect((road.children[1] as THREE.InstancedMesh).count).toBeLessThanOrEqual(3400);
      }
      scene.reset();
    }
    expect(sliders).toBeGreaterThan(0);
    expect(gates).toBeGreaterThan(0);
    scene.dispose();
  });
});
