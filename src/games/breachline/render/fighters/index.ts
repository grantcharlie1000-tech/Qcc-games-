/** The fighters in the world: every visible player's body, kit, weapon and animation, posed from the simulation's
 * fields. `render/hero/index.ts` re-exports `createFighters` from here; the interfaces stay there.
 *
 * Each fighter is one skinned mesh (body and kit, one draw call) per level of detail sharing one skeleton, plus its
 * weapon (one draw call). Levels are chosen by distance from the camera with a budget: at most four fighters get full
 * detail, so ten in view stay under 60k triangles. Meshes are built lazily, one per frame, cheapest first, so the
 * first frame never stalls; until a fighter's level exists it shows the nearest level that does. */
import * as THREE from 'three';
import { WEAPONS, type WeaponId } from '../../config';
import { weaponIdOf } from '../../state';
import { makeSprite } from '../../textures';
import { heroReady } from '../hero/geom';
import type { Fighters, HeroLighting } from '../hero/index';
import type { Match, SimEvent } from '../../state';
import { Animator, idleInput, type PoseInput } from './anim';
import { figureGeometry, figureBuilt } from './figure';
import { SCALE, makeBones } from './skeleton';
import { WEAPON_BONES } from '../hero/weapons';
import { BAKED, loadFighterTextures, texturedFighterMaterial, texturedGeometry, type FighterTextures, type TexturedFighterMaterial } from './textures';
import { weaponFor } from './weapon';
import { fighterMaterial, type FighterMaterial } from './material';

/** Distances (m) at which a fighter drops to the next level; and how many may have full detail at once. */
export const LOD_DIST = [7, 18] as const;
export const LOD0_MAX = 4;
/** How strongly the light probe's colour lights a fighter, on top of the scene's run-time sun and sky lights. */
const PROBE_GAIN = 0.6;
/** Fill every fighter gets on top of the probe (shade under the yard walls is near zero in the bake). */
const SHADE_FILL = 0.8;
/** Baked albedo carries its own occlusion and is lighter than the vertex colours: less fill for it. */
const BAKED_GAIN = 0.42;

interface Fig {
  squad: 0 | 1; group: THREE.Group; meshes: (THREE.SkinnedMesh | null)[]; skeleton: THREE.Skeleton; bones: THREE.Bone[];
  weapon: THREE.SkinnedMesh; weaponBones: THREE.Bone[]; wid: WeaponId; anim: Animator; mat: FighterMaterial; weaponMat: FighterMaterial; wlod: 1 | 2;
  x: number; z: number; yaw: number; pitch: number; crouch: number; lean: number; phase: number;
  fresh: boolean; lod: number; remoteReload: number; deathKind: number; tmats: (TexturedFighterMaterial | null)[]; texVersion: number; dist: number; reloadEmpty: boolean; wasReloading: boolean; input: PoseInput;
}

const wrap = (a: number) => { a = (a + Math.PI) % (Math.PI * 2); return (a < 0 ? a + Math.PI * 2 : a) - Math.PI; };

/** `Fighters` plus the match-event hook the scene forwards to (optional on the scene's side). */
export interface FightersWithEvents extends Fighters { handle(events: readonly SimEvent[], m: Match, self: number): void }

export function createFighters(scene: THREE.Scene, lighting: HeroLighting): FightersWithEvents {
  const figs: (Fig | null)[] = [];
  let ready = false;
  heroReady.then(() => { ready = true; });
  // Contact shadow under each fighter (until the sun shadow reaches them), stretched when they lie down.
  const blobTex = makeSprite('blob');
  const blobGeo = new THREE.PlaneGeometry(1, 1); blobGeo.rotateX(-Math.PI / 2);
  const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.7 });
  const blobs = new THREE.InstancedMesh(blobGeo, blobMat, 10);
  blobs.frustumCulled = false; blobs.renderOrder = 1; scene.add(blobs);
  // The camera's position, captured when the scene renders (one frame late), for choosing levels of detail.
  const cam = new THREE.Vector3(NaN, 0, 0);
  // Baked texture sets, loaded once the renderer is known (the first frame); until then the procedural look.
  const baked: (FighterTextures | null)[] = [null, null];
  let texVersion = 0, texStarted = false;
  blobs.onBeforeRender = (renderer, _s, camera) => {
    cam.setFromMatrixPosition(camera.matrixWorld);
    if (texStarted) return;
    texStarted = true;
    for (const squad of [0, 1] as const) {
      if (!BAKED[squad]) continue;
      loadFighterTextures(renderer, squad).then(t => { baked[squad] = t; texVersion++; }).catch(err => console.warn('Breachline fighters: baked textures unavailable, keeping the procedural look', err));
    }
  };
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
  const color = new THREE.Color();
  // Build queue: [squad, lod] pairs still to build, cheapest first.
  const queue: [0 | 1, number][] = [];
  const want = (squad: 0 | 1, lod: number) => { if (!figureBuilt(squad, lod) && !queue.some(q => q[0] === squad && q[1] === lod)) queue.push([squad, lod]); queue.sort((a, b) => b[1] - a[1]); };

  function weaponMesh(f: Fig, id: WeaponId, lod: 1 | 2) {
    const w = weaponFor(id, lod);
    f.weapon.geometry = w.geo; f.wid = id; f.wlod = lod; f.anim.setWeapon(id, w);
  }

  function figFor(i: number, squad: 0 | 1, wid: WeaponId): Fig {
    let f = figs[i];
    if (f && f.squad === squad) return f;
    if (f) drop(f);
    const group = new THREE.Group(), bones = makeBones();
    // The root bone hangs off a holder so all levels share one skeleton. Inverses come from the bind pose in model
    // space (the holder alone, unscaled); each level binds with an identity bind matrix in attached mode, so a vertex
    // ends up at bone world * inverse * position, carrying the group's position, yaw and scale.
    const holder = new THREE.Object3D(); holder.add(bones[0]); holder.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(bones);
    group.scale.setScalar(SCALE); group.add(holder);
    const mat = fighterMaterial(), weaponMat = fighterMaterial();
    const w = weaponFor(wid), wb = Array.from({ length: WEAPON_BONES }, () => new THREE.Bone());
    const weapon = new THREE.SkinnedMesh(w.geo, weaponMat); weapon.add(...wb); weapon.bind(new THREE.Skeleton(wb)); weapon.frustumCulled = false;
    group.add(weapon);
    scene.add(group);
    const anim = new Animator(bones, weapon, wb, w);
    f = { squad, group, meshes: [null, null, null], skeleton, bones, weapon, weaponBones: wb, wid, anim, mat, weaponMat, x: 0, z: 0, yaw: 0, pitch: 0, crouch: 0, lean: 0, phase: 0, fresh: true, lod: 2, wlod: 1, remoteReload: 0, deathKind: -1, tmats: [null, null, null], texVersion: 0, dist: 0, reloadEmpty: false, wasReloading: false, input: idleInput() };
    anim.setWeapon(wid, w);
    figs[i] = f;
    for (const l of [2, 1, 0]) want(squad, l);
    return f;
  }
  /** The mesh for a level, made on first use from the built geometry (sharing the fighter's skeleton). */
  function meshFor(f: Fig, lod: number): THREE.SkinnedMesh | null {
    if (f.meshes[lod]) return f.meshes[lod];
    if (!figureBuilt(f.squad, lod)) return null;
    // The baked set when it has arrived and matches this mesh; otherwise the procedural material.
    const t = baked[f.squad], tg = t ? texturedGeometry(t, lod, () => figureGeometry(f.squad, lod).geo) : null;
    let mat: THREE.Material = f.mat;
    if (t && tg) { const tm = (f.tmats[lod] ??= texturedFighterMaterial(t.levels[lod]!.maps)); tm.envMap = f.mat.envMap; mat = tm; }
    const mesh = new THREE.SkinnedMesh(tg ?? figureGeometry(f.squad, lod).geo, mat);
    mesh.frustumCulled = false; mesh.castShadow = true;
    mesh.bind(f.skeleton, new THREE.Matrix4());
    f.group.add(mesh);
    f.meshes[lod] = mesh;
    return mesh;
  }
  function drop(f: Fig) {
    scene.remove(f.group); f.mat.dispose(); f.weaponMat.dispose(); for (const m of f.tmats) m?.dispose();
  }

  return {
    update(view) {
      const { m, dt } = view, k = 1 - Math.exp(-dt * 16);
      if (!ready) { for (const f of figs) if (f) f.group.visible = false; return; }
      // One mesh build per frame at most.
      const job = queue.shift();
      if (job) figureGeometry(job[0], job[1]);
      const camOk = Number.isFinite(cam.x);
      const order: Fig[] = [];
      let blob = 0;
      for (let i = 0; i < Math.max(figs.length, m.players.length); i++) {
        const p = m.players[i];
        if (!p || m.phase === 'lobby') { const f = figs[i]; if (f) f.group.visible = false; continue; }
        const wid = weaponIdOf(m, p), f = figFor(i, p.squad, wid), local = i === view.self;
        if (f.wid !== wid) weaponMesh(f, wid, f.wlod);
        const tx = local ? view.px + (p.x - view.px) * view.alpha : p.x, tz = local ? view.pz + (p.z - view.pz) * view.alpha : p.z;
        const snap = f.fresh || local || Math.hypot(tx - f.x, tz - f.z) > 4;
        if (snap) { f.x = tx; f.z = tz; f.yaw = local ? view.yaw : p.yaw; f.pitch = local ? view.pitch : p.pitch; f.crouch = p.crouch; f.lean = p.lean; }
        else { f.x += (tx - f.x) * k; f.z += (tz - f.z) * k; f.yaw += wrap(p.yaw - f.yaw) * k; f.pitch += (p.pitch - f.pitch) * k; f.crouch += (p.crouch - f.crouch) * k; f.lean += (p.lean - f.lean) * k; }
        const show = !(i === view.watch && p.alive) && !view.menu;
        f.group.visible = show;
        // Pose input from the simulation (reload timing is only known for fighters this device runs).
        const def = WEAPONS[wid], reloading = p.reload > 0;
        if (reloading && !f.wasReloading) f.reloadEmpty = p.mag[p.slot] === 0;
        f.wasReloading = reloading;
        const inp = f.input;
        inp.x = f.x; inp.z = f.z; inp.yaw = f.yaw; inp.pitch = f.pitch; inp.crouch = f.crouch; inp.lean = f.lean;
        inp.alive = p.alive; inp.pace = p.pace; inp.sprint = p.sprint; inp.ads = p.ads; f.remoteReload = Math.max(0, f.remoteReload - dt);
        inp.reload = reloading ? p.reload / def.reload : f.remoteReload > 0 ? f.remoteReload / def.reload : 0; inp.empty = f.reloadEmpty;
        inp.deathKind = p.alive ? (f.deathKind = -1) : f.deathKind;
        inp.act = p.act; inp.actT = p.actT; inp.hp = p.hp; inp.deaths = p.deaths;
        if (f.fresh) { f.anim.reset(inp); f.fresh = false; }
        if (!show) continue;
        f.anim.update(inp, dt);
        f.phase = f.anim.gaitPhase * Math.PI * 2;
        f.group.position.set(f.anim.root.x, 0, f.anim.root.z); f.group.rotation.y = f.anim.yaw;
        // Light from the probe at the fighter, as a tint on its material; reflections from the room's probe.
        // Diffuse: the light probe at the fighter, as indirect irradiance. Specular: the room's reflection probe,
        // scaled to the room (bake units differ from a studio environment).
        const l = lighting.probe(f.x, 1.1, f.z).color;
        // A floor on the fill, so a fighter in deep shade keeps fabric, webbing, polymer and skin apart.
        // Irradiance reaches diffuse as albedo * E / pi, so a 0.1 albedo beside walls baked to about 0.15 needs E near 4.
        color.setRGB(SHADE_FILL + l[0] * PROBE_GAIN, SHADE_FILL + l[1] * PROBE_GAIN, SHADE_FILL * 1.06 + l[2] * PROBE_GAIN).multiplyScalar(Math.PI);
        f.mat.userData.probe.value.copy(color); f.weaponMat.userData.probe.value.copy(color);
        for (const tm of f.tmats) if (tm) tm.userData.probe.value.copy(color).multiplyScalar(BAKED_GAIN);
        const env = lighting.environment(f.x, f.z), es = lighting.environmentScale(f.x, f.z) * 0.8;
        if (f.mat.envMap !== env) { f.mat.envMap = env; f.weaponMat.envMap = env; f.mat.needsUpdate = f.weaponMat.needsUpdate = true; for (const tm of f.tmats) if (tm) { tm.envMap = env; tm.needsUpdate = true; } }
        f.mat.envMapIntensity = f.weaponMat.envMapIntensity = es;
        for (const tm of f.tmats) if (tm) tm.envMapIntensity = es;
        // When a baked set arrives, remake this fighter's meshes with it.
        if (f.texVersion !== texVersion) { f.texVersion = texVersion; f.meshes.forEach((ms, l) => { if (ms) { f.group.remove(ms); f.meshes[l] = null; } }); }
        f.dist = camOk ? Math.hypot(cam.x - f.x, cam.y - 1.2, cam.z - f.z) : Math.hypot(view.px - f.x, view.pz - f.z);
        order.push(f);
        if (blob < 10) { const lie = p.alive ? 0 : 0.9; blobs.setMatrixAt(blob++, m4.compose(v3.set(f.x, 0.04, f.z), q4.identity(), s3.set(1.0 + lie, 1, 1.0 + lie))); }
      }
      // Levels of detail by distance, full detail for the nearest few only.
      order.sort((a, b) => a.dist - b.dist);
      order.forEach((f, n) => {
        let lod = f.dist < LOD_DIST[0] && n < LOD0_MAX ? 0 : f.dist < LOD_DIST[1] ? 1 : 2;
        // Use the nearest built level until the wanted one exists.
        let mesh: THREE.SkinnedMesh | null = null;
        for (const l of [lod, lod + 1, lod + 2, lod - 1, lod - 2]) { if (l < 0 || l > 2) continue; mesh = meshFor(f, l); if (mesh) { lod = l; break; } }
        f.lod = lod;
        const wl = lod === 2 ? 2 : 1;
        if (f.wlod !== wl) weaponMesh(f, f.wid, wl);
        f.meshes.forEach((ms, l) => { if (ms) ms.visible = l === lod; });
      });
      for (let i = blob; i < 10; i++) blobs.setMatrixAt(i, m4.makeScale(0, 0, 0));
      blobs.instanceMatrix.needsUpdate = true;
    },
    pose(i) { return figs[i] ?? null; },
    muzzle(i, out) {
      const f = figs[i];
      if (!f || !f.group.visible) return false;
      // The scene asks for the muzzle exactly when this fighter fires: that is the recoil cue.
      f.anim.fire();
      f.weapon.updateWorldMatrix(true, false);
      out.copy(f.anim.w.muzzle).applyMatrix4(f.weapon.matrixWorld);
      return true;
    },
    /** Match events (forwarded by the scene when it does): a remote fighter's reload starts the reload animation, a
     * kill picks the death by where the shot came from (front: falls back; behind: falls forward; side: spins). */
    handle(events: readonly SimEvent[], m: Match, self: number) {
      for (const e of events) {
        if (e.e === 'reload' && e.id !== self) { const f = figs[e.id], p = m.players[e.id]; if (f && p && p.reload <= 0) { f.remoteReload = WEAPONS[weaponIdOf(m, p)].reload; f.reloadEmpty = p.mag[p.slot] === 0; } }
        else if (e.e === 'kill') {
          const f = figs[e.on], v = m.players[e.on], k = m.players[e.by];
          if (!f || !v || !k || e.by === e.on) continue;
          // Angle of the killer seen from the victim, relative to the victim's facing (yaw 0 looks along -Z).
          const a = wrap(Math.atan2(-(k.x - v.x), -(k.z - v.z)) - v.yaw);
          f.deathKind = Math.abs(a) < 0.9 ? 0 : Math.abs(a) > 2.3 ? 1 : 2;
        }
      }
    },
    reset(ids) {
      if (!ids) { for (const f of figs) if (f) f.fresh = true; return; }
      for (const id of ids) { const f = figs[id]; if (f) f.fresh = true; }
    },
    dispose() {
      for (const f of figs) if (f) drop(f);
      scene.remove(blobs); blobGeo.dispose(); blobMat.dispose(); blobTex.dispose();
    },
  };
}
