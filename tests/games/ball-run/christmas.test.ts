import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createScene } from '../../../src/games/ball-run/scene';
import { createSleigh, SLEIGH_COLORS } from '../../../src/games/ball-run/sleigh';
import { SNOW_DEPTH, SNOW_OVERHANG, SNOW_SINK, snowCapGeometry } from '../../../src/games/ball-run/snow';
import { getCourse } from '../../../src/games/ball-run/course';
import { createRun } from '../../../src/games/ball-run/model';
import { RADIUS, SLOPE, type Obstacle, type ObstaclePose } from '../../../src/games/ball-run/config';

const captured = vi.hoisted(() => ({ scene: null as THREE.Scene | null }));
// Only browser/GPU boundaries are replaced, as in scene-cache.test.ts.
vi.mock('three', async () => {
  const actual = await vi.importActual<typeof THREE>('three');
  return { ...actual, WebGLRenderer: class {
    info = { render: { calls: 6 }, memory: { geometries: 3 } };
    setPixelRatio() {} setClearColor() {} setSize() {} dispose() {} forceContextLoss() {}
    render(scene: THREE.Scene) { captured.scene = scene; scene.updateMatrixWorld(true); }
  } };
});
vi.mock('../../../src/ui/glass-frame-source', () => ({ registerGlassFrameSource: () => () => {}, notifyGlassFrame() {} }));

function stubDocument(festive: 'christmas' | 'off') {
  vi.stubGlobal('window', { devicePixelRatio: 2, location: { search: '' }, localStorage: { getItem: () => null } });
  vi.stubGlobal('document', { documentElement: { dataset: { festive } }, createElement: () => ({ getContext: () => ({ fillRect() {} }) }) });
}
afterEach(() => { vi.unstubAllGlobals(); });

describe('Ball Run Christmas sleigh model', () => {
  const sleigh = createSleigh(), box = new THREE.Box3().setFromObject(sleigh.group);

  it('is exactly one ball wide, centred on the ball, with its runners on the ball\'s ground contact', () => {
    expect(box.max.x - box.min.x).toBeCloseTo(2 * RADIUS, 6);
    expect(box.max.x + box.min.x).toBeCloseTo(0, 6);
    expect(box.min.y).toBeCloseTo(-RADIUS, 6);
  });

  it('reaches no further forward than the ball, so a crash never shows it inside a block, and stays low', () => {
    // Forward is -z.
    expect(box.min.z).toBeGreaterThanOrEqual(-RADIUS);
    expect(box.max.y).toBeLessThan(RADIUS);
    expect(box.max.z - box.min.z).toBeLessThan(4 * RADIUS);
  });

  it('carries Santa\'s hat but no Santa: six merged meshes, one per material', () => {
    const meshes = sleigh.group.children as THREE.Mesh[];
    expect(meshes).toHaveLength(6);
    const colours = meshes.map(m => (m.material as THREE.MeshPhongMaterial).color.getHex());
    expect(colours).toEqual([SLEIGH_COLORS.body, SLEIGH_COLORS.gold, SLEIGH_COLORS.velvet, SLEIGH_COLORS.floor, SLEIGH_COLORS.hat, SLEIGH_COLORS.fur]);
    // The hat (red cone, white brim and pompom) sits on the seat, inside the sleigh's walls.
    const hat = new THREE.Box3().setFromObject(meshes[4]).union(new THREE.Box3().setFromObject(meshes[5]));
    expect(hat.min.x).toBeGreaterThan(box.min.x + .03);
    expect(hat.max.x).toBeLessThan(box.max.x - .03);
    expect(hat.min.y).toBeGreaterThan(-RADIUS + .2);
    for (const mesh of meshes) expect(mesh.geometry.getAttribute('position').count).toBeGreaterThan(0);
  });

  it('disposes every geometry and material it made', () => {
    const own = createSleigh(), spies = (own.group.children as THREE.Mesh[]).flatMap(m => [vi.spyOn(m.geometry, 'dispose'), vi.spyOn(m.material as THREE.Material, 'dispose')]);
    own.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
  });
});

describe('Ball Run Christmas snow cap', () => {
  it('is a unit mound on y = 0 whose lip hangs a little below it, with baked white-to-lavender shading', () => {
    const g = snowCapGeometry();
    g.computeBoundingBox();
    const b = g.boundingBox!;
    expect(b.min.x).toBeCloseTo(-.5, 6); expect(b.max.x).toBeCloseTo(.5, 6);
    expect(b.min.z).toBeCloseTo(-.5, 6); expect(b.max.z).toBeCloseTo(.5, 6);
    expect(b.min.y).toBeLessThan(0); expect(b.min.y).toBeGreaterThan(-.5);
    expect(b.max.y).toBeGreaterThan(.9); expect(b.max.y).toBeLessThan(1.15);
    const colors = g.getAttribute('color');
    expect(colors.count).toBe(g.getAttribute('position').count);
    let brightest = 0;
    for (let i = 0; i < colors.count; i++) brightest = Math.max(brightest, colors.getX(i) + colors.getY(i) + colors.getZ(i));
    expect(brightest).toBeGreaterThan(2.7);
    // The lip hangs straight down at the cap's full size, so it is outside the block's faces at any width.
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) < 0) expect(Math.max(Math.abs(pos.getX(i)), Math.abs(pos.getZ(i)))).toBeCloseTo(.5, 6);
    expect(g.getAttribute('normal')).toBeUndefined();
    // A few centimetres: a light covering, not a drift.
    expect(SNOW_DEPTH).toBeLessThanOrEqual(.08);
    g.dispose();
  });
});

describe('Ball Run Christmas scene', () => {
  beforeEach(() => stubDocument('christmas'));

  it('puts one snow cap on top of every obstacle (sliders included) and none on the gate walls', () => {
    const scene = createScene({ clientWidth: 390, clientHeight: 844 } as HTMLCanvasElement, { reducedMotion: () => false });
    const pose: ObstaclePose = { x: 0, y: 0, distance: 0, roll: 0, halfWidth: 0, halfHeight: 0, halfDepth: 0 };
    const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), rotation = new THREE.Quaternion(), size = new THREE.Vector3(), up = new THREE.Vector3();
    let checked = 0, sliders = 0, banked = 0;
    for (const seed of [11, 42]) {
      const course = getCourse(seed, 'hard'), run = createRun(seed, 1, 'hard'), view = { run, course, speed: 0 };
      for (let distance = 300; distance <= 3000; distance += 300) for (const elapsed of [0, .517]) {
        run.distance = distance; run.elapsed = elapsed; run.height = course.surfaceHeight(distance, run.x) + RADIUS;
        view.speed = course.speed(distance);
        scene.render(view);
        const road = captured.scene!.children[0], snow = road.children[3] as THREE.InstancedMesh;
        expect(snow.material).toBeInstanceOf(THREE.MeshBasicMaterial);
        const caps: { position: THREE.Vector3; up: THREE.Vector3; size: THREE.Vector3 }[] = [];
        for (let i = 0; i < snow.count; i++) {
          snow.getMatrixAt(i, matrix);
          matrix.decompose(position, rotation, size);
          caps.push({ position: position.clone().add(road.position), up: up.set(0, 1, 0).applyQuaternion(rotation).clone(), size: size.clone() });
        }
        const obstacles: Obstacle[] = [];
        const origin = Math.floor(distance * 2) / 2;
        course.forEachObstacle(origin - 6, origin + Math.min(260, 160 + 1.6 * view.speed), o => obstacles.push(o));
        expect(snow.count).toBe(obstacles.length);
        for (const o of obstacles) {
          course.pose(o, elapsed, pose);
          // The block's top centre in render space: its centre plus its own up axis times its half height.
          const tilt = new THREE.Vector3(Math.sin(pose.roll), Math.cos(pose.roll), 0);
          const top = new THREE.Vector3(pose.x, pose.y + SLOPE * distance, distance - pose.distance).addScaledVector(tilt, pose.halfHeight - SNOW_SINK);
          const cap = caps.find(c => c.position.distanceTo(top) < 1e-4);
          expect(cap, `seed ${seed}, d ${distance}, obstacle ${o.id}`).toBeDefined();
          expect(cap!.up.distanceTo(tilt)).toBeLessThan(1e-5);
          expect(cap!.size.x).toBeCloseTo(2 * (pose.halfWidth + SNOW_OVERHANG), 5);
          expect(cap!.size.y).toBeCloseTo(SNOW_DEPTH, 5);
          expect(cap!.size.z).toBeCloseTo(2 * (pose.halfDepth + SNOW_OVERHANG), 5);
          checked++;
          if (o.slide) sliders++;
          if (Math.abs(pose.roll) > .05) banked++;
        }
      }
      scene.reset();
    }
    expect(checked).toBeGreaterThan(50);
    expect(sliders).toBeGreaterThan(0);
    expect(banked).toBeGreaterThan(0);
    scene.dispose();
  });

  it('draws the sleigh, not the ball, at the ball\'s position, standing on the road and following its bank', () => {
    const scene = createScene({ clientWidth: 390, clientHeight: 844 } as HTMLCanvasElement, { reducedMotion: () => false });
    const course = getCourse(7, 'medium'), run = createRun(7, 1, 'medium'), view = { run, course, speed: 0 };
    let bankedChecks = 0;
    for (let distance = 0; distance < 1500; distance += .5) {
      const s = course.sample(distance);
      if (!s.ground) continue;
      run.distance = distance; run.x = s.center; run.height = course.surfaceHeight(distance, run.x) + RADIUS / Math.cos(s.bank);
      view.speed = course.speed(distance);
      scene.render(view);
      const sleigh = captured.scene!.getObjectByName('sleigh')!;
      expect(sleigh.visible).toBe(true);
      expect(sleigh.position.x).toBeCloseTo(run.x, 6);
      expect(sleigh.position.y).toBeCloseTo(run.height + SLOPE * distance, 6);
      if (Math.abs(s.bank) > .1 && distance > 2) {
        // After travelling along the road it has eased onto the bank.
        expect(Math.abs(-sleigh.rotation.z - s.bank)).toBeLessThan(.08);
        bankedChecks++;
      }
    }
    expect(bankedChecks).toBeGreaterThan(0);
    scene.dispose();
  });

  it('never turns about y while dodging, so it stays within the ball\'s width, and holds its attitude in the air and off the edge', () => {
    const scene = createScene({ clientWidth: 390, clientHeight: 844 } as HTMLCanvasElement, { reducedMotion: () => false });
    const course = getCourse(7, 'medium'), run = createRun(7, 1, 'medium'), view = { run, course, speed: 0 };
    const sleigh = () => captured.scene!.getObjectByName('sleigh')!;
    // A hard dodge: two metres sideways per metre forward.
    for (let i = 0; i <= 40; i++) {
      const distance = 400 + i * .25, s = course.sample(distance);
      run.distance = distance; run.x = s.center + Math.sin(i / 3) * Math.min(1.5, s.width / 2 - RADIUS);
      run.height = course.surfaceHeight(distance, run.x) + RADIUS / Math.cos(s.bank);
      scene.render(view);
      expect(sleigh().rotation.y).toBe(0);
    }
    const held = sleigh().rotation.clone();
    // Launched 3 m above the road: the attitude holds.
    for (let i = 1; i <= 20; i++) {
      run.distance = 410 + i * .5; run.height = course.surfaceHeight(run.distance, run.x) + 3;
      scene.render(view);
      expect(sleigh().rotation.x).toBe(held.x);
      expect(sleigh().rotation.z).toBe(held.z);
    }
    // Off the road's edge and falling past it: still held, though the road plane extends under it.
    for (let i = 1; i <= 10; i++) {
      run.distance = 421 + i * .5; const s = course.sample(run.distance);
      run.x = s.center + s.width / 2 + 1; run.height = course.surfaceHeight(run.distance, s.center) - .5 * i;
      scene.render(view);
      expect(sleigh().rotation.x).toBe(held.x);
      expect(sleigh().rotation.z).toBe(held.z);
    }
    // No ball anywhere: not the ball itself, and the Speed Up trail draws diamond glints, not spheres.
    const spheres = captured.scene!.children.filter(c => c instanceof THREE.Mesh && c.geometry instanceof THREE.SphereGeometry);
    expect(spheres).toHaveLength(0);
    expect(captured.scene!.children.some(c => c instanceof THREE.InstancedMesh && c.geometry instanceof THREE.OctahedronGeometry)).toBe(true);
    scene.dispose();
  });
});

describe('Ball Run with the theme off', () => {
  beforeEach(() => stubDocument('off'));

  it('keeps the original ball and adds no snow and no sleigh', () => {
    const scene = createScene({ clientWidth: 390, clientHeight: 844 } as HTMLCanvasElement, { reducedMotion: () => false });
    const course = getCourse(11, 'hard'), run = createRun(11, 1, 'hard');
    run.distance = 300; run.height = course.surfaceHeight(300, run.x) + RADIUS;
    scene.render({ run, course, speed: course.speed(300) });
    expect(captured.scene!.getObjectByName('sleigh')).toBeUndefined();
    const balls = captured.scene!.children.filter(c => c instanceof THREE.Mesh && !(c instanceof THREE.InstancedMesh) && c.geometry instanceof THREE.SphereGeometry);
    expect(balls).toHaveLength(1);
    expect(captured.scene!.children.some(c => c instanceof THREE.InstancedMesh && c.geometry instanceof THREE.SphereGeometry)).toBe(true);
    const road = captured.scene!.children[0];
    // tiles, grid, blocks, cyan: the original four pools.
    expect(road.children).toHaveLength(4);
    scene.dispose();
  });
});
