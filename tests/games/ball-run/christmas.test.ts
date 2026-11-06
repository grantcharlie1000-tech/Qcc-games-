import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createScene } from '../../../src/games/ball-run/scene';
import { createSleigh, SLEIGH_COLORS, SLEIGH_POSE, placeOnRunners } from '../../../src/games/ball-run/sleigh';
import { SNOW_DEPTH, SNOW_EDGE, SNOW_OVERHANG, SNOW_SINK, snowCapGeometry, snowCapMaterial } from '../../../src/games/ball-run/snow';
import { CLEAR, getCourse } from '../../../src/games/ball-run/course';
import { createSnowfall, SNOWFALL_BOX, SNOWFALL_FLAKES, SNOWFALL_PERIOD } from '../../../src/games/ball-run/snowfall';
import { createRun, heightAboveRest, step, surfaceSlope } from '../../../src/games/ball-run/model';
import { BALL, CONFIG, FLARE, type Run, PITCH_LIMIT, RADIUS, SLEIGH_BODY, SLOPE, STEP, boxExtents, largestBox, sleighPitch, type BoxExtents, type Obstacle, type ObstaclePose } from '../../../src/games/ball-run/config';
import { driveBot, placeRun, useBody } from './bot';

/** The sleigh's pitch for a run's state, exactly as model.ts and scene.ts take it (config.ts sleighPitch). */
function pitchFor(course: ReturnType<typeof getCourse>, run: { distance: number; x: number; height: number; vx: number; vy: number; grounded: boolean }): number {
  const s = course.sample(run.distance);
  return sleighPitch(run.grounded, surfaceSlope(course, run.distance, run.x), run.vy, run.vx, s.bank, course.speed(run.distance), run.grounded ? 0 : heightAboveRest(course, run.distance, run.x, run.height));
}

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

  // The sleigh's real vertices, and those extreme in some direction (any box face the poses below can turn
  // toward picks one of them), for searching many poses quickly.
  const vertices: THREE.Vector3[] = [];
  for (const mesh of createSleigh().group.children as THREE.Mesh[]) {
    const p = mesh.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) vertices.push(new THREE.Vector3().fromBufferAttribute(p, i));
  }
  const extremes = (() => {
    const picked = new Set<number>(), d = new THREE.Vector3();
    for (let k = 0; k < 2000; k++) {
      const u = 2 * (k + .5) / 2000 - 1, phi = k * 2.399963;
      d.set(Math.sqrt(1 - u * u) * Math.cos(phi), u, Math.sqrt(1 - u * u) * Math.sin(phi));
      let best = 0, top = -Infinity;
      for (let i = 0; i < vertices.length; i++) { const v = vertices[i].dot(d); if (v > top) { top = v; best = i; } }
      picked.add(best);
    }
    return [...picked].map(i => vertices[i]);
  })();
  /** The furthest the posed sleigh reaches, in the frame of a block whose roll is `roll`. */
  function reach(points: THREE.Vector3[], pitch: number, bank: number, roll: number, carve: number, squash: number, into: BoxExtents): void {
    const sleigh = new THREE.Object3D(), unroll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll), v = new THREE.Vector3();
    placeOnRunners(sleigh, pitch, bank, carve, squash);
    sleigh.updateMatrix();
    for (const point of points) {
      v.copy(point).applyMatrix4(sleigh.matrix).applyQuaternion(unroll);
      into.halfWidth = Math.max(into.halfWidth, Math.abs(v.x)); into.bottom = Math.min(into.bottom, v.y); into.top = Math.max(into.top, v.y);
      into.front = Math.max(into.front, -v.z); into.back = Math.max(into.back, v.z);
    }
  }
  const empty = (): BoxExtents => ({ halfWidth: 0, bottom: 0, top: -1, front: 0, back: 0 });

  it('has a box for every pitch the sleigh can take, from -PITCH_LIMIT to PITCH_LIMIT, row after row', () => {
    expect(body.table[0][0]).toBeCloseTo(-PITCH_LIMIT, 9);
    expect(body.table[body.table.length - 1][1]).toBeCloseTo(PITCH_LIMIT, 9);
    for (let i = 1; i < body.table.length; i++) expect(body.table[i][0]).toBeCloseTo(body.table[i - 1][1], 9);
    // The union over a range takes every row it touches.
    const k = boxExtents(body.table, -.12, .03, { halfWidth: 0, bottom: 0, top: 0, front: 0, back: 0 }), rows = body.table.filter(r => r[1] >= -.12 && r[0] <= .03);
    expect(k.back).toBe(Math.max(...rows.map(r => r[6]))); expect(k.halfWidth).toBe(Math.max(...rows.map(r => r[2])));
    expect(sleighPitch(true, Math.tan(.6), 0, 0, 0, 20, 0)).toBe(PITCH_LIMIT);
    expect(sleighPitch(false, 0, -6, 0, 0, 20, Infinity)).toBeCloseTo(Math.atan2(-6, 20), 12);
    // Within FLARE of the road below it blends from its flight path to the road's slope: no jump either way.
    expect(sleighPitch(false, -.1, -6, 0, 0, 20, 0)).toBeCloseTo(Math.atan(-.1), 12);
    expect(sleighPitch(false, -.1, -6, 0, 0, 20, FLARE / 2)).toBeCloseTo((Math.atan(-.1) + Math.atan2(-6, 20)) / 2, 12);
    expect(sleighPitch(false, -.1, -6, 0, 0, 20, FLARE)).toBeCloseTo(Math.atan2(-6, 20), 12);
    // In the air, what its sideways motion climbs across a bank is not its nose's climb.
    expect(sleighPitch(false, 0, -6 - Math.tan(.3) * 4, 4, .3, 20, Infinity)).toBeCloseTo(Math.atan2(-6, 20), 12);
  });

  it('holds everything drawn of it, snugly, in every row: any pitch in it, bank, block roll, carve and squash', { timeout: 120000 }, () => {
    // Pitch across the row; the bank up to the steepest road's; the block's roll up to SLEIGH_POSE.roll from that
    // bank; the carve lean and the spring both ways. Posed by placeOnRunners exactly as scene.ts poses it.
    const maxBank = Math.max(CONFIG.easy.maxBank, CONFIG.medium.maxBank, CONFIG.hard.maxBank);
    for (const row of body.table) {
      const drawn = empty();
      for (let a = 0; a <= 6; a++) for (const bank of [-1, -.5, 0, .5, 1]) for (const roll of [-1, -.5, 0, .5, 1]) for (const carve of [-1, 0, 1]) for (const squash of [-SLEIGH_POSE.stretch, SLEIGH_POSE.squash]) {
        const pitch = row[0] + (row[1] - row[0]) * a / 6, b = maxBank * bank;
        reach(extremes, pitch, b, b - SLEIGH_POSE.roll * roll, SLEIGH_POSE.carve * carve, squash, drawn);
      }
      // And every vertex, at the row's ends and the extreme bank, roll and carve.
      for (const pitch of [row[0], row[1]]) for (const bank of [-1, 1]) for (const roll of [-1, 1]) for (const carve of [-1, 1]) {
        reach(vertices, pitch, maxBank * bank, maxBank * bank - SLEIGH_POSE.roll * roll, SLEIGH_POSE.carve * carve, SLEIGH_POSE.squash, drawn);
      }
      const name = `pitch ${row[0]}..${row[1]}`;
      const pairs: [string, number, number][] = [['side', drawn.halfWidth, row[2]], ['bottom', -drawn.bottom, -row[3]], ['top', drawn.top, row[4]], ['front', drawn.front, row[5]], ['back', drawn.back, row[6]]];
      for (const [face, model, box] of pairs) {
        expect(model, `${name} ${face}`).toBeLessThanOrEqual(box);
        expect(box - model, `${name} ${face} snug`).toBeLessThanOrEqual(.006);
      }
    }
  });

  it('allows for every difference the courses have between the bank under it and the roll of a block it meets', { timeout: 120000 }, () => {
    // course.ts poses a block with the bank at its own centre and keeps the bank under its footprint within
    // 0.12 rad of it; the sleigh can touch it from past the footprint too, out to its box's reach.
    const largest = largestBox(body.table, { halfWidth: 0, bottom: 0, top: 0, front: 0, back: 0 }), pose: ObstaclePose = { x: 0, y: 0, distance: 0, roll: 0, halfWidth: 0, halfHeight: 0, halfDepth: 0 };
    let worst = 0;
    for (const difficulty of ['easy', 'medium', 'hard'] as const) for (let seed = 1; seed <= 25; seed++) {
      const course = getCourse(seed, difficulty);
      course.forEachObstacle(0, 3000, o => {
        course.pose(o, 0, pose);
        for (let d = o.distance - o.depth / 2 - largest.front; d <= o.distance + o.depth / 2 + largest.back; d += .05) worst = Math.max(worst, Math.abs(course.sample(d).bank - pose.roll));
      });
    }
    expect(worst).toBeGreaterThan(.05);
    expect(worst).toBeLessThanOrEqual(SLEIGH_POSE.roll);
  });

  it('is drawn in its box\'s frame through the real scene: on banks, dodging and in the air, inside the box for its pitch', { timeout: 60000 }, () => {
    stubDocument('christmas');
    const scene = createScene({ clientWidth: 390, clientHeight: 844 } as HTMLCanvasElement, { reducedMotion: () => false });
    const course = getCourse(7, 'hard'), run = createRun(7, 1, 'hard'), view = { run, course, speed: 0 };
    const local = new THREE.Vector3(), centre = new THREE.Vector3(), unroll = new THREE.Quaternion(), Z = new THREE.Vector3(0, 0, 1);
    const k: BoxExtents = { halfWidth: 0, bottom: 0, top: 0, front: 0, back: 0 };
    let checked = 0, steep = 0;
    for (let i = 0; i < 3000; i++) {
      const distance = 100 + i * .5, s = course.sample(distance);
      if (!s.ground) continue;
      view.speed = course.speed(distance);
      run.distance = distance; run.elapsed += .5 / view.speed;
      run.x = s.center + Math.sin(i / 7) * (s.width / 2 - .5); run.vx = Math.cos(i / 7) * (s.width / 2 - .5) / 7 * view.speed / .5;
      const air = i % 40 > 30;
      run.grounded = !air;
      run.height = course.surfaceHeight(distance, run.x) + RADIUS / Math.cos(s.bank) + (air ? 1.5 : 0); run.vy = air ? -6 : s.gradient * view.speed;
      scene.render(view);
      if (i % 9) continue;
      const pitch = pitchFor(course, run);
      boxExtents(body.table, pitch, pitch, k);
      if (Math.abs(pitch) > .25) steep++;
      const sleigh = captured.scene!.getObjectByName('sleigh')!;
      sleigh.updateMatrix();
      centre.set(run.x, run.height + SLOPE * distance, 0);
      unroll.setFromAxisAngle(Z, s.bank);
      const drawn = empty();
      for (const mesh of sleigh.children as THREE.Mesh[]) {
        const p = mesh.geometry.getAttribute('position');
        for (let n = 0; n < p.count; n += 5) {
          local.fromBufferAttribute(p, n).applyMatrix4(sleigh.matrix).sub(centre).applyQuaternion(unroll);
          drawn.halfWidth = Math.max(drawn.halfWidth, Math.abs(local.x)); drawn.bottom = Math.min(drawn.bottom, local.y); drawn.top = Math.max(drawn.top, local.y);
          drawn.front = Math.max(drawn.front, -local.z); drawn.back = Math.max(drawn.back, local.z);
        }
      }
      const at = `at ${distance}`;
      expect(drawn.halfWidth, at).toBeLessThanOrEqual(k.halfWidth); expect(drawn.bottom, at).toBeGreaterThanOrEqual(k.bottom); expect(drawn.top, at).toBeLessThanOrEqual(k.top);
      expect(drawn.front, at).toBeLessThanOrEqual(k.front); expect(drawn.back, at).toBeLessThanOrEqual(k.back);
      checked++;
    }
    expect(checked).toBeGreaterThan(100);
    expect(steep).toBeGreaterThan(0);
    scene.dispose();
  });

  it('on ordinary road (pitch within ±0.149) fits inside the clearance the course generator keeps round the ball', () => {
    // There the generator's own guarantee covers it. On steeper road the box reaches past it; passability there
    // is shown by sleigh-courses.test.ts, not proved.
    const k = boxExtents(body.table, -.149, .149, { halfWidth: 0, bottom: 0, top: 0, front: 0, back: 0 });
    expect(k.halfWidth).toBeLessThanOrEqual(CLEAR);
    expect(k.front).toBeLessThanOrEqual(CLEAR);
    expect(k.back).toBeLessThanOrEqual(CLEAR);
  });

  it('hits a block its backrest overlaps that the ball has already cleared, and nothing else changes', () => {
    let checked = 0;
    const k: BoxExtents = { halfWidth: 0, bottom: 0, top: 0, front: 0, back: 0 };
    for (const seed of [11, 42, 7]) {
      const course = getCourse(seed, 'medium'), blocks: Obstacle[] = [];
      course.forEachObstacle(200, 2000, o => { if (o.kind === 'block' && !o.slide) blocks.push(o); });
      for (const o of blocks) {
        const p = course.pose(o, 0, { x: 0, y: 0, distance: 0, roll: 0, halfWidth: 0, halfHeight: 0, halfDepth: 0 });
        // Centre 0.39 m past the block's back face, straight in line with it: the sphere (0.38) is clear, the
        // sleigh's backrest (about 0.43 behind the centre on ordinary road) is still over the block.
        const d = o.distance + o.depth / 2 + .39, s = course.sample(d);
        if (!s.ground || s.tunnel || Math.abs(p.x - s.center) > s.width / 2 - .5) continue;
        let nearby = 0;
        course.forEachObstacle(d - 3, d + 3, () => nearby++);
        if (nearby !== 1) continue;
        const asBall = placeRun(seed, 'medium', d, p.x), asSleigh = placeRun(seed, 'medium', d, p.x);
        step(asBall, 0, STEP, BALL); step(asSleigh, 0, STEP, body);
        expect(asBall.phase).toBe('running');
        expect(asSleigh.phase).toBe('dying'); expect(asSleigh.reason).toBe('block');
        // Past the block by more than the backrest reaches at any pitch there, the box changes nothing: the
        // sleigh runs on exactly as a round body with the sleigh's handling does.
        boxExtents(body.table, -PITCH_LIMIT, PITCH_LIMIT, k);
        const clear = placeRun(seed, 'medium', o.distance + o.depth / 2 + k.back + .05, p.x), ball = { ...clear };
        step(clear, 0, STEP, body); step(ball, 0, STEP, { ...BALL, steerResponse: body.steerResponse, bankDrift: body.bankDrift });
        expect(clear).toEqual(ball);
        if (++checked >= 6) break;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(3);
  });
});

describe('Ball Run Christmas snowfall', () => {
  it('is one point cloud placed by its shader: fixed seeds, and per frame only uniforms change', () => {
    const a = createSnowfall(), b = createSnowfall();
    expect(a.points).toBeInstanceOf(THREE.Points);
    const seeds = a.points.geometry.getAttribute('seed') as THREE.BufferAttribute;
    expect(seeds.count).toBe(SNOWFALL_FLAKES);
    expect(Array.from(seeds.array)).toEqual(Array.from((b.points.geometry.getAttribute('seed') as THREE.BufferAttribute).array));
    for (let i = 0; i < seeds.array.length; i++) { expect(seeds.array[i]).toBeGreaterThanOrEqual(0); expect(seeds.array[i]).toBeLessThan(1); }
    const version = seeds.version, position = (a.points.geometry.getAttribute('position') as THREE.BufferAttribute).version;
    a.update(new THREE.Vector3(1, 2, 3.6), 123456.7, 9876.5, 4000.25);
    expect(seeds.version).toBe(version);
    expect((a.points.geometry.getAttribute('position') as THREE.BufferAttribute).version).toBe(position);
    const u = (a.points.material as THREE.ShaderMaterial).uniforms;
    expect(u.uOrigin.value.toArray()).toEqual([1, 2, 3.6]);
    // Long runs stay in float precision: the shader's wrap makes these equivalent to the raw values.
    expect(u.uTravel.value).toBeLessThan(u.uBox.value.z); expect(u.uLift.value).toBeLessThan(u.uBox.value.y); expect(u.uTime.value).toBeLessThan(SNOWFALL_PERIOD);
    const dispose = [vi.spyOn(a.points.geometry, 'dispose'), vi.spyOn(a.points.material as THREE.Material, 'dispose')];
    a.dispose(); b.dispose();
    for (const spy of dispose) expect(spy).toHaveBeenCalledOnce();
  });
});

describe('Ball Run Christmas snowfall clock', () => {
  it('wraps its period with no jump: every flake falls whole box heights and sways whole cycles per period', () => {
    const seeds = createSnowfall().points.geometry.getAttribute('seed') as THREE.BufferAttribute;
    for (let i = 0; i < seeds.count; i++) {
      // The shader's own formulas (snowfall.ts).
      const w = seeds.getW(i), fall = .7 + .05 * Math.floor(w * 12.999), sway = 2 * Math.PI * Math.floor((.6 + w) * SNOWFALL_PERIOD / (2 * Math.PI)) / SNOWFALL_PERIOD;
      const heights = fall * SNOWFALL_PERIOD / SNOWFALL_BOX.y, cycles = sway * SNOWFALL_PERIOD / (2 * Math.PI);
      expect(Math.abs(heights - Math.round(heights))).toBeLessThan(1e-9);
      expect(Math.abs(cycles - Math.round(cycles))).toBeLessThan(1e-9);
      expect(fall).toBeGreaterThanOrEqual(.7); expect(fall).toBeLessThanOrEqual(1.3 + 1e-9);
    }
  });

  it('only advances by the real time between drawn frames, at most 1/20 s, so a pause never makes it jump', () => {
    stubDocument('christmas');
    let now = 1000;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    const scene = createScene({ clientWidth: 390, clientHeight: 844 } as HTMLCanvasElement, { reducedMotion: () => false });
    const course = getCourse(11, 'medium'), run = createRun(11, 1, 'medium');
    run.distance = 300; run.height = course.surfaceHeight(300, run.x) + RADIUS;
    const view = { run, course, speed: course.speed(300) };
    scene.render(view);
    const time = () => ((captured.scene!.children.find(c => c instanceof THREE.Points) as THREE.Points).material as THREE.ShaderMaterial).uniforms.uTime.value as number;
    const start = time();
    now += 16; scene.render(view);
    expect(time() - start).toBeCloseTo(.016, 6);
    // A ten-minute pause (no frames drawn), then the next frame: the snow moves on by one frame at most.
    now += 600000; scene.render(view);
    expect(time() - start).toBeCloseTo(.066, 6);
    scene.dispose(); clock.mockRestore();
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

  /** How far the drawn road tiles' tops stand off the simulated surface, worst over the tiles near the player. */
  function tileError(): number {
    const course = getCourse(28, 'easy'), run = createRun(28, 1, 'easy'), distance = 95;
    run.distance = distance; run.height = course.surfaceHeight(distance, run.x) + RADIUS;
    const scene = createScene({ clientWidth: 390, clientHeight: 844 } as HTMLCanvasElement, { reducedMotion: () => false });
    scene.render({ run, course, speed: course.speed(distance) });
    const road = captured.scene!.children[0], tiles = road.children[0] as THREE.InstancedMesh, m = new THREE.Matrix4(), v = new THREE.Vector3();
    let worst = 0, bends = 0;
    // Every tile and line is a right-handed box: a mirrored instance would be drawn inside out (its top face culled).
    const grid = road.children[1] as THREE.InstancedMesh;
    for (let i = 0; i < tiles.count; i++) { tiles.getMatrixAt(i, m); expect(m.determinant()).toBeGreaterThan(0); }
    for (let i = 0; i < grid.count; i++) { grid.getMatrixAt(i, m); expect(m.determinant()).toBeGreaterThan(0); }
    for (let i = 0; i < tiles.count; i++) {
      tiles.getMatrixAt(i, m);
      // Its top face's outward normal points up.
      const n = new THREE.Vector3(0, 1, 0).applyMatrix3(new THREE.Matrix3().getNormalMatrix(m));
      expect(n.y).toBeGreaterThan(0);
      for (const [u, w] of [[-.5, -.5], [.5, -.5], [-.5, .5], [.5, .5], [0, 0]]) {
        v.set(u, .5, w).applyMatrix4(m).add(road.position);
        const d = distance - v.z;
        if (d < distance || d > distance + 30) continue;
        if (Math.abs(course.sample(d).center - course.sample(d + 1).center) > .02) bends++;
        worst = Math.max(worst, Math.abs(v.y - (course.surfaceHeight(d, v.x) + SLOPE * distance)));
      }
    }
    expect(bends).toBeGreaterThan(0);
    scene.dispose();
    return worst;
  }

  it('draws the road\'s tiles on the surface it simulates, on bends too, so the runners sit on what is drawn', () => {
    // On easy seed 28's sharp bend the original tiles (yawed, then rolled) lean off that surface by several cm.
    expect(tileError()).toBeLessThan(.008);
  });

  it('snows in one draw call while moving, and not at all under Reduce motion', () => {
    let reduced = false;
    const scene = createScene({ clientWidth: 390, clientHeight: 844 } as HTMLCanvasElement, { reducedMotion: () => reduced });
    const course = getCourse(11, 'medium'), run = createRun(11, 1, 'medium');
    run.distance = 300; run.height = course.surfaceHeight(300, run.x) + RADIUS;
    scene.render({ run, course, speed: course.speed(300) });
    const flakes = captured.scene!.children.filter(c => c instanceof THREE.Points);
    expect(flakes).toHaveLength(1);
    expect(flakes[0].visible).toBe(true);
    reduced = true;
    scene.render({ run, course, speed: course.speed(300) });
    expect(flakes[0].visible).toBe(false);
    scene.dispose();
  });

  /** The road's height as the scene draws it: before the start line it continues the warm-up's straight slope. */
  const roadAt = (course: ReturnType<typeof getCourse>, d: number, x: number) => course.surfaceHeight(d, x) - (d < 0 ? SLOPE * d : 0);
  /** The sleigh's pitch as drawn: its forward axis's climb (the bank and carve turn about that axis's own line). */
  const pitchOf = (sleigh: THREE.Object3D) => Math.asin(new THREE.Vector3(0, 0, -1).applyQuaternion(sleigh.quaternion).y);

  it('rides whole courses with its runners on the road, across the whole width, on steep crests, dips and bank changes', () => {
    // Steering slowly across the road, so the bank's twist where it starts and ends is felt off the centre line.
    const scene = createScene({ clientWidth: 390, clientHeight: 844 } as HTMLCanvasElement, { reducedMotion: () => true });
    let banked = 0, steep = 0, worst = 0;
    for (const [seed, difficulty] of [[7, 'medium'], [8, 'hard'], [2, 'hard']] as const) {
      const course = getCourse(seed, difficulty), run = createRun(seed, 1, difficulty), view = { run, course, speed: 0 };
      run.grounded = true;
      for (let distance = 0; distance < 2500; distance += .5) {
        const s = course.sample(distance);
        if (!s.ground) { scene.reset(); continue; }
        view.speed = course.speed(distance);
        run.distance = distance; run.elapsed += .5 / view.speed;
        run.x = s.center + Math.sin(distance / 23) * (s.width / 2 - .45); run.vx = 0;
        run.height = course.surfaceHeight(distance, run.x) + RADIUS / Math.cos(s.bank); run.vy = 0;
        scene.render(view);
        const sleigh = captured.scene!.getObjectByName('sleigh')!;
        // Its pitch is the surface's slope under it, and it has no yaw (its nose lies along the course).
        expect(pitchOf(sleigh)).toBeCloseTo(pitchFor(course, run), 9);
        expect(Math.abs(pitchOf(sleigh))).toBeLessThan(PITCH_LIMIT);
        expect(Math.abs(new THREE.Vector3(0, 0, -1).applyQuaternion(sleigh.quaternion).x)).toBeLessThan(1e-9);
        // Both runners lie on the real road surface along their glide (from under the dash to under the backrest).
        sleigh.updateMatrix();
        for (const side of [-1, 1]) for (const z of [-.15, 0, .15, .3]) {
          const contact = new THREE.Vector3(side * .25, -RADIUS, z).applyMatrix4(sleigh.matrix);
          const road = roadAt(course, distance - contact.z, contact.x) + SLOPE * distance;
          worst = Math.max(worst, Math.abs(contact.y - road));
          expect(Math.abs(contact.y - road), `seed ${seed} at ${distance}, runner ${side} z ${z}`).toBeLessThan(.005);
        }
        if (Math.abs(s.bank) > .1) banked++;
        if (Math.abs(Math.atan(s.gradient)) > .25) steep++;
      }
      scene.reset();
    }
    expect(banked).toBeGreaterThan(0); expect(steep).toBeGreaterThan(0);
    scene.dispose();
  });

  it('keeps its nose steady through real steps: taking off and landing over drops, crests and banks', { timeout: 300000 }, () => {
    // The bot drives the simulation as the sleigh over whole courses (drops, crests, dips), and hard steering
    // reversals throw it off banks; the pitch the simulation and the drawing use is checked every step.
    let takeoffs = 0, landings = 0, worstTakeoff = 0, worstLanding = 0, worstInFlight = 0;
    const watch = (course: ReturnType<typeof getCourse>) => {
      let last = NaN, wasGrounded = true;
      return (run: Run) => {
        const pitch = pitchFor(course, run);
        if (!Number.isNaN(last)) {
          const jump = Math.abs(pitch - last);
          if (run.grounded !== wasGrounded) {
            if (run.grounded) { landings++; worstLanding = Math.max(worstLanding, jump); } else { takeoffs++; worstTakeoff = Math.max(worstTakeoff, jump); }
          } else if (!run.grounded) worstInFlight = Math.max(worstInFlight, jump);
        }
        last = pitch; wasGrounded = run.grounded;
      };
    };
    useBody(SLEIGH_BODY);
    try {
      for (const difficulty of ['easy', 'medium', 'hard'] as const) for (let seed = 1; seed <= 8; seed++) {
        const course = getCourse(seed, difficulty), run = createRun(seed, 1, difficulty);
        run.phase = 'running';
        driveBot(run, 2500, watch(course));
      }
    } finally { useBody(BALL); }
    for (let seed = 1; seed <= 12; seed++) for (const difficulty of ['medium', 'hard'] as const) for (const period of [6, 12, 24]) {
      const course = getCourse(seed, difficulty);
      for (let d = 200; d < 3000; d += 61) {
        const s = course.sample(d);
        if (Math.abs(s.bank) < .15 || !s.ground) continue;
        const run = placeRun(seed, difficulty, d, s.center), see = watch(course);
        for (let n = 0; n < 240 && run.phase === 'running'; n++) { step(run, Math.sign(Math.sin(n / period)), STEP, SLEIGH_BODY); see(run); }
      }
    }
    expect(takeoffs).toBeGreaterThan(50); expect(landings).toBeGreaterThan(50);
    // Measured here and in a wider survey (side falls, the speed cap): under 0.015 rad at take-off and landing,
    // under 0.04 rad in any one step of flight, as the nose flares onto the road over the last 2.5 m. (Landing
    // after a drop jumped 0.33 rad before.)
    expect(worstTakeoff).toBeLessThan(.02);
    expect(worstLanding).toBeLessThan(.02);
    expect(worstInFlight).toBeLessThan(.04);
  });

  it('leans at most 0.04 rad into a carve on its inside runner, and in the air points its nose along its flight path', () => {
    const scene = createScene({ clientWidth: 390, clientHeight: 844 } as HTMLCanvasElement, { reducedMotion: () => false });
    const course = getCourse(7, 'medium'), run = createRun(7, 1, 'medium'), view = { run, course, speed: course.speed(400) };
    const sleigh = () => captured.scene!.getObjectByName('sleigh')!;
    run.grounded = true;
    let leaned = 0;
    for (let i = 0; i <= 80; i++) {
      const distance = 400 + i * .25, s = course.sample(distance), reach = Math.min(1.5, s.width / 2 - RADIUS);
      run.distance = distance; run.elapsed += .25 / view.speed;
      run.x = s.center + Math.sin(i / 3) * reach; run.vx = Math.cos(i / 3) * reach / 3 * view.speed / .25;
      run.height = course.surfaceHeight(distance, run.x) + RADIUS / Math.cos(s.bank); run.vy = s.gradient * view.speed;
      scene.render(view);
      // The carve: its sideways axis turned past the road's bank, about its own length.
      const across = new THREE.Vector3(1, 0, 0).applyQuaternion(sleigh().quaternion), flat = new THREE.Vector3(1, 0, 0).applyQuaternion(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitchOf(sleigh())).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -s.bank)));
      const carve = across.angleTo(flat);
      expect(carve).toBeLessThanOrEqual(.04 + 1e-6);
      if (carve > .01) leaned++;
      // It tips onto its inside runner: neither runner's contact goes below the road.
      sleigh().updateMatrix();
      for (const side of [-1, 1]) {
        const contact = new THREE.Vector3(side * .25, -RADIUS, 0).applyMatrix4(sleigh().matrix);
        expect(contact.y, `runner ${side} at ${distance}`).toBeGreaterThanOrEqual(roadAt(course, distance - contact.z, contact.x) + SLOPE * distance - .003);
      }
    }
    expect(leaned).toBeGreaterThan(0);
    // Launched and falling at 6 m/s: its nose points along its flight path.
    run.grounded = false;
    for (let i = 1; i <= 20; i++) {
      run.distance = 420 + i * .5; run.elapsed += .5 / view.speed; run.vx = 0;
      run.height = course.surfaceHeight(run.distance, run.x) + 3; run.vy = -6 - i * .2;
      scene.render(view);
      expect(pitchOf(sleigh())).toBeCloseTo(pitchFor(course, run), 9);
    }
    // Off the road's edge and falling past it: banked as the road under it, as its collision box is.
    for (let i = 1; i <= 10; i++) {
      run.distance = 436 + i * .5; run.elapsed += .5 / view.speed; const s = course.sample(run.distance);
      run.x = s.center + s.width / 2 + 1; run.height = course.surfaceHeight(run.distance, s.center) - .5 * i; run.vy = -8;
      scene.render(view);
      const across = new THREE.Vector3(1, 0, 0).applyQuaternion(sleigh().quaternion);
      expect(Math.atan2(-across.y, Math.hypot(across.x, across.z))).toBeCloseTo(s.bank, 1);
    }
    // No ball anywhere: not the ball itself, and the Speed Up trail draws diamond glints, not spheres.
    const spheres = captured.scene!.children.filter(c => c instanceof THREE.Mesh && c.geometry instanceof THREE.SphereGeometry);
    expect(spheres).toHaveLength(0);
    expect(captured.scene!.children.some(c => c instanceof THREE.InstancedMesh && c.geometry instanceof THREE.OctahedronGeometry)).toBe(true);
    scene.dispose();
  });

  it('under Reduce motion keeps its pose (the road\'s, or its flight path\'s) without springing or leaning into carves', () => {
    const scene = createScene({ clientWidth: 390, clientHeight: 844 } as HTMLCanvasElement, { reducedMotion: () => true });
    const course = getCourse(7, 'medium'), run = createRun(7, 1, 'medium'), view = { run, course, speed: course.speed(400) };
    const sleigh = () => captured.scene!.getObjectByName('sleigh')!;
    run.grounded = true;
    for (let i = 0; i <= 40; i++) {
      const distance = 400 + i * .25, s = course.sample(distance);
      run.distance = distance; run.elapsed += .25 / view.speed; run.x = s.center + Math.sin(i / 3); run.vx = 20 * Math.cos(i / 3);
      run.height = course.surfaceHeight(distance, run.x) + RADIUS / Math.cos(s.bank); run.vy = i % 2 ? 4 : -4;
      scene.render(view);
      expect(sleigh().scale.y).toBe(1);
      const across = new THREE.Vector3(1, 0, 0).applyQuaternion(sleigh().quaternion);
      expect(Math.atan2(-across.y, Math.hypot(across.x, across.z))).toBeCloseTo(s.bank, 6);
    }
    run.grounded = false; run.distance += .5; run.elapsed += .5 / view.speed; run.height += 3; run.vy = -8;
    scene.render(view);
    // The pitch is what it collides with, so it is the same under Reduce motion.
    expect(pitchOf(sleigh())).toBeCloseTo(pitchFor(course, run), 9);
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
    expect(captured.scene!.children.some(c => c instanceof THREE.Points)).toBe(false);
    const balls = captured.scene!.children.filter(c => c instanceof THREE.Mesh && !(c instanceof THREE.InstancedMesh) && c.geometry instanceof THREE.SphereGeometry);
    expect(balls).toHaveLength(1);
    expect(captured.scene!.children.some(c => c instanceof THREE.InstancedMesh && c.geometry instanceof THREE.SphereGeometry)).toBe(true);
    const road = captured.scene!.children[0];
    // tiles, grid, blocks, cyan: the original four pools.
    expect(road.children).toHaveLength(4);
    scene.dispose();
  });

  it('keeps the original road tiles (yawed along a bend, then rolled), which lean off the surface on a sharp bend', () => {
    const course = getCourse(28, 'easy'), run = createRun(28, 1, 'easy'), distance = 95;
    run.distance = distance; run.height = course.surfaceHeight(distance, run.x) + RADIUS;
    const scene = createScene({ clientWidth: 390, clientHeight: 844 } as HTMLCanvasElement, { reducedMotion: () => false });
    scene.render({ run, course, speed: course.speed(distance) });
    const road = captured.scene!.children[0], tiles = road.children[0] as THREE.InstancedMesh, m = new THREE.Matrix4(), v = new THREE.Vector3();
    let worst = 0;
    for (let i = 0; i < tiles.count; i++) {
      tiles.getMatrixAt(i, m);
      for (const u of [-.5, .5]) {
        v.set(u, .5, 0).applyMatrix4(m).add(road.position);
        const d = distance - v.z;
        if (d >= distance && d <= distance + 30) worst = Math.max(worst, Math.abs(v.y - (course.surfaceHeight(d, v.x) + SLOPE * distance)));
      }
    }
    // The original drawing is unchanged with the theme off: its tiles still stand centimetres off on the bend.
    expect(worst).toBeGreaterThan(.03);
    scene.dispose();
  });
});
