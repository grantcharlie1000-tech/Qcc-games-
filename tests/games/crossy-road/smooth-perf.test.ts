import { afterEach, expect, it, vi } from 'vitest';
import type * as Three from 'three';

const observed = vi.hoisted(() => ({ scene: null as Three.Scene | null }));
vi.mock('three', async () => {
  const actual = await vi.importActual<typeof Three>('three');
  return {
    ...actual,
    WebGLRenderer: class {
      readonly shadowMap = { enabled: false };
      readonly info = { render: { calls: 0, triangles: 0 }, memory: { geometries: 0, textures: 0 }, programs: [] };
      private ratio = 1;
      constructor(private options: { canvas: HTMLCanvasElement }) {}
      setClearColor() {}
      getPixelRatio() { return this.ratio; }
      setDrawingBufferSize(w: number, h: number, r: number) {
        this.ratio = r;
        this.options.canvas.width = Math.floor(w * r);
        this.options.canvas.height = Math.floor(h * r);
      }
      compile() {}
      dispose() {}
      forceContextLoss() {}
      render(scene: Three.Scene) {
        observed.scene = scene;
        let calls = 0;
        let triangles = 0;
        const geometries = new Set<Three.BufferGeometry>();
        scene.traverseVisible(object => {
          const mesh = object as Three.InstancedMesh;
          if (!mesh.isMesh) return;
          const count = mesh.isInstancedMesh ? mesh.count : 1;
          if (count <= 0) return;
          calls++;
          triangles += ((mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3) * count;
          geometries.add(mesh.geometry);
        });
        this.info.render = { calls, triangles: Math.round(triangles) };
        this.info.memory.geometries = geometries.size;
      }
    },
  };
});

import { createScene, fallingFlake } from '../../../src/games/crossy-road/scene';
import { createRun, pose } from '../../../src/games/crossy-road/rules';
import { World } from '../../../src/games/crossy-road/world';
import type { SceneFrame } from '../../../src/games/crossy-road/config';

afterEach(() => vi.unstubAllGlobals());

function makeScene(width = 1280, height = 720, seed = 11) {
  vi.stubGlobal('window', { devicePixelRatio: 1 });
  const canvas = { clientWidth: width, clientHeight: height, width, height } as HTMLCanvasElement;
  const scene = createScene(canvas, { quality: 'low' });
  const state = createRun(seed);
  const world = new World(seed);
  const frame: SceneFrame = { state, world, pose: pose(state), dt: 1 / 60, reducedMotion: false, colorBlind: false, ufoWarn: false };
  return { scene, frame, world, state };
}

it('interpolates vehicles smoothly via renderOffset without mutating RunState', () => {
  const { scene, frame, state } = makeScene();
  try {
    scene.render(frame);
    const vehicles = () => observed.scene!.children
      .filter(o => (o as Three.InstancedMesh).isInstancedMesh && (o as Three.InstancedMesh).count > 0 && (o as Three.InstancedMesh).geometry.hasAttribute('paint'))
      .map(o => Array.from((o as Three.InstancedMesh).instanceMatrix.array.slice(0, (o as Three.InstancedMesh).count * 16)));
    const atZero = vehicles();
    const tBefore = state.t;
    frame.renderOffset = 1 / 120;
    scene.render(frame);
    const atHalf = vehicles();
    expect(state.t).toBe(tBefore);
    expect(atHalf).not.toEqual(atZero);
  } finally {
    scene.dispose();
  }
});

it('reuses caller output object in fallingFlake to avoid per-frame allocations', () => {
  const out = { x: 0, y: 0, z: 0, size: 0 };
  const result = fallingFlake(0, 0.5, 24, 24, 4, 0, out);
  expect(result).toBe(out);
  expect(out.size).toBeGreaterThan(0);
});

it('keeps Crossy Road under 90,000 triangles at 1280x720 at start and mid-run', () => {
  const { scene, frame, world, state } = makeScene(1280, 720, 1);
  try {
    scene.render(frame);
    expect(scene.stats.triangles).toBeLessThan(90_000);
    world.ensure(160);
    state.started = true;
    state.row = 120;
    state.maxRow = 120;
    state.safeLine = 118;
    state.t = 42.5;
    frame.pose.z = 120;
    scene.reset();
    scene.render(frame);
    expect(scene.stats.triangles).toBeLessThan(90_000);
  } finally {
    scene.dispose();
  }
});
