/** Fighters built from the Patch "Tactical soldier in black" (CC-BY-4.0, see docs/evidence/breachline/patch-trial/STATUS.md),
 * behind the `?fighters=patch` switch. Same interface and contracts as `render/fighters/index.ts`
 * (`FightersWithEvents`): the fighters' own skeleton, animator and world weapons are imported, not copied; only the
 * body and headgear differ.
 *
 * Assets (prepared offline by scripts/breachline-assets/patch-trial/, loaded through ArtLoader):
 * - patch/tactical/body-skinned.glb: three levels (8,000 / 3,200 / 1,200 triangles) already in the skeleton's bind
 *   pose, weighted to its bones; one texture set shared by both squads (diff 2048, nor/arm/mask 1024), each squad
 *   recoloured in the shader by remapping luminance through the mask (R kit, G keep).
 * - patch/headgear/headgear.glb: squad A steel helmet and goggles, squad B headset, three levels each, plain
 *   coloured, in head-bone space.
 * Levels of detail and their budget follow the stock fighters (`LOD_DIST`, `LOD0_MAX`). Everything is built and every
 * program compiled in `warm()`; nothing is created during play. If the assets cannot load, the stock fighters take
 * over, so the switch can never leave a match without fighters. */
import * as THREE from 'three';
import { WEAPONS, type WeaponId } from '../../config';
import { weaponIdOf, type Match, type SimEvent } from '../../state';
import { makeSprite } from '../../textures';
import { heroReady } from '../hero/geom';
import type { HeroLighting } from '../hero/index';
import { WEAPON_BONES } from '../hero/weapons';
import { ArtLoader } from '../assets';
import { Animator, idleInput, type PoseInput } from '../fighters/anim';
import { B, SCALE, makeBones } from '../fighters/skeleton';
import { weaponFor } from '../fighters/weapon';
import { fighterMaterial, type FighterMaterial } from '../fighters/material';
import { LOD_DIST, LOD0_MAX, createFighters, type FightersWithEvents } from '../fighters/index';

/** Probe gains as the stock fighters use them (not exported there). The stock baked sets carry their own occlusion
 * and are lighter, so they take 0.42 of the probe; this albedo is not baked-light (near-black kit), so it takes all
 * of it (checked in the game: at 0.42 the figures read as silhouettes outdoors). */
const PROBE_GAIN = 0.6, SHADE_FILL = 0.8;
/** The body's share of the probe (set by comparing game frames; `?patchgain=` overrides it while tuning). */
const BODY_GAIN = Number(typeof location === 'undefined' ? NaN : new URLSearchParams(location.search).get('patchgain')) || 0.75;
const SET = '../patch/tactical';

/** Squad looks: the darkest and lightest each class reaches (sRGB), cloth weave and stain strength. */
export const PATCH_LOOKS = [
  // Squad 0: dark slate cloth (linear albedo about 0.08 at the middle of its range), kit darker and glossier, light dust.
  { fat: [0x262b30, 0x6a737c], kit: [0x16181a, 0x45484d], kitGloss: 0.72, dirt: 0x7a7468, dirtAmt: 0.35, weave: 0.10, stain: 0.16, headgear: ['helmetA', 'gogglesA'] },
  // Squad 1: coyote cloth (about 0.27), olive kit darker than the cloth, both desaturated, darker mud.
  { fat: [0x4e4132, 0xc4b296], kit: [0x2f3224, 0x77795e], kitGloss: 0.85, dirt: 0x4f4232, dirtAmt: 0.45, weave: 0.10, stain: 0.22, headgear: ['headsetB'] },
] as const;
/** Rim light from the probe, as a fraction of it, at grazing angles (separates edges from dark walls). */
const RIM = 0.35;

interface Maps { map: THREE.Texture; normalMap: THREE.Texture; arm: THREE.Texture; mask: THREE.Texture }
interface Assets { body: THREE.BufferGeometry[]; maps: Maps; lumRange: { fatigues: number[]; kit: number[] }; headgear: { geo: THREE.BufferGeometry; set: string; lod: number; color: string; roughness: number; metalness: number; opacity: number }[] }
type ProbeMaterial = THREE.MeshStandardMaterial & { userData: { probe: { value: THREE.Color } } };

/** Probe lighting as the stock baked material does it: the reflection probe for specular only, the light probe as
 * uniform diffuse irradiance (`uProbe`). `extra` edits the fragment shader further. */
function probeMaterial(params: THREE.MeshStandardMaterialParameters, key: string, extra?: (fs: string) => string, uniforms: Record<string, THREE.IUniform> = {}): ProbeMaterial {
  const m = new THREE.MeshStandardMaterial(params) as ProbeMaterial, probe = { value: new THREE.Color(0.5, 0.5, 0.5) };
  m.userData.probe = probe;
  m.customProgramCacheKey = () => key;
  m.onBeforeCompile = shader => {
    shader.uniforms.uProbe = probe; Object.assign(shader.uniforms, uniforms);
    const maps = THREE.ShaderChunk.lights_fragment_maps.replace(/iblIrradiance \+= getIBLIrradiance\( geometryNormal \);/, '');
    let fs = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uProbe;').replace('#include <lights_fragment_maps>', `${maps}
// The probe as a sky-weighted directional term: the (normal-mapped) normal bends it, upward faces get more, undersides
// less; plus a rim at grazing angles.
{ vec3 nW = inverseTransformDirection(normal, viewMatrix); float rim = pow(1.0 - saturate(dot(normal, geometryViewDir)), 3.0);
  iblIrradiance += uProbe * (0.6 + 0.5 * nW.y + ${RIM.toFixed(2)} * rim); }`);
    if (extra) { fs = extra(fs); shader.vertexShader = 'varying vec3 vObjP; varying vec3 vObjN;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjP = position; vObjN = normal;'); }
    shader.fragmentShader = fs;
  };
  return m;
}

/** The body material for a squad. Recolour by luminance remap: each class's source luminance (sRGB-encoded) is centred
 * on its median and spread over a fifth of its 2..98% range, then mapped between the look's dark and light colours,
 * so folds, seams and wear survive; plus a 2.5 mm object-space weave, a faint two-octave stain, a steeper curve for
 * kit and darker soles. Texels the mask's G channel marks (balaclava, eye band, gloves) keep their own colour. */
function bodyMaterial(a: Assets, squad: 0 | 1): ProbeMaterial {
  const L = PATCH_LOOKS[squad], enc = (x: number) => Math.pow(Math.max(x, 1e-6), 1 / 2.2);
  const u = {
    dirtC: { value: new THREE.Color(L.dirt) }, dirtAmt: { value: L.dirtAmt }, kitGloss: { value: L.kitGloss },
    tMask: { value: a.maps.mask }, fat: { value: new THREE.Vector3(...a.lumRange.fatigues.map(enc)) }, kit: { value: new THREE.Vector3(...a.lumRange.kit.map(enc)) },
    fatA: { value: new THREE.Color(L.fat[0]) }, fatB: { value: new THREE.Color(L.fat[1]) }, kitA: { value: new THREE.Color(L.kit[0]) }, kitB: { value: new THREE.Color(L.kit[1]) },
    weave: { value: L.weave }, stain: { value: L.stain },
  };
  const m = probeMaterial({ map: a.maps.map, normalMap: a.maps.normalMap, aoMap: a.maps.arm, roughnessMap: a.maps.arm, metalnessMap: a.maps.arm, roughness: 1, metalness: 1 }, 'patch-body', fs => `uniform sampler2D tMask; uniform vec3 fat, kit, fatA, fatB, kitA, kitB, dirtC; uniform float weave, stain, dirtAmt, kitGloss; varying vec3 vObjP; varying vec3 vObjN;
float pfH(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float pfNoise(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(pfH(i), pfH(i + vec3(1,0,0)), f.x), mix(pfH(i + vec3(0,1,0)), pfH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(pfH(i + vec3(0,0,1)), pfH(i + vec3(1,0,1)), f.x), mix(pfH(i + vec3(0,1,1)), pfH(i + vec3(1,1,1)), f.x), f.y), f.z); }
` + fs.replace('#include <map_fragment>', `#include <map_fragment>
{ vec3 mk = texture2D(tMask, vMapUv).rgb; float k = smoothstep(0.3, 0.7, mk.r), keep = smoothstep(0.3, 0.7, mk.g);
  float l = pow(max(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)), 1e-6), 0.4545);
  // Source detail carried strongly: spread over a tenth of the class's range (folds, seams and stitching become steps).
  float sF = 0.5 + 0.5 * tanh((l - fat.y) / max(1e-4, (fat.z - fat.x) * 0.1));
  float sK = pow(0.5 + 0.5 * tanh((l - kit.y) / max(1e-4, (kit.z - kit.x) * 0.1)), 1.3);
  vec3 an = abs(vObjN); vec2 w2 = an.x > an.y && an.x > an.z ? vObjP.yz : an.y > an.z ? vObjP.xz : vObjP.xy;
  float wv = sin(w2.x * 2513.0) * sin(w2.y * 2513.0) * 0.6 + (pfNoise(vObjP * 900.0) - 0.5) * 0.8;
  float st = pfNoise(vObjP * 5.0) * 0.65 + pfNoise(vObjP * 17.0) * 0.35;
  vec3 cF = mix(fatA, fatB, sF) * (1.0 + weave * wv) * (1.0 - stain * (st - 0.45));
  vec3 cK = mix(kitA, kitB, sK) * (1.0 + weave * 0.4 * wv) * (1.0 - stain * 0.6 * (st - 0.45));
  vec3 c = mix(cF, cK, k);
  // Dirt: knees, elbows, cuffs and boots (bind-pose positions; the fighter faces -Z), broken up by noise.
  vec3 ap = vec3(abs(vObjP.x), vObjP.y, vObjP.z);
  float dz = max(max(1.0 - length((ap - vec3(0.11, 0.50, -0.07)) / vec3(0.08, 0.09, 0.07)), 1.0 - length((ap - vec3(0.343, 1.215, -0.152)) / 0.08)),
                 max(1.0 - length((ap - vec3(0.45, 1.06, -0.26)) / 0.07), smoothstep(0.2, 0.04, vObjP.y)));
  float dirt = saturate(dz * 1.6) * smoothstep(0.35, 0.75, pfNoise(vObjP * 28.0) * 0.6 + pfNoise(vObjP * 7.0) * 0.4 + 0.15) * dirtAmt;
  c = mix(c, dirtC, dirt);
  if (vObjP.y < 0.028) c *= 0.55;
  // Cavity (baked into the mask's B): seams, strap edges and pouch gaps.
  c *= mix(1.0, mk.b, 0.85);
  diffuseColor.rgb = mix(c, diffuseColor.rgb * mix(1.0, mk.b, 0.6), keep); }`).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor *= mix(1.0, kitGloss, smoothstep(0.3, 0.7, texture2D(tMask, vMapUv).r));`), u);
  return m;
}

interface Fig {
  squad: 0 | 1; group: THREE.Group; meshes: THREE.SkinnedMesh[]; gear: THREE.Group[]; skeleton: THREE.Skeleton; bones: THREE.Bone[];
  weapon: THREE.SkinnedMesh; wid: WeaponId; anim: Animator; mats: ProbeMaterial[]; weaponMat: FighterMaterial; wlod: 1 | 2;
  x: number; z: number; yaw: number; pitch: number; crouch: number; lean: number; phase: number;
  fresh: boolean; lod: number; remoteReload: number; deathKind: number; dist: number; reloadEmpty: boolean; wasReloading: boolean; input: PoseInput;
}
const wrap = (a: number) => { a = (a + Math.PI) % (Math.PI * 2); return (a < 0 ? a + Math.PI * 2 : a) - Math.PI; };

export function createPatchFighters(scene: THREE.Scene, lighting: HeroLighting): FightersWithEvents {
  const figs: (Fig | null)[] = [];
  let assets: Assets | null = null, fallback: FightersWithEvents | null = null, warming: Promise<void> | null = null, warmed = false;
  const keep: THREE.Material[] = [];
  const blobTex = makeSprite('blob'), blobGeo = new THREE.PlaneGeometry(1, 1); blobGeo.rotateX(-Math.PI / 2);
  const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.7 });
  const blobs = new THREE.InstancedMesh(blobGeo, blobMat, 10); blobs.frustumCulled = false; blobs.renderOrder = 1; scene.add(blobs);
  const cam = new THREE.Vector3(NaN, 0, 0);
  blobs.onBeforeRender = (renderer, _s, camera) => { cam.setFromMatrixPosition(camera.matrixWorld); if (!warmed) { warmed = true; void api.warm(renderer, camera); } };
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(), color = new THREE.Color();

  async function load(renderer: THREE.WebGLRenderer): Promise<Assets> {
    const art = new ArtLoader(renderer, 'high');
    const [body, gear, map, normalMap, arm, mask] = await Promise.all([
      art.model('../patch/tactical/body-skinned'), art.model('../patch/headgear/headgear'),
      art.texture(SET, 'diff', 2048), art.texture(SET, 'nor', 1024), art.texture(SET, 'arm', 1024), art.texture(SET, 'mask' as 'arm', 1024),
    ]);
    for (const t of [map, normalMap, arm, mask]) { t.flipY = false; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true; }
    const geo = (n: string) => { const o = body.scene.getObjectByName(n) as THREE.Mesh | undefined; if (!o) throw new Error(`patch fighters: no ${n}`); return o.geometry; };
    const hg: Assets['headgear'] = [];
    gear.scene.traverse(o => { const m = o as THREE.Mesh, x = m.userData as { set?: string; lod?: number; color?: string; roughness?: number; metalness?: number; opacity?: number };
      if (m.isMesh && x.set) hg.push({ geo: m.geometry, set: x.set, lod: x.lod ?? 0, color: x.color ?? '#222222', roughness: x.roughness ?? 0.7, metalness: x.metalness ?? 0, opacity: x.opacity ?? 1 }); });
    const extras = (body.parser.json as { asset?: { extras?: { lumRange?: Assets['lumRange'] } } }).asset?.extras;
    return { body: [geo('body_lod0'), geo('body_lod1'), geo('body_lod2')], maps: { map, normalMap, arm, mask }, lumRange: extras?.lumRange ?? { fatigues: [0, 0.0017, 0.015], kit: [0, 0.0012, 0.0093] }, headgear: hg };
  }

  function weaponMesh(f: Fig, id: WeaponId, lod: 1 | 2) { const w = weaponFor(id, lod); f.weapon.geometry = w.geo; f.wid = id; f.wlod = lod; f.anim.setWeapon(id, w); }

  function figFor(a: Assets, i: number, squad: 0 | 1, wid: WeaponId): Fig {
    let f = figs[i];
    if (f && f.squad === squad) return f;
    if (f) drop(f);
    // As the stock fighters: the root bone hangs off a holder; every level binds with an identity bind matrix in
    // attached mode, so all levels share the skeleton and carry the group's position, yaw and scale.
    const group = new THREE.Group(), bones = makeBones(), holder = new THREE.Object3D(); holder.add(bones[0]); holder.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(bones); group.scale.setScalar(SCALE); group.add(holder);
    const body = bodyMaterial(a, squad), mats: ProbeMaterial[] = [body];
    const meshes = a.body.map(g => { const m = new THREE.SkinnedMesh(g, body); m.frustumCulled = false; m.castShadow = true; m.bind(skeleton, new THREE.Matrix4()); group.add(m); return m; });
    const gear = [0, 1, 2].map(() => new THREE.Group());
    for (const h of a.headgear) {
      if (!(PATCH_LOOKS[squad].headgear as readonly string[]).includes(h.set)) continue;
      const hm = probeMaterial({ color: h.color, roughness: h.roughness, metalness: h.metalness, transparent: h.opacity < 1, opacity: h.opacity }, h.opacity < 1 ? 'patch-gear-t' : 'patch-gear'); mats.push(hm);
      const mesh = new THREE.Mesh(h.geo, hm); mesh.frustumCulled = false; mesh.castShadow = h.opacity >= 1; gear[h.lod].add(mesh);
    }
    for (const g of gear) bones[B.head].add(g);
    const weaponMat = fighterMaterial(), w = weaponFor(wid), wb = Array.from({ length: WEAPON_BONES }, () => new THREE.Bone());
    const weapon = new THREE.SkinnedMesh(w.geo, weaponMat); weapon.add(...wb); weapon.bind(new THREE.Skeleton(wb)); weapon.frustumCulled = false;
    group.add(weapon); scene.add(group);
    const anim = new Animator(bones, weapon, wb, w); anim.setWeapon(wid, w);
    f = { squad, group, meshes, gear, skeleton, bones, weapon, wid, anim, mats, weaponMat, wlod: 1, x: 0, z: 0, yaw: 0, pitch: 0, crouch: 0, lean: 0, phase: 0, fresh: true, lod: 2, remoteReload: 0, deathKind: -1, dist: 0, reloadEmpty: false, wasReloading: false, input: idleInput() };
    figs[i] = f;
    return f;
  }
  function drop(f: Fig) { scene.remove(f.group); for (const m of f.mats) m.dispose(); f.weaponMat.dispose(); }

  const api: FightersWithEvents = {
    update(view) {
      if (fallback) return fallback.update(view);
      const { m, dt } = view, k = 1 - Math.exp(-dt * 16), a = assets;
      if (!a) { for (const f of figs) if (f) f.group.visible = false; return; }
      const camOk = Number.isFinite(cam.x), order: Fig[] = [];
      let blob = 0;
      for (let i = 0; i < Math.max(figs.length, m.players.length); i++) {
        const p = m.players[i];
        if (!p || m.phase === 'lobby') { const f = figs[i]; if (f) f.group.visible = false; continue; }
        const wid = weaponIdOf(m, p), f = figFor(a, i, p.squad, wid), local = i === view.self;
        if (f.wid !== wid) weaponMesh(f, wid, f.wlod);
        const tx = local ? view.px + (p.x - view.px) * view.alpha : p.x, tz = local ? view.pz + (p.z - view.pz) * view.alpha : p.z;
        const snap = f.fresh || local || Math.hypot(tx - f.x, tz - f.z) > 4;
        if (snap) { f.x = tx; f.z = tz; f.yaw = local ? view.yaw : p.yaw; f.pitch = local ? view.pitch : p.pitch; f.crouch = p.crouch; f.lean = p.lean; }
        else { f.x += (tx - f.x) * k; f.z += (tz - f.z) * k; f.yaw += wrap(p.yaw - f.yaw) * k; f.pitch += (p.pitch - f.pitch) * k; f.crouch += (p.crouch - f.crouch) * k; f.lean += (p.lean - f.lean) * k; }
        const show = !(i === view.watch && p.alive) && !view.menu;
        f.group.visible = show;
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
        const l = lighting.probe(f.x, 1.1, f.z).color;
        color.setRGB(SHADE_FILL + l[0] * PROBE_GAIN, SHADE_FILL + l[1] * PROBE_GAIN, SHADE_FILL * 1.06 + l[2] * PROBE_GAIN).multiplyScalar(Math.PI);
        f.weaponMat.userData.probe.value.copy(color);
        for (const mt of f.mats) mt.userData.probe.value.copy(color).multiplyScalar(BODY_GAIN);
        const env = lighting.environment(f.x, f.z), es = lighting.environmentScale(f.x, f.z) * 0.8;
        if (f.weaponMat.envMap !== env) { f.weaponMat.envMap = env; f.weaponMat.needsUpdate = true; for (const mt of f.mats) { mt.envMap = env; mt.needsUpdate = true; } }
        f.weaponMat.envMapIntensity = es; for (const mt of f.mats) mt.envMapIntensity = es;
        f.dist = camOk ? Math.hypot(cam.x - f.x, cam.y - 1.2, cam.z - f.z) : Math.hypot(view.px - f.x, view.pz - f.z);
        order.push(f);
        if (blob < 10) { const lie = p.alive ? 0 : 0.9; blobs.setMatrixAt(blob++, m4.compose(v3.set(f.x, 0.04, f.z), q4.identity(), s3.set(1.0 + lie, 1, 1.0 + lie))); }
      }
      order.sort((x, y) => x.dist - y.dist);
      order.forEach((f, n) => {
        const lod = f.dist < LOD_DIST[0] && n < LOD0_MAX ? 0 : f.dist < LOD_DIST[1] ? 1 : 2;
        f.lod = lod;
        const wl = lod === 2 ? 2 : 1; if (f.wlod !== wl) weaponMesh(f, f.wid, wl);
        f.meshes.forEach((ms, l) => { ms.visible = l === lod; }); f.gear.forEach((g, l) => { g.visible = l === lod; });
      });
      for (let i = blob; i < 10; i++) blobs.setMatrixAt(i, m4.makeScale(0, 0, 0));
      blobs.instanceMatrix.needsUpdate = true;
    },
    async warm(renderer, camera) {
      if (fallback) return fallback.warm(renderer, camera);
      if (warming) return warming;
      warmed = true;
      return (warming = (async () => {
        await heroReady;
        try { assets = await load(renderer); }
        catch (e) {
          console.warn('Breachline: Patch fighters unavailable, using the stock fighters', e);
          scene.remove(blobs); fallback = createFighters(scene, lighting); return fallback.warm(renderer, camera);
        }
        for (const id of Object.keys(WEAPONS) as WeaponId[]) { weaponFor(id, 1); weaponFor(id, 2); }
        // Compile every program: both squads' bodies, the headgear, the weapon, with and without a reflection probe.
        const tmp = new THREE.Scene(), env = lighting.environment(0, 0), bones = makeBones(), holder = new THREE.Object3D();
        holder.add(bones[0]); holder.updateMatrixWorld(true);
        const sk = new THREE.Skeleton(bones), made: THREE.Material[] = [];
        tmp.add(holder, ...scene.children.filter(o => (o as THREE.Light).isLight).map(l => l.clone()));
        for (const e of env ? [null, env] : [null]) for (const squad of [0, 1] as const) {
          const bm = bodyMaterial(assets, squad); bm.envMap = e; made.push(bm);
          for (const g of assets.body) { const s = new THREE.SkinnedMesh(g, bm); s.bind(sk, new THREE.Matrix4()); s.frustumCulled = false; tmp.add(s); }
          for (const opaque of [true, false]) { const hm = probeMaterial({ color: 0x222222, transparent: !opaque, opacity: opaque ? 1 : 0.85 }, opaque ? 'patch-gear' : 'patch-gear-t'); hm.envMap = e; made.push(hm); const hgm = new THREE.Mesh(assets.headgear[0]?.geo ?? new THREE.BoxGeometry(0.1, 0.1, 0.1), hm); hgm.frustumCulled = false; tmp.add(hgm); }
          const wmat = fighterMaterial(); wmat.envMap = e; made.push(wmat);
          const w = weaponFor('ar'), wb = Array.from({ length: WEAPON_BONES }, () => new THREE.Bone()), wm = new THREE.SkinnedMesh(w.geo, wmat);
          wm.add(...wb); wm.bind(new THREE.Skeleton(wb)); wm.frustumCulled = false; tmp.add(wm);
        }
        await renderer.compileAsync(tmp, camera);
        // Upload the shared textures and geometry now, not on the first frame a fighter is seen.
        for (const t of Object.values(assets.maps)) renderer.initTexture(t);
        keep.push(...made);
      })());
    },
    pose(i) { if (fallback) return fallback.pose(i); return figs[i] ?? null; },
    muzzle(i, out) {
      if (fallback) return fallback.muzzle(i, out);
      const f = figs[i];
      if (!f || !f.group.visible) return false;
      f.anim.fire();
      f.weapon.updateWorldMatrix(true, false);
      out.copy(f.anim.w.muzzle).applyMatrix4(f.weapon.matrixWorld);
      return true;
    },
    handle(events: readonly SimEvent[], m: Match, self: number) {
      if (fallback) return fallback.handle(events, m, self);
      for (const e of events) {
        if (e.e === 'reload' && e.id !== self) { const f = figs[e.id], p = m.players[e.id]; if (f && p && p.reload <= 0) { f.remoteReload = WEAPONS[weaponIdOf(m, p)].reload; f.reloadEmpty = p.mag[p.slot] === 0; } }
        else if (e.e === 'kill') {
          const f = figs[e.on], v = m.players[e.on], k = m.players[e.by];
          if (!f || !v || !k || e.by === e.on) continue;
          const a = wrap(Math.atan2(-(k.x - v.x), -(k.z - v.z)) - v.yaw);
          f.deathKind = Math.abs(a) < 0.9 ? 0 : Math.abs(a) > 2.3 ? 1 : 2;
        }
      }
    },
    reset(ids) {
      if (fallback) return fallback.reset(ids);
      if (!ids) { for (const f of figs) if (f) f.fresh = true; return; }
      for (const id of ids) { const f = figs[id]; if (f) f.fresh = true; }
    },
    dispose() {
      if (fallback) fallback.dispose();
      for (const f of figs) if (f) drop(f);
      for (const m of keep) m.dispose();
      if (assets) { for (const t of Object.values(assets.maps)) t.dispose(); for (const g of assets.body) g.dispose(); for (const h of assets.headgear) h.geo.dispose(); }
      scene.remove(blobs); blobGeo.dispose(); blobMat.dispose(); blobTex.dispose();
    },
  };
  return api;
}
