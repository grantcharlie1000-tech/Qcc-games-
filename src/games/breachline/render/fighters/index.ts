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
import { heroMaterial } from '../hero/material';
import type { Fighters, HeroLighting } from '../hero/index';
import { Animator, idleInput, type PoseInput } from './anim';
import { figureGeometry, figureBuilt } from './figure';
import { SCALE, makeBones } from './skeleton';
import { standInWeapon } from './weapon';

/** Distances (m) at which a fighter drops to the next level; and how many may have full detail at once. */
export const LOD_DIST = [7, 18] as const;
export const LOD0_MAX = 4;
/** The world's run-time lights are tuned for flat Lambert boxes; physically based fabric under them needs this gain
 * to sit at the same brightness as the walls around it. */
const LIGHT_GAIN = 1.45;

interface Fig {
  squad: 0 | 1; group: THREE.Group; meshes: (THREE.SkinnedMesh | null)[]; skeleton: THREE.Skeleton; bones: THREE.Bone[];
  weapon: THREE.SkinnedMesh; weaponBones: THREE.Bone[]; wid: WeaponId; anim: Animator; mat: THREE.MeshStandardMaterial; weaponMat: THREE.MeshStandardMaterial;
  x: number; z: number; yaw: number; pitch: number; crouch: number; lean: number; phase: number;
  fresh: boolean; lod: number; dist: number; reloadEmpty: boolean; wasReloading: boolean; input: PoseInput;
}

const wrap = (a: number) => { a = (a + Math.PI) % (Math.PI * 2); return (a < 0 ? a + Math.PI * 2 : a) - Math.PI; };

export function createFighters(scene: THREE.Scene, lighting: HeroLighting): Fighters {
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
  blobs.onBeforeRender = (_r, _s, camera) => { cam.setFromMatrixPosition(camera.matrixWorld); };
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
  const color = new THREE.Color();
  // Build queue: [squad, lod] pairs still to build, cheapest first.
  const queue: [0 | 1, number][] = [];
  const want = (squad: 0 | 1, lod: number) => { if (!figureBuilt(squad, lod) && !queue.some(q => q[0] === squad && q[1] === lod)) queue.push([squad, lod]); queue.sort((a, b) => b[1] - a[1]); };

  function weaponMesh(f: Fig, id: WeaponId) {
    const w = standInWeapon(id);
    f.weapon.geometry = w.geo; f.wid = id; f.anim.setWeapon(id, w);
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
    const mat = heroMaterial(), weaponMat = heroMaterial();
    const w = standInWeapon(wid), wb = [new THREE.Bone(), new THREE.Bone()];
    const weapon = new THREE.SkinnedMesh(w.geo, weaponMat); weapon.add(wb[0], wb[1]); weapon.bind(new THREE.Skeleton(wb)); weapon.frustumCulled = false;
    group.add(weapon);
    scene.add(group);
    const anim = new Animator(bones, weapon, wb, w);
    f = { squad, group, meshes: [null, null, null], skeleton, bones, weapon, weaponBones: wb, wid, anim, mat, weaponMat, x: 0, z: 0, yaw: 0, pitch: 0, crouch: 0, lean: 0, phase: 0, fresh: true, lod: 2, dist: 0, reloadEmpty: false, wasReloading: false, input: idleInput() };
    anim.setWeapon(wid, w);
    figs[i] = f;
    for (const l of [2, 1, 0]) want(squad, l);
    return f;
  }
  /** The mesh for a level, made on first use from the built geometry (sharing the fighter's skeleton). */
  function meshFor(f: Fig, lod: number): THREE.SkinnedMesh | null {
    if (f.meshes[lod]) return f.meshes[lod];
    if (!figureBuilt(f.squad, lod)) return null;
    const mesh = new THREE.SkinnedMesh(figureGeometry(f.squad, lod).geo, f.mat);
    mesh.frustumCulled = false; mesh.castShadow = true;
    mesh.bind(f.skeleton, new THREE.Matrix4());
    f.group.add(mesh);
    f.meshes[lod] = mesh;
    return mesh;
  }
  function drop(f: Fig) {
    scene.remove(f.group); f.mat.dispose(); f.weaponMat.dispose();
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
        if (f.wid !== wid) weaponMesh(f, wid);
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
        inp.alive = p.alive; inp.pace = p.pace; inp.sprint = p.sprint; inp.ads = p.ads; inp.reload = reloading ? p.reload / def.reload : 0; inp.empty = f.reloadEmpty;
        inp.act = p.act; inp.actT = p.actT; inp.hp = p.hp; inp.deaths = p.deaths;
        if (f.fresh) { f.anim.reset(inp); f.fresh = false; }
        if (!show) continue;
        f.anim.update(inp, dt);
        f.phase = f.anim.gaitPhase * Math.PI * 2;
        f.group.position.set(f.anim.root.x, 0, f.anim.root.z); f.group.rotation.y = f.anim.yaw;
        // Light from the probe at the fighter, as a tint on its material; reflections from the room's probe.
        const l = lighting.probe(f.x, 1.1, f.z).color;
        color.setRGB(Math.min(2.6, (0.25 + l[0] * 1.15) * LIGHT_GAIN), Math.min(2.6, (0.25 + l[1] * 1.15) * LIGHT_GAIN), Math.min(2.6, (0.25 + l[2] * 1.15) * LIGHT_GAIN));
        f.mat.color.copy(color); f.weaponMat.color.copy(color);
        const env = lighting.environment(f.x, f.z);
        if (f.mat.envMap !== env) { f.mat.envMap = env; f.weaponMat.envMap = env; f.mat.needsUpdate = f.weaponMat.needsUpdate = true; }
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
