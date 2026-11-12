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
import { B, HEAD_CENTRE, JOINT, SCALE, SIDE, makeBones } from '../fighters/skeleton';
import type { World } from '../../world';
import * as RD from './ragdoll';
import { weaponFor } from '../fighters/weapon';
import { fighterMaterial, type FighterMaterial } from '../fighters/material';
import { LOD_DIST, LOD0_MAX, createFighters, type FightersWithEvents } from '../fighters/index';

/** Probe gains as the stock fighters use them (not exported there). The stock baked sets carry their own occlusion
 * and are lighter, so they take 0.42 of the probe; this albedo is not baked-light (near-black kit), so it takes all
 * of it (checked in the game: at 0.42 the figures read as silhouettes outdoors). */
const PROBE_GAIN = 0.6, SHADE_FILL = 0.8;
/** The body's share of the probe: 0.42, the stock baked sets' own value, chosen from game frames at 0.75 and 0.42 once the
 * albedo was in range and the occlusion baked (`?patchgain=` overrides it while tuning). */
const BODY_GAIN = Number(typeof location === 'undefined' ? NaN : new URLSearchParams(location.search).get('patchgain')) || 0.42;
const SET = '../patch/tactical';

/** Squad looks: the darkest and lightest each class reaches (sRGB), cloth weave and stain strength. */
export const PATCH_LOOKS = [
  // Squad 0: dark slate cloth (linear albedo about 0.08 at its middle), kit darker (0.035) and glossier, light dust.
  // `fat`/`kit` are the middle albedo (sRGB); `fatC`/`kitC` how far the source's detail swings it either way.
  { fat: 0x4a5058, fatC: 0.55, kit: 0x34373b, kitC: 0.5, kitGloss: 0.72, gain: 1.45, sleeve: 1.0, dirt: 0x7a7468, dirtAmt: 0.35, weave: 0.10, stain: 0.16, headgear: ['helmetA', 'gogglesA'] },
  // Squad 1: coyote cloth (about 0.19 at its middle, rising to 0.25 on light folds), olive kit darker (0.1), both
  // desaturated, darker mud. (At 0.26 with a wider swing the sleeves read cream in the game.)
  { fat: 0x857360, fatC: 0.3, kit: 0x585b45, kitC: 0.4, kitGloss: 0.85, gain: 1.0, sleeve: 0.72, dirt: 0x4f4232, dirtAmt: 0.45, weave: 0.10, stain: 0.22, headgear: ['headsetB'] },
] as const;
/** `gain` multiplies the body's probe share per squad (job 5: squad 0's dark cloth needs more fill to read in the
 * yard's shade); `sleeve` scales the cloth albedo on the arms (squad 1's sleeves remapped lightest). */
/** Rim light from the probe, as a fraction of it, at grazing angles (separates edges from dark walls). */
const RIM = 0.35;

interface Maps { map: THREE.Texture; normalMap: THREE.Texture; arm: THREE.Texture; mask: THREE.Texture }
interface Assets { rifle: { body: THREE.BufferGeometry; mag: THREE.BufferGeometry; magSeat: THREE.Vector3; maps: { map: THREE.Texture; arm: THREE.Texture } } | null; body: THREE.BufferGeometry[]; maps: Maps; lumRange: { fatigues: number[]; kit: number[] }; headgear: { geo: THREE.BufferGeometry; set: string; lod: number; color: string; roughness: number; metalness: number; opacity: number }[] }
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
/** Wounds a fighter can carry (job 12.2): bind-pose position (xyz) and age-scaled strength (w). */
export const MAX_WOUNDS = 8;
/** `?blood=off` replaces blood with dust-dark scuffs (plan 12.4). */
const BLOOD = typeof location === 'undefined' || new URLSearchParams(location.search).get('blood') !== 'off';
function bodyMaterial(a: Assets, squad: 0 | 1): ProbeMaterial {
  const L = PATCH_LOOKS[squad], enc = (x: number) => Math.pow(Math.max(x, 1e-6), 1 / 2.2);
  const u = {
    uWound: { value: Array.from({ length: MAX_WOUNDS }, () => new THREE.Vector4(0, -9, 0, 0)) }, uHurt: { value: 0 }, uBlood: { value: BLOOD ? 1 : 0 },
    sleeve: { value: L.sleeve }, dirtC: { value: new THREE.Color(L.dirt) }, dirtAmt: { value: L.dirtAmt }, kitGloss: { value: L.kitGloss },
    tMask: { value: a.maps.mask }, fat: { value: new THREE.Vector3(...a.lumRange.fatigues.map(enc)) }, kit: { value: new THREE.Vector3(...a.lumRange.kit.map(enc)) },
    fatA: { value: new THREE.Color(L.fat) }, kitA: { value: new THREE.Color(L.kit) }, fatC: { value: L.fatC }, kitC: { value: L.kitC },
    weave: { value: L.weave }, stain: { value: L.stain },
  };
  const m = probeMaterial({ map: a.maps.map, normalMap: a.maps.normalMap, aoMap: a.maps.arm, roughnessMap: a.maps.arm, metalnessMap: a.maps.arm, roughness: 1, metalness: 1 }, 'patch-body', fs => `uniform sampler2D tMask; uniform vec3 fat, kit, fatA, kitA, dirtC; uniform float fatC, kitC, weave, stain, dirtAmt, kitGloss, sleeve, uHurt, uBlood; uniform vec4 uWound[8]; varying vec3 vObjP; varying vec3 vObjN;
float pfH(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float pfNoise(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(pfH(i), pfH(i + vec3(1,0,0)), f.x), mix(pfH(i + vec3(0,1,0)), pfH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(pfH(i + vec3(0,0,1)), pfH(i + vec3(1,0,1)), f.x), mix(pfH(i + vec3(0,1,1)), pfH(i + vec3(1,1,1)), f.x), f.y), f.z); }
` + fs.replace('#include <map_fragment>', `#include <map_fragment>
{ vec3 mk = texture2D(tMask, vMapUv).rgb; float k = smoothstep(0.3, 0.7, mk.r), keep = smoothstep(0.3, 0.7, mk.g);
  float l = pow(max(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)), 1e-6), 0.4545);
  // Source detail carried strongly: spread over a tenth of the class's range (folds, seams and stitching become steps).
  float sF = tanh((l - fat.y) / max(1e-4, (fat.z - fat.x) * 0.15));
  float sK = tanh((l - kit.y) / max(1e-4, (kit.z - kit.x) * 0.15)) - 0.15;
  vec3 an = abs(vObjN); vec2 w2 = an.x > an.y && an.x > an.z ? vObjP.yz : an.y > an.z ? vObjP.xz : vObjP.xy;
  float wv = sin(w2.x * 2513.0) * sin(w2.y * 2513.0) * 0.6 + (pfNoise(vObjP * 900.0) - 0.5) * 0.8;
  float st = pfNoise(vObjP * 5.0) * 0.65 + pfNoise(vObjP * 17.0) * 0.35;
  vec3 cF = fatA * (1.0 + fatC * sF) * (1.0 + weave * wv) * (1.0 - stain * (st - 0.45));
  vec3 cK = kitA * (1.0 + kitC * sK) * (1.0 + weave * 0.4 * wv) * (1.0 - stain * 0.6 * (st - 0.45));
  cF *= mix(1.0, sleeve, smoothstep(0.2, 0.26, abs(vObjP.x)) * step(0.95, vObjP.y));
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
  c = mix(c, diffuseColor.rgb * mix(1.0, mk.b, 0.6), keep);
  // Wounds (job 12.2), in bind-pose space so they ride the skin: a dark entry mark and a stain that soaks into the
  // cloth around it and runs a little downward; with ?blood=off a dusty scuff instead.
  vec3 bloodC = mix(vec3(0.16, 0.12, 0.10), vec3(0.20, 0.012, 0.010), uBlood), entryC = mix(vec3(0.05), vec3(0.06, 0.004, 0.004), uBlood);
  float soak = 0.0, entry = 0.0;
  for (int i = 0; i < 8; i++) {
    vec4 w = uWound[i]; if (w.w <= 0.0) continue;
    // Head wounds (bind-pose height above 1.5 m) stay a small patch on the balaclava or helmet edge.
    float hd = step(1.5, w.y), e = length(vObjP - w.xyz);
    vec3 dv = vObjP - w.xyz; dv.y *= dv.y < 0.0 ? 0.6 : 1.3;
    float r = (0.03 + 0.04 * w.w) * mix(1.0, 0.5, hd), d = length(dv) / r + (pfNoise(vObjP * 60.0) - 0.5) * 0.35;
    // The stain is densest at the hole and thins outward, rather than an even wash.
    float fall = 1.0 - smoothstep(0.0, 1.0, d);
    soak = max(soak, fall * sqrt(fall) * min(1.0, w.w * 1.3) * mix(1.0, 0.7, hd));
    // Entry: a dark core about 1.5 cm across with a darkened ring around it.
    entry = max(entry, max(1.0 - smoothstep(0.006, 0.011, e), (1.0 - smoothstep(0.011, 0.026, e)) * 0.55));
  }
  // Worse as health falls: below half, blood and dirt spread over the torso front and the legs; near death, more.
  float hurt = smoothstep(0.5, 1.0, uHurt), patchy = smoothstep(0.45, 0.8, pfNoise(vObjP * 9.0) * 0.7 + pfNoise(vObjP * 31.0) * 0.3);
  float region = max(step(0.85, vObjP.y) * step(vObjP.y, 1.45) * step(vObjP.z, 0.02), step(0.15, vObjP.y) * step(vObjP.y, 0.9));
  soak = max(soak, hurt * region * patchy * 0.75);
  c = mix(c, c * 0.35 + bloodC * 0.65, soak * 0.85);
  c = mix(c, dirtC * 0.6, hurt * 0.25 * patchy);
  c = mix(c, entryC, entry);
  diffuseColor.rgb = c; }`).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor *= mix(1.0, kitGloss, smoothstep(0.3, 0.7, texture2D(tMask, vMapUv).r));`), u);
  (m.userData as Record<string, unknown>).wound = u.uWound; (m.userData as Record<string, unknown>).hurt = u.uHurt;
  return m;
}

/** Job 12.6: what killed a fighter, from the shared events, for the ragdoll's impulse. */
interface KillInfo { kind: 'gun' | 'blast' | 'melee'; shot: { x: number; y: number; z: number; yaw: number; pitch: number; w: WeaponId } | null; boom: { x: number; y: number; z: number } | null; head: boolean; kx: number; kz: number; seed: number }
interface Fig {
  squad: 0 | 1; group: THREE.Group; meshes: THREE.SkinnedMesh[]; gear: THREE.Group[]; skeleton: THREE.Skeleton; bones: THREE.Bone[];
  weapon: THREE.SkinnedMesh; wbones: THREE.Bone[]; dressed: THREE.Object3D[]; wid: WeaponId; anim: Animator; mats: ProbeMaterial[]; weaponMat: FighterMaterial; wlod: 1 | 2;
  x: number; z: number; yaw: number; pitch: number; crouch: number; lean: number; phase: number;
  fresh: boolean; lod: number; remoteReload: number; deathKind: number; dist: number; wounds: THREE.Vector4[]; nWound: number; hurt: number; react: { t: number; ax: number; az: number; limb: number }; died: number; kill: KillInfo | null; rag: RD.Ragdoll | null; ragInv: THREE.Matrix4; gunQ: THREE.Quaternion; gunF: THREE.Quaternion; px: number; pz: number; vx: number; vz: number; reloadEmpty: boolean; wasReloading: boolean; input: PoseInput;
}
const wrap = (a: number) => { a = (a + Math.PI) % (Math.PI * 2); return (a < 0 ? a + Math.PI * 2 : a) - Math.PI; };

/** A fighter lying where it fell (job 12.2). */
export interface PatchBody { id: number; x: number; z: number; yaw: number; t: number }
export interface PatchFighters extends FightersWithEvents { bodies(): PatchBody[] }
export function createPatchFighters(scene: THREE.Scene, lighting: HeroLighting): PatchFighters {
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
    // The Patch rifle at world level of detail, for fighters carrying the AR (job 5.3). Optional: without it the stock
    // world AR is kept.
    let rifle: Assets['rifle'] = null;
    try {
      const [rw, rmap, rarm] = await Promise.all([art.model('../patch/rifle-scifi/rifle-world'), art.texture('../patch/rifle-scifi', 'diff', 1024), art.texture('../patch/rifle-scifi', 'arm', 1024)]);
      for (const t of [rmap, rarm]) { t.flipY = false; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true; }
      const b = rw.scene.getObjectByName('body') as THREE.Mesh, m = rw.scene.getObjectByName('magazine') as THREE.Mesh;
      rifle = { body: b.geometry, mag: m.geometry, magSeat: m.position.clone(), maps: { map: rmap, arm: rarm } };
    } catch (e) { console.warn('Breachline: Patch world rifle unavailable; stock world AR kept', e); }
    const extras = (body.parser.json as { asset?: { extras?: { lumRange?: Assets['lumRange'] } } }).asset?.extras;
    return { rifle, body: [geo('body_lod0'), geo('body_lod1'), geo('body_lod2')], maps: { map, normalMap, arm, mask }, lumRange: extras?.lumRange ?? { fatigues: [0, 0.0017, 0.015], kit: [0, 0.0012, 0.0093] }, headgear: hg };
  }

  function weaponMesh(f: Fig, id: WeaponId, lod: 1 | 2) { const w = weaponFor(id, lod); f.weapon.geometry = w.geo; f.wid = id; f.wlod = lod; f.anim.setWeapon(id, w); dress(f); }
  /** Job 5.3: a fighter carrying the AR shows the Patch rifle instead of the stock world model. The stock skinned
   * mesh keeps its bones (the animator drives them) but draws nothing; the Patch body rides bone 0 and its magazine
   * bone 1, placed so the Patch grip palm sits on the world weapon's grip socket. */
  const EMPTY = (() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([], 3)); g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([], 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute([], 4)); return g; })();
  let rifleMat: ProbeMaterial | null = null;
  function dress(f: Fig) {
    for (const o of f.dressed) o.removeFromParent();
    f.dressed.length = 0;
    const r = assets?.rifle; if (!r || f.wid !== 'ar') return;
    const w = weaponFor('ar', f.wlod), g = w.grip.p, T = new THREE.Vector3(g.x, g.y + 0.07, g.z - 0.185);
    rifleMat ??= probeMaterial({ map: r.maps.map, aoMap: r.maps.arm, roughnessMap: r.maps.arm, metalnessMap: r.maps.arm, roughness: 1, metalness: 1 }, 'patch-gear');
    if (!f.mats.includes(rifleMat)) f.mats.push(rifleMat);
    const body = new THREE.Mesh(r.body, rifleMat), mag = new THREE.Mesh(r.mag, rifleMat);
    body.position.copy(T); mag.position.copy(r.magSeat).add(T).sub(w.mag);
    for (const m of [body, mag]) { m.frustumCulled = false; m.castShadow = true; }
    // The magazine bone's origin is the world model's magazine seat; the Patch magazine is offset from it.
    const holder = new THREE.Group(); holder.position.copy(w.mag); holder.add(mag);
    f.wbones[0].add(body); f.wbones[1].add(holder); f.dressed.push(body, holder);
    f.weapon.geometry = EMPTY;
  }

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
    f = { wounds: Array.from({ length: MAX_WOUNDS }, () => new THREE.Vector4(0, -9, 0, 0)), nWound: 0, hurt: 0, react: { t: 9, ax: 0, az: 0, limb: -1 }, died: -1, kill: null, rag: null, ragInv: new THREE.Matrix4(), gunQ: new THREE.Quaternion(), gunF: new THREE.Quaternion(), px: NaN, pz: NaN, vx: 0, vz: 0, squad, group, meshes, gear, skeleton, bones, weapon, wbones: wb, dressed: [], wid, anim, mats, weaponMat, wlod: 1, x: 0, z: 0, yaw: 0, pitch: 0, crouch: 0, lean: 0, phase: 0, fresh: true, lod: 2, remoteReload: 0, deathKind: -1, dist: 0, reloadEmpty: false, wasReloading: false, input: idleInput() };
    figs[i] = f;
    dress(f);
    return f;
  }
  function drop(f: Fig) { scene.remove(f.group); for (const m of f.mats) m.dispose(); f.weaponMat.dispose(); }

  /** Job 12.2: the last shot of each shooter (origin and look), to place the wound its hit makes. */
  const lastShot = new Map<number, { x: number; y: number; z: number; yaw: number; pitch: number; w: WeaponId }>();
  let lastBoom: { x: number; y: number; z: number } | null = null;
  const SEGS: [number, number, number][] = [[B.head, -1, 0.11], [B.spine2, B.neck, 0.15], [B.spine1, B.spine2, 0.15], [B.pelvis, B.spine1, 0.15],
    [B.upperL, B.foreL, 0.06], [B.foreL, B.handL, 0.05], [B.upperR, B.foreR, 0.06], [B.foreR, B.handR, 0.05],
    [B.thighL, B.shinL, 0.085], [B.shinL, B.footL, 0.065], [B.thighR, B.shinR, 0.085], [B.shinR, B.footR, 0.065]];
  const bindM = new THREE.Matrix4(), ro = new THREE.Vector3(), rd = new THREE.Vector3(), sa = new THREE.Vector3(), sb = new THREE.Vector3(), cp = new THREE.Vector3(), cq = new THREE.Vector3(), seg = new THREE.Line3(), wm = new THREE.Matrix4();
  /** Places a wound where shooter `by`'s last shot meets fighter `on`: the nearest body part to the ray (the head when
   * the hit was a head shot), the entry point where the ray crosses that part's surface, stored in bind-pose space so
   * it rides the skin. Deterministic from the shared events (up to each client's interpolated pose). */
  function wound(on: number, by: number, head: boolean, hp: number) {
    const f = figs[on], s = lastShot.get(by); if (!f) return;
    f.hurt = Math.max(f.hurt, 1 - Math.max(0, hp) / 100);
    if (!s) return;
    f.group.updateMatrixWorld(true);
    ro.set(s.x, s.y, s.z); rd.set(-Math.sin(s.yaw) * Math.cos(s.pitch), Math.sin(s.pitch), -Math.cos(s.yaw) * Math.cos(s.pitch)).normalize();
    let best = -1, bd = Infinity, bt = 0;
    SEGS.forEach(([b, c, r], k) => {
      if (head !== (b === B.head)) return;
      f.bones[b].getWorldPosition(sa); if (c >= 0) f.bones[c].getWorldPosition(sb); else sb.copy(sa).add(cq.set(0, 0.16, 0));
      seg.set(sa, sb);
      // Closest points between the ray and the bone segment, by sampling the segment (12 steps is plenty here).
      for (let i = 0; i <= 12; i++) { seg.at(i / 12, cp); const t = Math.max(0, cp.clone().sub(ro).dot(rd)), d = cq.copy(ro).addScaledVector(rd, t).distanceTo(cp) - r; if (d < bd) { bd = d; best = k; bt = t; } }
    });
    if (best < 0) return;
    const [b, , r] = SEGS[best];
    // Entry: back along the ray from its closest approach to where it crosses the part's surface.
    const back = Math.sqrt(Math.max(0, r * r - Math.max(0, bd + r) ** 2));
    cp.copy(ro).addScaledVector(rd, Math.max(0, bt - back));
    // World -> bind pose through that bone (attached mode, identity bind matrix: world = bone.world * inverse * v).
    const bi = f.skeleton.boneInverses[b]; wm.copy(f.bones[b].matrixWorld).invert(); cp.applyMatrix4(wm).applyMatrix4(bindM.copy(bi).invert());
    const w = f.wounds[f.nWound % MAX_WOUNDS]; f.nWound++;
    w.set(cp.x, cp.y, cp.z, 0.6 + Math.min(0.4, (100 - hp) / 150));
    // The hit's direction in the fighter's own frame, for the flinch away from it; a hit limb kicks too.
    const yaw = f.anim.yaw, lx = rd.x * Math.cos(yaw) - rd.z * Math.sin(yaw), lz = rd.x * Math.sin(yaw) + rd.z * Math.cos(yaw);
    f.react.t = 0; f.react.ax = lx; f.react.az = lz; f.react.limb = [B.upperL, B.upperR, B.thighL, B.thighR, B.shinL, B.shinR, B.foreL, B.foreR].includes(b as never) ? b : -1;
  }
  // ---- Job 12.6: ragdoll on death -------------------------------------------------------------------------------------
  /** The bone at each ragdoll point (the head point is the head's centre, not its pivot). */
  const PT_BONE = [B.pelvis, B.spine2, B.neck, B.head, B.upperL, B.upperR, B.foreL, B.foreR, B.handL, B.handR, B.thighL, B.thighR, B.shinL, B.shinR, B.footL, B.footR];
  const bindPt = PT_BONE.map((b, i) => (i === RD.P.head ? JOINT[b].clone().add(HEAD_CENTRE) : JOINT[b].clone()));
  const pv = { x: 0, y: 0, z: 0 }, mp = PT_BONE.map(() => new THREE.Vector3()), wq = Array.from({ length: 32 }, () => new THREE.Quaternion());
  const fx = new THREE.Vector3(), fy = new THREE.Vector3(), fz = new THREE.Vector3(), fm = new THREE.Matrix4(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), d0 = new THREE.Vector3(), d1 = new THREE.Vector3();
  /** The rotation of the frame whose X runs along `x` and whose Y is `y` made square to it. */
  const frame = (x: THREE.Vector3, y: THREE.Vector3, out: THREE.Quaternion) => {
    fx.copy(x).normalize(); fy.copy(y).addScaledVector(fx, -fy.copy(y).dot(fx)).normalize(); fz.crossVectors(fx, fy);
    return out.setFromRotationMatrix(fm.makeBasis(fx, fy, fz));
  };
  const BIND_PELVIS = frame(bindPt[RD.P.hipR].clone().sub(bindPt[RD.P.hipL]), bindPt[RD.P.chest].clone().sub(bindPt[RD.P.pelvis]), new THREE.Quaternion()).invert();
  const BIND_CHEST = frame(bindPt[RD.P.shR].clone().sub(bindPt[RD.P.shL]), bindPt[RD.P.neck].clone().sub(bindPt[RD.P.chest]), new THREE.Quaternion()).invert();
  const GUN_UP = new THREE.Vector3(0, 0.08, 0), gp = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  /** Weapon speed given to the body by the killing round, in m/s at the point hit. */
  const KICK: Record<WeaponId, number> = { ar: 2.6, carbine: 2.5, smg: 2.1, shotgun: 5.5, dmr: 3.6, pistol: 2.0 };

  /** Starts the ragdoll from the live pose (the bones as last drawn), the fighter's own speed, and an impulse from
   * what killed them, seeded from the kill so every client plays the same fall. */
  function startRag(f: Fig, k: KillInfo) {
    f.group.updateMatrixWorld(true);
    const pts = PT_BONE.map((b, i) => (i === RD.P.head ? f.bones[b].localToWorld(HEAD_CENTRE.clone()) : f.bones[b].getWorldPosition(new THREE.Vector3())));
    f.weapon.updateMatrixWorld(true);
    const gun = [new THREE.Vector3(), f.anim.w.muzzle.clone(), GUN_UP.clone()].map(v => v.applyMatrix4(f.weapon.matrixWorld));
    const r = RD.createRagdoll(pts, { x: f.vx, y: 0, z: f.vz }, gun), rnd = RD.rng(k.seed);
    f.ragInv.copy(f.group.matrixWorld).invert();
    f.weapon.getWorldQuaternion(f.gunQ); gunFrame(gun, f.gunF).invert();
    const near = (cx: number, cy: number, cz: number, fall: number, speed: number, vx: number, vy: number, vz: number) => {
      for (let i = 0; i < RD.POINTS; i++) { const p = pts[i], d = Math.hypot(p.x - cx, p.y - cy, p.z - cz), w = Math.max(0, 1 - d / fall); if (w > 0) RD.push(r, i, vx * speed * w, vy * speed * w, vz * speed * w); }
    };
    if (k.kind === 'gun' && k.shot) {
      const s = k.shot;
      rd.set(-Math.sin(s.yaw) * Math.cos(s.pitch), Math.sin(s.pitch), -Math.cos(s.yaw) * Math.cos(s.pitch)).normalize(); ro.set(s.x, s.y, s.z);
      // The body region the round struck: the head on a head shot, otherwise the point nearest the shot's line.
      let hit: number = RD.P.head, bd = Infinity;
      if (!k.head) pts.forEach((p, i) => { const t = Math.max(0, cp.copy(p).sub(ro).dot(rd)), d = cq.copy(ro).addScaledVector(rd, t).distanceTo(p); if (i !== RD.P.head && d < bd) { bd = d; hit = i; } });
      const h = pts[hit], v = KICK[s.w] ?? 2.5, shotgun = s.w === 'shotgun';
      near(h.x, h.y, h.z, shotgun ? 0.75 : 0.42, v * (k.head ? 1.25 : 1), rd.x, rd.y + (shotgun ? 0.15 : 0), rd.z);
      RD.push(r, hit, rd.x * v * 0.6, rd.y * v * 0.6, rd.z * v * 0.6);
    } else if (k.kind === 'blast' && k.boom) {
      const b = k.boom;
      for (let i = 0; i < RD.POINTS; i++) {
        const p = pts[i], dx = p.x - b.x, dy = p.y - b.y, dz = p.z - b.z, d = Math.max(0.2, Math.hypot(dx, dy, dz)), sp = Math.min(9, Math.max(2.5, 9 * (1 - d / 6)));
        RD.push(r, i, (dx / d) * sp, (Math.max(0, dy / d) + 0.55) * sp, (dz / d) * sp);
      }
    } else {
      // Melee, or a gun kill whose shot this client missed: away from the killer.
      const dx = pts[RD.P.chest].x - k.kx, dz = pts[RD.P.chest].z - k.kz, d = Math.hypot(dx, dz) || 1;
      near(pts[RD.P.chest].x, pts[RD.P.chest].y, pts[RD.P.chest].z, 0.6, k.kind === 'melee' ? 2.4 : 1.8, dx / d, 0.05, dz / d);
    }
    // The legs give way: knees forward (the way the body faces) and a little seeded scatter in the arms.
    const fw = { x: -Math.sin(f.anim.yaw), z: -Math.cos(f.anim.yaw) };
    for (const kn of [RD.P.knL, RD.P.knR]) { const a = 0.5 + rnd() * 0.5; RD.push(r, kn, fw.x * a, 0, fw.z * a); }
    for (const i of [RD.P.elL, RD.P.elR, RD.P.haL, RD.P.haR]) RD.push(r, i, (rnd() - 0.5) * 1.2, (rnd() - 0.5) * 0.6, (rnd() - 0.5) * 1.2);
    // The weapon leaves the hands sideways.
    const side = rnd() < 0.5 ? -1 : 1; RD.pushGun(r, -fw.z * side * 1.1, 0.6, fw.x * side * 1.1);
    f.rag = r;
  }
  function gunFrame(g: readonly { x: number; y: number; z: number }[], out: THREE.Quaternion) {
    return frame(d0.set(g[1].x - g[0].x, g[1].y - g[0].y, g[1].z - g[0].z), d1.set(g[2].x - g[0].x, g[2].y - g[0].y, g[2].z - g[0].z), out);
  }
  /** World rotation of a bone aimed from its bind direction `from` (rotated by its parent) to the direction `to`. */
  const aim = (parent: THREE.Quaternion, from: THREE.Vector3, to: THREE.Vector3, out: THREE.Quaternion) => out.setFromUnitVectors(d0.copy(from).applyQuaternion(parent).normalize(), d1.copy(to).normalize()).multiply(parent);
  /** Drives the skeleton from the ragdoll points (in the fighter's model space, as it stood at death): pelvis and
   * chest from the hip and shoulder lines, the other bones aimed along their sticks, helper bones halfway. */
  function writeRag(f: Fig) {
    const r = f.rag!, local = (b: number, parent: number) => f.bones[b].quaternion.copy(qa.copy(wq[parent]).invert().multiply(wq[b]));
    for (let i = 0; i < RD.POINTS; i++) { RD.point(r, i, pv); mp[i].set(pv.x, pv.y, pv.z).applyMatrix4(f.ragInv); }
    const sub = (a: number, b: number, out: THREE.Vector3) => out.copy(mp[a]).sub(mp[b]);
    const bv = (a: number, b: number) => new THREE.Vector3().copy(JOINT[a]).sub(JOINT[b]);
    wq[B.root].identity(); f.bones[B.root].quaternion.identity();
    frame(sub(RD.P.hipR, RD.P.hipL, fx.clone()), sub(RD.P.chest, RD.P.pelvis, fy.clone()), wq[B.pelvis]).multiply(BIND_PELVIS);
    frame(sub(RD.P.shR, RD.P.shL, fx.clone()), sub(RD.P.neck, RD.P.chest, fy.clone()), wq[B.spine2]).multiply(BIND_CHEST);
    wq[B.spine1].copy(wq[B.pelvis]).slerp(wq[B.spine2], 0.5);
    f.bones[B.pelvis].position.copy(mp[RD.P.pelvis]);
    local(B.pelvis, B.root); local(B.spine1, B.pelvis); local(B.spine2, B.spine1);
    aim(wq[B.spine2], bindPt[RD.P.head].clone().sub(JOINT[B.neck]), sub(RD.P.head, RD.P.neck, new THREE.Vector3()), wq[B.neck]); local(B.neck, B.spine2);
    f.bones[B.head].quaternion.identity();
    for (const sd of [0, 1]) {
      const S = SIDE[sd], o = sd ? 1 : 0;
      wq[S.clav].copy(wq[B.spine2]); f.bones[S.clav].quaternion.identity();
      aim(wq[S.clav], bv(S.fore, S.upper), sub(RD.P.elL + o, RD.P.shL + o, new THREE.Vector3()), wq[S.upper]); local(S.upper, S.clav);
      aim(wq[S.upper], bv(S.hand, S.fore), sub(RD.P.haL + o, RD.P.elL + o, new THREE.Vector3()), wq[S.fore]); local(S.fore, S.upper);
      aim(wq[B.pelvis], bv(S.shin, S.thigh), sub(RD.P.knL + o, RD.P.hipL + o, new THREE.Vector3()), wq[S.thigh]); local(S.thigh, B.pelvis);
      aim(wq[S.thigh], bv(S.foot, S.shin), sub(RD.P.ftL + o, RD.P.knL + o, new THREE.Vector3()), wq[S.shin]); local(S.shin, S.thigh);
      for (const b of [S.hand, S.foot, S.toe, S.twist]) f.bones[b].quaternion.identity();
      f.bones[S.elbow].quaternion.identity().slerp(f.bones[S.fore].quaternion, 0.5);
      f.bones[S.knee].quaternion.identity().slerp(f.bones[S.shin].quaternion, 0.5);
      f.bones[S.delt].quaternion.identity().slerp(f.bones[S.upper].quaternion, 0.5); f.bones[S.delt].scale.setScalar(1);
      f.bones[S.hip].quaternion.identity().slerp(f.bones[S.thigh].quaternion, 0.5);
    }
    // The weapon: its own three points give its turn since death; its origin is the first point.
    if (r.gun) {
      for (let i = 0; i < 3; i++) { RD.gunPoint(r, i, pv); gp[i].set(pv.x, pv.y, pv.z); }
      gunFrame(gp, qb).multiply(f.gunF).multiply(f.gunQ);
      fm.compose(gp[0], qb, s3.set(SCALE, SCALE, SCALE)).premultiply(f.ragInv);
      fm.decompose(f.weapon.position, f.weapon.quaternion, f.weapon.scale);
    }
  }

  const api: PatchFighters = {
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
        if (p.alive && f.rag) { f.rag = null; f.kill = null; f.fresh = true; }
        if (f.fresh) { f.anim.reset(inp); f.fresh = false; f.px = NaN; }
        // The fighter's own speed, carried into the ragdoll at death.
        if (dt > 0 && p.alive) { if (Number.isFinite(f.px)) { f.vx = (f.anim.root.x - f.px) / dt; f.vz = (f.anim.root.z - f.pz) / dt; } f.px = f.anim.root.x; f.pz = f.anim.root.z; }
        if (!show) continue;
        if (!p.alive && f.kill && !f.rag && m.world) startRag(f, f.kill);
        if (f.rag) { RD.advance(f.rag, m.world as World, dt); writeRag(f); }
        else f.anim.update(inp, dt);
        // Job 12.2: wounds and hurt state into the body material; a reaction away from the last hit.
        const bm = f.mats[0] as unknown as { userData: { wound?: { value: THREE.Vector4[] }; hurt?: { value: number } } };
        bm.userData.wound!.value = f.wounds; bm.userData.hurt!.value = Math.max(f.hurt, p.alive ? 0 : 0.85);
        if (p.alive && f.react.t < 0.45) {
          f.react.t += dt; const k = Math.sin(Math.min(1, f.react.t / 0.45) * Math.PI) * 0.22;
          q4.setFromAxisAngle(v3.set(f.react.az, 0, -f.react.ax).normalize(), k); f.bones[B.spine2].quaternion.premultiply(q4);
          if (f.react.limb >= 0) { q4.setFromAxisAngle(v3.set(1, 0, 0), k * 1.3); f.bones[f.react.limb].quaternion.premultiply(q4); }
        }
        f.phase = f.anim.gaitPhase * Math.PI * 2;
        if (!f.rag) { f.group.position.set(f.anim.root.x, 0, f.anim.root.z); f.group.rotation.y = f.anim.yaw; }
        const l = lighting.probe(f.x, 1.1, f.z).color;
        color.setRGB(SHADE_FILL + l[0] * PROBE_GAIN, SHADE_FILL + l[1] * PROBE_GAIN, SHADE_FILL * 1.06 + l[2] * PROBE_GAIN).multiplyScalar(Math.PI);
        f.weaponMat.userData.probe.value.copy(color);
        for (const mt of f.mats) mt.userData.probe.value.copy(color).multiplyScalar(BODY_GAIN * PATCH_LOOKS[f.squad].gain);
        const env = lighting.environment(f.x, f.z), es = lighting.environmentScale(f.x, f.z) * 0.8;
        if (f.weaponMat.envMap !== env) { f.weaponMat.envMap = env; f.weaponMat.needsUpdate = true; for (const mt of f.mats) { mt.envMap = env; mt.needsUpdate = true; } }
        f.weaponMat.envMapIntensity = es; for (const mt of f.mats) mt.envMapIntensity = es;
        f.dist = camOk ? Math.hypot(cam.x - f.x, cam.y - 1.2, cam.z - f.z) : Math.hypot(view.px - f.x, view.pz - f.z);
        order.push(f);
        if (blob < 10) { const lie = p.alive ? 0 : 0.9; if (f.rag) RD.point(f.rag, RD.P.pelvis, pv); else { pv.x = f.x; pv.z = f.z; } blobs.setMatrixAt(blob++, m4.compose(v3.set(pv.x, 0.04, pv.z), q4.identity(), s3.set(1.0 + lie, 1, 1.0 + lie))); }
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
    pose(i) {
      if (fallback) return fallback.pose(i);
      const f = figs[i]; if (!f) return null;
      // A fallen fighter is where its body came to rest (the animator's root after the fall), which the environment's
      // blood pool follows; a living one is its simulated position.
      if (f.rag) { RD.point(f.rag, RD.P.pelvis, pv); return { x: pv.x, z: pv.z, yaw: f.anim.yaw, pitch: f.pitch, crouch: f.crouch, lean: f.lean, phase: f.phase }; }
      return f.died >= 0 ? { x: f.anim.root.x, z: f.anim.root.z, yaw: f.anim.yaw, pitch: f.pitch, crouch: f.crouch, lean: f.lean, phase: f.phase } : f;
    },
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
        if (e.e === 'shot') lastShot.set(e.id, e);
        else if (e.e === 'boom') lastBoom = { x: e.x, y: e.y, z: e.z };
        else if (e.e === 'hit') wound(e.on, e.by, e.head, e.hp);
        else if (e.e === 'reload' && e.id !== self) { const f = figs[e.id], p = m.players[e.id]; if (f && p && p.reload <= 0) { f.remoteReload = WEAPONS[weaponIdOf(m, p)].reload; f.reloadEmpty = p.mag[p.slot] === 0; } }
        else if (e.e === 'kill') {
          const f = figs[e.on], v = m.players[e.on], k = m.players[e.by];
          if (!f || !v || !k || e.by === e.on) continue;
          const a = wrap(Math.atan2(-(k.x - v.x), -(k.z - v.z)) - v.yaw);
          f.deathKind = Math.abs(a) < 0.9 ? 0 : Math.abs(a) > 2.3 ? 1 : 2;
          f.died = m.t;
          // Job 12.6: what the ragdoll starts from. Explosions name a grenade or the breach charge; melee is 'Melee'.
          const s = lastShot.get(e.by), kind = /grenade|charge/i.test(e.w) ? 'blast' : e.w === 'Melee' ? 'melee' : 'gun';
          f.kill = { kind, shot: s ? { x: s.x, y: s.y, z: s.z, yaw: s.yaw, pitch: s.pitch, w: s.w } : null, boom: lastBoom && { ...lastBoom }, head: e.head, kx: k.x, kz: k.z, seed: e.on * 7919 + v.deaths * 131 + e.by * 17 };
        }
      }
    },
    reset(ids) {
      if (fallback) return fallback.reset(ids);
      // A new round (or a respawn) clears wounds, hurt state and the body.
      const clear = (f: Fig) => { f.fresh = true; f.nWound = 0; f.hurt = 0; f.died = -1; f.kill = null; f.rag = null; f.react.t = 9; for (const w of f.wounds) w.set(0, -9, 0, 0); };
      if (!ids) { for (const f of figs) if (f) clear(f); return; }
      for (const id of ids) { const f = figs[id]; if (f) clear(f); }
    },
    /** Job 12.2: fighters lying where they fell this round (bodies stay until the round ends): position, facing and
     * the match time of death, for the environment's blood pool. */
    bodies() {
      const out: PatchBody[] = [];
      figs.forEach((f, id) => { if (!f || f.died < 0 || !f.group.visible) return; if (f.rag) RD.point(f.rag, RD.P.pelvis, pv); else { pv.x = f.anim.root.x; pv.z = f.anim.root.z; } out.push({ id, x: pv.x, z: pv.z, yaw: f.anim.yaw, t: f.died }); });
      return out;
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
