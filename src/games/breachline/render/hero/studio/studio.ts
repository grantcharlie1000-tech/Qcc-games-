/** Dev-only hero studio (served by vite at /src/games/breachline/render/hero/studio/index.html, never built into the
 * site): any weapon on a turntable under neutral light, and any frame of any animation. Driven by
 * `window.__breachlineHero` from the evidence script `tests/games/breachline/hero-shots.mjs`. */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { WeaponId } from '../../../config';
import { heroMaterial } from '../material';
import { heroReady } from '../geom';
import { reloadFrame } from '../reload';
import { WEAPON_BONES, census, weaponModel } from '../weapons';
import { DEFAULT_LOOK, POSE, createFpRig, holdFor, type FpRig } from '../rig';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.setPixelRatio(1);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x3a3d40);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;
const key = new THREE.DirectionalLight(0xfff2e0, 2.2); key.position.set(-1.5, 2.2, 1.2);
const rim = new THREE.DirectionalLight(0xdde8ff, 1.2); rim.position.set(1.5, 0.8, -2);
scene.add(key, rim, new THREE.HemisphereLight(0xffffff, 0x404040, 0.3));
const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 20);
const stage = new THREE.Group(); scene.add(stage);
const mat = heroMaterial();
const lensMat = new THREE.MeshStandardMaterial({ color: 0x8fb0b0, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.14, depthWrite: false });

function clear() { for (const c of [...stage.children]) stage.remove(c); }
function size() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }

function rigMesh(geo: THREE.BufferGeometry, bones: number) {
  const list: THREE.Bone[] = [];
  for (let i = 0; i < bones; i++) list.push(new THREE.Bone());
  const mesh = new THREE.SkinnedMesh(geo, mat);
  for (const b of list) mesh.add(b);
  mesh.bind(new THREE.Skeleton(list));
  mesh.frustumCulled = false;
  return { mesh, bones: list };
}

let rig: FpRig | null = null;
const getRig = () => (rig ??= createFpRig(DEFAULT_LOOK(0, 0x3d8bf2)));

const api = {
  /** One arm alone (the right), wrist at the origin, in a named pose; view yaw/pitch in degrees. */
  hand(o: { pose?: keyof typeof POSE; yaw?: number; pitch?: number; dist?: number; wire?: boolean } = {}) {
    clear(); size();
    const r = getRig();
    stage.add(r.root); stage.position.set(0, 0, 0);
    r.gun.visible = false;
    const q = new THREE.Quaternion();
    r.arms[0].solve(new THREE.Vector3(0, 0, 0.565 - 0.001), new THREE.Vector3(0, 0, 0), q, new THREE.Vector3(0, -1, 0.3));
    r.arms[1].solve(new THREE.Vector3(5, 0, 0.565), new THREE.Vector3(5, 0, 0), q, new THREE.Vector3(5, -1, 0.3));
    r.arms[0].pose(POSE[o.pose ?? 'open']);
    const yaw = THREE.MathUtils.degToRad(o.yaw ?? 0), pitch = THREE.MathUtils.degToRad(o.pitch ?? 60), d = o.dist ?? 0.45;
    const c = new THREE.Vector3(0, 0, -0.07);
    camera.position.set(c.x + Math.sin(yaw) * Math.cos(pitch) * d, c.y + Math.sin(pitch) * d, c.z + Math.cos(yaw) * Math.cos(pitch) * d); camera.lookAt(c);
    (r.root.children.find(c => (c as THREE.SkinnedMesh).isSkinnedMesh) as THREE.Mesh).material = o.wire ? new THREE.MeshBasicMaterial({ wireframe: true, color: 0x99ff99 }) : mat;
    renderer.render(scene, camera);
    r.gun.visible = true;
    return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
  },

  /** First person: the camera at the eye, the weapon at the hip (ads 0) or aimed (ads 1). Or, with orbit, the same
   * pose seen from outside (yaw/pitch degrees around the weapon). */
  fp(id: WeaponId, o: { ads?: number; orbit?: boolean; yaw?: number; pitch?: number; dist?: number; fov?: number; at?: [number, number, number]; reload?: number; empty?: boolean } = {}) {
    clear(); size();
    const t0 = performance.now(), r = getRig();
    if (r.weapon.id !== id) r.setWeapon(id);
    const ms = performance.now() - t0, a = o.ads ?? 0;
    stage.position.set(0, 0, 0); stage.add(r.root);
    const H = holdFor(id).hip, az = holdFor(id).adsZ;
    r.gun.position.set(H.p[0] * (1 - a), H.p[1] * (1 - a), H.p[2] + (az - H.p[2]) * a); r.gun.rotation.set(H.r[0] * (1 - a), H.r[1] * (1 - a), H.r[2] * (1 - a));
    const f = o.reload !== undefined ? reloadFrame(id, o.reload, !!o.empty) : undefined;
    if (f) { r.gun.position.x += f.gunP[0]; r.gun.position.y += f.gunP[1]; r.gun.position.z += f.gunP[2]; r.gun.rotation.x += f.gunR[0]; r.gun.rotation.y += f.gunR[1]; r.gun.rotation.z += f.gunR[2]; }
    const t1 = performance.now(); r.solve(f); const solveMs = performance.now() - t1;
    if (o.orbit) {
      const yaw = THREE.MathUtils.degToRad(o.yaw ?? 60), pitch = THREE.MathUtils.degToRad(o.pitch ?? 10), d = o.dist ?? 1.1;
      const c = o.at ? r.gun.localToWorld(new THREE.Vector3(...o.at)) : new THREE.Vector3(0.05, -0.2, -0.3);
      camera.fov = 30; camera.position.set(c.x + Math.sin(yaw) * Math.cos(pitch) * d, c.y + Math.sin(pitch) * d, c.z + Math.cos(yaw) * Math.cos(pitch) * d); camera.lookAt(c);
    } else { camera.fov = o.fov ?? 54 - a * 9; camera.position.set(0, 0, 0); camera.rotation.set(0, 0, 0); }
    camera.near = 0.01; camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    camera.fov = 30; camera.updateProjectionMatrix();
    (document.getElementById('info') as HTMLElement).textContent = `fp ${id} ads ${a}`;
    return { buildMs: ms, solveMs, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, residual: r.residual.map(v => +v.toFixed(4)) };
  },

  /** Shows one weapon. yaw/pitch in degrees around its centre; dist in metres. */
  weapon(id: WeaponId, o: { yaw?: number; pitch?: number; dist?: number; lod?: number; mag?: number; bolt?: number } = {}) {
    clear(); size();
    const t0 = performance.now(), w = weaponModel(id, o.lod ?? 0), ms = performance.now() - t0;
    const { mesh, bones } = rigMesh(w.geo, WEAPON_BONES);
    bones[1].position.y = -(o.mag ?? 0); bones[2].position.z = o.bolt ?? 0;
    for (let i = 5; i < bones.length; i++) bones[i].scale.setScalar(0);
    stage.add(mesh);
    if (w.lens) stage.add(new THREE.Mesh(w.lens, lensMat));
    const bb = w.geo.boundingBox!, c = new THREE.Vector3(); bb.getCenter(c);
    stage.position.set(-c.x, -c.y, -c.z);
    const yaw = THREE.MathUtils.degToRad(o.yaw ?? 90), pitch = THREE.MathUtils.degToRad(o.pitch ?? 8), d = o.dist ?? 1.9;
    camera.position.set(Math.sin(yaw) * Math.cos(pitch) * d, Math.sin(pitch) * d, Math.cos(yaw) * Math.cos(pitch) * d);
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    const info = `${id} lod${o.lod ?? 0} ${w.triangles} tris built ${ms.toFixed(0)} ms`;
    (document.getElementById('info') as HTMLElement).textContent = info;
    return { triangles: w.triangles, ms, census };
  },
};
(window as unknown as { __breachlineHero: typeof api }).__breachlineHero = api;
addEventListener('resize', size);
size();
const q = new URLSearchParams(location.search);
if (q.get('w')) api.weapon(q.get('w') as WeaponId, { yaw: Number(q.get('yaw') ?? 90) });
await heroReady;
(window as unknown as { __heroReady: boolean }).__heroReady = true;
