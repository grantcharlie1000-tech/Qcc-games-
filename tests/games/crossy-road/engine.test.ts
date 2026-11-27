import {afterEach, expect, it, vi} from 'vitest';
import * as THREE from 'three';
import type * as Three from 'three';
import {treeGeometry, unitBoxGeometry} from '../../../src/games/crossy-road/models';
import {clipFacing, viewBasis} from '../../../src/games/crossy-road/view-clip';

const observed = vi.hoisted(() => ({scene: null as Three.Scene | null}));
vi.mock('three', async () => {
  const actual = await vi.importActual<typeof Three>('three');
  return {...actual, WebGLRenderer: class {
    readonly shadowMap = {enabled: false};
    readonly info = {render: {calls: 0, triangles: 0}, memory: {geometries: 0, textures: 0}, programs: [] as unknown[]};
    private ratio = 1;
    constructor(private options: {canvas: HTMLCanvasElement}) {}
    setClearColor() {} getPixelRatio() { return this.ratio; }
    setDrawingBufferSize(w: number, h: number, r: number) { this.ratio = r; this.options.canvas.width = Math.floor(w * r); this.options.canvas.height = Math.floor(h * r); }
    compile() {} dispose() {} forceContextLoss() {}
    render(scene: Three.Scene) {
      observed.scene = scene;
      let calls = 0, triangles = 0;
      scene.traverse(object => {
        const mesh = object as Three.InstancedMesh;
        if (!mesh.isMesh || !mesh.visible) return;
        const count = mesh.isInstancedMesh ? mesh.count : 1;
        calls++;
        triangles += ((mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3) * count;
      });
      this.info.render = {calls, triangles};
    }
  }};
});

const PITCH = 45 * Math.PI / 180, YAW = 20 * Math.PI / 180, DIST = 40, SLOPE = 0.85 / 0.9;
const basis = viewBasis(PITCH, YAW, DIST, SLOPE);
const viewDir = [-Math.sin(YAW) * Math.cos(PITCH), -Math.sin(PITCH), -Math.cos(YAW) * Math.cos(PITCH)];

function normals(geometry: THREE.BufferGeometry): number[][] {
  const normal = geometry.getAttribute('normal'), index = geometry.getIndex()!;
  const out: number[][] = [];
  for (let t = 0; t < index.count; t += 3) {
    const i = index.getX(t);
    out.push([normal.getX(i), normal.getY(i), normal.getZ(i)]);
  }
  return out;
}
function sameVertex(geometry: THREE.BufferGeometry, source: THREE.BufferGeometry): boolean {
  const a = geometry.getAttribute('position'), b = source.getAttribute('position');
  for (let i = 0; i < a.count; i++) {
    let found = false;
    for (let j = 0; j < b.count; j++) {
      if (a.getX(i) === b.getX(j) && a.getY(i) === b.getY(j) && a.getZ(i) === b.getZ(j)) { found = true; break; }
    }
    if (!found) return false;
  }
  return true;
}

it('keeps the three camera-facing faces of a lane box and the two shadow-facing faces', () => {
  const box = unitBoxGeometry();
  const color = clipFacing(box, basis, [0], false);
  const shadow = clipFacing(box, basis, [0], true);
  expect(color.index!.count / 3).toBe(6);
  expect(shadow.index!.count / 3).toBe(4);
  const facing = normals(color).map(n => n[0] * viewDir[0] + n[1] * viewDir[1] + n[2] * viewDir[2]);
  expect(facing.every(dot => dot < -0.2)).toBe(true);
  expect(normals(color).map(n => n.join(','))).toEqual(expect.arrayContaining(['1,0,0', '0,1,0', '0,0,1']));
  expect(normals(shadow).every(n => (n[0] === -1 && n[1] === 0) || (n[0] === 0 && n[1] === 1))).toBe(true);
  expect(sameVertex(color, box)).toBe(true);
  expect(sameVertex(shadow, box)).toBe(true);
  color.dispose(); shadow.dispose(); box.dispose();
});

it('copies tree vertices that still face the camera and drops the rest from both passes', () => {
  const tree = treeGeometry(0);
  const color = clipFacing(tree, basis, [0], false);
  const shadow = clipFacing(tree, basis, [0], true);
  expect(color.index!.count).toBeLessThan(tree.index!.count);
  expect(shadow.index!.count).toBeLessThan(color.index!.count);
  expect(sameVertex(color, tree)).toBe(true);
  expect(sameVertex(shadow, tree)).toBe(true);
  color.dispose(); shadow.dispose(); tree.dispose();
});

it('precomputed snow matches the per-flake hash', async () => {
  const {fallingFlake} = await import('../../../src/games/crossy-road/scene');
  const hash = (a: number, b: number): number => {
    let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x7f4a7c15, 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
    return (h ^ (h >>> 15)) & 0x3fffffff;
  };
  const snowH = 7;
  for (const anim of [0, 0.37, 4.2]) for (let i = 0; i < 220; i++) {
    const h = hash(i, 9001), g = hash(i, 9002);
    const speed = 0.55 + 0.5 * ((g & 255) / 255);
    const sway = 0.22 * Math.sin(anim * (0.9 + ((g >>> 8) & 7) * 0.1) + i);
    const y = snowH - (((((h >>> 20) & 1023) / 1024) * snowH + anim * speed) % snowH) - 0.3;
    const spanX = 13.5, spanZ = 19.25, cx = 2.2, cz = -6.4;
    const got = fallingFlake(i, anim, spanX, spanZ, cx, cz);
    if (y < 0.02) { expect(got).toBeNull(); continue; }
    const bx = ((h & 1023) / 1024) * spanX + sway + anim * 0.12, bz = (((h >>> 10) & 1023) / 1024) * spanZ;
    const x = cx + ((((bx - cx) % spanX) + spanX) % spanX) - spanX / 2;
    const z = cz + ((((bz - cz) % spanZ) + spanZ) % spanZ) - spanZ / 2;
    const size = 0.05 + 0.015 * ((g >>> 12) & 3);
    expect(got).toEqual({x, y, z, size});
  }
});

it('submits the facing triangles of a full scene without dropping a draw', async () => {
  vi.stubGlobal('window', {devicePixelRatio: 1});
  const {createScene} = await import('../../../src/games/crossy-road/scene');
  const {World} = await import('../../../src/games/crossy-road/world');
  const {createRun, pose} = await import('../../../src/games/crossy-road/rules');
  const canvas = {clientWidth: 1366, clientHeight: 768, width: 1366, height: 768} as HTMLCanvasElement;
  const scene = createScene(canvas);
  try {
    const state = createRun(11), world = new World(11);
    scene.render({state, world, pose: pose(state), dt: 1 / 60, reducedMotion: false, colorBlind: false, ufoWarn: false});
    const ground = observed.scene!.children.find(o => (o as THREE.InstancedMesh).instanceMatrix?.count === 6400) as THREE.InstancedMesh;
    expect(ground.geometry.index!.count).toBe(18);
    let strict = 0;
    observed.scene!.traverse(object => {
      const mesh = object as THREE.InstancedMesh;
      if (!mesh.isInstancedMesh || !(mesh.material as THREE.ShaderMaterial).uniforms?.uFloor) return;
      const color = observed.scene!.children.find(o => o !== mesh && (o as THREE.InstancedMesh).instanceMatrix === mesh.instanceMatrix) as THREE.InstancedMesh;
      expect(mesh.geometry.index!.count).toBeLessThanOrEqual(color.geometry.index!.count);
      if (mesh.geometry.index!.count < color.geometry.index!.count) strict++;
    });
    expect(strict).toBeGreaterThan(0);
    // The bird and the UFO keep every face: deaths tumble the bird, and the saucer spins.
    expect(observed.scene!.children.some(o => (o as THREE.InstancedMesh).geometry?.index?.count === 684)).toBe(true);
    expect(observed.scene!.children.some(o => (o as THREE.InstancedMesh).geometry?.index?.count === 1188)).toBe(true);
    expect(scene.stats.triangles).toBeLessThan(160_000);
    expect(scene.stats.triangles).toBeGreaterThan(80_000);
    expect(scene.stats.calls).toBeGreaterThan(0);
  } finally { scene.dispose(); }
});

afterEach(() => vi.unstubAllGlobals());
