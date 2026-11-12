/** The weapon in hand: owns its scene, camera and lights, poses the first-person rig each frame from the simulation's
 * fields (aim, pace, sprint, reload, swap, melee, use, lean) and the local shot events. Motion is built from analytic
 * damped springs (stable at any frame time): look sway, walk bob, recoil, aim transition with an arc, sprint carry,
 * reload timelines, a firing cycle with bolt travel and ejected casings. Reduced motion turns off bob and look sway. */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { SQUADS, WEAPONS, type WeaponId } from '../../config';
import { ACT, weaponIdOf, type Match, type SimEvent } from '../../state';
import { makeSprite } from '../../textures';
import { heroReady } from './geom';
import { texturedMaterial } from './material';
import { TEXTURED } from './weapons';
import { BAKED, clayMaterial, loadBaked } from './baked';
import { ArtLoader } from '../assets';
import { reloadFrame, idleFrame } from './reload';
import { muzzleInView, viewToWorld } from './muzzle';
import { readMeshBin } from './meshbin';
import { ARM_BONES, armsWithHand, type HandAsset } from './hands';
import { ART_BASE } from '../assets';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DEFAULT_LOOK, createFpRig, holdFor, type FpRig } from './rig';
import { CASES, WB } from './weapons';
import type { HeroLighting, HeroView, Viewmodel } from './index';

/** A damped spring toward a target, solved exactly for the step (underdamped or critically damped). */
export class Spring {
  x = 0; v = 0;
  constructor(public w: number, public z: number) {}
  step(target: number, dt: number): number {
    const y = this.x - target, v = this.v, w = this.w, z = Math.min(this.z, 0.999);
    if (this.z >= 1) {
      const e = Math.exp(-w * dt), c = v + w * y;
      this.x = target + (y + c * dt) * e; this.v = (v - w * c * dt) * e;
    } else {
      const wd = w * Math.sqrt(1 - z * z), e = Math.exp(-z * w * dt), co = Math.cos(wd * dt), si = Math.sin(wd * dt), B = (v + z * w * y) / wd;
      this.x = target + e * (y * co + B * si); this.v = e * ((B * wd - z * w * y) * co - (y * wd + z * w * B) * si);
    }
    return this.x;
  }
}
/** The weapon in hand is lit hotter than the world, as shooters have always done: dark coated metal under the
 * room's light sits below the post grade's black point and would read as a silhouette. */
const VM_GAIN = 2.2;
const soft = (x: number, max: number) => max * Math.tanh(x / max);
const smooth = (t: number) => t * t * (3 - 2 * t);
const wrap = (a: number) => { a = (a + Math.PI) % (Math.PI * 2); return (a < 0 ? a + Math.PI * 2 : a) - Math.PI; };

/** Recoil character per weapon: back, rise, yaw and roll impulses (spring velocities) and the bolt's cycle time. */
const KICK: Record<WeaponId, { back: number; rise: number; yaw: number; roll: number; cycle: number }> = {
  ar: { back: 0.55, rise: 1.6, yaw: 0.5, roll: 1.2, cycle: 0.06 },
  carbine: { back: 0.5, rise: 1.5, yaw: 0.55, roll: 1.3, cycle: 0.055 },
  smg: { back: 0.42, rise: 1.1, yaw: 0.5, roll: 1, cycle: 0.045 },
  shotgun: { back: 1.3, rise: 4.2, yaw: 0.9, roll: 2.4, cycle: 0.3 },
  dmr: { back: 0.85, rise: 2.8, yaw: 0.6, roll: 1.6, cycle: 0.07 },
  pistol: { back: 0.5, rise: 3.2, yaw: 0.6, roll: 1.4, cycle: 0.08 },
};

export function createHeroViewmodel(renderer: THREE.WebGLRenderer, lighting: HeroLighting): Viewmodel {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(54, 16 / 9, 0.04, 5);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x6a645c, 0.6), key = new THREE.DirectionalLight(0xffffff, 1.4), fill = new THREE.DirectionalLight(0xc8d4ff, 0.35);
  scene.add(hemi, key, fill);
  const holder = new THREE.Group(); scene.add(holder);
  // The flash's light on the weapon: always in the scene (a fixed light count), dark unless a shot is in flight.
  const flashLight = new THREE.PointLight(0xffb070, 0, 1.2, 2); holder.add(flashLight);
  if (import.meta.env?.DEV) (globalThis as { __heroVM?: unknown }).__heroVM = { scene, hemi, key, fill, camera, renderer, get timing() { return timing; } };
  // Reflections: the environment session's probe when it exists, else a neutral studio room, prefiltered once.
  let ownEnv: THREE.Texture | null = null;
  const envFor = (x: number, z: number) => lighting.environment(x, z) ?? (ownEnv ??= new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture);
  const flashTex = makeSprite('flash');
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true }));
  flash.visible = false; flash.renderOrder = 5;
  const rigs = new Map<number, FpRig>();
  let rig: FpRig | null = null, ready = false;
  // Build the arms and the first weapon while the menu is up, not on the first frame of a match.
  // The weapon in hand appears once the meshes and texture sets have settled (a baked weapon has no procedural look
  // to show meanwhile), then everything is warmed at once.
  let disposed = false;
  // Baked texture sets (KTX2 through the art loader; 1024 maps on the Low tier). Until they arrive, or if they
  // fail, the weapon keeps the procedural hero material.
  const low = typeof location !== 'undefined' && /[?&]arttier=low\b/.test(location.search);
  const art = new ArtLoader(renderer, low ? 'low' : 'high');
  const sets = new Map<WeaponId, THREE.Material>();
  const loads: Promise<unknown>[] = [heroReady];
  // `?heroclay`: weapons and arms in untextured grey clay, for the shape gates.
  const clay = typeof location !== 'undefined' && /[?&]heroclay\b/.test(location.search) ? clayMaterial() : null;
  const useSet = (id: WeaponId, m: THREE.Material) => { sets.set(id, m); for (const r of rigs.values()) r.setTextures(id, m); };
  const procedural = (id: WeaponId) => {
    const size = low ? 1024 : 2048, set = `../hero/${id}`;
    return Promise.all([art.texture(set, 'diff', size), art.texture(set, 'nor', size), art.texture(set, 'arm', size)]).then(([map, normalMap, armMap]) => {
      for (const t of [map, normalMap, armMap]) t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      useSet(id, texturedMaterial({ map, normalMap, arm: armMap }));
    }).catch(e => console.warn('Breachline weapon textures unavailable; procedural look kept.', e));
  };
  // Second-build weapons: the baked mesh and its set; the procedural model and its set if they fail to load.
  // `?heroold`: the previous procedural weapons, for side-by-side evidence.
  const old = typeof location !== 'undefined' && /[?&]heroold\b/.test(location.search);
  for (const b of old ? [] : BAKED) loads.push(loadBaked(b, art, low ? 1024 : 2048, clay).then(m => useSet(b.id, m)).catch(e => { console.warn('Breachline baked weapon unavailable; procedural model kept.', b.dir, e); return TEXTURED.has(b.id) ? procedural(b.id) : undefined; }));
  for (const id of TEXTURED) if (old || !BAKED.some(b => b.id === id)) loads.push(procedural(id));
  let armMat: THREE.Material | null = clay;
  // `?heroarms=patch`: trial of the Patch soldier's arms (scripts/breachline-assets/hero/arms-trial.ts) on the same rig.
  let armGeo: THREE.BufferGeometry | null = null;
  const armsTrial = typeof location !== 'undefined' && /[?&]heroarms=patch\b/.test(location.search);
  // The hands are the Patch "Base Hand" (Polyfork, CC BY 4.0) on our sleeve, as a two-tone glove (hand trial 2 won);
  // `?herohand=sculpt` brings back the sculpted glove and its texture set.
  const handTrial = !(typeof location !== 'undefined' && /[?&]herohand=sculpt\b/.test(location.search)) && !armsTrial;
  let handAsset: HandAsset | null = null;
  if (handTrial) loads.push(fetch(`${ART_BASE}hero/hand-trial/hand.json`).then(r => r.json()).then((h: HandAsset) => { handAsset = h; }).catch(e => console.warn('Breachline hand trial unavailable.', e)));
  if (armsTrial) loads.push((async () => {
    const buf = await (await fetch(`${ART_BASE}hero/arms-trial/arms.bin`)).arrayBuffer(), right = readMeshBin(buf).geometries.get('arm')!;
    const left = right.clone(); left.applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1));
    const ix = left.index!.array as Uint16Array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
    const si = left.getAttribute('skinIndex'); for (let i = 0; i < si.count; i++) si.setX(i, si.getX(i) + ARM_BONES);
    armGeo = mergeGeometries([right, left])!;
    const maps = await Promise.all((['diff', 'nor', 'arm'] as const).map(k => art.texture('../patch/tactical', k, 1024)));
    for (const t of maps) { t.flipY = false; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true; }
    armMat = texturedMaterial({ map: maps[0], normalMap: maps[1], arm: maps[2] });
    for (const r of rigs.values()) { r.setArmGeometry(armGeo); r.setArmMaterial(armMat); }
  })().catch(e => console.warn('Breachline arms trial unavailable.', e)));
  if (!clay && !armsTrial && !handTrial) loads.push(Promise.all((['diff', 'nor', 'arm'] as const).map(k => art.texture('../hero/hands', k, 1024))).then(([map, normalMap, armMap]) => {
    for (const t of [map, normalMap, armMap]) t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    armMat = texturedMaterial({ map, normalMap, arm: armMap }, true);
    for (const r of rigs.values()) r.setArmMaterial(armMat);
  }).catch(e => console.warn('Breachline hand textures unavailable; procedural look kept.', e)));
  const rigFor = (squad: 0 | 1) => {
    let r = rigs.get(squad);
    if (!r) { r = createFpRig(DEFAULT_LOOK(squad, Number(`0x${SQUADS[squad].color.slice(1)}`))); for (const [id, m] of sets) r.setTextures(id, m); if (armMat) r.setArmMaterial(armMat); if (armGeo) r.setArmGeometry(armGeo); if (handAsset) { r.setArmGeometry(armsWithHand(DEFAULT_LOOK(squad, Number(`0x${SQUADS[squad].color.slice(1)}`)), handAsset)); if (!clay) r.setArmMaterial(r.material); } rigs.set(squad, r); }
    return r;
  };
  /** Draws every weapon in both squads' arms once, with the flash and casings shown, into a tiny offscreen target:
   * shader programs compile and geometry and textures upload here, behind the loading screen, never at first use in
   * play. Also prefilters the fallback environment. Safe to call more than once; returns false if not ready. */
  // ---- The cheap look (weak GPUs): each material's Lambert twin, same map, colour and vertex colours ----
  let cheap = false;
  const twins = new WeakMap<THREE.Material, THREE.Material>();
  const twin = (m: THREE.Material) => {
    if (m.userData.full) return m;
    let t = twins.get(m);
    if (!t) {
      const s = m as THREE.MeshStandardMaterial;
      t = new THREE.MeshLambertMaterial({ map: s.map ?? null, color: s.color ?? 0xffffff, vertexColors: s.vertexColors, transparent: s.transparent, opacity: s.opacity, side: s.side, depthTest: s.depthTest, depthWrite: s.depthWrite });
      t.userData.full = m; twins.set(m, t);
    }
    return t;
  };
  function swapCheap(root: THREE.Object3D, on: boolean) {
    root.traverse(o => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const pick = (m: THREE.Material) => (on ? twin(m) : (m.userData.full as THREE.Material | undefined) ?? m);
      if (!Array.isArray(mesh.material)) mesh.material = pick(mesh.material);
      else if (mesh.material.some(m => pick(m) !== m)) mesh.material = mesh.material.map(pick);
    });
  }
  let warmed = false;
  function warm(): boolean {
    if (!ready || disposed) return false;
    const target = new THREE.WebGLRenderTarget(4, 4), prev = renderer.getRenderTarget(), wasVisible = holder.visible;
    scene.environment = envFor(0, 0);
    holder.visible = true; flash.visible = true;
    for (const squad of [0, 1] as const) {
      const r = rigFor(squad);
      holder.add(r.root); r.root.add(flash);
      r.gun.position.set(0.1, -0.08, -0.25);
      for (let i = 0; i < CASES; i++) r.weaponBones[WB.case0 + i].scale.setScalar(1);
      for (const id of Object.keys(WEAPONS) as WeaponId[]) {
        r.setWeapon(id); r.solve();
        renderer.setRenderTarget(target); renderer.render(scene, camera);
        // The cheap look too, so switching to it in play compiles nothing.
        swapCheap(scene, true); renderer.render(scene, camera);
        // ...and drawn straight to the screen (the lowest setting has no post pass); the next frame paints over it.
        renderer.setRenderTarget(null); renderer.render(scene, camera); renderer.setRenderTarget(target);
        swapCheap(scene, cheap);
      }
      holder.remove(r.root);
    }
    renderer.setRenderTarget(prev); target.dispose();
    holder.visible = wasVisible; flash.visible = false; rig = null; curSquad = -1;
    warmed = true;
    return true;
  }
  Promise.allSettled(loads).then(() => { ready = true; setTimeout(() => { if (!warmed && !disposed) warm(); }, 0); });
  // Motion state.
  const swayY = new Spring(14, 0.7), swayP = new Spring(14, 0.7), swayR = new Spring(12, 0.6);
  // Recoil: a stiff, quick spring for the rearward kick so it snaps back; aim: about 0.25 s with a slight settle.
  const kZ = new Spring(42, 0.62), kP = new Spring(22, 0.5), kY = new Spring(20, 0.6), kR = new Spring(18, 0.45), adsS = new Spring(13, 0.8), sprintS = new Spring(10, 1), useS = new Spring(9, 1);
  let burst = 0, lastYaw = 0, lastPitch = 0, gait = 0, cycle = 1, shots = 0, empty = false, lastReload = 0, curId: WeaponId = 'ar', curSquad = -1, swapPrev = 0, time = 0;
  const cases = Array.from({ length: CASES }, () => ({ t: 9, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3() }));
  let caseNext = 0, flashLife = 0;
  const frame = idleFrame();
  const eject = new THREE.Vector3(), tmp = new THREE.Vector3();
  // Cost of the weapon in hand, read by the evidence scripts (`__heroVM.timing`): script ms, draw calls, triangles.
  const perf = globalThis.performance ?? Date, timing = { update: 0, frames: 0, calls: 0, triangles: 0 };

  function fire(id: WeaponId) {
    const k = KICK[id], first = cycle > 0.25 ? 1.35 : 1, r = (a: number) => (Math.random() * 2 - 1) * a;
    // Rise builds over a burst: each shot within a quarter second of the last adds to it.
    burst = cycle < 0.25 ? Math.min(burst + 1, 7) : 0;
    kZ.v += k.back * 1.4 * first; kP.v += k.rise * first * (0.8 + Math.random() * 0.4) * (1 + burst * 0.12); kY.v += r(k.yaw); kR.v += r(k.roll) + k.roll * 0.25;
    // The flash lasts four frames at 60 fps, with a brief light on the weapon.
    cycle = 0; shots++; flashLife = 0.066;
    flash.scale.setScalar(0.12 + Math.random() * 0.06); (flash.material as THREE.SpriteMaterial).rotation = Math.random() * 6;
    if (id === 'shotgun') return; // the hull ejects when the pump is worked
    const c = cases[caseNext++ % CASES];
    c.t = 0; c.p.set(0, 0, 0); c.v.set(1.6 + Math.random() * 0.8, 1.1 + Math.random() * 0.6, 0.3 + Math.random() * 0.4); c.r.set(0, 0, 0); c.w.set(r(20), 25 + r(8), r(10));
  }

  /** One frame's pose of the weapon in hand (timed by `update`). */
  function updateInner(view: HeroView, clock: number) {
      const { m, dt } = view, p = m.players[view.self];
      time = clock;
      const show = ready && !!p && p.alive && view.watch === view.self && !view.menu && m.phase !== 'lobby';
      holder.visible = show;
      if (!show || !p) return;
      if (p.squad !== curSquad) { if (rig) holder.remove(rig.root); rig = rigFor(p.squad); holder.add(rig.root); rig.root.add(flash); curSquad = p.squad; curId = '' as WeaponId; }
      const r = rig!, id = weaponIdOf(m, p), def = WEAPONS[id], hold = holdFor(id);
      if (id !== curId) { r.setWeapon(id); curId = id; }
      const still = view.reduced ? 0 : 1;
      // Aim, sprint and "using something" blends.
      const adsRaw = adsS.step(p.adsT, dt), ads = smooth(Math.min(1, Math.max(0, adsRaw))), settle = Math.max(0, adsRaw - 1);
      // The stock comes to the cheek first: the weapon's travel toward the eye leads its move to the centre.
      const adsZ = smooth(Math.min(1, Math.max(0, adsRaw * 1.4)));
      const sprint = sprintS.step(p.sprint ? 1 : 0, dt), use = useS.step(p.act !== ACT.none || p.using ? 1 : 0, dt);
      // Look sway: mouse movement drives spring velocity, soft-clamped, much less when aimed.
      const dyaw = wrap(view.yaw - lastYaw), dpitch = view.pitch - lastPitch; lastYaw = view.yaw; lastPitch = view.pitch;
      if (dt > 0) { swayY.v += soft(dyaw / dt, 3) * 0.6 * still; swayP.v += soft(dpitch / dt, 3) * 0.6 * still; swayR.v += soft(dyaw / dt, 3) * 0.8 * still; }
      const sy = soft(swayY.step(0, dt), 0.08), sp = soft(swayP.step(0, dt), 0.06), sr = soft(swayR.step(0, dt), 0.1);
      // Walk bob: a figure-of-eight from the gait phase.
      gait += dt * (2.2 + Math.min(1.4, p.pace) * 7.5);
      const bobA = Math.min(1.4, p.pace) * (1 - ads * 0.85) * still * (1 + sprint * 0.8);
      // Recoil springs.
      const rz = kZ.step(0, dt), rp = kP.step(0, dt), ry = kY.step(0, dt), rr = kR.step(0, dt);
      // Reload: latch empty or tactical when it starts.
      if (p.reload > 0 && lastReload <= 0) empty = p.mag[p.slot] === 0;
      lastReload = p.reload;
      const reloading = p.reload > 0;
      if (reloading) reloadFrame(id, Math.min(1, 1 - p.reload / def.reload), empty, frame); else Object.assign(frame, idleFrame());
      // Firing cycle: bolt back and forward; locked back when empty.
      cycle += dt;
      const kc = KICK[id], boltT = cycle < kc.cycle ? Math.sin(Math.PI * cycle / kc.cycle) : 0;
      const locked = !reloading && p.mag[p.slot] === 0 && id !== 'shotgun' ? 1 : 0;
      r.weaponBones[WB.bolt].position.z = 0;
      frame.bolt = Math.max(frame.bolt, boltT, locked);
      if (id === 'shotgun' && cycle > 0.12 && cycle < 0.5) { const t = (cycle - 0.12) / 0.38; frame.handle = Math.max(frame.handle, Math.sin(Math.PI * t)); frame.hand = [frame.hand[0], frame.hand[1], frame.hand[2], frame.hand[3]]; }
      r.weaponBones[WB.trigger].rotation.x = cycle < 0.08 ? -0.25 : 0;
      // Compose the weapon's pose in camera space.
      // Dev only: `__heroHip` overrides the hip placement, to try holds in the game (evidence script).
      const H = (import.meta.env?.DEV && (globalThis as { __heroHip?: { p: [number, number, number]; r: [number, number, number] } }).__heroHip) || hold.hip, x0 = H.p[0] * (1 - ads), y0 = H.p[1] * (1 - ads) - settle * 0.03, z0 = H.p[2] + (hold.adsZ - H.p[2]) * adsZ;
      const arc = Math.sin(Math.PI * ads) * 0.008;
      let x = x0 - arc * 0.5, y = y0 - arc, z = z0;
      let ax = H.r[0] * (1 - ads), ay = H.r[1] * (1 - ads), az = H.r[2] * (1 - ads);
      x += Math.sin(gait) * 0.006 * bobA - sy * 0.25 * (1 - ads * 0.6); y += -Math.abs(Math.cos(gait)) * 0.008 * bobA + Math.sin(time * 1.6) * 0.0012 * still * (1 - ads * 0.7) - sp * 0.2 * (1 - ads * 0.6);
      ay += sy * (1 - ads * 0.85); ax += sp * (1 - ads * 0.85); az += -sr * 0.6 * (1 - ads * 0.7) + Math.sin(gait) * 0.01 * bobA - p.lean * 0.1;
      // Sprint: carried across the chest, muzzle down and left. Using: lowered out of the way.
      x -= sprint * 0.05; y -= sprint * 0.035 + use * 0.24; z += sprint * 0.03; ay += sprint * 0.62; ax -= sprint * 0.28 + use * 0.5; az += sprint * 0.25;
      // Swap: down and back up. Melee: a forward bash.
      // Swap: the weapon rolls out (and the next one in) low on the right, the holster side.
      if (p.swap > 0) { const t = smooth(p.swap / 0.42); x += t * 0.1; y -= t * 0.24; ax -= t * 0.45; ay -= t * 0.3; az -= t * 0.85; }
      if (p.swap > swapPrev) cycle = 1;
      swapPrev = p.swap;
      if (p.meleeCool > 0.4) { const t = Math.sin(Math.PI * (0.75 - p.meleeCool) / 0.35); z -= t * 0.16; ay -= t * 0.45; x -= t * 0.06; ax += t * 0.15; }
      // Reload's extra pose, recoil last.
      x += frame.gunP[0]; y += frame.gunP[1]; z += frame.gunP[2]; ax += frame.gunR[0]; ay += frame.gunR[1]; az += frame.gunR[2];
      const recoilScale = 1 - ads * 0.45;
      z += rz * 0.035 * recoilScale; ax += rp * 0.025 * recoilScale; ay += ry * 0.012; az += rr * 0.02;
      r.gun.position.set(x, y, z); r.gun.rotation.set(ax, ay, az, 'XYZ');
      r.solve(frame);
      // Casings: a short ballistic arc out of the port, then gone (the world's casings are the effects' job).
      const S = r.weapon.sockets;
      eject.set(...S.eject);
      for (let i = 0; i < CASES; i++) {
        const c = cases[i], b = r.weaponBones[WB.case0 + i];
        if (c.t > 0.6) { b.scale.setScalar(0); continue; }
        c.t += dt; c.v.y -= 9.8 * dt; c.p.addScaledVector(c.v, dt); c.r.x += c.w.x * dt; c.r.y += c.w.y * dt; c.r.z += c.w.z * dt;
        // The case is bound at the port; its bone carries it along its arc (weapon space, ignoring the gun's own motion).
        b.position.copy(c.p); b.rotation.copy(c.r); b.scale.setScalar(1);
        tmp.copy(eject);
      }
      // Light from the probe where the shooter stands; the key from the sun direction, dimmed indoors by the probe.
      const l = lighting.probe(p.x, 1.4, p.z).color, lum = (l[0] + l[1] + l[2]) / 3;
      // Diffuse: the probe's light with a floor so nothing goes to black.
      hemi.color.setRGB(0.12 + l[0] * 1.05, 0.12 + l[1] * 1.05, 0.12 + l[2] * 1.05); hemi.intensity = VM_GAIN * 1.5; hemi.groundColor.setRGB(0.06 + l[0] * 0.45, 0.06 + l[1] * 0.42, 0.06 + l[2] * 0.4);
      const sc = lighting.sun.color; key.color.setRGB(sc[0] / 1.55, sc[1] / 1.55, sc[2] / 1.55);
      key.intensity = VM_GAIN * (0.6 + Math.min(2, lum * 1.8)); fill.intensity = VM_GAIN * 0.4;
      // Sun direction in camera space: rotate the world direction by the inverse view yaw.
      const sy0 = Math.sin(view.yaw), cy0 = Math.cos(view.yaw), s = lighting.sun;
      // Indoors the light comes from the ceiling fittings: the key leans toward overhead and slightly ahead, so the
      // rail, the optic and the receiver's top edges catch a highlight; outdoors it follows the sun.
      const indoor = lighting.environment(p.x, p.z) ? 0.75 : 0.45;
      key.position.set((s.x * cy0 - s.z * sy0) * (1 - indoor) + 0.15 * indoor, Math.max(0.35, s.y) * (1 - indoor) + 1 * indoor, (s.x * sy0 + s.z * cy0) * (1 - indoor) - 0.35 * indoor);
      fill.position.set(-key.position.x, 0.3, -key.position.z);
      // Specular only (see material.ts), scaled into the probe's units.
      scene.environment = envFor(p.x, p.z); scene.environmentIntensity = VM_GAIN * (lighting.environment(p.x, p.z) ? lighting.environmentScale(p.x, p.z) : 1) * Math.max(0.35, Math.min(1.6, lum * 1.2));
      // Muzzle flash at the muzzle socket.
      const scoped = id === 'dmr' && ads > 0.9;
      // Dev only: `__heroFlashHold` keeps the flash up, so a slow capture can show where it sits.
      if (import.meta.env?.DEV && (globalThis as { __heroFlashHold?: boolean }).__heroFlashHold && shots > 0) flashLife = Math.max(flashLife, 0.05 + dt);
      if (flashLife > 0) { flashLife -= dt; flash.visible = flashLife > 0 && !scoped; muzzleInView(r.gun, S.muzzle, tmp); r.root.worldToLocal(tmp); flash.position.copy(tmp); }
      else flash.visible = false;
      flashLight.intensity = flash.visible ? VM_GAIN * 1.6 : 0; flashLight.position.copy(flash.position).applyMatrix4(r.root.matrix);
      r.gun.visible = !scoped;
      for (const a of r.root.children) if ((a as THREE.SkinnedMesh).isSkinnedMesh) a.visible = !scoped;
      camera.fov = 54 - ads * 8; camera.updateProjectionMatrix();
      void shots;
    }

  return {
    get visible() { return holder.visible; },
    warm,
    setCheap(on: boolean) { if (on !== cheap) { cheap = on; swapCheap(scene, on); } },
    update(view: HeroView, clock: number) {
      const t0 = perf.now();
      updateInner(view, clock);
      timing.update += perf.now() - t0; timing.frames++;
    },
    muzzle(out: THREE.Vector3, world: THREE.Camera) {
      if (!holder.visible || !rig) return false;
      return !!viewToWorld(muzzleInView(rig.gun, rig.weapon.sockets.muzzle, tmp), camera, world, out);
    },
    handle(events: readonly SimEvent[], m: Match, self: number) {
      for (const e of events) if (e.e === 'shot' && e.id === self && m.players[self]) fire(e.w);
    },
    render() {
      if (!holder.visible) return 0;
      if (cheap) swapCheap(scene, true); // a weapon or rig made since then
      renderer.clearDepth();
      const c0 = renderer.info.render.calls, t0 = renderer.info.render.triangles;
      renderer.render(scene, camera);
      const r = renderer.info.autoReset; // with auto reset the counts start again at each render
      timing.calls = renderer.info.render.calls - (r ? 0 : c0); timing.triangles = renderer.info.render.triangles - (r ? 0 : t0);
      return renderer.info.render.calls;
    },
    resize(aspect: number) { camera.aspect = aspect; camera.updateProjectionMatrix(); },
    dispose() {
      disposed = true;
      for (const r of rigs.values()) r.dispose();
      flashTex.dispose(); (flash.material as THREE.Material).dispose(); ownEnv?.dispose();
      for (const m of sets.values()) m.dispose(); armMat?.dispose(); art.dispose();
    },
  };
}
