/** The asset-rendered parts of the level: rooms rebuilt from render/levelgeo.ts with photo-sourced materials,
 * baked lightmaps and modelled props. Everything here is drawn in its own light-free scene, because its light is
 * baked. Rooms it does not cover keep the procedural look, and so does everything if loading fails. */
import * as THREE from 'three';
import { WALL_H } from '../config';
import type { Claim, FaceRec, PanelLook } from '../levelmesh';
import type { RGB } from '../lightbake';
import { MAP } from '../map';
import { TILE, type TexId } from '../textures';
import { ArtLoader, type Tier } from './assets';
import { REGIONS, collectFaces, faceArrays, packAtlas, splitFace, type GeoArrays } from './levelgeo';
import { FIXTURES } from './fixtures';
import { fixtureMeshes } from './fixturemesh';
import { dressLab, type DressKey } from './labdress';
import { clockFace, safetySign } from './printed';
import { artMaterial } from './materials';
import { PROPS } from './props';
import { PLANKS, SURFACES } from './surfaces';

interface BakeInfo {
  version: number; region: string; meanLight?: number; width: number; height: number; density: number; scale: number;
  props: number[][];
  grid: { x0: number; z0: number; nx: number; nz: number; heights: number[]; sh: number[][] };
  panels: { index: number; side: number; light: number[] }[];
}
export interface ArtWorld {
  group: THREE.Group;
  claim: Claim;
  panelLook(index: number): PanelLook | null;
  /** Fits the environment probes once the group is in a scene. */
  capture(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void;
  stats: { triangles: number; meshes: number; textureBytes: number };
  readonly envReady: boolean;
  /** The reflection probe for the room containing (x, z), or null. */
  environment(x: number, z: number): THREE.Texture | null;
  /** 1 / the mean baked surface light of the room containing (x, z), or 1 outside art rooms. */
  environmentScale(x: number, z: number): number;
  dispose(): void;
}

const TEX_SIZE: Record<Tier, number> = { low: 512, medium: 1024, high: 1024 };
const PROP_SIZE: Record<Tier, number> = { low: 256, medium: 512, high: 512 };

function geometry(a: GeoArrays): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(a.position, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(a.normal, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(a.uv, 2));
  g.setAttribute('uv1', new THREE.Float32BufferAttribute(a.uv1, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(a.color, 3));
  g.setIndex(a.index);
  g.computeBoundingSphere();
  return g;
}

/** Scales and turns metre UVs into texture repeats. */
function mapUv(uv: number[], sx: number, sy: number, rotate = 0) {
  const c = Math.cos(rotate), s = Math.sin(rotate);
  for (let i = 0; i < uv.length; i += 2) { const u = uv[i], v = uv[i + 1]; uv[i] = (u * c - v * s) / sx; uv[i + 1] = (u * s + v * c) / sy; }
}

export async function loadArtWorld(renderer: THREE.WebGLRenderer, tier: Tier, procedural: Record<TexId, THREE.Texture>, progress: (f: number) => void): Promise<ArtWorld> {
  const L = new ArtLoader(renderer, tier, progress), full = tier !== 'low';
  /** Debug switches for visual review only (?artdbg=nodir,nonormal,noenv,noarm). */
  const dbg = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('artdbg')?.split(',') ?? [] : [];
  const group = new THREE.Group(), materials: THREE.Material[] = [], geometries: THREE.BufferGeometry[] = [], disposers: (() => void)[] = [];
  const { byRegion } = collectFaces();
  const sets = new Map<string, Promise<[THREE.Texture, THREE.Texture | null, THREE.Texture | null]>>();
  const set = (name: string, size: number) => {
    let p = sets.get(name);
    if (!p) { p = Promise.all([L.texture(name, 'diff', size), full ? L.texture(name, 'nor', size) : null, full ? L.texture(name, 'arm', size) : null]); sets.set(name, p); }
    return p;
  };
  const models = new Map<string, ReturnType<ArtLoader['model']>>();
  for (const p of PROPS) if (!models.has(p.model)) models.set(p.model, L.model(p.model));

  const looks = new Map<number, PanelLook>();
  const envLights: THREE.MeshStandardMaterial[] = [];
  let envLight = 1;
  await Promise.all(REGIONS.map(async (region, r) => {
    const [info, lightMap, dirMap] = await Promise.all([
      L.json<BakeInfo>(`bake/${region.name}.json`), L.bakeMap(`bake/${region.name}-light.png`, true), full ? L.bakeMap(`bake/${region.name}-dir.png`, false) : Promise.resolve(null),
    ]);
    const faces = byRegion[r], atlas = packAtlas(faces.filter(f => !f.glow), info.density);
    if (atlas.width !== info.width || atlas.height !== info.height) throw new Error(`${region.name}: lightmap is out of date (rebake)`);
    // Average light the room's probe sees, for specular occlusion.
    envLight = info.meanLight ?? 1;
    // One mesh per surface type.
    const ids = [...new Set(atlas.charts.map(c => c.face.tex))];
    for (const id of ids) {
      const a = faceArrays(atlas, f => f.tex === id), s = SURFACES[id];
      let map: THREE.Texture, nor: THREE.Texture | null = null, arm: THREE.Texture | null = null;
      if (s) {
        [map, nor, arm] = await set(s.set, TEX_SIZE[tier]);
        mapUv(a.uv, s.size, s.size, s.rotate);
        if (s.tint) for (let i = 0; i < a.color.length; i++) a.color[i] *= s.tint[i % 3];
      } else {
        map = procedural[id];
        if (!atlas.charts.some(c => c.face.tex === id && c.face.mode === 'fit')) mapUv(a.uv, TILE[id][0], TILE[id][1]);
      }
      if (dbg.includes('nonormal')) nor = null;
      if (dbg.includes('noarm')) arm = null;
      const mat = artMaterial({ map, normalMap: nor, armMap: dbg.includes('metal') ? null : arm, lightMap, lightScale: info.scale, dirMap: dbg.includes('nodir') ? null : dirMap, vertexTint: true, roughness: dbg.includes('mirror') ? 0.02 : arm ? s?.gloss ?? 1 : 0.85, metalness: dbg.includes('metal') ? 1 : arm ? 1 : 0, band: s?.band, spec: s?.spec, specOnly: dbg.includes('speconly') });
      const g = geometry(a), mesh = new THREE.Mesh(g, mat);
      mesh.matrixAutoUpdate = false; mesh.name = `art:${region.name}:${id}`;
      group.add(mesh); materials.push(mat); geometries.push(g); envLights.push(mat);
    }
    // Modelled dressing, lit by the lightmap of whatever it stands on.
    if (region.name === 'lab') {
      const printed = { sign: safetySign(), clock: clockFace() };
      disposers.push(() => { printed.sign.dispose(); printed.clock.dispose(); });
      const D = dressLab(atlas, region), [bm, bn, ba] = await set('blue_metal_plate', TEX_SIZE[tier]), [pm, pn, pa] = await set('painted_plaster_wall', TEX_SIZE[tier]);
      const plain = (color: [number, number, number], roughness: number, metalness: number) => ({ map: null, normalMap: null, armMap: null, color: new THREE.Color(...color), roughness, metalness });
      const looks: Record<DressKey, Parameters<typeof artMaterial>[0]> = {
        door: { map: bm, normalMap: bn, armMap: ba, color: new THREE.Color(1.55, 1.62, 1.7), roughness: 0.8, metalness: 1 },
        locker: { map: pm, normalMap: pn, armMap: pa, color: new THREE.Color(0.52, 0.58, 0.52), roughness: 0.55, metalness: 1 },
        trim: { map: pm, normalMap: pn, armMap: pa, color: new THREE.Color(0.3, 0.36, 0.44), roughness: 0.7, metalness: 1 },
        handle: plain([0.72, 0.72, 0.7], 0.32, 1), chrome: plain([0.92, 0.92, 0.92], 0.07, 1), steel: plain([0.66, 0.67, 0.68], 0.28, 1),
        grid: plain([0.78, 0.78, 0.76], 0.5, 0),
        conduit: plain([0.55, 0.56, 0.56], 0.45, 1), socket: plain([0.82, 0.81, 0.78], 0.42, 0), kick: plain([0.035, 0.035, 0.04], 0.55, 0),
        cork: plain([0.42, 0.28, 0.15], 0.9, 0), paper: plain([0.86, 0.86, 0.84], 0.85, 0), plastic: plain([0.16, 0.17, 0.18], 0.45, 0),
        aid: plain([0.1, 0.42, 0.18], 0.5, 0),
        screen: { ...plain([0.02, 0.03, 0.04], 0.12, 0), emissive: new THREE.Color(0.05, 0.11, 0.16) },
        sign: { map: printed.sign, normalMap: null, armMap: null, roughness: 0.5, metalness: 0 },
        clock: { map: printed.clock, normalMap: null, armMap: null, roughness: 0.15, metalness: 0 },
        amber: plain([0.2, 0.08, 0.015], 0.05, 0), glass: plain([0.1, 0.13, 0.125], 0.04, 0),
      };
      for (const [key, arrays] of D.parts) {
        const o = looks[key as DressKey];
        // The throttled tier has no reflection probe, so metals would read black: draw them as painted.
        // Bare metal (no texture) would read chalk-white as paint, so it is darkened to its average reflected tone.
        const asPaint = full ? {} : { metalness: 0, armMap: null, color: !o.map && (o.metalness ?? 0) > 0.5 ? new THREE.Color(o.color as THREE.Color).multiplyScalar(0.42) : o.color };
        const mat = artMaterial({ ...o, ...asPaint, lightMap, lightScale: info.scale, dirMap, vertexTint: true });
        const g = geometry(arrays), mesh = new THREE.Mesh(g, mat);
        mesh.matrixAutoUpdate = false; mesh.name = `art:${region.name}:dress:${key}`;
        group.add(mesh); materials.push(mat); geometries.push(g); envLights.push(mat);
      }
      if (D.missed) console.warn(`Breachline art: ${D.missed} dressing pieces found no surface to stand on: ${D.misses.join(' ')}`);
    }
    // The room's own light fixtures glow (the map's lamp panels in this room are not drawn).
    const fx = fixtureMeshes(FIXTURES[region.name] ?? []);
    for (const m of fx.meshes) group.add(m);
    disposers.push(fx.dispose);
    // Destructible panels facing into the room.
    const wallSet = SURFACES.drywall;
    const [wmap, wnor, warm] = wallSet ? await set(wallSet.set, TEX_SIZE[tier]) : [procedural.drywall, null, null];
    const wall = dbg.includes('panelbasic') ? new THREE.MeshBasicMaterial({ map: wmap, vertexColors: true }) as unknown as THREE.MeshStandardMaterial
      : artMaterial({ map: wmap, normalMap: wnor, armMap: warm, vertexLight: true, roughness: warm ? 1 : 0.9, metalness: warm ? 1 : 0, band: wallSet?.band });
    materials.push(wall); if (wall.userData.art) envLights.push(wall);
    const tables = new Map<number, Map<number, Float32Array>>();
    for (const p of info.panels) { let t = tables.get(p.index); if (!t) tables.set(p.index, t = new Map()); t.set(p.side, new Float32Array(p.light)); }
    const [km, kn, ka] = await set(PLANKS.set, TEX_SIZE[tier]);
    const planks = artMaterial({ map: km, normalMap: kn, armMap: ka, vertexLight: true, roughness: 1, metalness: ka ? 1 : 0, color: new THREE.Color(...(PLANKS.tint ?? [1, 1, 1])) });
    materials.push(planks); envLights.push(planks);
    for (const [index, t] of tables) looks.set(index, { ...panelLook(MAP.panels[index].cols + 1, t, wall, wallSet ? [wallSet.size, wallSet.size] : TILE.drywall), planks, plankTile: [PLANKS.size, PLANKS.size] });
  }));
  // Props, each lit by its own baked probe.
  const info = await L.json<BakeInfo>(`bake/${REGIONS[0].name}.json`);
  for (const [i, p] of PROPS.entries()) {
    const gltf = await models.get(p.model)!, root = gltf.scene.clone(true);
    const meshes: THREE.Mesh[] = [];
    root.traverse(o => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
    for (const mesh of meshes) {
      const src = mesh.material as THREE.MeshStandardMaterial, key = `${p.model}--${src.name}`;
      const [map, nor, arm] = await set(key, PROP_SIZE[tier]);
      const mat = artMaterial({ map, normalMap: nor, armMap: dbg.includes('metal') ? null : arm, sh: info.props[i], roughness: arm ? 1 : 0.7, metalness: arm ? 1 : 0 });
      mesh.material = mat; materials.push(mat); envLights.push(mat);
      mesh.matrixAutoUpdate = true;
    }
    root.position.set(p.x, p.y, p.z); root.rotation.y = p.yaw; root.scale.setScalar(p.scale ?? 1);
    group.add(root);
  }
  for (const m of envLights) m.userData.art.artEnvLight.value = Math.max(0.05, envLight);
  let triangles = 0, meshes = 0;
  group.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { meshes++; const g = m.geometry; triangles += (g.index ? g.index.count : g.attributes.position.count) / 3; } });

  let env: THREE.WebGLRenderTarget | null = null;
  const claimFaces: Claim = f => { let left: FaceRec[] = [f]; for (const r of REGIONS) left = left.flatMap(g => splitFace(g, r).outside); return left; };
  return {
    group, claim: claimFaces, stats: { triangles, meshes, textureBytes: L.bytes },
    panelLook: i => looks.get(i) ?? null,
    get envReady() { return env !== null; },
    environmentScale(x, z) { const r = REGIONS[0]; return env && x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1 ? 1 / Math.max(0.05, envLight) : 1; },
    environment(x, z) { const r = REGIONS[0]; return env && x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1 ? env.texture : null; },
    capture(renderer, scene) {
      if (!full || dbg.includes('noenv')) return;
      // One reflection probe per room, from its middle at eye height.
      const r = REGIONS[0], cube = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
      const cam = new THREE.CubeCamera(0.05, 60, cube);
      cam.position.set((r.x0 + r.x1) / 2, 1.6, (r.z0 + r.z1) / 2);
      // Reflections are projected onto the room's box, so they line up with the room from anywhere in it.
      if (!dbg.includes('nobox')) for (const m of envLights) {
        const u = m.userData.art;
        u.artBoxMin.value.set(r.x0, 0, r.z0); u.artBoxMax.value.set(r.x1, WALL_H, r.z1); u.artProbe.value.copy(cam.position);
      }
      // The game renders with autoClear off; a fresh cube target's depth starts at 0, so it must be cleared here.
      const auto = renderer.autoClear, target = renderer.getRenderTarget();
      renderer.autoClear = true;
      cam.update(renderer, scene);
      renderer.autoClear = auto; renderer.setRenderTarget(target);
      const pmrem = new THREE.PMREMGenerator(renderer);
      env = pmrem.fromCubemap(cube.texture);
      pmrem.dispose(); cube.dispose();
      for (const m of envLights) { m.envMap = env.texture; m.needsUpdate = true; }
    },
    dispose() {
      for (const m of materials) m.dispose();
      for (const g of geometries) g.dispose();
      group.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
      env?.dispose();
      for (const d of disposers) d();
      L.dispose();
    },
  };
}

function panelLook(width: number, t: Map<number, Float32Array>, wall: THREE.Material, tile: readonly [number, number]): PanelLook {
  const at = (side: number, c: number, r: number): RGB | null => {
    const v = t.get(side), k = (r * width + c) * 3;
    return v && c >= 0 && c < width && k + 2 < v.length ? [v[k], v[k + 1], v[k + 2]] : null;
  };
  return {
    wall, tile,
    light(c, r, side) {
      if (side !== 0) return at(side, c, r);
      const a = at(1, c, r), b = at(-1, c, r);
      return a && b ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2] : a ?? b;
    },
  };
}
