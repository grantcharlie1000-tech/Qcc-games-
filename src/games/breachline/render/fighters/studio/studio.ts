/** Dev-only fighter studio (served by vite at /src/games/breachline/render/fighters/studio/index.html, never built
 * into the site): a fighter of either squad on a turntable, at any level of detail, in any frame of any animation.
 * Driven by `window.__breachlineFighters` from `tests/games/breachline/fighters-shots.mjs`. */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { heroReady } from '../../hero/geom';
import { heroMaterial } from '../../hero/material';
import { figureGeometry } from '../figure';
import { BONES, SCALE, makeBones } from '../skeleton';
import { Animator, type PoseInput, idleInput } from '../anim';
import { standInWeapon } from '../weapon';
import type { WeaponId } from '../../../config';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.setPixelRatio(1);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x3a3d40);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.5;
const key = new THREE.DirectionalLight(0xfff2e0, 2.4); key.position.set(-2, 3, 2.2);
const rim = new THREE.DirectionalLight(0xdde8ff, 1.3); rim.position.set(2, 1.5, -2.5);
scene.add(key, rim, new THREE.HemisphereLight(0xffffff, 0x404040, 0.35));
// Floor with a grid every 0.25 m, so foot plant and sliding are visible in strips.
const floorTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d')!;
  g.fillStyle = '#55585b'; g.fillRect(0, 0, 256, 256); g.strokeStyle = '#6c7074'; g.lineWidth = 2;
  for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 256); g.stroke(); g.beginPath(); g.moveTo(0, i * 64); g.lineTo(256, i * 64); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(40, 40); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2; scene.add(floor);
const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 80);
const mat = heroMaterial(), weaponMat = heroMaterial();

function size(w = innerWidth, h = innerHeight) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }

interface Rig { group: THREE.Group; mesh: THREE.SkinnedMesh; weapon: THREE.SkinnedMesh; anim: Animator; squad: 0 | 1; lod: number; wid: WeaponId }
const rigs: Rig[] = [];
function makeRig(squad: 0 | 1, lod: number, wid: WeaponId): Rig {
  const group = new THREE.Group(), bones = makeBones(), f = figureGeometry(squad, lod);
  const mesh = new THREE.SkinnedMesh(f.geo, mat);
  mesh.add(bones[0]); mesh.bind(new THREE.Skeleton(bones)); mesh.frustumCulled = false;
  const w = standInWeapon(wid), wb = [new THREE.Bone(), new THREE.Bone()];
  const weapon = new THREE.SkinnedMesh(w.geo, weaponMat); weapon.add(wb[0]); weapon.add(wb[1]); weapon.bind(new THREE.Skeleton(wb)); weapon.frustumCulled = false;
  group.add(mesh, weapon); group.scale.setScalar(SCALE); scene.add(group);
  const anim = new Animator(bones, weapon, wb, w);
  return { group, mesh, weapon, anim, squad, lod, wid };
}
function rig(i: number, squad: 0 | 1, lod: number, wid: WeaponId = 'ar') {
  let r = rigs[i];
  if (!r || r.squad !== squad || r.lod !== lod || r.wid !== wid) { if (r) scene.remove(r.group); r = rigs[i] = makeRig(squad, lod, wid); }
  r.group.visible = true;
  return r;
}
function only(n: number) { rigs.forEach((r, i) => { if (r) r.group.visible = i < n; }); }

function look(at: THREE.Vector3, yawDeg: number, pitchDeg: number, dist: number, fov = 30) {
  const yaw = THREE.MathUtils.degToRad(yawDeg), pitch = THREE.MathUtils.degToRad(pitchDeg);
  camera.fov = fov; camera.updateProjectionMatrix();
  camera.position.set(at.x - Math.sin(yaw) * Math.cos(pitch) * dist, at.y + Math.sin(pitch) * dist, at.z - Math.cos(yaw) * Math.cos(pitch) * dist);
  camera.lookAt(at);
}

export interface ShotOptions { bones?: boolean; squad?: 0 | 1; lod?: number; weapon?: WeaponId; yaw?: number; pitch?: number; dist?: number; at?: [number, number, number]; fov?: number; pose?: Partial<PoseInput>; bind?: boolean; wire?: boolean; w?: number; h?: number }

const api = {
  /** One fighter standing at the origin facing -Z; the camera orbits (yaw 0 looks at its face). */
  shot(o: ShotOptions = {}) {
    size(o.w, o.h); only(0);
    const r = rig(0, o.squad ?? 0, o.lod ?? 0, o.weapon ?? 'ar');
    const t0 = performance.now();
    if (o.bind) r.anim.bindPose(); else { r.anim.reset({ ...idleInput(), ...o.pose }); r.anim.update({ ...idleInput(), ...o.pose }, 1 / 60); }
    const ms = performance.now() - t0;
    r.group.position.copy(r.anim.root); r.group.rotation.y = r.anim.yaw;
    r.mesh.material = o.wire ? new THREE.MeshBasicMaterial({ wireframe: true, color: 0x99ff99 }) : mat;
    look(new THREE.Vector3(...(o.at ?? [0, 0.95, 0])), o.yaw ?? 0, o.pitch ?? 5, o.dist ?? 4.6, o.fov ?? 30);
    let helper: THREE.SkeletonHelper | null = null;
    if (o.bones) { helper = new THREE.SkeletonHelper(r.mesh); (helper.material as THREE.LineBasicMaterial).depthTest = false; scene.add(helper); }
    renderer.render(scene, camera);
    if (helper) scene.remove(helper);
    const f = figureGeometry(r.squad, r.lod);
    return { triangles: f.triangles, buildMs: f.ms, census: f.census, poseMs: ms, calls: renderer.info.render.calls, rendered: renderer.info.render.triangles, bones: BONES, weaponTris: standInWeapon(r.wid).triangles, diag: r.anim.diag() };
  },
  /** Runs an animation from a script of inputs and renders frame `frame` of `frames` sampled over `seconds`. The
   * camera follows the fighter (side or front) unless `fixed`. Returns the pose diagnostics. */
  clip(o: ShotOptions & { script: string; frames: number; frame: number; seconds: number; follow?: boolean; side?: 'side' | 'front' | 'back' | 'rear34' | 'front34' }) {
    size(o.w, o.h); only(0);
    const r = rig(0, o.squad ?? 0, o.lod ?? 0, o.weapon ?? 'ar');
    const script = SCRIPTS[o.script], dt = 1 / 60, total = o.seconds * (o.frame / Math.max(1, o.frames - 1)) + (script.lead ?? 0);
    let t = 0, input = { ...idleInput(), ...script.at(0) };
    r.anim.reset(input);
    r.anim.update(input, dt);
    while (t < total - 1e-6) { t += dt; input = { ...idleInput(), ...script.at(t) }; r.anim.update(input, dt); if (script.event) script.event(t, dt, r.anim); }
    r.group.position.copy(r.anim.root); r.group.rotation.y = r.anim.yaw;
    const p = r.anim.root, view = { side: 90, front: 0, back: 180, rear34: 215, front34: 35 }[o.side ?? 'side'];
    const at = o.follow === false ? new THREE.Vector3(...(o.at ?? [0, 0.9, 0])) : new THREE.Vector3(p.x, o.at?.[1] ?? 0.9, p.z);
    look(at, view + (o.yaw ?? 0), o.pitch ?? 4, o.dist ?? 5, o.fov ?? 30);
    let helper: THREE.SkeletonHelper | null = null;
    if (o.bones) { helper = new THREE.SkeletonHelper(r.mesh); (helper.material as THREE.LineBasicMaterial).depthTest = false; scene.add(helper); }
    renderer.render(scene, camera);
    if (helper) scene.remove(helper);
    return r.anim.diag();
  },
};

interface Script { at(t: number): Partial<PoseInput>; lead?: number; event?: (t: number, dt: number, a: Animator) => void }
const walk = (vx: number, vz: number, extra: Partial<PoseInput> = {}, lead = 1.0): Script => ({ lead, at: t => ({ x: vx * t, z: vz * t, pace: Math.hypot(vx, vz) / 3.5, ...extra }) });
const SCRIPTS: Record<string, Script> = {
  idle: { at: () => ({}) },
  walk: walk(0, -2.6),
  sprint: walk(0, -6.2, { sprint: true }),
  crouchwalk: walk(0, -1.5, { crouch: 1 }),
  strafe: walk(2.4, 0),
  back: walk(0, 2.0),
  fire: { lead: 0.5, at: () => ({ ads: true }), event: (t, dt, a) => { if (t > 0.5 && Math.floor((t - 0.5) / 0.087) !== Math.floor((t - 0.5 - dt) / 0.087)) a.fire(); } },
  flinch: { lead: 0.5, at: t => ({ hp: t > 0.55 ? 60 : 100 }) },
  death0: { lead: 0.3, at: t => ({ alive: t < 0.35, deaths: 0 }) },
  death1: { lead: 0.3, at: t => ({ alive: t < 0.35, deaths: 1 }) },
  death2: { lead: 0.3, at: t => ({ alive: t < 0.35, deaths: 2 }) },
  reload: { lead: 0.2, at: t => ({ reload: t > 0.25 ? Math.max(0, 1 - (t - 0.25) / 2.3) : 0 }) },
  reloadEmpty: { lead: 0.2, at: t => ({ reload: t > 0.25 ? Math.max(0, 1 - (t - 0.25) / 2.3) : 0, empty: true }) },
  plant: { lead: 0.3, at: () => ({ act: 1, actT: 0.5 }) },
  reinforce: { lead: 0.3, at: () => ({ act: 3, actT: 0.5 }) },
  lean: { at: () => ({ lean: 1 }) },
  crouch: { at: () => ({ crouch: 1 }) },
};
(window as unknown as { __breachlineFighters: typeof api }).__breachlineFighters = api;
addEventListener('resize', () => size());
size();
await heroReady;
(window as unknown as { __fightersReady: boolean }).__fightersReady = true;
