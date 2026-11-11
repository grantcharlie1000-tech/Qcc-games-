/** Patch asset trial page (evidence only; served by the vite dev server, never built into the site). Loads candidate
 * models from Patch (fetched by the driver from a scratch folder, never from the repository) beside our own rifleman and
 * AR-5, under one neutral three-point light on a mid-grey backdrop. Driven by `window.__trial` from `shoot.mjs`.
 * Downloaded files are parsed only by three's GLTFLoader; nothing in them is executed. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { heroReady } from '../../../src/games/breachline/render/hero/geom';
import { figureGeometry } from '../../../src/games/breachline/render/fighters/figure';
import { SCALE, makeBones } from '../../../src/games/breachline/render/fighters/skeleton';
import { Animator, idleInput } from '../../../src/games/breachline/render/fighters/anim';
import { weaponFor } from '../../../src/games/breachline/render/fighters/weapon';
import { fighterMaterial } from '../../../src/games/breachline/render/fighters/material';
import { loadFighterTextures, texturedFighterMaterial, texturedGeometry } from '../../../src/games/breachline/render/fighters/textures';
import { WEAPON_BONES, weaponModel } from '../../../src/games/breachline/render/hero/weapons';
import { heroMaterial, texturedMaterial } from '../../../src/games/breachline/render/hero/material';
import { ArtLoader } from '../../../src/games/breachline/render/assets';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.setPixelRatio(1);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x77797c);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.5;
// The fighter studio's three-point rig: warm key high front-left, cool fill low front-right, rim behind. Lights turn
// with the camera so every view is lit the same way.
const key = new THREE.DirectionalLight(0xfff0dc, 3.0), fill = new THREE.DirectionalLight(0xdfe8ff, 1.1), rim = new THREE.DirectionalLight(0xffffff, 2.2);
scene.add(key, fill, rim, key.target, fill.target, rim.target, new THREE.HemisphereLight(0xffffff, 0x5a5a5a, 0.25));
function placeLights(yaw: number, at: THREE.Vector3) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  // Rig defined for a camera on +Z looking at -Z; rotated by the camera's yaw about the target.
  const put = (x: number, y: number, z: number, l: THREE.DirectionalLight) => { l.position.set(at.x + x * c + z * s, at.y + y, at.z - x * s + z * c); l.target.position.copy(at); };
  put(-2.2, 3.2, 2.6, key); put(2.4, 1.2, 2.2, fill); put(0.6, 2.4, -3.0, rim);
}
const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
const objects = new Map<string, THREE.Object3D>();
const info = new Map<string, Record<string, unknown>>();

function tris(o: THREE.Object3D) {
  let n = 0;
  o.traverse(c => { const m = c as THREE.Mesh; if (m.isMesh) { const g = m.geometry; n += (g.index ? g.index.count : g.getAttribute('position').count) / 3; } });
  return n;
}
/** Wraps `inner` so its bounding box is normalised: soldiers to `height` with feet on y = 0, weapons to `length`
 * along X centred on the origin. `rotY` turns the model first (radians) so it faces +Z / points along X. */
function normalise(inner: THREE.Object3D, kind: 'soldier' | 'weapon', size: number, rotY = 0) {
  const turn = new THREE.Group(); turn.add(inner); turn.rotation.y = rotY; turn.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(turn), dim = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const k = size > 0 ? size / (kind === 'soldier' ? dim.y : dim.x) : 1; // size 0: keep the file's own scale
  const scaled = new THREE.Group(); scaled.add(turn); scaled.scale.setScalar(k);
  scaled.position.set(-c.x * k, kind === 'soldier' ? -box.min.y * k : -c.y * k, -c.z * k);
  const outer = new THREE.Group(); outer.add(scaled);
  return { outer, rawDims: dim.toArray().map(v => +v.toFixed(3)), scale: +k.toFixed(4) };
}

const gltf = new GLTFLoader();
/** `hide` drops nodes by name (alternate parts shipped in the same file); `move` offsets nodes (metres, file units). */
async function load(name: string, kind: 'soldier' | 'weapon', size: number, rotY = 0, opt: { hide?: string[]; move?: Record<string, [number, number, number]> } = {}) {
  const g = await gltf.loadAsync(`/patch-dl/${name}.glb`);
  for (const h of opt.hide ?? []) g.scene.getObjectByName(h)?.removeFromParent();
  for (const [n, d] of Object.entries(opt.move ?? {})) { const o = g.scene.getObjectByName(n); if (o) o.position.add(new THREE.Vector3(...d)); }
  const mats = new Set<THREE.MeshStandardMaterial>();
  g.scene.traverse(c => { const m = c as THREE.Mesh; if (m.isMesh) { m.frustumCulled = false; (Array.isArray(m.material) ? m.material : [m.material]).forEach(x => mats.add(x as THREE.MeshStandardMaterial)); } });
  const n = normalise(g.scene, kind, size, rotY);
  objects.set(name, n.outer);
  const r = { triangles: tris(g.scene), rawDims: n.rawDims, scale: n.scale, materials: [...mats].map(m => ({ name: m.name, map: m.map?.image?.width ?? 0, normal: !!m.normalMap, rm: !!m.roughnessMap, metal: m.metalness, rough: m.roughness, side: m.side, transparent: m.transparent })) };
  info.set(name, r);
  return r;
}

/** Our current rifleman (squad 0, full detail, baked textures, idle pose with the AR) turned to face +Z. */
async function ourRifleman(squad: 0 | 1 = 0) {
  await heroReady;
  const tex = await loadFighterTextures(renderer, squad).catch(() => null);
  const group = new THREE.Group(), bones = makeBones(), f = figureGeometry(squad, 0);
  const tg = tex ? texturedGeometry(tex, 0, () => f.geo) : null;
  let m: THREE.Material;
  if (tg && tex) { const tm = texturedFighterMaterial(tex.levels[0]!.maps); tm.userData.probe.value.setRGB(1.3, 1.3, 1.35); tm.envMap = scene.environment; tm.envMapIntensity = 0.6; m = tm; }
  else { const pm = fighterMaterial(); pm.userData.probe.value.setRGB(1.3, 1.3, 1.35); m = pm; }
  const mesh = new THREE.SkinnedMesh(tg ?? f.geo, m); mesh.add(bones[0]); mesh.bind(new THREE.Skeleton(bones)); mesh.frustumCulled = false;
  const w = weaponFor('ar'), wb = Array.from({ length: w.bones }, () => new THREE.Bone());
  const wm = fighterMaterial(); wm.userData.probe.value.setRGB(1.3, 1.3, 1.35);
  const weapon = new THREE.SkinnedMesh(w.geo, wm); weapon.add(...wb); weapon.bind(new THREE.Skeleton(wb)); weapon.frustumCulled = false;
  group.add(mesh, weapon); group.scale.setScalar(SCALE);
  const anim = new Animator(bones, weapon, wb, w); anim.reset(idleInput()); anim.update(idleInput(), 1 / 60);
  group.position.copy(anim.root); group.rotation.y = anim.yaw;
  const outer = new THREE.Group(), turn = new THREE.Group(); turn.add(group); turn.rotation.y = Math.PI; outer.add(turn);
  scene.add(outer); outer.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(mesh); scene.remove(outer);
  objects.set('rifleman', outer);
  const r = { triangles: f.triangles + w.triangles, textured: !!tg, height: +(box.max.y - box.min.y).toFixed(3) };
  info.set('rifleman', r);
  return r;
}

/** Our AR-5 at full detail with its baked texture set, turned to lie along X (as the candidates do). */
async function ourAr5() {
  await heroReady;
  const w = weaponModel('ar', 0);
  const list = Array.from({ length: WEAPON_BONES }, () => new THREE.Bone());
  let mat: THREE.Material = heroMaterial();
  try {
    const art = new ArtLoader(renderer, 'high');
    const [map, normalMap, arm] = await Promise.all((['diff', 'nor', 'arm'] as const).map(k => art.texture('../hero/ar', k, 2048)));
    for (const t of [map, normalMap, arm]) t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    mat = texturedMaterial({ map, normalMap, arm });
  } catch (e) { console.warn('no AR texture set', e); }
  const mesh = new THREE.SkinnedMesh(w.geo, mat); for (const b of list) mesh.add(b); mesh.bind(new THREE.Skeleton(list)); mesh.frustumCulled = false;
  for (let i = 5; i < list.length; i++) list[i].scale.setScalar(0);
  const holder = new THREE.Group(); holder.add(mesh);
  if (w.lens) holder.add(new THREE.Mesh(w.lens, new THREE.MeshStandardMaterial({ color: 0xc08a3a, roughness: 0.03, metalness: 0.55, transparent: true, opacity: 0.2, depthWrite: false })));
  // Our weapons lie along Z with the muzzle at -Z; turn so the muzzle points to +X like the candidates' sheets.
  const b = w.geo.boundingBox!, len = b.max.z - b.min.z;
  const n = normalise(holder, 'weapon', len, Math.PI / 2);
  objects.set('ar5', n.outer);
  const r = { triangles: w.triangles, lengthM: +len.toFixed(3), textured: mat.type === 'MeshStandardMaterial' && !!(mat as THREE.MeshStandardMaterial).map };
  info.set('ar5', r);
  return r;
}

interface Place { name: string; x?: number; y?: number; z?: number; yaw?: number; pitch?: number; roll?: number }
interface Frame {
  show: Place[]; w: number; h: number;
  /** Orbit camera: target, yaw (0 = from +Z), pitch, distance (degrees and metres). */
  at?: [number, number, number]; yaw?: number; pitch?: number; dist?: number; fov?: number;
  /** Free camera instead: position and look-at target. */
  pos?: [number, number, number]; look?: [number, number, number];
  /** Render only the window [x, y, w, h] of a full frame of fullW x fullH (exact pixel density of that frame). */
  view?: [number, number, number, number, number, number];
  lightYaw?: number; bg?: number;
}
const stage = new THREE.Group(); scene.add(stage);
function frame(o: Frame) {
  for (const c of [...stage.children]) stage.remove(c);
  for (const p of o.show) {
    const src = objects.get(p.name); if (!src) throw new Error(`not loaded: ${p.name}`);
    const holder = new THREE.Group(); holder.add(src);
    holder.position.set(p.x ?? 0, p.y ?? 0, p.z ?? 0);
    holder.rotation.set(THREE.MathUtils.degToRad(p.pitch ?? 0), THREE.MathUtils.degToRad(p.yaw ?? 0), THREE.MathUtils.degToRad(p.roll ?? 0), 'YXZ');
    stage.add(holder);
  }
  renderer.setSize(o.w, o.h, false);
  camera.fov = o.fov ?? 30; camera.aspect = o.view ? o.view[4] / o.view[5] : o.w / o.h;
  let yaw = 0;
  if (o.pos) { camera.position.set(...o.pos); camera.lookAt(new THREE.Vector3(...(o.look ?? [0, 0, -1]))); yaw = Math.atan2(camera.position.x - (o.look?.[0] ?? 0), camera.position.z - (o.look?.[2] ?? -1)); }
  else {
    const at = new THREE.Vector3(...(o.at ?? [0, 0.9, 0])), y = THREE.MathUtils.degToRad(o.yaw ?? 0), p = THREE.MathUtils.degToRad(o.pitch ?? 0), d = o.dist ?? 5;
    camera.position.set(at.x + Math.sin(y) * Math.cos(p) * d, at.y + Math.sin(p) * d, at.z + Math.cos(y) * Math.cos(p) * d); camera.lookAt(at); yaw = y;
  }
  if (o.view) camera.setViewOffset(o.view[4], o.view[5], o.view[0], o.view[1], o.view[2], o.view[3]); else camera.clearViewOffset();
  camera.updateProjectionMatrix();
  placeLights(o.lightYaw !== undefined ? THREE.MathUtils.degToRad(o.lightYaw) : yaw, new THREE.Vector3(...(o.at ?? o.look ?? [0, 0.9, 0])));
  scene.background = new THREE.Color(o.bg ?? 0x77797c);
  renderer.render(scene, camera);
  return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
}
/** Where a world point lands in a full frame (for choosing close-up windows). */
function project(o: Frame, pt: [number, number, number]) {
  frame({ ...o, w: 8, h: 8 * (o.view ? o.view[5] / o.view[4] : o.h / o.w) });
  const v = new THREE.Vector3(...pt).project(camera), W = o.view ? o.view[4] : o.w, H = o.view ? o.view[5] : o.h;
  return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H];
}

const api = { load, ourRifleman, ourAr5, frame, project, info: () => Object.fromEntries(info) };
(window as unknown as { __trial: typeof api }).__trial = api;
(window as unknown as { __trialReady: boolean }).__trialReady = true;
