import { beforeAll, describe, expect, test } from 'vitest';
import * as THREE from 'three';
import { BODY } from '../../../src/games/breachline/config';
import { eyeOf } from '../../../src/games/breachline/world';
import { heroReady } from '../../../src/games/breachline/render/hero/geom';
import { figureGeometry } from '../../../src/games/breachline/render/fighters/figure';
import { Animator, DEATH_KINDS, DEATH_TIME, idleInput, type PoseInput } from '../../../src/games/breachline/render/fighters/anim';
import { B, BONES, SCALE, SIDE, makeBones } from '../../../src/games/breachline/render/fighters/skeleton';
import { weaponFor } from '../../../src/games/breachline/render/fighters/weapon';
import { LOD0_MAX } from '../../../src/games/breachline/render/fighters/index';

beforeAll(async () => { await heroReady; });

function rig(id: 'ar' | 'pistol' | 'shotgun' = 'ar') {
  const bones = makeBones(), weapon = new THREE.Object3D(), wb = Array.from({ length: 9 }, () => new THREE.Bone());
  return new Animator(bones, weapon, wb, weaponFor(id));
}
/** Model space (authored units) to world, as the fighter's group does. */
const world = (a: Animator, v: THREE.Vector3) => v.clone().multiplyScalar(SCALE).applyAxisAngle(new THREE.Vector3(0, 1, 0), a.yaw).add(a.root);
const run = (a: Animator, p: Partial<PoseInput>, seconds: number, step?: (t: number, i: PoseInput) => void) => {
  let i = { ...idleInput(), ...p };
  a.reset(i);
  for (let t = 0; t < seconds; t += 1 / 60) { if (step) { i = { ...i }; step(t, i); } a.update(i, 1 / 60); }
  return i;
};

describe('fighter meshes', () => {
  test('triangle and bone budgets at every level, for both squads', () => {
    for (const squad of [0, 1] as const) {
      const [l0, l1, l2] = [0, 1, 2].map(l => figureGeometry(squad, l).triangles);
      expect(l0).toBeLessThanOrEqual(8000); expect(l0).toBeGreaterThan(6000);
      expect(l1).toBeLessThanOrEqual(3800);
      expect(l2).toBeLessThanOrEqual(1400);
      // Ten fighters in view: at most LOD0_MAX at full detail, the rest at the middle level or below.
      expect(LOD0_MAX * l0 + (10 - LOD0_MAX) * l1).toBeLessThanOrEqual(60000);
      const si = figureGeometry(squad, 0).geo.getAttribute('skinIndex');
      let max = 0; for (let i = 0; i < si.count * 4; i++) max = Math.max(max, (si.array as Uint16Array)[i]);
      expect(max).toBeLessThan(BONES);
    }
    expect(BONES).toBeLessThanOrEqual(40);
  });
});

describe('fighters fill the simulation\'s hit volumes', () => {
  const poses: Partial<PoseInput>[] = [];
  for (const crouch of [0, 0.5, 1]) for (const lean of [-1, 0, 1]) for (const pitch of [-0.8, 0, 0.8]) poses.push({ crouch, lean, pitch, yaw: 0.7, x: 3, z: -2 });
  test.each(poses)('head in the head sphere and chest in the body cylinder: %o', p => {
    const a = rig(), i = run(a, p, 0.5);
    const eye = eyeOf(i), head = world(a, a.headCentre(new THREE.Vector3()));
    expect(head.distanceTo(new THREE.Vector3(eye.x, eye.y + 0.02, eye.z))).toBeLessThan(0.03);
    // Body cylinder: centred a third of the way toward the lean, radius r, up to the head sphere's base.
    const cx = i.x + (eye.x - i.x) * 0.35, cz = i.z + (eye.z - i.z) * 0.35, r = BODY.radius + 0.02, top = eye.y + 0.02 - BODY.headR + 0.03;
    for (const b of [B.pelvis, B.spine1, B.spine2]) {
      const w = world(a, a.wp[b]);
      expect(Math.hypot(w.x - cx, w.z - cz)).toBeLessThan(r);
      expect(w.y).toBeLessThan(top);
    }
  });
});

describe('fighter animation', () => {
  test('the bore follows the view direction when aiming or just fired, and drops to a low ready otherwise', () => {
    for (const p of [{ pitch: 0.5, ads: true }, { pitch: -0.6, ads: true }, { pitch: 0.2, crouch: 1, ads: true }]) {
      const a = rig(); run(a, p, 0.6, (t, i) => { i.z = -2.6 * t; i.pace = 0.75; });
      expect(a.diag().aimErr).toBeLessThan(0.02);
    }
    // Hip fire: on the line while shooting, low again a moment after.
    const a = rig(); run(a, { pitch: 0.1 }, 1.0, t => { if (Math.floor(t / 0.1) !== Math.floor((t - 1 / 60) / 0.1)) a.fire(); });
    expect(a.diag().aimErr).toBeLessThan(0.08);
    const b = rig(); run(b, { pitch: 0.1 }, 2.0);
    expect(b.diag().aimErr).toBeGreaterThan(0.35);
    expect(b.diag().aimErr).toBeLessThan(0.8);
  });

  test('a planted foot does not slide while walking, strafing or crouch-walking', () => {
    for (const [vx, vz, crouch] of [[0, -2.6, 0], [2.4, 0, 0], [0, -1.5, 1], [0, -5.1, 0]]) {
      const a = rig(), i = { ...idleInput(), crouch, sprint: vz < -4 };
      a.reset(i);
      const last: (THREE.Vector3 | null)[] = [null, null];
      let worst = 0, planted = 0;
      for (let t = 0; t < 3; t += 1 / 60) {
        i.x = vx * t; i.z = vz * t; i.pace = Math.hypot(vx, vz) / 3.5;
        a.update(i, 1 / 60);
        if (t < 1) continue;
        for (const s of [0, 1]) {
          const foot = world(a, a.wp[SIDE[s].toe]);
          const down = a.diag().stance[s];
          if (down && last[s]) { worst = Math.max(worst, Math.hypot(foot.x - last[s]!.x, foot.z - last[s]!.z)); planted++; }
          last[s] = down ? foot : null;
        }
      }
      expect(planted).toBeGreaterThan(40);
      // The ball of a planted foot moves less than 5 mm a frame (the heel may lift and roll over it).
      expect(worst).toBeLessThan(0.005);
    }
  });

  test('every death ends at rest on the ground', () => {
    for (let k = 0; k < DEATH_KINDS; k++) {
      const a = rig();
      run(a, { deaths: k }, 0.4 + DEATH_TIME + 0.3, (t, i) => { i.alive = t < 0.4; });
      let lo = Infinity, hi = -Infinity;
      for (let b = 0; b < BONES; b++) { const y = world(a, a.wp[b]).y; expect(Number.isFinite(y)).toBe(true); lo = Math.min(lo, y); hi = Math.max(hi, y); }
      expect(lo).toBeGreaterThan(-0.02);
      expect(hi).toBeLessThan(0.55);
      expect(world(a, a.wp[B.pelvis]).y).toBeLessThan(0.3);
    }
  });

  test('all fighter animation for ten fighters stays near a millisecond a frame', () => {
    const rigs = Array.from({ length: 10 }, () => rig());
    const inputs = rigs.map((a, n) => { const i = { ...idleInput(), x: n }; a.reset(i); return i; });
    for (let f = 0; f < 120; f++) rigs.forEach((a, n) => { inputs[n].z = -f / 60 * 2.6; inputs[n].pace = 0.75; a.update(inputs[n], 1 / 60); });
    const t0 = performance.now();
    for (let f = 0; f < 120; f++) rigs.forEach((a, n) => { inputs[n].z -= 2.6 / 60; a.update(inputs[n], 1 / 60); });
    const ms = (performance.now() - t0) / 120;
    console.log(`ten fighters: ${ms.toFixed(3)} ms per frame`);
    expect(ms).toBeLessThan(2);
  });
});
