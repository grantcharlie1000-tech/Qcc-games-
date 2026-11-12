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
import { ROOM_LOOK, roomAmbience } from './ambience';
import { wallRuns } from './labdress';
import { dressRoom, type DressKey } from './labdress';
import { BOX_H, BOX_W, LABEL_VARIANTS, archiveBoxGeometry, labelAtlas, labelGeometry } from './archivebox';
import type { DetailBuilder, DressProxy } from './detail';
import { clockFace, exitSign, fireSign, roomSigns, safetySign } from './printed';
import { artMaterial } from './materials';
import { PROPS, propKey } from './props';
import { DEFAULT_ALBEDO, PLANKS, PROCEDURAL_ALBEDO, SET_ALBEDO, SURFACES } from './surfaces';

interface BakeInfo {
  version: number; region: string; meanLight?: number; width: number; height: number; density: number; scale: number;
  props: number[][];
  /** Which placement each probe in `props` belongs to (render/props.ts `propKey`); older bakes go by list order. */
  propKeys?: string[];
  grid: { x0: number; z0: number; nx: number; nz: number; heights: number[]; sh: number[][] };
  panels: { index: number; side: number; light: number[] }[];
}
export interface ArtWorld {
  group: THREE.Group;
  claim: Claim;
  panelLook(index: number): PanelLook | null;
  /** Captures the next room's reflection probe (one per call, so no single frame stalls). True when all are done. */
  captureNext(renderer: THREE.WebGLRenderer, scene: THREE.Scene): boolean;
  /** Hides each room's small dressing while the camera is more than DRESS_RANGE metres from the room (draw calls). */
  cull(eye: THREE.Vector3): void;
  /** Shows the models of set piece `piece` that belong to damage state `state` (render/setpiecemodels.ts). */
  pieceState(piece: number, state: number): void;
  /** Removes a breakable dressing piece from its merged mesh (10.2); `restoreDress` puts every one back. */
  hideDress(p: DressProxy): void;
  restoreDress(): void;
  /** The ceiling fittings drawn in loaded rooms, and the lens of each (its glow goes when one is shot). */
  fittings: { x: number; z: number; w: number; d: number; lens(on: boolean): void }[];
  /** What a round can mark on its way through (no collision: rounds pass): each dressing piece's box and material key,
   * and each modelled prop with its bounds (render/surfacehit.ts names their materials). */
  markables: { dress: { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; key: string }[]; props: { box: THREE.Box3; object: THREE.Object3D; model: string; piece?: number }[] };
  /** Compiles every shader the art needs (in parallel where the browser can), so its first frame does not stall. */
  warm(renderer: THREE.WebGLRenderer, camera: THREE.Camera, scene: THREE.Scene, samples: number): Promise<void>;
  stats: { triangles: number; meshes: number; textureBytes: number };
  readonly envReady: boolean;
  /** The reflection probe for the room containing (x, z), or null. */
  environment(x: number, z: number): THREE.Texture | null;
  /** 1 / the mean baked surface light of the room containing (x, z), or 1 outside art rooms. */
  environmentScale(x: number, z: number): number;
  dispose(): void;
}

const TEX_SIZE: Record<Tier, number> = { low: 512, medium: 1024, high: 1024 };
/** Texture sets only ever seen from a distance (their normal maps load at half size). */
const FAR_SETS = new Set(['OfficeCeiling001', 'preconcrete_wall_001', 'aerial_grass_rock']);
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
  /** Each room's dressing meshes, shown only within DRESS_RANGE metres of the room's rectangle. */
  const DRESS_RANGE = 10, dressing: { x0: number; z0: number; x1: number; z1: number; meshes: THREE.Object3D[] }[] = [];
  const group = new THREE.Group(), materials: THREE.Material[] = [], geometries: THREE.BufferGeometry[] = [], disposers: (() => void)[] = [];
  const { byRegion } = collectFaces();
  const sets = new Map<string, Promise<[THREE.Texture, THREE.Texture | null, THREE.Texture | null]>>();
  const set = (name: string, size: number) => {
    let p = sets.get(name);
    // Occlusion, roughness and metal vary slowly across a surface: at 1024 colour and normals, they come at 512 (half
    // the High download of the texture sets for no visible change).
    // Normals at half size too for the surfaces never seen up close: the ceiling overhead, the perimeter's precast
    // wall and the matte grass.
    const half = size >= 1024 ? size / 2 : size, nor = FAR_SETS.has(name) ? half : size;
    if (!p) { p = Promise.all([L.texture(name, 'diff', size), full ? L.texture(name, 'nor', nor) : null, full ? L.texture(name, 'arm', half) : null]); sets.set(name, p); }
    return p;
  };
  const boxes: (DetailBuilder['boxes'][number] & { room: number })[] = [];
  const markables: ArtWorld['markables'] = { dress: [], props: [] };
  const pieceProps = new Map<number, { object: THREE.Object3D; states: number[] }[]>();
  // Breakable dressing: each piece's geometry and first vertex there, and the positions it had before it was removed.
  const dressAt = new Map<DressProxy, { geo: THREE.BufferGeometry; start: number }>(), hidden = new Map<DressProxy, Float32Array>();
  const fittings: ArtWorld['fittings'] = [];
  const models = new Map<string, ReturnType<ArtLoader['model']>>();
  const lods = new Map<string, ReturnType<ArtLoader['model']>>();
  // High draws each prop's full model near and its simplified level (compacted at build, so small) beyond a few
  // metres; Low draws only the simplified one.
  for (const p of PROPS) if (!lods.has(p.model)) { if (full) models.set(p.model, L.model(p.model)); lods.set(p.model, L.model(`${p.model}.lod1`)); }

  const looks = new Map<number, PanelLook>();
  /** Per room: the materials its reflection probe lights, its mean baked light, its probe once captured. */
  const rooms = REGIONS.map(() => ({ envLights: [] as THREE.MeshStandardMaterial[], envLight: 1, env: null as THREE.WebGLRenderTarget | null, captured: false, props: [] as number[][] }));
  /** Panel corner light from every room's bake (a wall between two art rooms is listed by both, one side each). */
  const tables = new Map<number, { t: Map<number, Float32Array>; walls: Map<number, THREE.Material>; planks: THREE.Material; plate: THREE.Material; tile: readonly [number, number] }>();
  const roomAt = (x: number, z: number) => REGIONS.findIndex(r => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);
  /** Rooms whose art loaded; any room that fails keeps the procedural look on its own. */
  const loaded = REGIONS.map(() => false);
  const dressOf = (region: { x0: number; z0: number; x1: number; z1: number }) => {
    let d = dressing.find(e => e.x0 === region.x0 && e.z0 === region.z0);
    if (!d) dressing.push(d = { x0: region.x0, z0: region.z0, x1: region.x1, z1: region.z1, meshes: [] });
    return d.meshes;
  };
  await Promise.all(REGIONS.map(async (region, r) => { try {
    const envLights = rooms[r].envLights;
    const [info, lightMap, dirMap] = await Promise.all([
      L.json<BakeInfo>(`bake/${region.name}.json`), L.bakeMap(`bake/${region.name}-light.png`, true), full ? L.bakeMap(`bake/${region.name}-dir.png`, false) : Promise.resolve(null),
    ]);
    const faces = byRegion[r], atlas = packAtlas(faces.filter(f => !f.glow), info.density), look = ROOM_LOOK[region.name];
    if (atlas.width !== info.width || atlas.height !== info.height) throw new Error(`${region.name}: lightmap is out of date (rebake)`);
    // Average light the room's probe sees, for specular occlusion.
    rooms[r].envLight = info.meanLight ?? 1;
    rooms[r].props = info.propKeys ? PROPS.map(p => info.props[info.propKeys!.indexOf(propKey(p))]) : info.props;
    // One mesh per surface type.
    const ids = [...new Set(atlas.charts.map(c => c.face.tex))];
    const merged = new Map<string, { a: ReturnType<typeof faceArrays>; mat: THREE.MeshStandardMaterial; id: string }>();
    // Light tier: the whole room as one vertex-coloured mesh, for when it is seen far off through an opening: each
    // surface's average colour times its tint times the baked light at the vertex (read once from the lightmap).
    const far = tier === 'low' ? { pos: [] as number[], col: [] as number[], idx: [] as number[], lm: imagePixels(lightMap.image as CanvasImageSource & { width: number; height: number }) } : null;
    for (const id of ids) {
      const a = faceArrays(atlas, f => f.tex === id), s = SURFACES[id];
      let map: THREE.Texture, nor: THREE.Texture | null = null, arm: THREE.Texture | null = null;
      if (s) {
        [map, nor, arm] = await set(s.set, TEX_SIZE[tier]);
        mapUv(a.uv, s.size, s.size, s.rotate);
        if (s.tint) for (let i = 0; i < a.color.length; i++) a.color[i] *= s.tint[i % 3];
        // The room's own wall tone (render/ambience.ts ROOM_LOOK).
        // An accent wall takes its own paint: the faces on the plane x (or z) = at, facing into the room.
        if (look && (id === 'drywall' || id === 'cinder')) for (let i = 0; i < a.color.length; i++) {
          const v = Math.floor(i / 3), ac = look.accent, on = ac && Math.abs(a.position[v * 3 + (ac.axis === 'x' ? 0 : 2)] - ac.at) < 0.2 && Math.abs(a.normal[v * 3 + (ac.axis === 'x' ? 0 : 2)]) > 0.9;
          a.color[i] *= on ? ac.tint[i % 3] : look.wall[i % 3];
        }
      } else {
        map = procedural[id];
        if (!atlas.charts.some(c => c.face.tex === id && c.face.mode === 'fit')) mapUv(a.uv, TILE[id][0], TILE[id][1]);
      }
      if (far && far.lm) {
        const alb = (s ? SET_ALBEDO[s.set] : PROCEDURAL_ALBEDO[id]) ?? DEFAULT_ALBEDO, base = far.pos.length / 3, { w, h, data } = far.lm;
        for (let v = 0; v < a.position.length / 3; v++) {
          const px = Math.min(w - 1, Math.max(0, Math.floor(a.uv1[v * 2] * w))), py = Math.min(h - 1, Math.max(0, Math.floor(a.uv1[v * 2 + 1] * h))), k = (py * w + px) * 4;
          far.pos.push(a.position[v * 3], a.position[v * 3 + 1], a.position[v * 3 + 2]);
          for (let c = 0; c < 3; c++) far.col.push(a.color[v * 3 + c] * alb[c] * srgbToLinear(data[k + c]) * info.scale);
        }
        for (const k of a.index) far.idx.push(base + k);
      }
      if (dbg.includes('nonormal')) nor = null;
      if (dbg.includes('noarm')) arm = null;
      const mat = artMaterial({ map, normalMap: nor, armMap: dbg.includes('metal') ? null : arm, lightMap, lightScale: info.scale, dirMap: dbg.includes('nodir') ? null : dirMap, vertexTint: true, roughness: dbg.includes('mirror') ? 0.02 : arm ? s?.gloss ?? 1 : 0.85, metalness: dbg.includes('metal') ? 1 : arm ? 1 : 0, band: (id === 'drywall' || id === 'cinder') && look?.band ? look.band : s?.band, tiles: (id === 'drywall' || id === 'cinder') ? look?.tiles : null, bands: look?.bands, wear: s?.wear, spec: s?.spec, normalScale: s?.normal, specOnly: dbg.includes('speconly') });
      // On the light tier, surfaces with nothing of their own in the shader (no painted band or worn path) that share a
      // texture set are drawn as one mesh per set: their tint and scale are already in the vertices.
      if (tier === 'low' && s && !s.band && !s.wear && !(look?.band && (id === 'drywall' || id === 'cinder'))) {
        const m = merged.get(s.set);
        if (!m) merged.set(s.set, { a, mat, id });
        else { const base = m.a.position.length / 3; for (const k of ['position', 'normal', 'uv', 'uv1', 'color'] as const) for (const v of a[k]) m.a[k].push(v); for (const k of a.index) m.a.index.push(base + k); m.id = `${m.id}+${id}`; mat.dispose(); }
        continue;
      }
      const g = geometry(a), mesh = new THREE.Mesh(g, mat);
      mesh.matrixAutoUpdate = false; mesh.name = `art:${region.name}:${id}`;
      group.add(mesh); materials.push(mat); geometries.push(g); envLights.push(mat);
    }
    for (const { a, mat, id } of merged.values()) {
      const g = geometry(a), mesh = new THREE.Mesh(g, mat);
      mesh.matrixAutoUpdate = false; mesh.name = `art:${region.name}:${id}`;
      group.add(mesh); materials.push(mat); geometries.push(g); envLights.push(mat);
    }
    if (far && far.idx.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(far.pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(far.col, 3)); g.setIndex(far.idx);
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, farMaterial()); mesh.matrixAutoUpdate = false; mesh.name = `art:${region.name}:far`; mesh.userData.farRoom = r;
      group.add(mesh); geometries.push(g);
    }
    // Modelled dressing, lit by the lightmap of whatever it stands on.
    {
      const printed = { sign: safetySign(), clock: clockFace(), exit: exitSign(), fire: fireSign(), rooms: roomSigns() };
      disposers.push(() => { for (const t of Object.values(printed)) t.dispose(); });
      const tDress = performance.now();
      const D = dressRoom(atlas, region);
      for (const b of D.boxes) boxes.push({ ...b, room: r });
      markables.dress.push(...D.proxies);
      for (const b of D.boxes) { const h = Math.max(b.w, b.depth) / 2 + 0.02; markables.dress.push({ x0: b.x - h, y0: b.y, z0: b.z - h, x1: b.x + h, y1: b.y + b.h, z1: b.z + h, key: 'card' }); }
      const [bm, bn, ba] = await set('blue_metal_plate', TEX_SIZE[tier]), [pm, pn, pa] = await set('painted_plaster_wall', TEX_SIZE[tier]);
      const plain = (color: [number, number, number], roughness: number, metalness: number) => ({ map: null, normalMap: null, armMap: null, color: new THREE.Color(...color), roughness, metalness });
      const looks: Record<DressKey, Parameters<typeof artMaterial>[0]> = {
        door: { map: bm, normalMap: bn, armMap: ba, color: new THREE.Color(1.55, 1.62, 1.7), roughness: 0.55, metalness: 1, spec: 1.4 },
        // Painted sheet steel in an occupied office: clean, even paint (a light grey-blue, linear albedo about 0.3) with
        // a soft sheen; the modelled gaps, louvres, handles and label plates carry the detail. (A texture set's grime
        // read as chalk with the plaster set and as rust with the plate set.)
        locker: plain([0.27, 0.31, 0.34], 0.42, 0),
        trim: { map: pm, normalMap: pn, armMap: pa, color: new THREE.Color(0.3, 0.36, 0.44), roughness: 0.7, metalness: 1 },
        casing: { map: pm, normalMap: pn, armMap: pa, color: new THREE.Color(0.95, 0.93, 0.88), roughness: 0.55, metalness: 1, spec: 1.2 },
        handle: plain([0.72, 0.72, 0.7], 0.32, 1), chrome: plain([0.92, 0.92, 0.92], 0.07, 1), steel: plain([0.66, 0.67, 0.68], 0.28, 1),
        grid: plain([0.6, 0.6, 0.58], 0.45, 0),
        conduit: plain([0.55, 0.56, 0.56], 0.45, 1), socket: plain([0.82, 0.81, 0.78], 0.42, 0), kick: plain([0.035, 0.035, 0.04], 0.55, 0),
        cork: plain([0.42, 0.28, 0.15], 0.9, 0), paper: plain([0.86, 0.86, 0.84], 0.85, 0), plastic: plain([0.16, 0.17, 0.18], 0.45, 0),
        aid: plain([0.1, 0.42, 0.18], 0.5, 0),
        screen: { ...plain([0.02, 0.03, 0.04], 0.12, 0), emissive: new THREE.Color(0.05, 0.11, 0.16) },
        sign: { map: printed.sign, normalMap: null, armMap: null, roughness: 0.5, metalness: 0 },
        roomsign: { map: printed.rooms, normalMap: null, armMap: null, roughness: 0.45, metalness: 0 },
        clock: { map: printed.clock, normalMap: null, armMap: null, roughness: 0.15, metalness: 0 },
        fire: { map: printed.fire, normalMap: null, armMap: null, roughness: 0.4, metalness: 0 },
        alarm: plain([0.62, 0.06, 0.05], 0.35, 0),
        card: plain([0.55, 0.43, 0.3], 0.85, 0), binder: plain([1, 1, 1], 0.5, 0), label: plain([0.88, 0.87, 0.82], 0.8, 0),
        exit: { map: printed.exit, normalMap: null, armMap: null, roughness: 0.3, metalness: 0, emissive: new THREE.Color(0.9, 1.2, 0.95), emissiveMap: printed.exit },
        amber: plain([0.2, 0.08, 0.015], 0.05, 0),
        chassis: plain([0.045, 0.046, 0.05], 0.78, 0),
        led: { ...plain([0.02, 0.08, 0.03], 0.2, 0), emissive: new THREE.Color(0.25, 1.6, 0.45) }, ledAmber: { ...plain([0.1, 0.05, 0.01], 0.2, 0), emissive: new THREE.Color(1.6, 0.8, 0.12) },
        bulb: { ...plain([1, 0.85, 0.6], 0.3, 0), emissive: new THREE.Color(6, 4.2, 2.4) }, glass: plain([0.1, 0.13, 0.125], 0.04, 0),
      };
      const merged: GeoArrays = { position: [], normal: [], uv: [], uv1: [], color: [], index: [] }, mergedAt = new Map<string, number>(), keyGeo = new Map<string, THREE.BufferGeometry>();
      for (const [key, arrays] of D.parts) {
        const o = looks[key as DressKey];
        // The throttled tier has no reflection probe, so metals would read black: draw them as painted.
        // Bare metal (no texture) would read chalk-white as paint, so it is darkened to its average reflected tone.
        const asPaint = full ? {} : { metalness: 0, armMap: null, color: !o.map && (o.metalness ?? 0) > 0.5 ? new THREE.Color(o.color as THREE.Color).multiplyScalar(0.42) : o.color };
        // On the throttled tier every untextured piece becomes plain paint, so they share one draw call: fold each
        // piece's colour into its vertex tint and draw them together after this loop.
        if (!full && !o.map && !o.emissive) {
          const c = (asPaint as { color?: THREE.Color }).color ?? new THREE.Color(1, 1, 1), base = merged.position.length / 3;
          mergedAt.set(key, base);
          merged.position.push(...arrays.position); merged.normal.push(...arrays.normal); merged.uv.push(...arrays.uv); merged.uv1.push(...arrays.uv1);
          for (let i = 0; i < arrays.color.length; i += 3) merged.color.push(arrays.color[i] * c.r, arrays.color[i + 1] * c.g, arrays.color[i + 2] * c.b);
          for (const k of arrays.index) merged.index.push(base + k);
          continue;
        }
        const mat = artMaterial({ ...o, ...asPaint, lightMap, lightScale: info.scale, dirMap, vertexTint: true });
        const g = geometry(arrays), mesh = new THREE.Mesh(g, mat);
        keyGeo.set(key, g);
        mesh.matrixAutoUpdate = false; mesh.name = `art:${region.name}:dress:${key}`;
        dressOf(region).push(mesh);
        group.add(mesh); materials.push(mat); geometries.push(g); envLights.push(mat);
      }
      if (dbg.includes('timing')) console.warn(`art timing: ${region.name} dressing ${(performance.now() - tDress).toFixed(0)} ms`);
      if (merged.index.length) {
        const mat = artMaterial({ map: null, lightMap, lightScale: info.scale, dirMap, vertexTint: true, roughness: 0.6, metalness: 0 });
        const g = geometry(merged), mesh = new THREE.Mesh(g, mat);
        mesh.matrixAutoUpdate = false; mesh.name = `art:${region.name}:dress:merged`;
        dressOf(region).push(mesh);
        group.add(mesh); materials.push(mat); geometries.push(g);
        for (const key of mergedAt.keys()) keyGeo.set(`merged:${key}`, g);
      }
      for (const p of D.proxies) {
        if (!p.role) continue;
        const own = keyGeo.get(p.key), merged = keyGeo.get(`merged:${p.key}`);
        if (own) dressAt.set(p, { geo: own, start: p.from }); else if (merged) dressAt.set(p, { geo: merged, start: mergedAt.get(p.key)! + p.from });
      }
      if (D.missed) console.warn(`Breachline art: ${D.missed} dressing pieces found no surface to stand on: ${D.misses.join(' ')}`);
      // Dressing models (product scans, decimated): one instanced mesh per model part, a 256 px colour map only (no
      // normal or ARM: they are small and seen at desk range), lit by a flat probe at the room's mean light.
      const byModel = new Map<string, typeof D.models>();
      for (const m of D.models) { const l = byModel.get(m.model) ?? []; l.push(m); byModel.set(m.model, l); }
      const k = 1.3 * Math.max(0.05, rooms[r].envLight), flat = [k, k * 0.97, k * 0.92, k * 0.3, k * 0.3, k * 0.3, 0, 0, 0, 0, 0, 0];
      const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), at = new THREE.Vector3();
      for (const [model, list] of byModel) {
        const gl = await L.model(full ? model : `${model}.lod1`);
        gl.scene.updateMatrixWorld(true);
        const parts: THREE.Mesh[] = [];
        gl.scene.traverse(o => { if ((o as THREE.Mesh).isMesh) parts.push(o as THREE.Mesh); });
        for (const part of parts) {
          const map = await L.texture(`${model}--${(part.material as THREE.Material).name}`, 'diff', 256);
          const mat = artMaterial({ map, normalMap: null, armMap: null, sh: flat, roughness: 0.55, metalness: 0 });
          const im = new THREE.InstancedMesh(part.geometry, mat, list.length);
          list.forEach((p, i) => im.setMatrixAt(i, m4.compose(at.set(p.x, p.y, p.z), q4.setFromAxisAngle(up, p.yaw), one).multiply(part.matrixWorld)));
          im.computeBoundingSphere();
          im.name = `art:${region.name}:dressmodel:${model}`;
          dressOf(region).push(im); group.add(im); materials.push(mat); envLights.push(mat);
        }
      }
    }
    // The room's own light fixtures glow (the map's lamp panels in this room are not drawn).
    // The room's light and identity over its bake: contact shadows, pools under the fittings, darker junctions.
    { const amb = roomAmbience(region, wallRuns(atlas, region)); for (const m of amb.meshes) { m.name = `art:${region.name}:ambience`; group.add(m); } disposers.push(amb.dispose); }
    const fx = fixtureMeshes(FIXTURES[region.name] ?? []);
    for (const m of fx.meshes) { m.name = `art:${region.name}:fixtures`; group.add(m); }
    { const lensGeo = fx.meshes[1]?.geometry, col = lensGeo?.attributes.color as THREE.BufferAttribute | undefined, orig = col ? Float32Array.from(col.array as Float32Array) : null;
      for (const { f, at } of fx.lenses) fittings.push({ x: f.x, z: f.z, w: f.w, d: f.d, lens(on) { if (!col || !orig) return; for (let i = at * 3; i < (at + 4) * 3; i++) (col.array as Float32Array)[i] = on ? orig[i] : 0.16; col.needsUpdate = true; } }); }
    disposers.push(fx.dispose);
    // Destructible panels facing into the room.
    const wallSet = SURFACES.drywall;
    const [wmap, wnor, warm] = wallSet ? await set(wallSet.set, TEX_SIZE[tier]) : [procedural.drywall, null, null];
    const wall = dbg.includes('panelbasic') ? new THREE.MeshBasicMaterial({ map: wmap, vertexColors: true }) as unknown as THREE.MeshStandardMaterial
      : artMaterial({ map: wmap, normalMap: wnor, armMap: warm, vertexLight: true, normalScale: wallSet?.normal, roughness: warm ? 1 : 0.9, metalness: warm ? 1 : 0, band: look?.band ?? wallSet?.band, tiles: look?.tiles, bands: look?.bands, color: look ? new THREE.Color(...look.wall) : undefined });
    materials.push(wall); if (wall.userData.art) envLights.push(wall);
    const [km, kn, ka] = await set(PLANKS.set, TEX_SIZE[tier]);
    const planks = artMaterial({ map: km, normalMap: kn, armMap: ka, vertexLight: true, roughness: 1, metalness: ka ? 1 : 0, color: new THREE.Color(...(PLANKS.tint ?? [1, 1, 1])) });
    materials.push(planks); envLights.push(planks);
    // Reinforcement plates: painted steel that picks up the room's reflection probe, so its folds and rails catch the
    // fittings like the room's other metal.
    // Painted steel behaves as paint (a dielectric): semi-gloss, so the fittings show in it as soft highlights.
    const [sm, sn, sa] = await set('painted_plaster_wall', TEX_SIZE[tier]);
    const plate = artMaterial({ map: sm, normalMap: sn, armMap: sa, vertexLight: true, roughness: 0.45, metalness: 0, spec: 1.6, color: new THREE.Color(0.3, 0.34, 0.33) });
    materials.push(plate); envLights.push(plate);
    for (const p of info.panels) {
      let e = tables.get(p.index);
      if (!e) tables.set(p.index, e = { t: new Map(), walls: new Map(), planks, plate, tile: wallSet ? [wallSet.size, wallSet.size] : TILE.drywall });
      e.t.set(p.side, new Float32Array(p.light)); e.walls.set(p.side, wall);
    }
    loaded[r] = true;
  } catch (e) { console.warn(`Breachline art: ${region.name} unavailable, keeping its procedural look`, e); } }));
  if (!loaded.some(Boolean)) throw new Error('no art rooms loaded');
  for (const [index, e] of tables) looks.set(index, { ...panelLook(MAP.panels[index].cols + 1, e.t, e.walls.get(1) ?? e.walls.get(-1)!, e.tile), wallBack: e.walls.get(-1), planks: e.planks, plankTile: [PLANKS.size, PLANKS.size], plate: e.plate, plateTile: [1.2, 1.2] });
  // Props, each lit by its own baked probe from the bake of the room it stands in.
  /** Colour lifts per model: the covered car's scan is a near-black cover, lifted to a dark grey-green tarpaulin so
   * its folds read in daylight. */
  const PROP_TINT: Record<string, THREE.Color> = { covered_car: new THREE.Color(2.2, 2.7, 2.5) };
  for (const [i, p] of PROPS.entries()) {
    const room = roomAt(p.x, p.z);
    if (room < 0 || !loaded[room]) continue;
    const lod = new THREE.LOD();
    const levels: [THREE.Object3D, number][] = full ? [[(await models.get(p.model)!).scene.clone(true), 0], [(await lods.get(p.model)!).scene.clone(true), 5]] : [[(await lods.get(p.model)!).scene.clone(true), 0]];
    const mats = new Map<string, THREE.Material>();
    for (const [root, distance] of levels) {
      const meshes: THREE.Mesh[] = [];
      root.traverse(o => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
      for (const mesh of meshes) {
        const src = mesh.material as THREE.MeshStandardMaterial, key = `${p.model}--${src.name}`;
        let mat = mats.get(key);
        if (!mat) {
          const [map, nor, arm] = await set(key, PROP_SIZE[tier]);
          const m = artMaterial({ map, normalMap: nor, armMap: dbg.includes('metal') ? null : arm, sh: rooms[room].props[i], roughness: arm ? 1 : 0.7, metalness: arm ? 1 : 0, color: PROP_TINT[p.model] });
          mats.set(key, m); materials.push(m); rooms[room].envLights.push(m); mat = m;
        }
        mesh.material = mat;
      }
      lod.addLevel(root, distance);
    }
    // Past a range set by its size the prop is not drawn at all: small kit at 22 m, a car or a crate at 45 m.
    { const r = new THREE.Box3().setFromObject(levels[levels.length - 1][0]).getBoundingSphere(new THREE.Sphere()).radius * (p.scale ?? 1); lod.addLevel(new THREE.Object3D(), r < 0.25 ? 9 : r < 0.8 ? 16 : 32); }
    lod.position.set(p.x, p.y, p.z); lod.rotation.set(0, p.yaw, p.tilt ?? 0, 'YXZ'); lod.scale.setScalar(p.scale ?? 1);
    if (p.piece !== undefined && p.states) { const list = pieceProps.get(p.piece) ?? []; list.push({ object: lod, states: p.states }); pieceProps.set(p.piece, list); lod.visible = p.states.includes(0); }
    group.add(lod);
    lod.updateMatrixWorld(true);
    markables.props.push({ box: new THREE.Box3().setFromObject(lod), object: lod, model: p.model, piece: p.piece });
  }
  // Archive boxes: one instanced body (CC0 cardboard, ambientCG Cardboard004) and one instanced label mesh per label
  // variant. Lit by a flat probe at the room's mean light, a little darker than the open room (they sit in shelving).
  if (boxes.length) {
    const room = boxes[0].room, k = 1.3 * Math.max(0.05, rooms[room].envLight), sh = [k, k * 0.97, k * 0.92, k * 0.3, k * 0.3, k * 0.3, 0, 0, 0, 0, 0, 0];
    // A texture set (built at 512 and 1024), not a prop's (256 and 512): the prop size on Low asked for a 256 that
    // does not exist, a 404 before the JPEG fallback.
    const [cm, cn, ca] = await set('Cardboard004', Math.max(512, PROP_SIZE[tier]));
    const body = artMaterial({ map: cm, normalMap: cn, armMap: ca, sh, roughness: ca ? 1 : 0.85, metalness: 0, vertexTint: true });
    const atlasTex = labelAtlas(), labelMat = artMaterial({ map: atlasTex, normalMap: null, armMap: null, sh, roughness: 0.8, metalness: 0 });
    labelMat.polygonOffset = true; labelMat.polygonOffsetFactor = -2; labelMat.polygonOffsetUnits = -2;
    materials.push(body, labelMat); rooms[room].envLights.push(body, labelMat); disposers.push(() => atlasTex.dispose());
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color(), at = new THREE.Vector3(), sc = new THREE.Vector3();
    const matrixOf = (b: typeof boxes[number]) => m4.compose(at.set(b.x, b.y, b.z), q.setFromEuler(e.set(0, b.yaw, b.tilt, 'YXZ')), sc.set(b.w / BOX_W, b.h / BOX_H, b.depth));
    const bodyGeo = archiveBoxGeometry(); geometries.push(bodyGeo);
    const bodies = new THREE.InstancedMesh(bodyGeo, body, boxes.length);
    boxes.forEach((b, j) => { bodies.setMatrixAt(j, matrixOf(b)); bodies.setColorAt(j, c.setRGB(...b.tint)); });
    bodies.computeBoundingSphere(); group.add(bodies);
    for (let v = 0; v < LABEL_VARIANTS; v++) {
      const list = boxes.filter(b => b.label === v);
      if (!list.length) continue;
      const lg = labelGeometry(v); geometries.push(lg);
      const labels = new THREE.InstancedMesh(lg, labelMat, list.length);
      list.forEach((b, j) => labels.setMatrixAt(j, matrixOf(b)));
      labels.computeBoundingSphere(); group.add(labels);
    }
  }
  for (const room of rooms) for (const m of room.envLights) m.userData.art.artEnvLight.value = Math.max(0.05, room.envLight);
  let triangles = 0, meshes = 0;
  group.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { meshes++; const g = m.geometry; triangles += (g.index ? g.index.count : g.attributes.position.count) / 3; } });

  // Until a room's probe is captured its materials hold a black stand-in of the same size, so the shader they compile
  // with is the one they keep: swapping in the real probe is then a uniform change, not a recompile mid-match.
  // 128 texels a face is plenty for the semi-gloss surfaces that reflect it, and quarter the cost of 256.
  const probeSize = 128;
  let standIn: THREE.WebGLRenderTarget | null = null, disposedArt = false;
  if (full && !dbg.includes('noenv')) {
    const pmrem = new THREE.PMREMGenerator(renderer), blank = new THREE.WebGLCubeRenderTarget(probeSize, { type: THREE.HalfFloatType });
    standIn = pmrem.fromCubemap(blank.texture);
    blank.dispose(); pmrem.dispose();
    for (const room of rooms) for (const m of room.envLights) { m.envMap = standIn.texture; m.needsUpdate = true; }
  }

  const claimFaces: Claim = f => { let left: FaceRec[] = [f]; REGIONS.forEach((r, i) => { if (loaded[i]) left = left.flatMap(g => splitFace(g, r).outside); }); return left; };
  return {
    group, claim: claimFaces, stats: { triangles, meshes, textureBytes: L.bytes },
    panelLook: i => looks.get(i) ?? null,
    get envReady() { return rooms.some(r => r.env !== null); },
    environmentScale(x, z) { const r = roomAt(x, z); return r >= 0 && rooms[r].env ? 1 / Math.max(0.05, rooms[r].envLight) : 1; },
    environment(x, z) { const r = roomAt(x, z); return r >= 0 ? rooms[r].env?.texture ?? null : null; },
    markables,
    hideDress(p) {
      const at = dressAt.get(p);
      if (!at || hidden.has(p)) return;
      const pos = at.geo.attributes.position as THREE.BufferAttribute, arr = pos.array as Float32Array, a = at.start * 3, b = (at.start + p.count) * 3;
      hidden.set(p, arr.slice(a, b));
      for (let i = a; i < b; i += 3) { arr[i] = arr[a]; arr[i + 1] = arr[a + 1]; arr[i + 2] = arr[a + 2]; }
      pos.needsUpdate = true;
    },
    restoreDress() {
      for (const [p, saved] of hidden) { const at = dressAt.get(p)!, pos = at.geo.attributes.position as THREE.BufferAttribute; (pos.array as Float32Array).set(saved, at.start * 3); pos.needsUpdate = true; }
      hidden.clear();
      for (const f of fittings) f.lens(true);
    },
    fittings,
    pieceState(piece, state) { for (const e of pieceProps.get(piece) ?? []) e.object.visible = e.states.includes(state); },
    cull(eye) {
      for (const d of dressing) {
        const dx = Math.max(d.x0 - eye.x, 0, eye.x - d.x1), dz = Math.max(d.z0 - eye.z, 0, eye.z - d.z1), show = dx * dx + dz * dz <= DRESS_RANGE * DRESS_RANGE;
        for (const m of d.meshes) m.visible = show;
      }
    },
    captureNext(renderer, scene) {
      if (!full || dbg.includes('noenv')) return true;
      const i = loaded.findIndex((ok, k) => ok && !rooms[k].env && !rooms[k].captured);
      if (i < 0) return true;
      rooms[i].captured = true;
      // One reflection probe per room, from its middle at eye height, projected onto the room's box so reflections
      // line up from anywhere in it. The game renders with autoClear off; a fresh cube's depth starts at 0, so clear.
      const r = REGIONS[i], auto = renderer.autoClear, target = renderer.getRenderTarget(), pmrem = new THREE.PMREMGenerator(renderer);
      renderer.autoClear = true;
      const cube = new THREE.WebGLCubeRenderTarget(probeSize, { type: THREE.HalfFloatType }), cam = new THREE.CubeCamera(0.05, Math.hypot(r.x1 - r.x0, WALL_H, r.z1 - r.z0) + 1, cube);
      cam.position.set((r.x0 + r.x1) / 2, 1.6, (r.z0 + r.z1) / 2);
      // The probe sees every room (the main camera's room culling uses layers).
      for (const c of cam.children) c.layers.enableAll();
      cam.update(renderer, scene);
      rooms[i].env = pmrem.fromCubemap(cube.texture);
      cube.dispose(); pmrem.dispose();
      renderer.autoClear = auto; renderer.setRenderTarget(target);
      for (const m of rooms[i].envLights) {
        const u = m.userData.art;
        if (!dbg.includes('nobox')) { u.artBoxMin.value.set(r.x0, 0, r.z0); u.artBoxMax.value.set(r.x1, WALL_H, r.z1); u.artProbe.value.copy(cam.position); }
        m.envMap = rooms[i].env!.texture;
      }
      return !loaded.some((ok, k) => ok && !rooms[k].captured);
    },
    async warm(renderer, camera, scene, samples) {
      const tick = () => new Promise(res => setTimeout(res, 0));
      // Shader variants depend on the target drawn to: the game draws into a linear half-float buffer (as do the
      // probes), not the tone-mapped screen, so compile against one like it.
      const prev = renderer.getRenderTarget(), hdr = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: true, samples });
      try {
        renderer.setRenderTarget(hdr);
        const done = renderer.compileAsync(group, camera, scene);
        renderer.setRenderTarget(prev);
        await done;
        // Upload the textures one per task, so the first frames that see them do not upload them all at once.
        const textures = new Set<THREE.Texture>();
        const add = (m: THREE.Material) => { for (const v of Object.values(m)) if ((v as THREE.Texture | null)?.isTexture && !(v as THREE.WebGLRenderTarget['texture'] & { isRenderTargetTexture?: boolean }).isRenderTargetTexture) textures.add(v as THREE.Texture); };
        materials.forEach(add);
        const all: THREE.Mesh[] = [];
        group.traverse(o => { const mesh = o as THREE.Mesh; if (mesh.isMesh) { all.push(mesh); ([] as THREE.Material[]).concat(mesh.material).forEach(add); } });
        for (const t of textures) { if (disposedArt) return; renderer.initTexture(t); await tick(); }
        // Then draw every mesh once into the small buffer, a few thousand triangles per task: the first draw is what
        // uploads a mesh's buffers (and, on some drivers, finishes its pipeline), and doing all of that in the first
        // frame that shows the art would freeze it for seconds.
        const shown = all.map(m => m.visible), culled = all.map(m => m.frustumCulled), auto = renderer.autoClear;
        const tris = (m: THREE.Mesh) => (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
        let batches = 0;
        try {
          for (let i = 0; i < all.length;) {
            if (disposedArt) return;
            for (const m of all) m.visible = false;
            for (let n = 0; i < all.length && n < 8000; i++) { all[i].visible = true; all[i].frustumCulled = false; n += tris(all[i]); }
            // The art joins the scene only for this draw (it is not live yet), and leaves it before the game's frame.
            const parent = group.parent;
            scene.add(group); renderer.autoClear = true; renderer.setRenderTarget(hdr);
            renderer.render(scene, camera);
            renderer.setRenderTarget(prev); renderer.autoClear = auto;
            if (parent) parent.add(group); else scene.remove(group);
            batches++;
            await tick();
          }
        } finally {
          all.forEach((m, i) => { m.visible = shown[i]; m.frustumCulled = culled[i]; });
        }
        if (dbg.includes('timing')) console.warn(`art timing: warm drew ${all.length} meshes in ${batches} batches, ${textures.size} textures`);
      } finally {
        renderer.setRenderTarget(prev);
        hdr.dispose();
      }
    },
    dispose() {
      disposedArt = true;
      standIn?.dispose();
      for (const m of materials) m.dispose();
      for (const g of geometries) g.dispose();
      group.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
      for (const r of rooms) r.env?.dispose();
      for (const d of disposers) d();
      L.dispose();
    },
  };
}

function panelLook(width: number, t: Map<number, Float32Array>, wall: THREE.Material, tile: readonly [number, number]): PanelLook {
  // Scratch results, reused (the caller reads them at once): no allocation per vertex of a rebuilt panel.
  const sa: [number, number, number] = [0, 0, 0], sb: [number, number, number] = [0, 0, 0], sm: [number, number, number] = [0, 0, 0];
  const at = (side: number, c: number, r: number, out: [number, number, number]): RGB | null => {
    const v = t.get(side), k = (r * width + c) * 3;
    if (!(v && c >= 0 && c < width && k + 2 < v.length)) return null;
    out[0] = v[k]; out[1] = v[k + 1]; out[2] = v[k + 2]; return out;
  };
  return {
    wall, tile,
    light(c, r, side) {
      if (side !== 0) return at(side, c, r, sa);
      const a = at(1, c, r, sa), b = at(-1, c, r, sb);
      if (!a || !b) return a ?? b;
      sm[0] = (a[0] + b[0]) / 2; sm[1] = (a[1] + b[1]) / 2; sm[2] = (a[2] + b[2]) / 2; return sm;
    },
  };
}

/** A lightmap image's pixels, read once (no GPU readback: the image is drawn into a 2D canvas). */
function imagePixels(img: CanvasImageSource & { width: number; height: number } | undefined) {
  if (!img || !img.width || !img.height) return null;
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true }); if (!g) return null;
  g.drawImage(img, 0, 0);
  return { w: c.width, h: c.height, data: g.getImageData(0, 0, c.width, c.height).data };
}
const srgbToLinear = (b: number) => { const c = b / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
let farMat: THREE.MeshBasicMaterial | null = null;
/** Shared by every far room: vertex colour only. */
function farMaterial() { return (farMat ??= new THREE.MeshBasicMaterial({ vertexColors: true })); }
