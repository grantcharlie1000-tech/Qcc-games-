import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { heroReady } from '../../../src/games/breachline/render/hero/geom';
import { muzzleInView, viewToWorld } from '../../../src/games/breachline/render/hero/muzzle';
import { holdFor } from '../../../src/games/breachline/render/hero/rig';
import { ar5Sockets } from '../../../src/games/breachline/render/hero/sculpt/designs';

beforeAll(async () => { await heroReady; });

describe('the held weapon fires from its muzzle', () => {
  const socket = ar5Sockets().muzzle, hold = holdFor('ar');
  const stances: [string, [number, number, number], [number, number, number]][] = [
    ['hip', hold.hip.p, hold.hip.r],
    ['aimed', [0, 0, hold.adsZ], [0, 0, 0]],
  ];
  for (const [name, p, r] of stances) {
    it(`the flash starts within 3 cm of the muzzle socket (${name})`, () => {
      const gun = new THREE.Group(); gun.position.set(...p); gun.rotation.set(...r);
      const flash = muzzleInView(gun, socket, new THREE.Vector3()), muzzle = gun.localToWorld(new THREE.Vector3(...socket));
      expect(flash.distanceTo(muzzle)).toBeLessThan(0.03);
    });
  }
  it('a viewmodel point reaches the world at the same place on screen and the same distance from the eye', () => {
    const view = new THREE.PerspectiveCamera(54, 16 / 9, 0.04, 5), world = new THREE.PerspectiveCamera(64, 16 / 9, 0.08, 600);
    world.position.set(3, 1.6, -2); world.rotation.set(-0.1, 0.7, 0, 'YXZ');
    const gun = new THREE.Group(); gun.position.set(...hold.hip.p); gun.rotation.set(...hold.hip.r);
    const p = muzzleInView(gun, socket, new THREE.Vector3()), out = viewToWorld(p, view, world, new THREE.Vector3());
    const a = p.clone().project(view), b = out.clone().project(world);
    expect(Math.abs(a.x - b.x)).toBeLessThan(1e-4);
    expect(Math.abs(a.y - b.y)).toBeLessThan(1e-4);
    expect(out.distanceTo(world.position)).toBeCloseTo(p.length(), 5);
  });
});
