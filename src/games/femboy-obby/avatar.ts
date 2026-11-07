/** The original low-poly avatar: a fully clothed androgynous boy in an oversized jumper, striped socks over tights,
 * boots and a hat. Built from boxes with vertex colours and merged into five rigid parts (body, two arms, two legs)
 * so the whole character costs five draw calls. Every outfit shares the same silhouette and the same collider. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Outfit } from './progress';

const SKIN = 0xf7d3b8, HAIR = 0x80502f, EYE = 0x2b2233, BLUSH = 0xf09ab5, BOW = 0x6e203c, INNER = 0xf2a3bf;

type Part = THREE.BufferGeometry;
function box(w: number, h: number, d: number, x: number, y: number, z: number, color: number, rx = 0, rz = 0, ry = 0): Part {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
  g.translate(x, y, z);
  return paint(g, color);
}
function paint(g: THREE.BufferGeometry, color: number): Part {
  const c = new THREE.Color(color), n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (g.index) return g.toNonIndexed();
  return g;
}
function shape(g: THREE.BufferGeometry, color: number, x: number, y: number, z: number, rx = 0, rz = 0, ry = 0): Part {
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
  g.translate(x, y, z);
  return paint(g.index ? g.toNonIndexed() : g, color);
}
function merge(parts: Part[]): THREE.BufferGeometry {
  const clean = parts.map(p => { const q = p.index ? p.toNonIndexed() : p; q.deleteAttribute('uv'); return q; });
  const g = mergeGeometries(clean)!;
  clean.forEach(p => p.dispose());
  g.computeBoundingSphere();
  return g;
}

/** Heights (feet at 0): boots 0–0.2, socks 0.2–0.62, tights 0.62–0.86, jumper 0.78–1.36, head 1.36–1.84. */
function bodyParts(o: Outfit, bow: boolean): Part[] {
  const p: Part[] = [];
  // Hips (tights or a skirt/shorts) and the oversized jumper.
  if (o.bottom === 'skirt') p.push(shape(new THREE.CylinderGeometry(0.3, 0.42, 0.24, 8), o.bottomColor, 0, 0.8, 0));
  else if (o.bottom === 'shorts') p.push(box(0.5, 0.2, 0.32, 0, 0.8, 0, o.bottomColor));
  else p.push(box(0.46, 0.16, 0.28, 0, 0.82, 0, o.bottomColor));
  p.push(box(0.74, 0.5, 0.48, 0, 1.12, 0, o.jumper));
  p.push(box(0.78, 0.1, 0.52, 0, 0.86, 0, o.trim)); // ribbed hem
  p.push(box(0.34, 0.08, 0.34, 0, 1.38, 0, o.trim)); // roll neck
  // Snowflake motif on the chest.
  p.push(box(0.05, 0.22, 0.02, 0, 1.12, -0.25, o.motif), box(0.22, 0.05, 0.02, 0, 1.12, -0.25, o.motif));
  p.push(box(0.04, 0.2, 0.02, 0, 1.12, -0.25, o.motif, 0, Math.PI / 4), box(0.04, 0.2, 0.02, 0, 1.12, -0.25, o.motif, 0, -Math.PI / 4));
  if (o.hood) p.push(box(0.5, 0.22, 0.16, 0, 1.34, 0.26, o.trim), box(0.04, 0.16, 0.02, -0.08, 1.24, -0.25, 0xfbefe0), box(0.04, 0.16, 0.02, 0.08, 1.24, -0.25, 0xfbefe0));
  if (bow) {
    p.push(shape(new THREE.ConeGeometry(0.08, 0.14, 4), BOW, -0.08, 1.33, -0.26, 0, Math.PI / 2));
    p.push(shape(new THREE.ConeGeometry(0.08, 0.14, 4), BOW, 0.08, 1.33, -0.26, 0, -Math.PI / 2));
    p.push(box(0.06, 0.06, 0.05, 0, 1.33, -0.27, BOW));
  }
  // Head, hair and face. -z is the face.
  p.push(box(0.5, 0.46, 0.46, 0, 1.6, 0, SKIN));
  p.push(box(0.54, 0.2, 0.5, 0, 1.78, 0.01, HAIR)); // crown
  p.push(box(0.54, 0.44, 0.14, 0, 1.6, 0.18, HAIR)); // back
  p.push(box(0.08, 0.34, 0.42, -0.25, 1.63, 0.02, HAIR), box(0.08, 0.34, 0.42, 0.25, 1.63, 0.02, HAIR)); // sides
  p.push(box(0.46, 0.1, 0.06, 0, 1.73, -0.23, HAIR), box(0.12, 0.08, 0.06, -0.14, 1.67, -0.23, HAIR)); // fringe
  p.push(box(0.07, 0.1, 0.02, -0.11, 1.58, -0.235, EYE), box(0.07, 0.1, 0.02, 0.11, 1.58, -0.235, EYE));
  p.push(box(0.025, 0.03, 0.01, -0.095, 1.605, -0.247, 0xffffff), box(0.025, 0.03, 0.01, 0.125, 1.605, -0.247, 0xffffff));
  p.push(box(0.08, 0.04, 0.02, -0.16, 1.5, -0.235, BLUSH), box(0.08, 0.04, 0.02, 0.16, 1.5, -0.235, BLUSH));
  p.push(box(0.06, 0.02, 0.02, 0, 1.47, -0.235, 0xb3546f));
  // Hat.
  const hc = o.hatColor, ht = o.hatTrim;
  if (o.hat === 'earmuff') {
    p.push(box(0.5, 0.05, 0.08, 0, 1.92, 0, ht));
    p.push(shape(new THREE.IcosahedronGeometry(0.13, 0), hc, -0.29, 1.6, 0), shape(new THREE.IcosahedronGeometry(0.13, 0), hc, 0.29, 1.6, 0));
    p.push(shape(new THREE.ConeGeometry(0.07, 0.12, 4), BOW, 0.14, 1.92, -0.02, 0, Math.PI / 2), shape(new THREE.ConeGeometry(0.07, 0.12, 4), BOW, 0.26, 1.92, -0.02, 0, -Math.PI / 2));
  } else {
    p.push(box(0.58, 0.12, 0.54, 0, 1.84, 0.01, ht)); // folded cuff
    p.push(box(0.54, 0.16, 0.5, 0, 1.97, 0.02, hc)); // crown
    if (o.hat === 'cat') {
      for (const s of [-1, 1]) {
        p.push(shape(new THREE.ConeGeometry(0.13, 0.24, 4), hc, s * 0.18, 2.16, 0.02, 0, -s * 0.18, Math.PI / 4));
        p.push(shape(new THREE.ConeGeometry(0.07, 0.15, 4), INNER, s * 0.17, 2.14, -0.07, 0, -s * 0.18, Math.PI / 4));
      }
    } else if (o.hat === 'pompom') {
      p.push(shape(new THREE.IcosahedronGeometry(0.12, 0), ht, 0, 2.12, 0.02));
    } else if (o.hat === 'santa') {
      p.push(shape(new THREE.ConeGeometry(0.26, 0.5, 6), hc, 0.06, 2.24, 0.12, 0.5, -0.35));
      p.push(shape(new THREE.IcosahedronGeometry(0.1, 0), ht, 0.22, 2.36, 0.33));
    } else if (o.hat === 'star') {
      const star = new THREE.OctahedronGeometry(0.15, 0);
      star.scale(1, 1, 0.45);
      p.push(shape(star, ht, 0, 2.17, 0.02));
    }
  }
  return p;
}

function armParts(o: Outfit, side: number): Part[] {
  // Pivot at the shoulder (0, 0, 0); the arm hangs down -y.
  return [
    box(0.24, 0.42, 0.28, side * 0.02, -0.2, 0, o.jumper),
    box(0.26, 0.09, 0.3, side * 0.02, -0.44, 0, o.trim),
    box(0.15, 0.13, 0.15, side * 0.02, -0.55, 0, SKIN),
  ];
}

function legParts(o: Outfit): Part[] {
  // Pivot at the hip (0, 0.84, 0) mapped to local 0.
  const p: Part[] = [box(0.2, 0.26, 0.22, 0, -0.13, 0, o.bottom === 'tights' ? o.bottomColor : 0x3d3442)];
  for (let i = 0; i < 4; i++) p.push(box(0.22, 0.105, 0.24, 0, -0.27 - i * 0.105, 0, i % 2 ? o.sockB : o.sockA));
  p.push(box(0.26, 0.22, 0.34, 0, -0.73, -0.04, o.boots), box(0.28, 0.06, 0.36, 0, -0.62, -0.04, 0xffffff));
  return p;
}

export interface Avatar {
  group: THREE.Group;
  setOutfit(o: Outfit, bow: boolean): void;
  /** Pose for this frame: horizontal speed, vertical speed, grounded, a landing squash 0..1 and elapsed time. */
  pose(speed: number, vy: number, grounded: boolean, squash: number, dt: number, reduced: boolean): void;
  dispose(): void;
}

export function createAvatar(material: THREE.Material): Avatar {
  const group = new THREE.Group();
  const body = new THREE.Mesh(undefined, material);
  const armL = new THREE.Group(), armR = new THREE.Group(), legL = new THREE.Group(), legR = new THREE.Group();
  const meshes = [new THREE.Mesh(undefined, material), new THREE.Mesh(undefined, material), new THREE.Mesh(undefined, material), new THREE.Mesh(undefined, material)];
  armL.add(meshes[0]); armR.add(meshes[1]); legL.add(meshes[2]); legR.add(meshes[3]);
  armL.position.set(-0.47, 1.3, 0); armR.position.set(0.47, 1.3, 0);
  legL.position.set(-0.12, 0.84, 0); legR.position.set(0.12, 0.84, 0);
  const rig = new THREE.Group();
  rig.add(body, armL, armR, legL, legR);
  group.add(rig);
  let cycle = 0;

  function setOutfit(o: Outfit, bow: boolean) {
    for (const m of [body, ...meshes]) m.geometry?.dispose();
    body.geometry = merge(bodyParts(o, bow));
    meshes[0].geometry = merge(armParts(o, -1));
    meshes[1].geometry = merge(armParts(o, 1));
    meshes[2].geometry = merge(legParts(o));
    meshes[3].geometry = merge(legParts(o));
  }

  return {
    group,
    setOutfit,
    pose(speed, vy, grounded, squash, dt, reduced) {
      const run = Math.min(1, speed / 6);
      if (grounded) cycle += dt * (4 + 8 * run);
      const swing = grounded ? Math.sin(cycle) * 0.75 * run : 0;
      if (grounded) {
        legL.rotation.x = swing; legR.rotation.x = -swing;
        armL.rotation.x = -swing * 0.8; armR.rotation.x = swing * 0.8;
        armL.rotation.z = -0.12; armR.rotation.z = 0.12;
      } else {
        // Airborne: one knee up, arms out for balance.
        const up = vy > 0 ? 1 : 0.6;
        legL.rotation.x = -0.7 * up; legR.rotation.x = 0.35 * up;
        armL.rotation.x = 0.3; armR.rotation.x = -0.4;
        armL.rotation.z = -0.9; armR.rotation.z = 0.9;
      }
      const s = reduced ? 0 : squash;
      rig.scale.set(1 + 0.12 * s, 1 - 0.16 * s, 1 + 0.12 * s);
      rig.position.y = grounded && !reduced ? Math.abs(Math.sin(cycle)) * 0.05 * run : 0;
    },
    dispose() { for (const m of [body, ...meshes]) m.geometry?.dispose(); },
  };
}
