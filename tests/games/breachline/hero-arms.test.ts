import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { beforeAll, expect, it } from 'vitest';
import { heroReady } from '../../../src/games/breachline/render/hero/geom';
import { FORE, UPPER, armsWithHand, makeArm, type HandAsset } from '../../../src/games/breachline/render/hero/hands';
import { DEFAULT_LOOK } from '../../../src/games/breachline/render/hero/rig';

beforeAll(async () => { await heroReady; });

it('with the elbow bent, the sleeve still reaches the wrist', () => {
  const hand = JSON.parse(readFileSync('public/game-art/breachline/hero/hand-trial/hand.json', 'utf8')) as HandAsset;
  const geo = armsWithHand(DEFAULT_LOOK(0, 0x3355aa), hand, true);
  const right = makeArm(1), left = makeArm(-1), root = new THREE.Group();
  root.add(right.bones[0], left.bones[0]);
  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshBasicMaterial());
  root.add(mesh); root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton([...right.bones, ...left.bones]), new THREE.Matrix4());
  // A bent arm: shoulder at the origin, the wrist 0.4 m away, the elbow out to the side.
  right.solve(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.15, 0.1, -0.35), new THREE.Quaternion(), new THREE.Vector3(1, -1, 0));
  root.updateMatrixWorld(true); mesh.skeleton.update();
  const wrist = right.bones[2].getWorldPosition(new THREE.Vector3());
  // The sleeve's last rings in bind pose (its skin index starts at the upper arm; the cuff and hand start elsewhere).
  const P = geo.getAttribute('position'), SI = geo.getAttribute('skinIndex'), v = new THREE.Vector3();
  let nearest = Infinity;
  for (let i = hand.pos.length / 3; i < P.count; i++) {
    if (SI.getX(i) !== 0 || P.getZ(i) > -(UPPER + FORE) + 0.02 || P.getZ(i) < -(UPPER + FORE) + 0.008) continue;
    v.fromBufferAttribute(P, i); mesh.applyBoneTransform(i, v); mesh.localToWorld(v);
    nearest = Math.min(nearest, v.distanceTo(wrist));
  }
  expect(nearest).toBeLessThan(0.05);
});
