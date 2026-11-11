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
import type { PoseInput } from '../../../src/games/breachline/render/fighters/anim';
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

/** A processed asset from public/game-art/breachline/patch/<dir>/: one mesh of `file` (by node name) with its KTX2
 * set loaded the way the game loads textures (ArtLoader). `tint` recolours by the mask: [fatigues, kit] sRGB hex. */
async function loadPrepared(name: string, dir: string, file: string, node: string, o: { tint?: [number, number]; plain?: boolean; size?: number; norSize?: number; armSize?: number; rotY?: number; drop?: Record<string, [number, number, number]> } = {}) {
  const g = await gltf.loadAsync(`/game-art/breachline/patch/${dir}/${file}`);
  const src = (node === '*' ? null : g.scene.getObjectByName(node)) as THREE.Mesh | null; if (node !== '*' && !src) throw new Error(`no node ${node}`);
  const art = new ArtLoader(renderer, 'high'), set = `../patch/${dir}`, size = o.size ?? 2048;
  const [map, normalMap] = await Promise.all([art.texture(set, 'diff', size), art.texture(set, 'nor', o.norSize ?? size)]);
  const arm = await art.texture(set, 'arm', o.armSize ?? 1024);
  const mat = new THREE.MeshStandardMaterial({ map, normalMap, roughnessMap: arm, metalnessMap: arm, roughness: 1, metalness: 1 });
  if (o.plain) { mat.map = null; mat.color.set(0x9a9a9a); }
  if (o.tint) {
    const mask = await art.texture(set, 'mask', 1024), ref = (g.parser.json.asset?.extras?.refLum ?? { fatigues: 0.07, kit: 0.055 }) as { fatigues: number; kit: number };
    const lin = (x: number) => Math.pow(x, 2.2);
    const u = { tintMask: { value: mask }, tintA: { value: new THREE.Color(o.tint[0]) }, tintB: { value: new THREE.Color(o.tint[1]) }, refA: { value: lin(ref.fatigues) }, refB: { value: lin(ref.kit) } };
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, u);
      sh.fragmentShader = 'uniform sampler2D tintMask; uniform vec3 tintA, tintB; uniform float refA, refB;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        { float k = texture2D(tintMask, vMapUv).r; float l = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          vec3 a = tintA * clamp(l / refA, 0.0, 3.0), b = tintB * clamp(l / refB, 0.0, 3.0); diffuseColor.rgb = mix(a, b, k); }`);
    };
    mat.customProgramCacheKey = () => 'tint';
  }
  const holder = new THREE.Group();
  if (src) { const mesh = new THREE.Mesh(src.geometry, mat); mesh.frustumCulled = false; holder.add(mesh); }
  else { g.scene.traverse(c => { const m = c as THREE.Mesh; if (m.isMesh) { m.material = mat; m.frustumCulled = false; } }); for (const [k, d] of Object.entries(o.drop ?? {})) g.scene.getObjectByName(k)?.position.add(new THREE.Vector3(...d)); holder.add(g.scene); }
  holder.rotation.y = o.rotY ?? 0;
  const wrap = new THREE.Group(); wrap.add(holder);
  objects.set(name, wrap);
  const r = { triangles: tris(holder), extras: g.parser.json.asset?.extras ? Object.keys(g.parser.json.asset.extras) : [] };
  info.set(name, r);
  return r;
}

/** The skinned soldier (body-skinned.glb) on the fighters' own skeleton and animator, with our AR in hand. Several
 * named rigs can exist (`soldier`, `ours`); `clip` poses one. */
interface Rig { group: THREE.Group; anim: Animator; outer: THREE.Group; mesh: THREE.SkinnedMesh }
const rigs = new Map<string, Rig>();
/** Squad looks for the recolour. Colours are sRGB hex: the darkest and lightest the cloth reaches. */
const LOOKS: Record<string, { fat: [number, number]; kit: [number, number]; weave: number; stain: number }> = {
  A: { fat: [0x090b0d, 0x323a42], kit: [0x050506, 0x232528], weave: 0.10, stain: 0.18 },   // ships: very dark slate fatigues, near-black kit
  B: { fat: [0x21190f, 0x8a6e4b], kit: [0x12140c, 0x5e6345], weave: 0.12, stain: 0.30 },   // coyote fatigues, olive kit
};
/** Recolour by remapping luminance. The source is near-black, so each class's own luminance range (2nd to 98th
 * percentile, measured offline, in sRGB-encoded units) is stretched onto the target's dark..light range: folds, seams,
 * stitching and wear keep their relative values. A fine object-space weave (2.5 mm) and a faint large stain layer add
 * cloth; kit gets a steeper curve (straps and buckles stay darker than the cloth) and boot soles are darkened. */
async function squadLook(mat: THREE.MeshStandardMaterial, look: string, art: ArtLoader, set: string, range: { fatigues: number[]; kit: number[] }) {
  const L = LOOKS[look], mask = await art.texture(set, 'mask' as 'arm', 1024), enc = (x: number) => Math.pow(Math.max(x, 1e-6), 1 / 2.2);
  const u = {
    tMask: { value: mask }, fat: { value: new THREE.Vector3(...range.fatigues.map(enc)) }, kit: { value: new THREE.Vector3(...range.kit.map(enc)) },
    fatA: { value: new THREE.Color(L.fat[0]) }, fatB: { value: new THREE.Color(L.fat[1]) }, kitA: { value: new THREE.Color(L.kit[0]) }, kitB: { value: new THREE.Color(L.kit[1]) },
    weave: { value: L.weave }, stain: { value: L.stain },
  };
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'varying vec3 vObjP; varying vec3 vObjN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vObjP = position; vObjN = normal;');
    sh.fragmentShader = `uniform sampler2D tMask; uniform vec3 fat, kit, fatA, fatB, kitA, kitB; uniform float weave, stain; varying vec3 vObjP; varying vec3 vObjN;
      float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float vnoise(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
      ` + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      { vec3 mk = texture2D(tMask, vMapUv).rgb; float k = smoothstep(0.3, 0.7, mk.r), keep = smoothstep(0.3, 0.7, mk.g);
        float l = pow(max(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)), 1e-6), 0.4545);
        // Centred on the class median with a spread of a fifth of its 2..98% range: small differences (folds, seams,
        // stitching, wear) become visible steps instead of all landing at the dark end.
        float sF = 0.5 + 0.5 * tanh((l - fat.y) / max(1e-4, (fat.z - fat.x) * 0.2));
        float sK = pow(0.5 + 0.5 * tanh((l - kit.y) / max(1e-4, (kit.z - kit.x) * 0.2)), 1.3);
        vec3 an = abs(vObjN); vec2 w2 = an.x > an.y && an.x > an.z ? vObjP.yz : an.y > an.z ? vObjP.xz : vObjP.xy;
        float wv = sin(w2.x * 2513.0) * sin(w2.y * 2513.0) * 0.6 + (vnoise(vObjP * 900.0) - 0.5) * 0.8;
        float st = vnoise(vObjP * 5.0) * 0.65 + vnoise(vObjP * 17.0) * 0.35;
        vec3 cF = mix(fatA, fatB, sF) * (1.0 + weave * wv) * (1.0 - stain * (st - 0.45));
        vec3 cK = mix(kitA, kitB, sK) * (1.0 + weave * 0.4 * wv) * (1.0 - stain * 0.6 * (st - 0.45));
        vec3 c = mix(cF, cK, k);
        if (vObjP.y < 0.028) c *= 0.55;
        diffuseColor.rgb = mix(c, diffuseColor.rgb, keep); }`);
  };
  mat.customProgramCacheKey = () => `look${look}`;
}
/** Our covered head (helmet, balaclava, goggles) and gloved hands, cut from our own textured figure by bone, bound to
 * the soldier's skeleton (same bones, same bind pose). */
async function attachOurs(rig: Rig, squad: 0 | 1) {
  const tex = await loadFighterTextures(renderer, squad).catch(() => null), f = figureGeometry(squad, 0);
  const geo = (tex ? texturedGeometry(tex, 0, () => f.geo) : null) ?? f.geo, SI = geo.getAttribute('skinIndex'), SW = geo.getAttribute('skinWeight'), ix = geo.index!.array;
  const KEEP = new Set([5, 9, 13]), keep: number[] = [];
  const dom = (v: number) => { let b = SI.getX(v), w = SW.getX(v); for (const [bb, ww] of [[SI.getY(v), SW.getY(v)], [SI.getZ(v), SW.getZ(v)], [SI.getW(v), SW.getW(v)]]) if (ww > w) { w = ww; b = bb; } return b; };
  for (let t = 0; t < ix.length; t += 3) if (KEEP.has(dom(ix[t])) && KEEP.has(dom(ix[t + 1])) && KEEP.has(dom(ix[t + 2]))) keep.push(ix[t], ix[t + 1], ix[t + 2]);
  const part = geo.clone(); part.setIndex(keep);
  let m: THREE.Material;
  if (tex && geo !== f.geo) { const tm = texturedFighterMaterial(tex.levels[0]!.maps); tm.userData.probe.value.setRGB(1.3, 1.3, 1.35); tm.envMap = scene.environment; tm.envMapIntensity = 0.6; m = tm; }
  else { const pm = fighterMaterial(); pm.userData.probe.value.setRGB(1.3, 1.3, 1.35); m = pm; }
  const mesh = new THREE.SkinnedMesh(part, m); mesh.frustumCulled = false; mesh.bind(rig.mesh.skeleton, rig.mesh.bindMatrix);
  rig.group.add(mesh);
  return keep.length / 3;
}
async function loadSkinned(name: string, node = 'body_lod0', weights = false, look: string | null = null, attach: 0 | 1 | null = null, url = '/game-art/breachline/patch/tactical/body-skinned.glb') {
  await heroReady;
  const g = await gltf.loadAsync(url);
  const src = g.scene.getObjectByName(node) as THREE.Mesh;
  const art = new ArtLoader(renderer, 'high'), set = '../patch/tactical';
  const [map, normalMap, arm] = await Promise.all([art.texture(set, 'diff', 2048), art.texture(set, 'nor', 1024), art.texture(set, 'arm', 1024)]);
  const mat = new THREE.MeshStandardMaterial({ map, normalMap, roughnessMap: arm, metalnessMap: arm, roughness: 1, metalness: 1 });
  if (look) await squadLook(mat, look, art, set, (g.parser.json.asset.extras as { lumRange: { fatigues: number[]; kit: number[] } }).lumRange);
  const bones = makeBones(), mesh = new THREE.SkinnedMesh(src.geometry, weights ? weightMaterial() : mat);
  mesh.add(bones[0]); mesh.bind(new THREE.Skeleton(bones)); mesh.frustumCulled = false;
  const w = weaponFor('ar'), wb = Array.from({ length: w.bones }, () => new THREE.Bone());
  const wm = fighterMaterial(); wm.userData.probe.value.setRGB(1.3, 1.3, 1.35);
  const weapon = new THREE.SkinnedMesh(w.geo, wm); weapon.add(...wb); weapon.bind(new THREE.Skeleton(wb)); weapon.frustumCulled = false;
  const group = new THREE.Group(); group.add(mesh, weapon); group.scale.setScalar(SCALE);
  const outer = new THREE.Group(); outer.add(group);
  const anim = new Animator(bones, weapon, wb, w);
  const rig = { group, anim, outer, mesh }; rigs.set(name, rig); objects.set(name, outer);
  const attached = attach === null ? 0 : await attachOurs(rig, attach);
  return { triangles: tris(mesh), attached };
}
/** Our own rifleman as a rig too, for side-by-side strips. */
async function ourRig(name: string, squad: 0 | 1 = 0) {
  await heroReady;
  const tex = await loadFighterTextures(renderer, squad).catch(() => null);
  const bones = makeBones(), f = figureGeometry(squad, 0), tg = tex ? texturedGeometry(tex, 0, () => f.geo) : null;
  let m: THREE.Material; if (tg && tex) { const tm = texturedFighterMaterial(tex.levels[0]!.maps); tm.userData.probe.value.setRGB(1.3, 1.3, 1.35); tm.envMap = scene.environment; tm.envMapIntensity = 0.6; m = tm; } else m = fighterMaterial();
  const mesh = new THREE.SkinnedMesh(tg ?? f.geo, m); mesh.add(bones[0]); mesh.bind(new THREE.Skeleton(bones)); mesh.frustumCulled = false;
  const w = weaponFor('ar'), wb = Array.from({ length: w.bones }, () => new THREE.Bone());
  const wm = fighterMaterial(); wm.userData.probe.value.setRGB(1.3, 1.3, 1.35);
  const weapon = new THREE.SkinnedMesh(w.geo, wm); weapon.add(...wb); weapon.bind(new THREE.Skeleton(wb)); weapon.frustumCulled = false;
  const group = new THREE.Group(); group.add(mesh, weapon); group.scale.setScalar(SCALE);
  const outer = new THREE.Group(); outer.add(group);
  rigs.set(name, { group, anim: new Animator(bones, weapon, wb, w), outer, mesh }); objects.set(name, outer);
}
/** Colours each vertex by its strongest bone, to show the weights. */
function weightMaterial() {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0 });
  m.onBeforeCompile = sh => {
    sh.vertexShader = 'varying vec3 vBone;\n' + sh.vertexShader.replace('#include <skinning_vertex>', `#include <skinning_vertex>
      { float b = skinIndex.x; vBone = vec3(fract(b * 0.37), fract(b * 0.61 + 0.3), fract(b * 0.83 + 0.6)) * skinWeight.x + vec3(0.15) * (1.0 - skinWeight.x); }`);
    sh.fragmentShader = 'varying vec3 vBone;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = vBone;');
  };
  m.customProgramCacheKey = () => 'weights';
  return m;
}
interface Script { at(t: number): Partial<PoseInput>; lead?: number }
const walk = (vx: number, vz: number, extra: Partial<PoseInput> = {}): Script => ({ lead: 1.0, at: t => ({ x: vx * t, z: vz * t, pace: Math.hypot(vx, vz) / 3.5, ...extra }) });
const SCRIPTS: Record<string, Script> = {
  idle: { at: () => ({}) }, walk: walk(0, -2.6), aim: { lead: 0.6, at: () => ({ ads: true }) }, aimUp: { lead: 0.6, at: () => ({ ads: true, pitch: 0.5 }) },
  crouch: { lead: 0.6, at: () => ({ crouch: 1 }) }, crouchwalk: walk(0, -1.5, { crouch: 1 }), sprint: walk(0, -6.2, { sprint: true }),
  death0: { lead: 0.3, at: t => ({ alive: t < 0.35, deaths: 0 }) }, death1: { lead: 0.3, at: t => ({ alive: t < 0.35, deaths: 1 }) },
};
/** A rigid prop (headgear) on rig `name`'s head bone. The file comes from the scratch folder (`/patch-dl/`). It is
 * centred, turned by `rotY` (most props face +Z; the fighters face -Z), scaled so its width across X is `width`, and
 * placed in head-bone space (bind axes: +Y up, -Z forward) with its bounding-box bottom at `at[1]`. */
async function headProp(name: string, prop: string, o: { width: number; at: [number, number, number]; rotY?: number; rotX?: number; recolor?: Record<string, number>; hide?: string[] }) {
  const r = rigs.get(name)!, g = await gltf.loadAsync(`/patch-dl/${prop}.glb`);
  for (const h of o.hide ?? []) g.scene.getObjectByName(h)?.removeFromParent();
  let n = 0;
  g.scene.traverse(c => { const m = c as THREE.Mesh; if (!m.isMesh) return; n += tris(m); const mats = Array.isArray(m.material) ? m.material : [m.material];
    mats.forEach(mm => { const ms = mm as THREE.MeshStandardMaterial; const key = Object.keys(o.recolor ?? {}).find(k => k === '*' || (ms.name ?? '').includes(k)); if (key !== undefined) { ms.color.set(o.recolor![key]); if (key === '*') ms.map = null; } ms.needsUpdate = true; }); });
  const turn = new THREE.Group(); turn.add(g.scene); turn.rotation.set(o.rotX ?? 0, o.rotY ?? 0, 0); turn.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(turn), dim = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3()), k = o.width / dim.x;
  const holder = new THREE.Group(); holder.add(turn); holder.scale.setScalar(k);
  holder.position.set(o.at[0] - c.x * k, o.at[1] - box.min.y * k, o.at[2] - c.z * k);
  r.mesh.skeleton.bones[5].add(holder);
  return { triangles: n, dims: dim.toArray().map(v => +v.toFixed(3)), scale: +k.toFixed(3) };
}
/** The prepared headgear (public/game-art/breachline/patch/headgear/headgear.glb) for a squad's sets, on the head bone. */
async function headgear(name: string, sets: string[]) {
  const r = rigs.get(name)!, g = await gltf.loadAsync('/game-art/breachline/patch/headgear/headgear.glb');
  let n = 0; const add: THREE.Mesh[] = [];
  g.scene.traverse(c => { const m = c as THREE.Mesh; const x = m.userData as { set?: string; color?: string; roughness?: number; metalness?: number; opacity?: number };
    if (!m.isMesh || !sets.includes(x.set ?? '') || ((x as { lod?: number }).lod ?? 0) !== 0) return;
    m.material = new THREE.MeshStandardMaterial({ color: x.color, roughness: x.roughness, metalness: x.metalness, transparent: (x.opacity ?? 1) < 1, opacity: x.opacity ?? 1 });
    m.frustumCulled = false; add.push(m); n += tris(m); });
  for (const m of add) r.mesh.skeleton.bones[5].add(m);
  return n;
}
/** Polyfork "Base Hand" (a WebXR-style hand: 25 joints, flat under one node, posed by absolute joint transforms).
 * Loads it as object `name`, mirrored for a right hand when `mirror`, with each finger curled by `curl` (radians per
 * joint, proximal..distal) about the finger's side axis toward the palm (`palmSign` picks which face is the palm). */
async function baseHand(name: string, o: { mirror?: boolean; curl?: number[]; thumb?: number[]; spread?: number; palmSign?: number; color?: number } = {}) {
  const g = await gltf.loadAsync('/patch-dl/basehand.glb');
  const skinned: THREE.SkinnedMesh[] = []; g.scene.traverse(c => { if ((c as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(c as THREE.SkinnedMesh); });
  const mat = new THREE.MeshStandardMaterial({ color: o.color ?? 0x1c1d1f, roughness: 0.8, metalness: 0 });
  for (const m of skinned) { m.material = mat; m.frustumCulled = false; }
  const sk = skinned[0].skeleton, bones = sk.bones, byName = (n: string) => bones.find(b => b.name.replace(/[^a-z-]/g, '') === n.replace(/[^a-z-]/g, ''))!;
  // Bind world matrices (relative to the skinned mesh) from the inverse bind matrices.
  const bind = new Map<THREE.Bone, THREE.Matrix4>(); bones.forEach((b, i) => bind.set(b, sk.boneInverses[i].clone().invert()));
  const P = (b: THREE.Bone) => new THREE.Vector3().setFromMatrixPosition(bind.get(b)!);
  const wrist = P(byName('wrist')), iMeta = P(byName('index-finger-metacarpal')), pMeta = P(byName('pinky-finger-metacarpal')), mProx = P(byName('middle-finger-phalanx-proximal'));
  const palmN = new THREE.Vector3().crossVectors(iMeta.clone().sub(wrist), pMeta.clone().sub(wrist)).normalize().multiplyScalar(o.palmSign ?? 1);
  const pose = new Map<THREE.Bone, THREE.Matrix4>(); for (const b of bones) pose.set(b, bind.get(b)!.clone());
  const chains: [string, number[]][] = [['index-finger', o.curl ?? [1.1, 1.2, 0.8]], ['middle-finger', o.curl ?? [1.1, 1.2, 0.8]], ['ring-finger', o.curl ?? [1.1, 1.2, 0.8]], ['pinky-finger', o.curl ?? [1.1, 1.2, 0.8]], ['thumb', o.thumb ?? [0.4, 0.5, 0.4]]];
  for (const [f, angles] of chains) {
    const names = f === 'thumb' ? ['thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'] : [`${f}-phalanx-proximal`, `${f}-phalanx-intermediate`, `${f}-phalanx-distal`, `${f}-tip`];
    const js = names.map(byName); const pts = js.map(P);
    const dir = pts[1].clone().sub(pts[0]).normalize(), axis = new THREE.Vector3().crossVectors(dir, palmN).normalize();
    let cum = new THREE.Quaternion(); const newP = pts.map(p => p.clone());
    for (let k = 0; k < js.length; k++) {
      if (k > 0) newP[k] = newP[k - 1].clone().add(pts[k].clone().sub(pts[k - 1]).applyQuaternion(cum));
      if (k < angles.length) cum = new THREE.Quaternion().setFromAxisAngle(axis, angles[k]).multiply(cum);
      const r = new THREE.Quaternion().setFromRotationMatrix(bind.get(js[k])!), m4 = new THREE.Matrix4().compose(newP[k], cum.clone().multiply(r), new THREE.Vector3(1, 1, 1));
      pose.set(js[k], m4);
    }
  }
  // Bones sit flat under the mesh's parent at identity: their local matrix is the pose itself.
  for (const b of bones) { b.matrixAutoUpdate = false; b.matrix.copy(pose.get(b)!); b.matrixWorldNeedsUpdate = true; }
  const holder = new THREE.Group(); holder.add(g.scene); if (o.mirror) holder.scale.x = -1;
  const wrap = new THREE.Group(); wrap.add(holder); objects.set(name, wrap);
  return { bones: bones.length, wrist: wrist.toArray(), palmN: palmN.toArray(), dims: new THREE.Box3().setFromObject(g.scene).getSize(new THREE.Vector3()).toArray() };
}
/** Groups already-loaded objects into a new object `name`, each with a local position (m), Euler rotation (degrees,
 * XYZ) and uniform scale, e.g. hands placed in a weapon's frame. */
function group(name: string, items: { name: string; p?: [number, number, number]; r?: [number, number, number]; s?: number }[]) {
  const grp = new THREE.Group();
  for (const it of items) { const src = objects.get(it.name); if (!src) throw new Error(`not loaded: ${it.name}`); const h = new THREE.Group(); h.add(src); h.position.set(...(it.p ?? [0, 0, 0])); h.rotation.set(...((it.r ?? [0, 0, 0]).map(THREE.MathUtils.degToRad) as [number, number, number])); h.scale.setScalar(it.s ?? 1); grp.add(h); }
  objects.set(name, grp);
}
/** Runs `script` and poses rig `name` at time `t` (s after the script's lead-in). Returns the root position. */
function pose(name: string, script: string, t: number) {
  const r = rigs.get(name)!, sc = SCRIPTS[script], dt = 1 / 60, total = t + (sc.lead ?? 0);
  let time = 0, input = { ...idleInput(), ...sc.at(0) };
  r.anim.reset(input); r.anim.update(input, dt);
  while (time < total - 1e-6) { time += dt; input = { ...idleInput(), ...sc.at(time) }; r.anim.update(input, dt); }
  r.group.position.copy(r.anim.root); r.group.rotation.y = r.anim.yaw;
  // The soldier rigs face -Z like the fighters; turn them to face +Z so the trial's yaw 0 is the front.
  r.outer.rotation.y = Math.PI;
  const p = r.anim.root; return [-p.x, p.y, -p.z];
}

/** World position of bone `b` of rig `name` as last posed (with the trial's placement of the rig at the origin). */
function joint(name: string, b: number) {
  const r = rigs.get(name)!; r.outer.updateMatrixWorld(true);
  return r.mesh.skeleton.bones[b].getWorldPosition(new THREE.Vector3()).toArray();
}

/** Small red spheres at the given points (for sockets), as object `name`, in the same frame rotation as `rotY`. */
function markers(name: string, pts: [number, number, number][], rotY = 0, r = 0.006) {
  const grp = new THREE.Group(), m = new THREE.MeshBasicMaterial({ color: 0xff2a2a, depthTest: false });
  for (const p of pts) { const s = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), m); s.position.set(...p); s.renderOrder = 10; grp.add(s); }
  grp.rotation.y = rotY; const w = new THREE.Group(); w.add(grp); objects.set(name, w);
}

const api = { load, loadPrepared, markers, loadSkinned, headProp, headgear, baseHand, group, ourRig, pose, joint, ourRifleman, ourAr5, frame, project, info: () => Object.fromEntries(info) };
(window as unknown as { __trial: typeof api }).__trial = api;
(window as unknown as { __trialReady: boolean }).__trialReady = true;
