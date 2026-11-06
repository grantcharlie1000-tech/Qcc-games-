import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createScene } from '../../../src/games/ball-run/scene';
import { createSleigh, SLEIGH_COLORS } from '../../../src/games/ball-run/sleigh';
import { SNOW_DEPTH, SNOW_EDGE, SNOW_OVERHANG, SNOW_SINK, snowCapGeometry, snowCapMaterial } from '../../../src/games/ball-run/snow';
import { CLEAR, getCourse } from '../../../src/games/ball-run/course';
import { createRun, step } from '../../../src/games/ball-run/model';
import { BALL, RADIUS, SLEIGH_BODY, SLOPE, STEP, type Obstacle, type ObstaclePose } from '../../../src/games/ball-run/config';
import { placeRun } from './bot';

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

  it('stays behind the ball\'s front while pitched on the steepest climb or dip, as steer() tilts it', () => {
    // The steepest road gradient across the courses tilts it about 0.185 rad; this allows 0.2 either way.
    const v = new THREE.Vector3(), q = new THREE.Quaternion(), x = new THREE.Vector3(1, 0, 0);
    for (const pitch of [-.2, -.1, .1, .2]) {
      q.setFromAxisAngle(x, pitch);
      let reach = 0;
      for (const mesh of sleigh.group.children as THREE.Mesh[]) {
        const p = mesh.geometry.getAttribute('position');
        for (let i = 0; i < p.count; i++) reach = Math.max(reach, -v.fromBufferAttribute(p, i).applyQuaternion(q).z);
      }
      expect(reach, `pitch ${pitch}`).toBeLessThanOrEqual(RADIUS);
    }
  });

  it('carries Santa\'s hat but no Santa, in two draw calls coloured per vertex', () => {
    const meshes = sleigh.group.children as THREE.Mesh[];
    expect(meshes).toHaveLength(2);
    const linear = (hex: number) => new THREE.Color(hex);
    const found = new Map<number, THREE.Box3>();
    for (const mesh of meshes) {
      expect((mesh.material as THREE.Material & { vertexColors: boolean }).vertexColors).toBe(true);
      const p = mesh.geometry.getAttribute('position'), c = mesh.geometry.getAttribute('color'), v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) for (const hex of Object.values(SLEIGH_COLORS)) {
        const k = linear(hex);
        if (Math.abs(c.getX(i) - k.r) + Math.abs(c.getY(i) - k.g) + Math.abs(c.getZ(i) - k.b) > 1e-5) continue;
        if (!found.has(hex)) found.set(hex, new THREE.Box3());
        found.get(hex)!.expandByPoint(v.fromBufferAttribute(p, i));
      }
    }
    // Every part is present: body, gold, velvet, floor, the hat's red cone and its white fur.
    expect([...found.keys()].sort()).toEqual(Object.values(SLEIGH_COLORS).sort());
    // The hat sits on the seat, inside the sleigh's walls, and its brim and pompom are on it.
    const hat = found.get(SLEIGH_COLORS.hat)!.clone().union(found.get(SLEIGH_COLORS.fur)!);
    expect(hat.min.x).toBeGreaterThan(box.min.x + .03);
    expect(hat.max.x).toBeLessThan(box.max.x - .03);
    expect(hat.min.y).toBeGreaterThan(-RADIUS + .2);
  });

  it('has no folded or inside-out triangles: every face turns the way its smoothed normals do', () => {
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), face = new THREE.Vector3(), normal = new THREE.Vector3(), t = new THREE.Vector3();
    for (const mesh of sleigh.group.children as THREE.Mesh[]) {
      const p = mesh.geometry.getAttribute('position'), n = mesh.geometry.getAttribute('normal');
      let inverted = 0;
      for (let i = 0; i < p.count; i += 3) {
        a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
        face.subVectors(b, a).cross(t.subVectors(c, a));
        if (face.lengthSq() < 1e-14) continue;
        normal.set(0, 0, 0);
        for (let k = 0; k < 3; k++) normal.add(t.fromBufferAttribute(n, i + k));
        if (face.dot(normal) < 0) inverted++;
      }
      expect(inverted, (mesh.material as THREE.Material).type).toBe(0);
    }
  });

  it('disposes every geometry and material it made', () => {
    const own = createSleigh(), spies = (own.group.children as THREE.Mesh[]).flatMap(m => [vi.spyOn(m.geometry, 'dispose'), vi.spyOn(m.material as THREE.Material, 'dispose')]);
    own.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
  });
});

describe('Ball Run Christmas sleigh collision', () => {
  if (SLEIGH_BODY.kind !== 'box') throw new Error('the sleigh collides as a box');
  const body = SLEIGH_BODY;

  it('is the box the drawn sleigh fills, to within a centimetre on every side, so what is seen is what hits', () => {
    const drawn = new THREE.Box3().setFromObject(createSleigh().group);
    // Forward is -z in the model and +distance in the simulation.
    const sides: [number, number][] = [[drawn.max.x, body.halfWidth], [-drawn.min.x, body.halfWidth], [drawn.min.y, body.bottom], [drawn.max.y, body.top], [-drawn.min.z, body.front], [drawn.max.z, body.back]];
    expect(drawn.max.x).toBeCloseTo(body.halfWidth, 6);
    expect(drawn.min.y).toBeCloseTo(body.bottom, 6);
    for (const [model, box] of sides) expect(Math.abs(model - box)).toBeLessThanOrEqual(.01 + 1e-9);
    expect(-drawn.min.z).toBeLessThanOrEqual(body.front); expect(drawn.max.z).toBeLessThanOrEqual(body.back); expect(drawn.max.y).toBeLessThanOrEqual(body.top);
  });

  it('fits inside the clearance the course generator keeps round the ball, so every course stays passable', () => {
    expect(body.halfWidth).toBeLessThanOrEqual(CLEAR);
    expect(body.front).toBeLessThanOrEqual(CLEAR);
    expect(body.back).toBeLessThanOrEqual(CLEAR);
  });

  it('hits a block its backrest overlaps that the ball has already cleared, and nothing else changes', () => {
    let checked = 0;
    for (const seed of [11, 42, 7]) {
      const course = getCourse(seed, 'medium'), blocks: Obstacle[] = [];
      course.forEachObstacle(200, 2000, o => { if (o.kind === 'block' && !o.slide) blocks.push(o); });
      for (const o of blocks) {
        const p = course.pose(o, 0, { x: 0, y: 0, distance: 0, roll: 0, halfWidth: 0, halfHeight: 0, halfDepth: 0 });
        // Centre 0.40 m past the block's back face, straight in line with it: the sphere (0.38) is clear,
        // the sleigh's backrest (0.42 behind the centre) is still over the block.
        const d = o.distance + o.depth / 2 + .4, s = course.sample(d);
        if (!s.ground || s.tunnel || Math.abs(p.x - s.center) > s.width / 2 - .5) continue;
        let nearby = 0;
        course.forEachObstacle(d - 3, d + 3, () => nearby++);
        if (nearby !== 1) continue;
        const asBall = placeRun(seed, 'medium', d, p.x), asSleigh = placeRun(seed, 'medium', d, p.x);
        step(asBall, 0, STEP, BALL); step(asSleigh, 0, STEP, body);
        expect(asBall.phase).toBe('running');
        expect(asSleigh.phase).toBe('dying'); expect(asSleigh.reason).toBe('block');
        // Ahead of the block by more than the backrest, the sleigh runs on exactly as the ball does.
        const clear = placeRun(seed, 'medium', o.distance + o.depth / 2 + body.back + .05, p.x), ball = { ...clear };
        step(clear, 0, STEP, body); step(ball, 0, STEP, BALL);
        expect(clear).toEqual(ball);
        if (++checked >= 6) break;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(3);
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
    // (The last vertex is the centre of the flat face that closes the underside.)
    for (let i = 0; i < pos.count - 1; i++) if (pos.getY(i) < 0) expect(Math.max(Math.abs(pos.getX(i)), Math.abs(pos.getZ(i)))).toBeCloseTo(.5, 6);
    // That underside faces down.
    const index = g.getIndex()!, p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), p2 = new THREE.Vector3();
    let undersides = 0;
    for (let t = 0; t < index.count; t += 3) {
      if (index.getX(t) !== pos.count - 1) continue;
      // As drawn (anchor × size + inset), since the edge band is collapsed in the unit anchors.
      const offset = g.getAttribute('inset'), drawn = (v: THREE.Vector3, k: number) => v.set(pos.getX(k) * 1.2 + offset.getX(k), pos.getY(k), pos.getZ(k) * 1.2 + offset.getY(k));
      drawn(p0, index.getX(t)); drawn(p1, index.getX(t + 1)); drawn(p2, index.getX(t + 2));
      expect(p1.sub(p0).cross(p2.sub(p0)).y).toBeLessThan(0);
      undersides++;
    }
    expect(undersides).toBeGreaterThan(20);
    expect(g.getAttribute('normal')).toBeUndefined();
    // The rounded edge is the same width in metres on every block: drawn as the shader does (anchor × size +
    // inset), every vertex below the crest lies within SNOW_EDGE of the cap's edge, on a 0.36 m post and a 14 m wall.
    const inset = g.getAttribute('inset');
    for (const [w, d] of [[.36, .66], [1.2, 1.2], [4.05, 14.05]]) for (let i = 0; i < pos.count - 1; i++) {
      const x = pos.getX(i) * w + inset.getX(i), z = pos.getZ(i) * d + inset.getY(i);
      expect(Math.abs(x)).toBeLessThanOrEqual(w / 2 + 1e-6); expect(Math.abs(z)).toBeLessThanOrEqual(d / 2 + 1e-6);
      const fromEdge = Math.min(w / 2 - Math.abs(x), d / 2 - Math.abs(z));
      if (pos.getY(i) < .99 - .11) expect(fromEdge, `${w}x${d}`).toBeLessThanOrEqual(SNOW_EDGE + 1e-6);
    }
    // A few centimetres: a light covering, not a drift.
    expect(SNOW_DEPTH).toBeLessThanOrEqual(.08);
    g.dispose();
  });
});

describe('Ball Run Christmas snow shader', () => {
  it('applies the metric inset to three.js\'s own basic vertex shader, after the instance-free transform', () => {
    const material = snowCapMaterial(), shader = { vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: '', uniforms: {} } as unknown as THREE.WebGLProgramParametersWithUniforms;
    expect(shader.vertexShader).toContain('#include <begin_vertex>');
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.vertexShader).toContain('attribute vec2 inset;');
    expect(shader.vertexShader).toContain('transformed.xz += inset / vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[2].xyz));');
    expect(shader.vertexShader.indexOf('#include <begin_vertex>')).toBeLessThan(shader.vertexShader.indexOf('transformed.xz += inset'));
    expect(shader.vertexShader.indexOf('transformed.xz += inset')).toBeLessThan(shader.vertexShader.indexOf('#include <project_vertex>'));
    material.dispose();
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
        const road = captured.scene!.children[0], snow = road.children.find(c => c instanceof THREE.InstancedMesh && c.geometry.getAttribute('inset')) as THREE.InstancedMesh;
        expect(snow.material).toBeInstanceOf(THREE.MeshBasicMaterial);
        expect(snow.geometry.getAttribute('inset')).toBeDefined();
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
